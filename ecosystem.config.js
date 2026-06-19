// pm2 守护进程配置：VPS 上用 `pm2 start ecosystem.config.js` 启动，
// 然后 `pm2 save && pm2 startup` 设成开机自启。
module.exports = {
  apps: [
    {
      name: 'read',
      script: 'server.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
