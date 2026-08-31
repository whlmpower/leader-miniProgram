# 全向领导力顾问 H5 · 阿里云 Linux 部署指南

本指南面向**阿里云 Linux 服务器**（ECS，主流为 Alibaba Cloud Linux / CentOS 7+ / Ubuntu 20.04+），目标是把本项目的 Node 后端 + 原生 H5 前端打包部署到服务器，并通过**已备案的 HTTPS 域名**对外访问。

> 前置：你的域名已在阿里云完成 ICP 备案，并已把 A 记录解析到这台 ECS 的公网 IP。
> 合规提醒：本产品含「广告闸门」逻辑，若后续要接**真实广告 / 微信支付**，主体需为**个体工商户或企业**，个人主体无法上线真实广告与支付（仅当前 mock 闸门不受影响）。

---

## 一、架构说明（先看这一段，避免走弯路）

项目当前是**单体形态**，不需要分开部署前后端：

```
浏览器 ──HTTPS──▶ Nginx(443) ──HTTP 反代──▶ Node(127.0.0.1:3002)
                      │                              │
                      │  同时提供：                    │  Express 同时：
                      │   · web/ 静态前端              │   · / 静态托管 web/
                      │   · /api/* 接口               │   · /api/* 接口
                      │   · /reports 报告文件          │   · /reports 静态目录
```

- 前端 `web/` 是纯静态（HTML/CSS/JS，无构建步骤），由 Express 的 `express.static` 直接托管。
- 前端调用全部使用**相对路径** `/api/...`，因此只要浏览器访问的域名与后端同源，就**无需处理 CORS**，也无需单独部署前端。
- 真正需要暴露在公网的只有 **Nginx 的 443 端口**；Node 进程只监听本机回环地址（127.0.0.1），不直连公网。

---

## 二、服务器初始化（一次性）

用 `root` 或具备 `sudo` 的账号登录后执行：

```bash
# 1) 安装 Node.js 18 LTS（项目未声明 engines，但用了 ESM，建议 ≥16，18 最稳）
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -   # CentOS/Alibaba Cloud Linux
# 若系统是 Ubuntu/Debian，改用：
#   curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs
yum install -y nodejs git     # CentOS/Alibaba Cloud Linux 用 yum；Ubuntu 用 apt-get install -y nodejs git

node -v   # 期望 v18.x
npm -v

# 2) 安装 Nginx
yum install -y nginx          # Ubuntu: apt-get install -y nginx
systemctl enable --now nginx

# 3) 安装 PM2（Node 进程守护，崩溃自动重启）
npm install -g pm2
```

> 备注：若服务器无外网或 npm 慢，可改用国内镜像 `npm config set registry https://registry.npmmirror.com`。

---

## 三、上传项目代码到服务器

两种常用方式，任选其一。

**方式 A：git 拉取（推荐，便于后续更新）**
```bash
cd /opt
git clone <你的仓库地址> leader
# 之后更新代码只需：cd /opt/leader && git pull
```

**方式 B：本地打包后上传**
在**本机（开发机）**执行：
```bash
cd leader-miniProgram
# 打包，排除 node_modules、运行时数据、密钥、git
tar czf leader-deploy.tar.gz \
  --exclude='server/node_modules' \
  --exclude='server/data' \
  --exclude='.git' --exclude='.env' \
  server web deploy
```
然后把 `leader-deploy.tar.gz` 上传到服务器 `/opt`，解压：
```bash
mkdir -p /opt/leader && cd /opt/leader
tar xzf /root/leader-deploy.tar.gz
```

---

## 四、安装依赖并启动（PM2 守护）

```bash
cd /opt/leader/server
npm install --production        # 只装 express / cors，很小

# 启动（生产环境建议绑定本机回环，配合 Nginx 反代）
PORT=3002 pm2 start src/index.js --name leader-server
pm2 save
pm2 startup                    # 按提示执行它给出的命令，实现开机自启
```

确认进程存活：
```bash
pm2 status
curl -s http://127.0.0.1:3002/api/config      # 应返回一段 JSON
```

> 启动方式说明：本项目 `index.js` 已做自适应——无论前台 `node src/index.js`、PM2 相对路径、`pm2 start /opt/leader/server/src/index.js` 绝对路径，或在 PM2 下，都会正确触发 `app.listen`。若仍遇「pm2 online 但端口不监听」，先用绝对路径启动作为兜底：`pm2 start /opt/leader/server/src/index.js --name leader-server`。

### 备案未完成时如何临时访问（无需备案）

ICP 备案约束的是「用**域名**走 **80/443** 访问大陆服务器」。备案完成前：

- **推荐：SSH 本地端口转发**（不暴露任何端口到公网，最安全）：
  ```bash
  # 在本机（Git Bash / 终端）执行，把服务器 127.0.0.1:3002 映射成本机 3003
  # （本机 3001/3002 分别被职业罗盘与本项目本地实例占用，故隧道用 3003）
  ssh -L 3003:127.0.0.1:3002 admin@<公网IP>
  ```
  保持窗口打开，浏览器访问 `http://localhost:3003`（前端 + /api 同源，可直接用）。

  > 当前 `index.js` 监听地址由 `LISTEN_HOST` 控制，**默认 `0.0.0.0`**（备案前临时放开，便于公网 `IP:3002` 直接访问；SSH 隧道同样可用）。**此状态仅为备案前临时方案**，待备案完成后务必按文末「第十一章 · 备案完成后待办」收敛回 `127.0.0.1` 并关闭 3002 公网规则。

- **不要**在域名未备案时把域名指向服务器并用 80/443 访问——阿里云会弹「未备案拦截页」。

