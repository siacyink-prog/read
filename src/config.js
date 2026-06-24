import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  // 数据目录：优先读 DATA_DIR 环境变量，方便 VPS 把数据放到 git 仓库外面
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  booksDir: path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'books'),
  annotationsDir: path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'annotations'),
  chatsDir: path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'chats'),
  uploadsDir: path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'uploads'),

  // 两个身份：栖 = 真人（登录，蓝色气泡）；凝 = AI 伙伴（不登录，粉色气泡）。
  // id 用来区分气泡颜色归属。role 决定能不能登录。
  users: [
    {
      id: 'qi',
      name: process.env.USER_NAME || '栖',
      password: process.env.USER_PASSWORD || 'change-me',
      color: 'blue',
      role: 'human',
    },
    {
      id: 'du',
      name: process.env.AI_NAME || '凝',
      color: 'pink',
      role: 'ai',
    },
  ],

  ai: {
    provider: (process.env.AI_PROVIDER || 'claude').toLowerCase(),
    // 凝的人格设定
    persona:
      process.env.AI_PERSONA ||
      '你是凝，栖的共读伙伴。你温柔、细腻、爱思考，和栖一起读书，真诚回应书里的内容和栖的想法。说话自然、有温度，不啰嗦。',
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      baseUrl: (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    },
  },

  // claude.ai connector（MCP）。填了 MCP_TOKEN 才启用。
  mcp: {
    enabled: !!process.env.MCP_TOKEN,
    token: process.env.MCP_TOKEN || '',
    // 通过 connector（即 claude.ai 里的渡）写的批注算谁名下。默认渡=粉。
    userId: process.env.MCP_USER_ID || 'du',
  },
};

export function findUser(id) {
  return config.users.find((u) => u.id === id);
}

// 仅供登录用：能登录的只有真人
export function findHuman(name) {
  return config.users.find(
    (u) => u.role === 'human' && (u.name === name || u.id === name)
  );
}
