// 极简文件存储：所有数据都是 JSON 文件。个人自用，够稳够简单。
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export function ensureDirs() {
  for (const dir of [
    config.dataDir,
    config.booksDir,
    config.annotationsDir,
    config.chatsDir,
    config.uploadsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJSON(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

// 原子写：先写临时文件再 rename，避免写一半崩了导致 JSON 损坏。
export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

export function listJSON(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJSON(path.join(dir, f)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function genId(prefix = '') {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}
