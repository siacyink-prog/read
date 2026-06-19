// 批注存储：每本书一个 JSON，按章节分桶。
import path from 'node:path';
import { config, findUser } from './config.js';
import { readJSON, writeJSON, genId } from './store.js';

function file(bookId) {
  return path.join(config.annotationsDir, `${bookId}.json`);
}

function load(bookId) {
  return readJSON(file(bookId), { bookId, chapters: {} });
}

function save(bookId, data) {
  writeJSON(file(bookId), data);
}

// 取某章全部批注（前端进章时一次拉完，按页渲染气泡）
export function getChapterAnnotations(bookId, chapterIndex) {
  const data = load(bookId);
  return data.chapters[String(chapterIndex)] || [];
}

export function getAllAnnotations(bookId) {
  return load(bookId).chapters || {};
}

// 新增一条批注。source: 'user' 用户手写 / 'ai' AI回复里提取的
export function addAnnotation(bookId, {
  chapterIndex,
  pageIndex,
  anchor,
  text,
  type = 'note',      // 'highlight' 纯划线 | 'note' 带想法
  authorId,
  source = 'user',
}) {
  const data = load(bookId);
  const key = String(chapterIndex);
  if (!data.chapters[key]) data.chapters[key] = [];

  const user = findUser(authorId);
  const ann = {
    id: genId('ann_'),
    chapterIndex: Number(chapterIndex),
    pageIndex: Number(pageIndex) || 0,
    anchor: (anchor || '').trim(),
    text: (text || '').trim(),
    type,
    source,
    authorId,
    authorName: user ? user.name : authorId,
    color: user ? user.color : 'gray',
    createdAt: Date.now(),
  };
  data.chapters[key].push(ann);
  save(bookId, data);
  return ann;
}

export function deleteAnnotation(bookId, chapterIndex, annId) {
  const data = load(bookId);
  const key = String(chapterIndex);
  if (!data.chapters[key]) return false;
  const before = data.chapters[key].length;
  data.chapters[key] = data.chapters[key].filter((a) => a.id !== annId);
  save(bookId, data);
  return data.chapters[key].length < before;
}

// 在某页正文里，根据锚点定位批注（给拼上下文用）
export function annotationsForPage(bookId, chapterIndex, pageIndex) {
  return getChapterAnnotations(bookId, chapterIndex).filter(
    (a) => a.pageIndex === Number(pageIndex)
  );
}
