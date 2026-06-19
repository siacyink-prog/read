// MCP 服务器：把共读系统的数据暴露成 claude.ai 能调的 tools。
// 传输用 Streamable HTTP（claude.ai 自定义 connector 的标准），鉴权靠 URL 里的 token。
// 和网页 App 共用同一份 data/ 数据。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config, findUser } from './config.js';
import { listBooks, getToc, getPage, getBook } from './books.js';
import { getChapterAnnotations, addAnnotation, deleteAnnotation } from './annotations.js';

const text = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
});

// 在书里全文搜一个词，返回命中的章/页位置，方便 Claude 定位
function searchBook(bookId, query, limit = 8) {
  const book = getBook(bookId);
  if (!book) return [];
  const hits = [];
  for (const ch of book.chapters) {
    ch.pages.forEach((pageText, pageIndex) => {
      const idx = pageText.indexOf(query);
      if (idx !== -1) {
        const start = Math.max(0, idx - 20);
        hits.push({
          chapterIndex: ch.index,
          chapterTitle: ch.title,
          pageIndex,
          snippet: pageText.slice(start, idx + query.length + 20).replace(/\n/g, ' '),
        });
      }
    });
    if (hits.length >= limit) break;
  }
  return hits.slice(0, limit);
}

function buildServer() {
  const server = new McpServer({ name: 'read-cobook', version: '1.0.0' });
  const actingUser = findUser(config.mcp.userId) || config.users[1];

  server.registerTool(
    'list_books',
    {
      title: '列出书架',
      description: '返回书架上所有书：id、书名、作者、章节数、总页数。先用它拿到 bookId。',
      inputSchema: {},
    },
    async () => text(listBooks())
  );

  server.registerTool(
    'get_book_toc',
    {
      title: '看某本书的目录',
      description: '返回一本书的章节目录（每章的 index、标题、页数）。',
      inputSchema: { bookId: z.string().describe('书的 id，来自 list_books') },
    },
    async ({ bookId }) => {
      const toc = getToc(bookId);
      return toc ? text(toc) : text('找不到这本书');
    }
  );

  server.registerTool(
    'get_page',
    {
      title: '读某一页的原文和批注',
      description:
        '返回某本书某章某页的正文原文，以及这一页上已有的划线/想法批注。chapterIndex 和 pageIndex 都从 0 开始。',
      inputSchema: {
        bookId: z.string().describe('书的 id'),
        chapterIndex: z.number().int().min(0).describe('第几章，从 0 开始'),
        pageIndex: z.number().int().min(0).default(0).describe('该章第几页，从 0 开始'),
      },
    },
    async ({ bookId, chapterIndex, pageIndex = 0 }) => {
      const page = getPage(bookId, chapterIndex, pageIndex);
      if (!page) return text('找不到这一页');
      page.annotations = getChapterAnnotations(bookId, chapterIndex).filter(
        (a) => a.pageIndex === pageIndex
      );
      return text(page);
    }
  );

  server.registerTool(
    'search_book',
    {
      title: '在书里搜一句话',
      description: '在指定的书里全文搜索一个词或短句，返回命中的章节/页码，方便定位后再 get_page。',
      inputSchema: {
        bookId: z.string().describe('书的 id'),
        query: z.string().describe('要搜的词或短句'),
      },
    },
    async ({ bookId, query }) => text(searchBook(bookId, query))
  );

  server.registerTool(
    'get_annotations',
    {
      title: '看某一章的全部批注',
      description: '返回某本书某一章的所有批注（含作者、颜色、锚点原句、内容）。',
      inputSchema: {
        bookId: z.string().describe('书的 id'),
        chapterIndex: z.number().int().min(0).describe('第几章，从 0 开始'),
      },
    },
    async ({ bookId, chapterIndex }) => text(getChapterAnnotations(bookId, chapterIndex))
  );

  server.registerTool(
    'add_annotation',
    {
      title: '写一条批注',
      description: `针对书里的某句话留下批注（会以「${actingUser.name}」的身份、${actingUser.color === 'pink' ? '粉色' : '蓝色'}气泡显示在网页阅读页上）。anchor 请填书里被回应的原句片段，方便贴到对应位置。`,
      inputSchema: {
        bookId: z.string().describe('书的 id'),
        chapterIndex: z.number().int().min(0).describe('第几章，从 0 开始'),
        pageIndex: z.number().int().min(0).default(0).describe('该章第几页，从 0 开始'),
        anchor: z.string().describe('书里被你回应的原句片段（锚点）'),
        text: z.string().describe('批注内容'),
      },
    },
    async ({ bookId, chapterIndex, pageIndex = 0, anchor, text: body }) => {
      const ann = addAnnotation(bookId, {
        chapterIndex,
        pageIndex,
        anchor,
        text: body,
        type: 'note',
        authorId: actingUser.id,
        source: 'ai',
      });
      return text({ ok: true, annotation: ann });
    }
  );

  server.registerTool(
    'delete_annotation',
    {
      title: '删除一条批注',
      description: '按 id 删除某一章里的一条批注。',
      inputSchema: {
        bookId: z.string().describe('书的 id'),
        chapterIndex: z.number().int().min(0).describe('第几章，从 0 开始'),
        annotationId: z.string().describe('批注的 id'),
      },
    },
    async ({ bookId, chapterIndex, annotationId }) =>
      text({ ok: deleteAnnotation(bookId, chapterIndex, annotationId) })
  );

  return server;
}

// 挂载到现有 Express app 上。URL 形如 /mcp/<token>
export async function mountMcp(app) {
  const handler = async (req, res) => {
    if (req.params.token !== config.mcp.token) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const server = buildServer();
    // 无状态模式：每个请求新建 server+transport，低流量个人自用足够稳。
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };

  app.post('/mcp/:token', handler);
  app.get('/mcp/:token', handler);
  app.delete('/mcp/:token', handler);
}
