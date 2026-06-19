// 电子书解析：epub / txt → 按章节切分 → 每章按自然段分页（800-1200字/页）
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import { config } from './config.js';
import { readJSON, writeJSON, listJSON, genId } from './store.js';

// 每页目标字数与上限
const PAGE_TARGET = 1000;
const PAGE_MAX = 1200;

// ---------- 分页：把一章文本切成多页 ----------
function paginate(text) {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pages = [];
  let buf = '';

  const flush = () => {
    if (buf.trim()) pages.push(buf.trim());
    buf = '';
  };

  for (let para of paragraphs) {
    // 单段超长：按句号等断句拆开
    if (para.length > PAGE_MAX) {
      const sentences = para.match(/[^。！？!?…]+[。！？!?…]*/g) || [para];
      for (const s of sentences) {
        if (buf.length + s.length > PAGE_MAX) flush();
        buf += s;
        if (buf.length >= PAGE_TARGET) flush();
      }
      continue;
    }
    if (buf.length + para.length > PAGE_MAX && buf.length > 0) flush();
    buf += (buf ? '\n' : '') + para;
    if (buf.length >= PAGE_TARGET) flush();
  }
  flush();
  return pages.length ? pages : [''];
}

// ---------- txt 解析 ----------
const CHAPTER_RE =
  /^\s*(第\s*[0-9零一二三四五六七八九十百千两]+\s*[章回节卷篇部](?:[ 　:：.、]?.*)?|序章|楔子|引子|尾声|后记|番外.*|Chapter\s+\d+.*|CHAPTER\s+\d+.*)\s*$/;

function parseTxt(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const chapters = [];
  let current = { title: '正文', body: [] };
  let matched = false;

  for (const line of lines) {
    if (CHAPTER_RE.test(line) && line.trim().length <= 40) {
      matched = true;
      if (current.body.join('').trim()) chapters.push(current);
      current = { title: line.trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join('').trim() || chapters.length === 0) chapters.push(current);

  // 如果完全没匹配到章节标记，整本作为一章
  return chapters.map((c, i) => ({
    index: i,
    title: c.title || `第 ${i + 1} 节`,
    pages: paginate(c.body.join('\n')),
  }));
}

// ---------- epub 解析 ----------
function parseEpub(buffer) {
  const zip = new AdmZip(buffer);
  const entryText = (name) => {
    const e = zip.getEntry(name);
    return e ? zip.readAsText(e) : null;
  };

  // 1. container.xml 找 OPF 路径
  const container = entryText('META-INF/container.xml');
  let opfPath = null;
  if (container) {
    const m = container.match(/full-path="([^"]+)"/i);
    if (m) opfPath = m[1];
  }
  if (!opfPath) throw new Error('epub 缺少 OPF，无法解析');

  const opfDir = path.posix.dirname(opfPath);
  const opf = entryText(opfPath);
  const $opf = cheerio.load(opf, { xmlMode: true });

  const title = $opf('metadata > dc\\:title, metadata title').first().text().trim() || '未命名';
  const author =
    $opf('metadata > dc\\:creator, metadata creator').first().text().trim() || '佚名';

  // 2. manifest: id -> href
  const manifest = {};
  $opf('manifest > item').each((_, el) => {
    const id = $opf(el).attr('id');
    const href = $opf(el).attr('href');
    if (id && href) manifest[id] = href;
  });

  // 3. spine 顺序
  const spine = [];
  $opf('spine > itemref').each((_, el) => {
    const idref = $opf(el).attr('idref');
    if (idref && manifest[idref]) spine.push(manifest[idref]);
  });

  const resolve = (href) =>
    (opfDir && opfDir !== '.' ? opfDir + '/' : '') + decodeURIComponent(href);

  const chapters = [];
  let idx = 0;
  for (const href of spine) {
    const full = resolve(href);
    const html = entryText(full);
    if (!html) continue;
    const $ = cheerio.load(html);
    $('script, style').remove();
    const chTitle =
      $('h1').first().text().trim() ||
      $('h2').first().text().trim() ||
      $('title').first().text().trim() ||
      `第 ${idx + 1} 节`;
    // 用换行保留段落结构
    $('p, br, div, h1, h2, h3, li').append('\n');
    const text = $('body').text().replace(/\n{2,}/g, '\n').trim();
    if (!text) continue;
    chapters.push({ index: idx, title: chTitle, pages: paginate(text) });
    idx++;
  }

  if (!chapters.length) throw new Error('epub 没有可读章节');
  return { title, author, chapters };
}

// ---------- 对外：导入一本书 ----------
export function importBook({ buffer, originalName }) {
  const ext = path.extname(originalName).toLowerCase();
  const id = genId('book_');
  let book;

  if (ext === '.epub') {
    const parsed = parseEpub(buffer);
    book = { id, title: parsed.title, author: parsed.author, format: 'epub', chapters: parsed.chapters };
  } else if (ext === '.txt') {
    // 尽量用 utf-8；个人自用，假定 utf-8
    const raw = buffer.toString('utf-8');
    const title = path.basename(originalName, ext);
    book = { id, title, author: '', format: 'txt', chapters: parseTxt(raw) };
  } else {
    throw new Error('只支持 .epub 和 .txt');
  }

  book.createdAt = Date.now();
  book.totalPages = book.chapters.reduce((n, c) => n + c.pages.length, 0);

  // 保存原文件备份
  fs.writeFileSync(path.join(config.uploadsDir, `${id}${ext}`), buffer);
  writeJSON(path.join(config.booksDir, `${id}.json`), book);
  return bookMeta(book);
}

function bookMeta(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format,
    chapterCount: book.chapters.length,
    totalPages: book.totalPages,
    createdAt: book.createdAt,
  };
}

export function listBooks() {
  return listJSON(config.booksDir)
    .map(bookMeta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getBook(id) {
  return readJSON(path.join(config.booksDir, `${id}.json`));
}

// 返回某章某页的内容 + 该章目录信息
export function getPage(bookId, chapterIndex, pageIndex) {
  const book = getBook(bookId);
  if (!book) return null;
  const ch = book.chapters[chapterIndex];
  if (!ch) return null;
  const text = ch.pages[pageIndex];
  if (text == null) return null;
  return {
    bookId,
    bookTitle: book.title,
    chapterIndex,
    chapterTitle: ch.title,
    pageIndex,
    pageCount: ch.pages.length,
    chapterCount: book.chapters.length,
    text,
  };
}

// 章节目录（不含正文，给前端导航用）
export function getToc(bookId) {
  const book = getBook(bookId);
  if (!book) return null;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    chapters: book.chapters.map((c) => ({
      index: c.index,
      title: c.title,
      pageCount: c.pages.length,
    })),
  };
}

export function deleteBook(id) {
  for (const f of [
    path.join(config.booksDir, `${id}.json`),
    path.join(config.annotationsDir, `${id}.json`),
    path.join(config.chatsDir, `${id}.json`),
  ]) {
    try { fs.unlinkSync(f); } catch {}
  }
  // 删原文件备份
  for (const ext of ['.epub', '.txt']) {
    try { fs.unlinkSync(path.join(config.uploadsDir, `${id}${ext}`)); } catch {}
  }
}
