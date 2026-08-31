# 全向领导力顾问 H5 · 职场管理困境诊断

把 `omni-leadership-advisor`（全向领导力专属顾问 Skill）包装成一个**独立 H5 网站**：用户通过一问一答完成「向上汇报 / 向下管理 / 横向协调」三类困境的诊断，拿到一份结构化报告，并可下载保存。

形态为**封闭分发 + 账号登录鉴权**：由管理员创建账号、线下发放，用户凭账号登录使用，无广告、无第三方 SDK。

---

## 产品流程

```
首页（诊断什么 / 诊断样例 / 怎么诊断 / 隐私与条款 / 怎么开始）
   │ 点「开始诊断」→ 未登录则进入登录页
   ▼
登录页（手机号 + 图形验证码 + 10 位账号密码 + 勾选隐私协议）
   │ 管理员后台创建并线下发放账号
   ▼
诊断对话页（一问一答；锚点题渲染为可点击选项卡片，也可自由输入）
   │ 报告前不限轮次
   ▼
点「生成报告」→ 后端生成《全向领导力诊断报告》
   ▼
报告页直接预览；回复「需要」后整理成 HTML 供下载
   │ 报告生成后最多再追问 10 轮，之后禁言
   ▼
报告生成后 24 小时，服务端自动删除对话原文与报告文件
```

---

## 与职业罗盘（compass）的关系

技术骨架平移自 `compass-miniProgram`（职业自我认知诊断 H5），三处刻意不同：

| 维度 | 职业罗盘 | 本产品 |
| --- | --- | --- |
| 诊断引擎 | `hemo-career-compass`（心理学维度 + 参照系） | `omni-leadership-advisor`（三方向 + 文字锚点 + 理论匹配） |
| 交互 | 纯对话，选项写在正文里 | **锚点题渲染为可点击选项卡片**，同时保留输入框 |
| 视觉 | 智性编辑风（宣纸米白 / 墨黑 / 黛蓝 / 宋体 / 宣纸噪点） | **石墨深蓝权威咨询风**（深墨蓝 / 青绿强调 / 顶部品牌条） |

两者端口隔离：职业罗盘 `3001`，本产品 `3002`。

---

## 技术架构

- **前端**：原生 H5（HTML/CSS/JS 单页，ES Module），移动端优先，无构建步骤。
- **后端**：Node.js + Express，负责账号体系、JWT 鉴权、图形验证码、登录限流、会话状态、大模型调用、报告生成、数据清理。
- **鉴权基座**：零依赖实现——`crypto.scrypt` 做密码哈希、`crypto` 手写 HS256 JWT、内存 Map 做验证码与限流。
- **大模型**：**StepFun 阶跃星辰**（默认 `step-3.7-flash`，OpenAI 兼容 `/chat/completions`）。设置 `LLM_MOCK=true` 时启用内置演示兜底（无需联网，便于测试）。
- **Skill 提示词**：`server/skill/` 下为 `omni-leadership-advisor` 完整内容（SKILL / knowledge / references / industry-packs），运行时拼接为 system prompt。

---

## 锚点选项协议（本产品交互核心）

Skill 要求「禁止让用户打分，只用情境化文字选项」。为此定义了一条前后端约定：

模型在需要用户对号入座时，于**回复末尾**输出：

```
[[OPTIONS]]
A|完全不清晰：不知道领导到底要什么
B|大致知道：知道方向，但标准模糊
C|明确KPI：有清晰指标和交付标准
D|懂战略意图：连为什么做、长远目标都清楚
[[/OPTIONS]]
```

- 前端 `app.js` 解析该块，渲染成可点击卡片；点击后以「选 A：描述」的形式作为用户输入发送。
- 输入框始终保留，用户可以不点卡片、直接打字（包括"2、3、4 都有"这类多选自述）。
- 协议定义见 `server/skill/prompts/options-protocol.md`。
- 落盘 HTML（报告预览 / 下载文件）前由 `src/options.js` 把该块转成 Markdown 列表，用户不会看到裸露标记。

---

## 行业包（可插拔）

Skill 的理论骨架不变，行业包只换话术与语境。通过 `.env` 的 `ACTIVE_PACK` 切换：

- `generic`（默认）：知识型 / 操作型 / 结果导向型团队语境。
- `postal`：代理金融 + 寄递 + 国企语境（区县 / 地市 / 省公司）。

会话创建时会快照当时的 `ACTIVE_PACK`，中途修改 `.env` 不影响进行中的诊断。

---

## 目录结构

```
leader-miniProgram/
├── server/
│   ├── src/
│   │   ├── index.js         # Express 路由入口（装配鉴权 / Admin / 会话）
│   │   ├── config.js        # 配置（端口 / 大模型 / 业务规则 / 鉴权 / 限流）
│   │   ├── auth.js          # scrypt 哈希 + JWT 签发校验 + 中间件
│   │   ├── captcha.js       # SVG 图形验证码（内存存储，5 分钟过期）
│   │   ├── users.js         # 账号体系（10 位密码 + JSON 存储 + 状态）
│   │   ├── ratelimit.js     # 手机号 / IP 双维度滑动窗口限流
│   │   ├── store.js         # 会话存储（JSON 文件）+ 24h 清理
│   │   ├── llm.js           # LLM 调用（StepFun 真实优先，mock 仅兜底）
│   │   ├── skillLoader.js   # 拼接 system prompt + 行业包 + 报告指令
│   │   ├── report.js        # Markdown → HTML（报告预览）
│   │   ├── conversation.js  # 对话整理 HTML（下载产物）
│   │   └── options.js       # 锚点选项块 → Markdown 列表
│   ├── skill/               # omni-leadership-advisor 全量内容 + prompts/（H5 协议）
│   ├── test/                # 单元 + 集成测试（node --test）
│   ├── smoke.mjs            # 全链路冒烟（进程内启动，27 项断言）
│   ├── data/                # 运行时数据（gitignore）
│   └── .env.example
├── web/                     # H5 前端
│   ├── index.html           # 五视图单页（首页 / 登录 / Admin / 对话 / 报告）
│   ├── samples/dialogue.html# 诊断样例（真实链路脱敏）
│   └── assets/{css,js,vendor}/
├── docs/                    # PRD / 技术方案
├── deploy/                  # Nginx / systemd / pm2 配置
└── design/                  # 设计稿位（预留）
```

