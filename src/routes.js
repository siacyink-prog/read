import express from 'express';
import multer from 'multer';
import { config } from './config.js';
import { login, requireAuth, currentUser } from './auth.js';
import {
  importBook, listBooks, getToc, getPage, deleteBook,
} from './books.js';
import {
  getChapterAnnotations, addAnnotation, deleteAnnotation,
} from './annotations.js';
import { sendMessage, getHistory, clearHistory } from './chat.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
const router = express.Router();

// ---------- 登录 ----------
router.post('/api/login', (req, res) => {
  const { name, password } = req.body || {};
  const user = login(name, password);
  if (!user) return res.status(401).json({ error: '用户名或密码不对' });
  req.session.user = user;
  res.json({ user });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/api/me', (req, res) => {
  res.json({ user: currentUser(req) });
});

// 以下都要登录
router.use(requireAuth);

// ---------- 书库 ----------
router.get('/api/books', (req, res) => res.json({ books: listBooks() }));

router.post('/api/books', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有文件' });
  try {
    const meta = importBook({ buffer: req.file.buffer, originalName: req.file.originalname });
    res.json({ book: meta });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/api/books/:id', (req, res) => {
  deleteBook(req.params.id);
  res.json({ ok: true });
});

router.get('/api/books/:id/toc', (req, res) => {
  const toc = getToc(req.params.id);
  if (!toc) return res.status(404).json({ error: '书不存在' });
  res.json(toc);
});

// 取某页正文 + 该章批注（一次给够，前端按页渲染）
router.get('/api/books/:id/page', (req, res) => {
  const ch = Number(req.query.chapter) || 0;
  const pg = Number(req.query.page) || 0;
  const page = getPage(req.params.id, ch, pg);
  if (!page) return res.status(404).json({ error: '页不存在' });
  page.annotations = getChapterAnnotations(req.params.id, ch).filter((a) => a.pageIndex === pg);
  res.json(page);
});

// ---------- 批注 ----------
router.get('/api/books/:id/annotations', (req, res) => {
  const ch = Number(req.query.chapter) || 0;
  res.json({ annotations: getChapterAnnotations(req.params.id, ch) });
});

router.post('/api/books/:id/annotations', (req, res) => {
  const user = currentUser(req);
  const { chapterIndex, pageIndex, anchor, text, type } = req.body || {};
  const ann = addAnnotation(req.params.id, {
    chapterIndex, pageIndex, anchor, text,
    type: type || (text ? 'note' : 'highlight'),
    authorId: user.id,
    source: 'user',
  });
  res.json({ annotation: ann });
});

router.delete('/api/books/:id/annotations/:annId', (req, res) => {
  const ch = Number(req.query.chapter) || 0;
  const ok = deleteAnnotation(req.params.id, ch, req.params.annId);
  res.json({ ok });
});

// ---------- 聊天（统一管道，bookId 可为 general） ----------
router.get('/api/chat/:bookId', (req, res) => {
  res.json({ messages: getHistory(req.params.bookId) });
});

router.post('/api/chat/:bookId', async (req, res) => {
  const user = currentUser(req);
  const { text, context } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: '消息为空' });
  try {
    const result = await sendMessage({
      bookId: req.params.bookId,
      text: text.trim(),
      context,
      user,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api/chat/:bookId', (req, res) => {
  clearHistory(req.params.bookId);
  res.json({ ok: true });
});

// 当前 AI 配置（前端提示用，不返回密钥）
router.get('/api/config', (req, res) => {
  res.json({
    provider: config.ai.provider,
    model: config.ai.provider === 'openai' ? config.ai.openai.model : config.ai.claude.model,
    hasKey:
      config.ai.provider === 'openai'
        ? !!config.ai.openai.apiKey
        : !!config.ai.claude.apiKey,
  });
});

export default router;
