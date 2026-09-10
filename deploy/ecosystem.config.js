// 全向领导力顾问 H5 · PM2 启动配置
// 用法：cd <repo根目录> && pm2 start deploy/ecosystem.config.js
// 更新后：pm2 restart leader-server
// 开机自启：pm2 save && pm2 startup （按提示执行生成的命令）
// 注意：路径用相对仓库根目录解析，clone 到任意目录都能用（不再硬编码 /opt/leader/server）

const path = require('path');
const serverDir = path.resolve(__dirname, '..', 'server');

module.exports = {
  apps: [
    {
      name: 'leader-server',
      script: path.join(serverDir, 'src/index.js'),
      cwd: serverDir,
      instances: 1,            // 会话状态在内存 + 本地文件，暂用单实例；多实例需外部存储
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 20,
      env: {
        // 默认 mock 模式（无 LLM_API_KEY），可完整体验流程
        PORT: 3002,
      },
      env_production: {
        PORT: 3002,
        // 真实大模型（取消注释并填入；不填则走真实模型需 LLM_API_KEY 已存在于 shell/环境）
        LLM_API_KEY: process.env.LLM_API_KEY || '',
        LLM_BASE_URL: process.env.LLM_BASE_URL || 'https://api.stepfun.com/v1',
        LLM_MODEL: process.env.LLM_MODEL || 'step-3.7-flash',
        // 安全：务必设置强随机 JWT_SECRET，否则生产模式会被拒绝启动
        JWT_SECRET: process.env.JWT_SECRET || '',
        NODE_ENV: 'production',
        MAX_INPUT_CHARS: 5000,
        POST_REPORT_TURNS: 10,
        REPORT_TTL_HOURS: 24,
        AD_DURATION_SEC: 10,
      },
    },
  ],
};
