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
// 必须放在 routes 之前：routes 里有 requireAuth 这种无路径中间件，
// 否则未登录访问 "/" 会被拦成 401，而不是看到登录页。
app.use(express.static(path.join(__dirname, 'public')));
app.use(routes);

// claude.ai connector（MCP）。懒加载：没装 SDK 或没配 token 也不影响网页 App。
if (config.mcp.enabled) {
  try {
    const { mountMcp } = await import('./src/mcp.js');
    await mountMcp(app);
    console.log(`🔌 MCP connector 已挂载： /mcp/<你的token>`);
  } catch (e) {
    console.warn('⚠️  MCP 未能挂载（是否已 npm install @modelcontextprotocol/sdk？）：', e.message);
  }
}

app.listen(config.port, () => {
  console.log(`📖 共读系统已启动： http://localhost:${config.port}`);
  console.log(`   AI provider: ${config.ai.provider}`);
  console.log(`   MCP connector: ${config.mcp.enabled ? '已开启' : '未开启（.env 里没填 MCP_TOKEN）'}`);
});