---

## 快速开始（本地）

```bash
cd server
npm install          # 或直接从 compass 项目复制 node_modules
cp .env.example .env # 填入 LLM_API_KEY；未拿到 Key 前保持 LLM_MOCK=true
npm start            # 默认 http://localhost:3002
```

浏览器打开 `http://localhost:3002`：

1. 用 `.env` 里的管理员手机 + 密码登录（`ADMIN_PHONE` / `ADMIN_PASSWORD`），进入「账号管理」页。
2. 输入一个测试手机号，点「生成密码」，拿到 10 位明文密码。
3. 退出，用该手机号 + 密码登录，即可开始诊断。

> 测试无需联网：`LLM_MOCK=true` 走内置演示兜底，会跑通「方向定位 → 锚点选项 → 报告」全链路。

---

## 环境变量（server/.env）

```bash
# 大模型（StepFun 阶跃星辰）
LLM_API_KEY=你的_stepfun_key
LLM_BASE_URL=https://api.stepfun.com/v1
LLM_MODEL=step-3.7-flash
LLM_MOCK=false                       # true=演示兜底

ACTIVE_PACK=generic                  # generic | postal

# 鉴权
JWT_SECRET=强随机长字符串（≥32字节）   # 生产必改！
ADMIN_PHONE=13800000001
ADMIN_PASSWORD=admin123456

# 业务规则
PORT=3002
MAX_INPUT_CHARS=1000                 # 单轮输入上限
POST_REPORT_TURNS=10                 # 报告后追问轮次上限
REPORT_TTL_HOURS=24                  # 报告留存时长，超时自动删除
```

完整清单见 `server/.env.example`。

---

## 业务规则

- **封闭分发**：账号仅由管理员在后台创建并线下发放，不开放公开注册。
- **账号密码**：10 位 = 1 位数字 + 9 位大小写字母，排除歧义字符 `0/O/1/l/I`；24 小时内可复用，过期需管理员重新生成。
- **登录**：手机号 + 图形验证码 + 密码三要素；验证码错误只拦截本次、不计数；手机/密码错误才计数；同手机号 24h≤5 次、同 IP 24h≤10 次失败限流。
- **JWT**：HS256，24h 有效期，写入 **httpOnly + SameSite=Lax Cookie**，前端不依赖 localStorage 做安全决策。
- **对话阶段**：报告前不限轮次；报告生成后最多再追问 10 轮，用尽后禁言。
- **报告触发**：用户主动点「生成报告」（每次诊断仅一次）。
- **下载**：报告生成后 AI 会问是否需要整理；回复「需要」即生成对话整理 HTML，点「下载报告」保存。
- **隐私删除**：报告生成后保留 24 小时，超时服务端自动清除对话与报告文件；未完成诊断的会话 3 天未活动自动清理。
- **能力边界**：战略与组织决策、心理治疗、法律纠纷三类，模型会明确拒绝并建议转介。

---

## 测试

```bash
cd server
npm test        # 单元 + 集成（node --test），22 + 16 项
npm run smoke   # 全链路冒烟（进程内启动服务，27 项断言）
```

冒烟脚本覆盖：管理员登录 → 建账号 → 普通用户登录 → 401 守卫 → 会话创建 → **锚点选项协议格式校验** → 生成报告 → 报告后追问 → 下载文件校验。

---

## 部署与迁移小程序

- **H5 部署**：需备案 **HTTPS** 域名，`web/` 静态托管 + `server/` 后端同域（或配置 `ALLOWED_ORIGIN`）。部署前务必把 `.env` 的 `JWT_SECRET` 改成强随机值，前置 Nginx 强制 HTTPS，可信代理后设置 `TRUST_PROXY=loopback`。详见 `deploy/DEPLOY.md`。
- **迁移小程序**：前端逻辑（登录/对话/报告）与 UI 已与后端解耦，后端零改动；可用 uni-app / Taro 重写前端。注意个人主体小程序不能使用 `web-view` 与流量主广告。

---

## 已知平台差异（Windows 开发注意）

从 Linux 部署环境平移到 Windows 本地开发时暴露了两个问题，已在代码中修掉：

1. `fs.writeFileSync(path, data, { mode: 0o600 })` 对**已存在**的文件在 Windows 上会抛 `EPERM`——统一改用 `config.js` 导出的 `WRITE_OPTS`（Windows 下不传 mode）。
2. 脱敏手机号 `139****1234` 含 `*`，在 Windows 上不能作为文件名——`conversation.js` 生成文件名时把 `*` 等非法字符替换为 `X`。
