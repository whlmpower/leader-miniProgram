# 邮箱验证码登录 · 运维操作清单（阿里云 DirectMail）

> 适用范围：项目「全向领导力顾问 H5」的「邮箱 + 邮箱验证码」登录方式。
> 账号模型：**邮箱绑定到手机号账号**（备用登录因子），登录后会话归属仍为原手机号，不改动会话/数据归属。
> 当前状态：代码已上线（`master`），默认 `EMAIL_MOCK=true`，验证码仅打印到服务端日志，**不真实发信**。

---

## 一、前置条件（上线真实发送前必须齐备）

| 项目 | 说明 | 缺失后果 |
|---|---|---|
| 已备案域名 | 你已有阿里云备案域名（与 ECS 跨云无关，仅邮件推送需验证域名） | 无法验证发件域名，邮件必进垃圾箱或发送被拒 |
| 阿里云账号 | 主账号或具 RAM 管理权限的子账号 | 无法创建发信地址 / AccessKey |
| 邮件推送服务开通 | 阿里云控制台开通「邮件推送 DirectMail」 | 接口调用返回 `InvalidUserStatus` |

---

## 二、阿里云控制台操作步骤

### 步骤 1 · 验证发件域名（SPF / DKIM）
1. 进入 **邮件推送控制台 → 邮件设置 → 发信域名**。
2. 添加你的域名（如 `yourdomain.com`），按页面提示在**域名 DNS** 中配置：
   - **SPF**：`v=spf1 include:dm.aliyun.com -all`（TXT 记录）
   - **MX**（若用回信）：按提示
   - **DKIM / CNAME**：按页面给出的主机记录与记录值逐条添加
3. 状态变为「验证通过」方可发送。

### 步骤 2 · 创建发信地址
1. 进入 **邮件推送控制台 → 邮件设置 → 发信地址**。
2. 新建发信地址：
   - **邮箱**：如 `advisor@yourdomain.com`（这就是 `.env` 的 `EMAIL_FROM_ADDRESS`）
   - **发信地址类型**：选「正常发信地址」（对应代码 `AddressType=1`，使用 MailAddress）
   - **别名**：如「全向领导力顾问」（对应 `EMAIL_FROM_ALIAS`）
3. 状态变为「可用」。

### 步骤 3 ·（可选）创建邮件标签
- 进入 **邮件标签**，新建一个标签（如 `login-code`）。当前代码未传 `Tag` 字段，可跳过；如需分渠道统计再补。

### 步骤 4 · 退出沙箱 / 提升额度（关键）
- 新账户默认在**沙箱模式**：只能发往「已验证收件人」，且每日额度极低。
- 进入 **邮件推送控制台 → 邮件设置 → 发信地址**，确认发信地址状态为「可用」；若仍受沙箱限制，按控制台引导提交「发送额度/沙箱解除」申请（通常需完成域名验证 + 发信地址可用后自助放开）。
- 验证码量级（每天数十~数百封）远低于免费额度，无需购买资源包。

### 步骤 5 · 创建 RAM 子账号并授权（安全）
1. 进入 **RAM 控制台 → 用户 → 创建用户**，勾选「编程访问」，获得 `AccessKeyId` / `AccessKeySecret`。
2. 为该用户**仅**授予邮件推送权限，二选一：
   - 直接附加系统策略 `AliyunDirectMailFullAccess`（最简单，但权限偏宽）；
   - 或新建**自定义策略**，仅允许 `dm:SingleSendMail`，再绑定到该用户（推荐，最小权限）。
3. **不要把主账号 AccessKey 写进 `.env`**。

---

## 三、修改 `server/.env`（关键配置，已被 .gitignore 忽略，不入库）

打开 `server/.env`，定位「邮箱验证码登录」区块（第 37 行起），按下表修改：

```dotenv
# 改为 false 才会真实发信；true 时验证码只打印到 data/server.log
EMAIL_MOCK=false

# 步骤 5 拿到的 RAM 子账号 AccessKey
EMAIL_ACCESS_KEY_ID=你的AccessKeyId
EMAIL_ACCESS_KEY_SECRET=你的AccessKeySecret

# 步骤 2 创建的发信地址（必须已经「可用」）
EMAIL_FROM_ADDRESS=advisor@yourdomain.com

# 发件人别名（收件人看到的名字），可不改
EMAIL_FROM_ALIAS=全向领导力顾问

# 一般保持默认即可
EMAIL_REGION_ID=cn-hangzhou
EMAIL_ENDPOINT=dm.aliyuncs.com
```

### `.env` 全部邮箱相关参数速查

