# 一起读 · 共读系统

凝和栖一起读电子书的小屋。她在书上划线、写想法（粉色气泡），栖写批注回应（蓝色气泡）。读到哪、聊了什么、批注都在同一个页面上。

不是 app，不是插件。从零搭的，自己的。

---

## 它能做什么

- 导入 **epub / txt**，自动按章节切分、按自然段分页（约 800–1200 字/页）
- 选中一句话 → 浮动按钮 → **划线** 或 **写想法**
- 两个人的批注**两种颜色**：蓬蓬粉色、岁岁蓝色
- 气泡默认折叠成小圆点，点开看全文，可删除
- 底部 **边读边聊**：聊天时自动把「当前这一页的原文 + 这页已有的批注」拼进 AI 上下文
- AI 回复里写 `【批注｜"原句"】内容` 会被后台自动提取，贴成蓝色气泡
- 日常聊天和共读聊天走**同一条管道**，只是共读时多拼一块章节原文

---

## 本地跑起来（先在自己电脑上试）

需要先装 [Node.js](https://nodejs.org)（18 以上）。

**最省事：装好 Node 后，直接双击 `start.bat`** —— 它会自动装依赖、启动、打开浏览器（第一次会提示你填 `.env`）。

想手动来也行：

```bash
# 1. 装依赖
npm install

# 2. 配置：复制 .env.example 为 .env，填密码和 API key
copy .env.example .env      # Windows
# cp .env.example .env      # Mac/Linux

# 3. 启动
npm start
```

打开 http://localhost:3000 ，用 `.env` 里设的用户名（凝 / 栖）和密码登录。

### .env 要填什么

- `USER_PENGPENG_PASSWORD` / `USER_SUISUI_PASSWORD`：两个人的登录密码
- `SESSION_SECRET`：随便一串长随机字符
- `AI_PROVIDER`：填 `claude` 或 `openai`
- 用 Claude：填 `ANTHROPIC_API_KEY`（国内中转就改 `ANTHROPIC_BASE_URL`）
- 用 OpenAI / 兼容接口：填 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`

---

## 上 VPS（最便宜那种就够）

假设是一台 Ubuntu 服务器。

```bash
# 1. 装 Node 和 git
sudo apt update && sudo apt install -y nodejs npm git

# 2. 拉代码
git clone https://github.com/siacyink-prog/read.git
cd read

# 3. 装依赖、配 .env
npm install
cp .env.example .env
nano .env        # 填密码和 API key，保存

# 4. 用 pm2 守护，挂后台不掉线
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # 按提示再执行它给出的一行命令，设成开机自启
```

服务默认跑在 3000 端口。配域名 + HTTPS 的话，推荐用 Caddy（自动签证书）：

```bash
sudo apt install -y caddy
# 编辑 /etc/caddy/Caddyfile，写两行：
#   你的域名 {
#       reverse_proxy localhost:3000
#   }
sudo systemctl restart caddy
```

之后访问 `https://你的域名` 就能用了。

更新代码：`git pull && pm2 restart read`

---

## 在 claude.ai 里当 connector 用（可选）

网页阅读页该划线划线、该写气泡写气泡，照常用。这一节是**额外**再开一扇门：让 claude.ai 通过 connector 读同一份书和批注、调用 tools。两边共用一套 `data/` 数据，互通。

### 开启

1. 生成一段别人猜不到的 token，填进 `.env`：

   ```bash
   # 生成一串随机 token
   openssl rand -hex 24
   # 填到 .env
   MCP_TOKEN=刚生成的那串
   MCP_USER_ID=suisui      # connector 写的批注算谁的：suisui(栖/蓝) 或 pengpeng(凝/粉)
   ```

2. 装好依赖（含 MCP SDK）并重启：`npm install && pm2 restart read`
3. connector 必须走 HTTPS 且公网可达（前面 Caddy 配好域名就满足了）。

### 在 claude.ai 里添加

打开 claude.ai → 设置 → Connectors → 拉到底「添加自定义连接器（Add custom connector）」，URL 填：

```
https://你的域名/mcp/<你在 .env 里设的 MCP_TOKEN>
```

加好后，claude.ai 那边就会出现这些 tools：

| tool | 作用 |
| --- | --- |
| `list_books` | 列出书架上所有书，拿到 bookId |
| `get_book_toc` | 看某本书的章节目录 |
| `get_page` | 读某章某页的原文 + 这页已有批注 |
| `search_book` | 在书里全文搜一句话，定位章/页 |
| `get_annotations` | 看某一章的全部批注 |
| `add_annotation` | 写一条批注（按 `MCP_USER_ID` 的身份和颜色，会同步显示在网页阅读页上） |
| `delete_annotation` | 删一条批注 |

这样你在 claude.ai 里就能说「读《XXX》第三章第一页，针对开头那句帮我写条批注」，Claude 调 `get_page` 看原文、调 `add_annotation` 留批注——蓬蓬下次打开网页阅读页，就能看到这条蓝色气泡。

> 注意：claude.ai 聊天框里不会出现网页那种选词划线的阅读界面，划线/气泡的可视化操作仍然在网页 App 上。connector 提供的是「让 Claude 读写同一份数据」的能力。

### 安全说明

token 就是钥匙，等于谁有这个 URL 谁就能读写你的书和批注，别外传、别提交到 git（`.env` 已被 `.gitignore` 排除）。想换钥匙，改 `.env` 里的 `MCP_TOKEN` 重启即可，旧 URL 立刻失效。

---

## 数据存在哪

全是 JSON 文件，在 `data/` 目录下，没有数据库，搬家直接拷文件夹：

- `data/books/` —— 解析后的书（章节、分页）
- `data/annotations/` —— 批注（按书、按章节分桶）
- `data/chats/` —— 聊天记录（每本书一份，日常聊天是 `general.json`）
- `data/uploads/` —— 上传的原始 epub/txt 备份

这些都不进 git（见 `.gitignore`），是你和蓬蓬的私人内容。

---

## token 消耗（参考）

每次发消息 ≈ 当前页原文（800–1200 字）+ 这页已有批注 + 最近几轮对话 + 你的消息，一页大约 1500–2500 token。不会把整本书喂进去，只喂当前这一页。

---

## 推送到 GitHub

双击 `push.bat`（Windows），会自动 `git add / commit / push` 到 `https://github.com/siacyink-prog/read`。第一次推送会让你登录 GitHub。

---

## 目录结构

```
read/
├── server.js            后端入口
├── ecosystem.config.js  pm2 配置
├── push.bat             一键推 GitHub
├── src/
│   ├── config.js        读 .env 配置
│   ├── store.js         JSON 文件读写
│   ├── auth.js          密码登录
│   ├── books.js         epub/txt 解析、分章分页
│   ├── annotations.js   批注存储
│   ├── aiProvider.js    Claude / OpenAI 双接口
│   ├── chat.js          统一聊天管道 + 批注提取
│   ├── routes.js        API 路由
│   └── mcp.js           claude.ai connector（MCP 服务器，暴露 tools）
├── public/              前端（登录、书库、阅读页）
└── data/                运行时数据（不进 git）
```
