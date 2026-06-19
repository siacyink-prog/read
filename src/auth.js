// 简单密码登录：两个固定账号，session 记住是谁。
import { config } from './config.js';

export function login(name, password) {
  const user = config.users.find(
    (u) => u.role === 'human' && (u.name === name || u.id === name) && u.password === password
  );
  if (!user) return null;
  return { id: user.id, name: user.name, color: user.color };
}

// Express 中间件：保护需要登录的接口
export function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: '请先登录' });
}

export function currentUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}