| 键 | 默认值 | 含义 |
|---|---|---|
| `EMAIL_MOCK` | `true` | `true`=不真实发信、仅日志回显；`false`=真实调用阿里云 |
| `EMAIL_ACCESS_KEY_ID` | 空 | RAM 子账号 AccessKeyId |
| `EMAIL_ACCESS_KEY_SECRET` | 空 | RAM 子账号 AccessKeySecret |
| `EMAIL_FROM_ADDRESS` | 空 | 已验证的发信地址（MailAddress），缺则无法真实发送 |
| `EMAIL_FROM_ALIAS` | 全向领导力顾问 | 收件人显示的发件人名 |
| `EMAIL_REGION_ID` | `cn-hangzhou` | 区域，一般不改 |
| `EMAIL_ENDPOINT` | `dm.aliyuncs.com` | DirectMail 接口域名，一般不改 |
| `EMAIL_CODE_TTL_MINUTES` | `10` | 验证码有效期（分钟） |
| `EMAIL_SEND_COOLDOWN_SECONDS` | `60` | 同一邮箱两次发码最小间隔（秒） |
| `EMAIL_MAX_SENDS_PER_HOUR` | `5` | 同一邮箱每小时最多发码次数 |
| `EMAIL_MAX_VERIFY_ATTEMPTS` | `5` | 同一邮箱最多校验尝试次数 |

> 修改任意一个 `EMAIL_*` 参数后，**必须重启后端服务**才能生效。

---

## 四、重启服务使配置生效

```bash
# 1. 终止旧进程（占用 3002 端口的 node）
#    Windows：任务管理器结束 node，或 netstat -ano | findstr :3002 后 taskkill /PID <pid> /F

# 2. 在 server/ 目录重启
cd server
node src/index.js
# 或生产用 pm2：pm2 restart leader-miniProgram
```

验证接口是否生效：

```bash
curl -s http://localhost:3002/api/config | python -c "import sys,json; d=json.load(sys.stdin); print('emailLogin =', d.get('emailLogin'), '| mock =', d.get('mock'))"
# 期望：emailLogin = True；mock 字段是 LLM 的 mock，与邮箱无关
```

---

## 五、端到端验证流程

1. **管理后台**建一个带邮箱的账号（或直接用已有手机号账号，在「我的对话 → 绑定邮箱」绑定）。
2. 登录页切到「邮箱」标签页 → 输入邮箱 → 点「获取验证码」。
   - `EMAIL_MOCK=true`：验证码打印在 `server/data/server.log`，前端也会有回显（便于联调）。
   - `EMAIL_MOCK=false`：验证码真实发到该邮箱。
3. 填入收到的 6 位验证码 → 点登录 → 应进入对应手机号账号的主页。
4. **绑定邮箱流程**：我的对话 → 绑定邮箱 → 输入邮箱 → 获取验证码 → 填码确认 → `/api/me` 返回该邮箱。

> 安全细节（已在代码中实现，无需再改）：验证码 10 分钟过期、60 秒冷却、每小时≤5 次、校验≤5 次；服务端存储仅保留哈希/过期态。

---

## 六、常见故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 验证码一直出现在服务端日志、收件箱收不到 | `EMAIL_MOCK=true` | 改为 `false` 并重启 |
| `邮件发送失败：Domain not verified` | 发件域名未验证 | 回步骤 1 补全 SPF/DKIM，等 DNS 生效 |
| `邮件发送失败：MailAddress ... not exist` | `EMAIL_FROM_ADDRESS` 不是已创建且「可用」的发信地址 | 回步骤 2 创建/启用 |
| `InvalidAccessKeyId` / `SignatureDoesNotMatch` | AccessKey 填错或权限不足 | 核对 `EMAIL_ACCESS_KEY_ID/SECRET`，确认 RAM 已授权 DirectMail |
| 邮件进垃圾箱 | 域名验证不全 / 发信地址随机类型 | 用「正常发信地址」(AddressType=1) + 完整 SPF/DKIM |
| 沙箱模式只能发给自己 | 账户仍在沙箱 | 回步骤 4 解除沙箱/提升额度 |
| 配置改了不生效 | 未重启服务 | 重启 `node src/index.js` |

---

## 七、后期改动备忘

- **换邮件服务商**（如 SendGrid / 腾讯云 SES）：替换 `server/src/email.js` 的 `sendVerificationCode` 实现即可，对外接口（`sendVerificationCode({to, code})` 与 `isEmailReal()`）保持不变，其它代码无需动。
- **调整验证码策略**：直接改 `.env` 的 `EMAIL_CODE_TTL_MINUTES` / `EMAIL_SEND_COOLDOWN_SECONDS` 等四项，无需改代码。
- **解绑邮箱**：当前未提供解绑 UI，如需解绑，调用 `users.js` 的 `setEmail(phone, '')`（留空即清除）。
- **前端文案/表单**：登录页邮箱表单在 `web/index.html`（标签 `data-view="login"` 内的邮箱 tab），交互逻辑在 `web/assets/js/app.js`，样式在 `web/assets/css/style.css`。
