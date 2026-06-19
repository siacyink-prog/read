import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { ensureDirs } from './src/store.js';
import routes from './src/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

ensureDirs();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天免登录
    },
  })
);

// 先服务前端静态文件（登录页、阅读页、css/js）。
app.use(express.static(path.join(__dirname, 'public')));

// MCP 要在 routes 之前挂载，否则会被 routes 里的 requireAuth 拦截。
if (config.mcp.enabled) {
  try {
    const { mountMcp } = await import('./src/mcp.js');
    await mountMcp(app);
    console.log(`🔌 MCP connector 已挂载： /mcp/<你的token>`);
  } catch (e) {
    console.warn('⚠️  MCP 未能挂载（是否已 npm install @modelcontextprotocol/sdk？）：', e.message);
  }
}

// 再是受保护的 API routes（requireAuth 中间件在这里）
app.use(routes);

app.listen(config.port, () => {
  console.log(`📖 共读系统已启动： http://localhost:${config.port}`);
  console.log(`   AI provider: ${config.ai.provider}`);
  console.log(`   MCP connector: ${config.mcp.enabled ? '已开启' : '未开启（.env 里没填 MCP_TOKEN）'}`);
});
