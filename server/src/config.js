import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT) || 3002,
  rootDir: ROOT,
  skillDir: path.join(ROOT, 'skill'),
  // 行业包：generic（通用，默认）| postal（中国邮政）
  activePack: (process.env.ACTIVE_PACK || 'generic').trim(),
  dataDir: path.join(ROOT, 'data'),
  sessionsDir: path.join(ROOT, 'data', 'sessions'),
  reportsDir: path.join(ROOT, 'data', 'reports'),
  conversationsDir: path.join(ROOT, 'data', 'conversations'),

  // LLM（OpenAI 兼容接口，默认 StepFun 阶跃星辰）
  llmApiKey: process.env.LLM_API_KEY || '',
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://api.stepfun.com/v1',
  llmModel: process.env.LLM_MODEL || 'step-3.7-flash',
  llmTemperature: Number(process.env.LLM_TEMPERATURE || 0.8),
  // 仅在显式设置 LLM_MOCK=true 时启用演示兜底；默认走真实大模型（对话无须 mock）
  llmMock: process.env.LLM_MOCK === 'true',

  // 业务规则
  maxInputChars: Number(process.env.MAX_INPUT_CHARS || 1000),
  postReportTurns: Number(process.env.POST_REPORT_TURNS || 10),
  // 用户数据保留时限：已生成报告的会话保留 7 天（168h），未生成报告的草稿同样保留 7 天；均可经环境变量覆盖
  reportTtlHours: Number(process.env.REPORT_TTL_HOURS || 168),
  abandonTtlDays: Number(process.env.ABANDON_TTL_DAYS || 7),

  // 鉴权（v2）
  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  jwtExpiresHours: Number(process.env.JWT_EXPIRES_HOURS || 24),
  adminPhone: process.env.ADMIN_PHONE || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  userPwdTtlHours: Number(process.env.USER_PWD_TTL_HOURS || 24),

  // 邀请码：邮箱自注册门控（替代注册页图形验证码）。写在配置文件，可随时修改；
  // 验证通过后才允许获取邮箱验证码。默认 !@0816，生产请改复杂值。
  inviteCode: process.env.INVITE_CODE || '!@0816',

  // 安全加固（v2 安全审查后新增）
  cookieSecure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  allowedOrigin: process.env.ALLOWED_ORIGIN || '', // 前后端不同源时填前端域名；同源留空
  // 部署在可信反向代理后填 'loopback'/'127.0.0.1'/'true'。
  // 注意：必须把字符串 'false' 归一为布尔 false，否则 Express 会把它当 IP 解析并抛
  // "invalid IP address: false"，服务直接起不来。
  trustProxy:
    !process.env.TRUST_PROXY || process.env.TRUST_PROXY === 'false'
      ? false
      : process.env.TRUST_PROXY === 'true'
        ? true
        : process.env.TRUST_PROXY,
  enableHsts: process.env.ENABLE_HSTS === 'true' || process.env.NODE_ENV === 'production',
  csp:
    process.env.CSP ||
    "default-src 'self'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",

  // 上下文窗口管理（自动识别上限 + 预算闸门 + 压缩）
  // step-3.7-flash 等模型的真实上下文长度以官方模型卡片为准；此处给保守安全值，
  // 宁可略小也不要超估——放大只会让压缩更激进，不会因低估而撞窗。
  contextWindowTokens: Number(process.env.CONTEXT_WINDOW_TOKENS || 32768),
  // 预算闸门：留 20% 给模型回复，避免逼近硬上限被 API 拒绝
  contextBudgetRatio: Number(process.env.CONTEXT_BUDGET_RATIO || 0.8),
  // 始终保留的最近轮数（user+assistant 各算一条，故 *2）
  recentTurns: Number(process.env.RECENT_TURNS || 8),

  // 限流（v2）
  ratePhoneMax: Number(process.env.RATE_PHONE_MAX || 5),
  rateIpMax: Number(process.env.RATE_IP_MAX || 10),
  rateWindowHours: Number(process.env.RATE_WINDOW_HOURS || 24),

  // 邮箱自注册（邀请码门控）
  // 邮箱作为「邀请码门控的自注册通道」：凭邀请码 + 邮箱验证码完成注册，再自设手机号与密码。
  // 无凭证或 EMAIL_MOCK=true 时走日志回显兜底（验证码打印到服务端日志），便于本地联调；
  // 填入 EMAIL_ACCESS_KEY_ID/SECRET 并将 EMAIL_MOCK 设为 false 即切真实发送。
  emailRegisterEnabled: process.env.EMAIL_REGISTER_ENABLED !== 'false',
  emailMock: process.env.EMAIL_MOCK === 'true' || !process.env.EMAIL_ACCESS_KEY_ID,
  emailAccessKeyId: process.env.EMAIL_ACCESS_KEY_ID || '',
  emailAccessKeySecret: process.env.EMAIL_ACCESS_KEY_SECRET || '',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || '',
  emailFromAlias: process.env.EMAIL_FROM_ALIAS || '全向领导力顾问',
  emailRegionId: process.env.EMAIL_REGION_ID || 'cn-hangzhou',
  emailEndpoint: process.env.EMAIL_ENDPOINT || 'dm.aliyuncs.com',
  emailCodeTtlMinutes: Number(process.env.EMAIL_CODE_TTL_MINUTES || 10),
  emailSendCooldownSeconds: Number(process.env.EMAIL_SEND_COOLDOWN_SECONDS || 60),
  emailMaxSendsPerHour: Number(process.env.EMAIL_MAX_SENDS_PER_HOUR || 5),
  emailMaxVerifyAttempts: Number(process.env.EMAIL_MAX_VERIFY_ATTEMPTS || 5),

  // 文件路径
  usersFile: path.join(ROOT, 'data', 'users.json'),
  ratelimitFile: path.join(ROOT, 'data', 'ratelimit.json'),
};

// 仅当显式开启 LLM_MOCK 时才进入演示兜底模式；否则一律走真实大模型
export const isMock = () => config.llmMock;

// 敏感文件写入选项。
// 注意：Windows 上对**已存在**的文件设置 POSIX mode，Node 会尝试 chmod，
// 而 Windows 不支持该语义，会抛 EPERM（表现为服务启动即崩溃）。
// 因此仅在非 Windows 平台下限制文件权限为 0600。
export const WRITE_OPTS = process.platform === 'win32' ? {} : { mode: 0o600 };