- 备案完成后，再按第五节配置 Nginx + HTTPS，并在安全组只保留 80/443、移除任何临时规则。

### 可选：用 systemd 替代 PM2
若不想装 PM2，可用本目录的 `leader.service`（见第五节），命令为：
```bash
cp deploy/leader.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now leader
```

---

## 五、Nginx 反向代理 + HTTPS

本目录已提供模板 `nginx-leader.conf`，按需修改 `server_name` 与证书路径后使用：

```bash
cp deploy/nginx-leader.conf /etc/nginx/conf.d/leader.conf
# 编辑：把 example.com 换成你的域名；把 ssl_certificate / ssl_certificate_key 指向你的证书
nginx -t          # 校验配置
systemctl reload nginx
```

证书申请（阿里云控制台可直接下载 Nginx 版证书，或用免费 Let's Encrypt）：
```bash
# 若用 certbot（可选）
yum install -y certbot python3-certbot-nginx
certbot --nginx -d example.com
```

---

## 六、环境变量（接入真实大模型 / 调业务参数）

默认无 `LLM_API_KEY` 时自动进入 **mock 模式**，可完整体验流程但不调用真实模型。
要接 DeepSeek / 通义 / GLM 等国产兼容接口，在 `/opt/leader/server` 目录建 `.env`（已在 .gitignore 中，不会随仓库泄露）：

```env
LLM_API_KEY=sk-xxxx
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
PORT=3002
MAX_INPUT_CHARS=5000
POST_REPORT_TURNS=10
REPORT_TTL_HOURS=24
AD_DURATION_SEC=10
```

> 用 PM2 时可用 `pm2 start src/index.js --name leader-server --env production`，或在 `ecosystem.config.js` 里声明 env。
> 改完配置后 `pm2 restart leader-server`（或 `systemctl restart leader`）。

---

## 七、防火墙 / 安全组

- **阿里云安全组**：只放行 **80 / 443** 入方向；**3002 不要**对公网开放（仅 Nginx 本机访问）。
- **系统防火墙**（若开启）：
  ```bash
  firewall-cmd --permanent --add-service=http --add-service=https
  firewall-cmd --reload
  ```

---

## 八、更新上线流程

```bash
cd /opt/leader
git pull                 # 或重新上传 tar 包并解压覆盖
cd server && npm install --production
pm2 restart leader-server     # 或 systemctl restart leader
```

---

## 九、排查清单

| 现象 | 排查点 |
|------|--------|
| 浏览器打不开页面 | 安全组/防火墙是否放 80/443；Nginx 是否运行 `systemctl status nginx` |
| 页面能开但对话报 502 | Node 进程是否存活 `pm2 status`；`curl 127.0.0.1:3002/api/config` |
| **pm2 online 但端口不监听、curl 显示 Connection refused** | 旧版 `isMain` 依赖 cwd 导致误判（已修复）：确认服务器 `index.js` 含 `pathToFileURL(path.resolve(projectRoot, ...))` 修复；兜底用绝对路径启动 `pm2 start /opt/leader/server/src/index.js` |
| 调用模型失败 | 检查 `.env` 的 `LLM_API_KEY`/`LLM_BASE_URL`；无 key 则是 mock 模式属正常 |
| 报告下载 403 | 需先在前端点完「下载广告」解锁（业务逻辑，非故障） |
| 数据不持久 | `server/data/` 需存在且 Node 进程有权写；PM2 默认工作目录在 server/ 下即可 |

---

## 十、本地快速自检（可选）

部署前在本机跑一遍，确认流程通畅：
```bash
cd server && npm install && npm start
# 浏览器打开 http://localhost:3002
```

---

## 十一、备案完成后待办（务必执行）⏰

> ⚠️ **当前为「备案前临时形态」**：Node 监听 `0.0.0.0:3002`、安全组/防火墙临时开放 3002 公网入方向，以便用 `http://公网IP:3002` 直接访问。**这只是过渡方案**——3002 长期裸露公网且为明文 HTTP，存在安全风险。ICP 备案一通过，必须按本节约收敛。

**待办清单（按顺序执行）**：

1. **DNS 指向**：阿里云域名控制台，把域名（如 `w-k-u-m.cn`）A 记录指向这台 ECS 的公网 IP。
2. **收口监听地址（「改回来」的核心动作）**：把 Node 监听从 `0.0.0.0` 收敛回本机回环 `127.0.0.1`，仅允许本机 Nginx 访问。
   - 方式一（推荐，持久化）：在 `/opt/leader/server/.env` 追加一行 `LISTEN_HOST=127.0.0.1`；
   - 方式二（PM2 启动注入）：`LISTEN_HOST=127.0.0.1 pm2 start src/index.js --name leader-server --update-env`。
3. **关闭 3002 公网规则**：阿里云安全组**删除 3002 入方向规则**，只保留 **80 / 443**。
4. **配置 Nginx + HTTPS**：用本目录填好版 `leader.conf`（或改 `nginx-leader.conf`），放到 `/etc/nginx/conf.d/leader.conf`，然后 `nginx -t && systemctl reload nginx`。
5. **重启生效并验证**：
   ```bash
   pm2 restart leader-server
   sleep 2
   ss -ltnp | grep 3002     # 应显示 127.0.0.1:3002，不再出现 0.0.0.0 / *:3002
   curl -s https://你的域名/api/config   # 公网 HTTPS 应返回 JSON
   ```
6. **确认 3002 不再对公网开放**：从外部执行 `telnet 公网IP 3002` 应**连接失败**（被安全组拦截）。

完成以上步骤后，公网访问入口只剩 Nginx 的 443（HTTPS），Node 仅本机可达，安全形态即完整。
