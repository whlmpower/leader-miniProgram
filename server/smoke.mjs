// 冒烟脚本：走通「管理员登录 → 建账号 → 用户登录 → 会话 → 锚点对话 → 报告 → 下载」全链路。
// 不依赖外部进程：直接在脚本内挂载 Express app 并监听随机端口，测完关闭。
// 验证码答案从 SVG 的 <text> 节点中提取（仅测试用途）。

let BASE = '';
let cookie = '';

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function getCaptcha() {
  const { data } = await req('/api/auth/captcha', { method: 'POST', json: {} });
  const chars = [...data.svg.matchAll(/>([A-Z0-9])<\/text>/g)].map((m) => m[1]).join('');
  return { captchaId: data.captchaId, answer: chars };
}

async function login(phone, password) {
  const cap = await getCaptcha();
  const r = await req('/api/auth/login', {
    method: 'POST',
    json: { phone, password, captchaId: cap.captchaId, captchaInput: cap.answer },
  });
  if (r.status !== 200) throw new Error(`登录失败 ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

const log = (...a) => console.log(...a);
let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    log(`  [OK]   ${name}`);
  } else {
    fail++;
    log(`  [FAIL] ${name} ${extra}`);
  }
}

(async () => {
  log('\n=== 0. 启动服务（进程内，随机端口） ===');
  const { app } = await import('./src/index.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  log(`  监听 ${BASE}`);

  try {
  log('\n=== 1. 管理员登录 ===');
  const admin = await login('13800000001', 'admin123456');
  check('管理员登录成功且角色为 admin', admin.role === 'admin', JSON.stringify(admin));

  log('\n=== 2. 管理员创建用户 ===');
  const testPhone = '139' + String(Date.now()).slice(-8);
  const created = await req('/api/admin/users', { method: 'POST', json: { phone: testPhone } });
  check('创建用户成功', created.status === 200, JSON.stringify(created.data));
  const pwd = created.data.password;
  check('密码为 10 位', typeof pwd === 'string' && pwd.length === 10, pwd);
  log(`  测试账号：${testPhone} / ${pwd}`);

  const list = await req('/api/admin/users');
  check('账号列表可见新账号', (list.data.users || []).some((u) => u.phone === testPhone));

  log('\n=== 3. 未登录访问诊断接口应 401 ===');
  const saved = cookie;
  cookie = '';
  const anon = await req('/api/sessions/mine');
  check('未登录返回 401', anon.status === 401, String(anon.status));
  cookie = saved;

  log('\n=== 4. 普通用户登录 ===');
  const user = await login(testPhone, pwd);
  check('用户登录成功且角色为 user', user.role === 'user', JSON.stringify(user));

  log('\n=== 5. 创建会话（确定性开场白） ===');
  const sess = await req('/api/session', { method: 'POST', json: {} });
  check('会话创建成功', sess.status === 200 && !!sess.data.sessionId, JSON.stringify(sess.data).slice(0, 120));
  const sid = sess.data.sessionId;
  check('开场白含「全向领导力顾问」', (sess.data.greeting || '').includes('全向领导力顾问'));
  check('开场白提到三个方向', ['向上', '向下', '横向'].every((k) => sess.data.greeting.includes(k)));

  log('\n=== 6. 对话：锚点选项协议 ===');
  const m1 = await req(`/api/session/${sid}/message`, {
    method: 'POST',
    json: { content: '我提想法总是被领导一句话否掉，他面带笑容但态度很强硬。' },
  });
  check('首轮回复成功', m1.status === 200, JSON.stringify(m1.data).slice(0, 200));
  const reply1 = m1.data.reply || '';
  const hasOpt = /\[\[OPTIONS\]\][\s\S]*?\[\[\/OPTIONS\]\]/.test(reply1);
  check('回复包含 [[OPTIONS]] 选项块', hasOpt);
  const optLines = hasOpt
    ? reply1.match(/\[\[OPTIONS\]\]([\s\S]*?)\[\[\/OPTIONS\]\]/)[1].trim().split('\n')
    : [];
  check('选项块为 4 条', optLines.length === 4, JSON.stringify(optLines));
  check('选项格式为「字母|描述」', optLines.every((l) => /^[A-D]\|.+/.test(l.trim())), JSON.stringify(optLines));
  check('选项块位于回复末尾', reply1.trim().endsWith('[[/OPTIONS]]'));
  log('  选项示例：' + (optLines[0] || '').trim());

  const m2 = await req(`/api/session/${sid}/message`, {
    method: 'POST',
    json: { content: '选 C：明确KPI：有清晰指标和交付标准' },
  });
  check('选项作答被接受', m2.status === 200, JSON.stringify(m2.data).slice(0, 160));

  log('\n=== 7. 生成报告 ===');
  const rep = await req(`/api/session/${sid}/report`, { method: 'POST', json: {} });
  check('报告生成成功', rep.status === 200, JSON.stringify(rep.data).slice(0, 200));
  const md = rep.data.reportMarkdown || '';
  check('报告含【问题定位】', md.includes('问题定位'));
  check('报告含【行动清单】', md.includes('行动清单'));
  check('报告含【置信度拆解】', md.includes('置信度拆解'));
  check('报告含避坑', md.includes('避坑'));

  log('\n=== 8. 报告后追问 + 下载整理 ===');
  const m3 = await req(`/api/session/${sid}/message`, { method: 'POST', json: { content: '需要' } });
  check('回复「需要」后会话标记为可下载', m3.data.conversationReady === true, JSON.stringify(m3.data).slice(0, 160));

  const dl = await req(`/api/session/${sid}/conversation/download`);
  check('下载返回 200', dl.status === 200, String(dl.status));
  const html = typeof dl.data === 'string' ? dl.data : '';
  check('下载内容为 HTML', html.startsWith('<!DOCTYPE html>'));
  check('下载内容标题正确', html.includes('全向领导力诊断对话记录'));
  check('下载内容含报告正文', html.includes('问题定位'));
  check('下载内容不含未解析的 OPTIONS 标记', !html.includes('[[OPTIONS]]'));

  log('\n=== 9. 报告后轮次限制 ===');
  const st = await req(`/api/session/${sid}`);
  check('报告后剩余追问轮次已递减', st.data.postReportTurnsLeft < 10, String(st.data.postReportTurnsLeft));

  log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  } finally {
    server.close();
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n[冒烟异常]', e.message);
  process.exit(1);
});
