// 统一聊天管道：日常聊天 和 共读聊天 走同一条管道。
// 唯一区别——共读模式多拼一块「当前页原文 + 已有批注」进上下文。
import path from 'node:path';
import { config, findUser } from './config.js';
import { readJSON, writeJSON, genId } from './store.js';
import { chatComplete } from './aiProvider.js';
import { getPage } from './books.js';
import { annotationsForPage, addAnnotation } from './annotations.js';

const GENERAL = 'general'; // 日常聊天用这个 id

function file(bookId) {
  return path.join(config.chatsDir, `${bookId || GENERAL}.json`);
}
function loadChat(bookId) {
  return readJSON(file(bookId), { bookId: bookId || GENERAL, messages: [] });
}
function saveChat(bookId, data) {
  writeJSON(file(bookId), data);
}

export function getHistory(bookId) {
  return loadChat(bookId).messages;
}

// 取最近 N 轮，控制 token
function recentTurns(messages, n = 12) {
  return messages.slice(-n).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    // 多人共读：把说话人名字带进去，AI 才分得清蓬蓬和岁岁
    content: m.role === 'assistant' ? m.text : `${m.authorName}：${m.text}`,
  }));
}

// 共读模式下，把当前页原文 + 该页已有批注拼成一段上下文
function buildReadingContext(bookId, ctx) {
  if (!bookId || bookId === GENERAL || !ctx || ctx.chapterIndex == null) return '';
  const page = getPage(bookId, ctx.chapterIndex, ctx.pageIndex || 0);
  if (!page) return '';

  const anns = annotationsForPage(bookId, ctx.chapterIndex, ctx.pageIndex || 0);
  let block = `【我们正在共读《${page.bookTitle}》——${page.chapterTitle}（第${
    (ctx.pageIndex || 0) + 1
  }/${page.pageCount}页）】\n当前这一页的原文：\n"""\n${page.text}\n"""`;

  if (anns.length) {
    const lines = anns
      .map((a) => {
        const who = a.source === 'ai' ? `${a.authorName}的批注` : a.authorName;
        const head = a.anchor ? `「${a.anchor}」` : '';
        return `- ${who}${head}：${a.text || '(只是划了线)'}`;
      })
      .join('\n');
    block += `\n\n这一页上已有的划线和想法：\n${lines}`;
  }
  return block;
}

const ANNOTATION_INSTRUCTION = `
当你在和主人共读、想针对书里某一句留下批注时，可以在回复里用这个格式（可多条）：
【批注｜"书里被你回应的原句片段"】你的批注内容
后台会自动把它提取出来，作为气泡贴在书页对应的句子旁边。锚点请尽量原样引用书里的短句，方便定位。如果只是普通聊天，正常说话即可，不必每次都写批注。`;

// 主入口
export async function sendMessage({ bookId, text, context, user }) {
  const isReading = bookId && bookId !== GENERAL && context && context.chapterIndex != null;
  const chat = loadChat(isReading ? bookId : GENERAL);

  // 1. 存用户消息
  const userMsg = {
    id: genId('msg_'),
    role: 'user',
    authorId: user.id,
    authorName: user.name,
    text,
    context: isReading ? { chapterIndex: context.chapterIndex, pageIndex: context.pageIndex || 0 } : null,
    createdAt: Date.now(),
  };
  chat.messages.push(userMsg);

  // 2. 组系统提示词
  let system = config.ai.persona;
  if (isReading) {
    system += `\n\n${buildReadingContext(bookId, context)}\n${ANNOTATION_INSTRUCTION}`;
  }

  // 3. 调 AI
  const reply = await chatComplete({
    system,
    messages: recentTurns(chat.messages),
  });

  // 4. 从回复里提取批注，存成气泡（颜色跟当前登录用户走）
  const created = [];
  if (isReading) {
    for (const ann of extractAnnotations(reply)) {
      const saved = addAnnotation(bookId, {
        chapterIndex: context.chapterIndex,
        pageIndex: context.pageIndex || 0,
        anchor: ann.anchor,
        text: ann.text,
        type: 'note',
        authorId: 'du', // 渡的批注 → 粉色气泡
        source: 'ai',
      });
      created.push(saved);
    }
  }

  // 5. 存 AI 回复
  const du = findUser('du');
  const aiMsg = {
    id: genId('msg_'),
    role: 'assistant',
    authorId: 'du',
    authorName: du ? du.name : '渡',
    text: reply,
    createdAt: Date.now(),
  };
  chat.messages.push(aiMsg);
  saveChat(isReading ? bookId : GENERAL, chat);

  return { userMsg, aiMsg, annotations: created };
}

// 正则提取：【批注｜"锚点"】批注内容
export function extractAnnotations(reply) {
  const re = /【批注[｜|]\s*["“]([^"”]+)["”]\s*】\s*([^\n【]*)/g;
  const out = [];
  let m;
  while ((m = re.exec(reply)) !== null) {
    out.push({ anchor: m[1].trim(), text: (m[2] || '').trim() });
  }
  return out;
}

export function clearHistory(bookId) {
  saveChat(bookId || GENERAL, { bookId: bookId || GENERAL, messages: [] });
}
