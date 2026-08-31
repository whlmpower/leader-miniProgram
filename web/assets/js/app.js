import { api, getToken, setToken } from './api.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// ---------- Markdown 渲染（marked + DOMPurify） ----------
const MARKED = window.marked;
if (MARKED && MARKED.setOptions) MARKED.setOptions({ gfm: true, breaks: true });

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMd(text) {
  const src = String(text || '');
  let html;
  try {
    html = MARKED ? MARKED.parse(src) : escapeHtml(src).replace(/\n/g, '<br/>');
  } catch {
    html = escapeHtml(src).replace(/\n/g, '<br/>');
  }
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
}

// ---------- 锚点选项协议解析 ----------
// 模型在需要用户「对号入座」时，于回复末尾输出：
//   [[OPTIONS]]
//   A|描述
//   B|描述
//   [[/OPTIONS]]
const OPT_RE = /\[\[OPTIONS\]\]([\s\S]*?)\[\[\/OPTIONS\]\]/;

function splitOptions(raw) {
  const text = String(raw || '');
  const m = text.match(OPT_RE);
  if (!m) return { text: text.trim(), options: [] };
  const body = text.replace(OPT_RE, '').trim();
  const options = m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('|');
      if (i < 0) return null;
      const key = l.slice(0, i).trim();
      const label = l.slice(i + 1).trim();
      return key && label ? { key, label } : null;
    })
    .filter(Boolean);
  return { text: body, options };
}

// ---------- 全局状态 ----------
const state = {
  role: null,
  phone: '',
  sessionId: null,
  status: 'collecting',
  messages: [],
  postReportTurnsLeft: 10,
  maxPostReportRounds: 10,
  reportHtml: '',
  conversationReady: false,
  pendingOptions: [],
  maxInputChars: 1000,
  busy: false,
  captchaId: '',
};

// ---------- 通用 UI ----------
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function showView(name) {
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
  window.scrollTo(0, 0);
  if (name === 'login') refreshCaptcha();
  if (name === 'admin') loadUsers();
}

function setBusy(busy, placeholder) {
  state.busy = busy;
  const input = $('#msgInput');
  const send = $('#btnSend');
  const report = $('#btnReport');
  input.disabled = busy || isMuted();
  send.disabled = busy || isMuted();
  report.disabled = busy;
  send.textContent = busy ? '…' : '发送';
  if (placeholder !== undefined) input.placeholder = placeholder;
}

function isMuted() {
  return state.status === 'reported' && state.postReportTurnsLeft <= 0;
}

// ---------- 首页导航 ----------
$$('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.go;
    if (target === 'login' && !getToken()) {
      showView('login');
      return;
    }
    if (target === 'login') {
      enterAfterLogin();
      return;
    }
    showView(target);
  });
});

// ---------- 隐私协议弹层 ----------
function openPrivacy() {
  $('#privacyModal').hidden = false;
}
function closePrivacy() {
  $('#privacyModal').hidden = true;
}
$('#openPrivacy').addEventListener('click', openPrivacy);
$('#openPrivacy2').addEventListener('click', openPrivacy);
$$('[data-close-modal]').forEach((el) => el.addEventListener('click', closePrivacy));

// ============================================================
// 登录
// ============================================================
async function refreshCaptcha() {
  try {
    const { captchaId, svg } = await api.captcha();
    state.captchaId = captchaId;
    $('#captchaBox').innerHTML = svg;
  } catch (e) {
    toast('验证码加载失败，请重试');
  }
}
$('#captchaBox').addEventListener('click', refreshCaptcha);

$('#lgAgree').addEventListener('change', (e) => {
  $('#btnLogin').disabled = !e.target.checked;
});

$('#btnLogin').addEventListener('click', login);
$('#lgPwd').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('#btnLogin').disabled) login();
});

async function login() {
  const phone = $('#lgPhone').value.trim();
  const password = $('#lgPwd').value;
  const captchaInput = $('#lgCaptcha').value.trim();
  const err = $('#lgErr');
  err.textContent = '';

  if (!/^1\d{10}$/.test(phone)) {
    err.textContent = '请输入正确的 11 位手机号';
    return;
  }
  if (!password || !captchaInput) {
    err.textContent = '请填写密码与图形验证码';
    return;
  }

  const btn = $('#btnLogin');
  btn.disabled = true;
  btn.textContent = '登录中…';
  try {
    const data = await api.login({ phone, password, captchaId: state.captchaId, captchaInput });
    setToken(data.token);
    state.role = data.role;
    state.phone = phone;
    $('#lgErr').textContent = '';
    $('#lgPwd').value = '';
    $('#lgCaptcha').value = '';
    enterAfterLogin();
  } catch (e) {
    err.textContent = e.message || '登录失败';
    refreshCaptcha();
    $('#lgCaptcha').value = '';
  } finally {
    btn.disabled = !$('#lgAgree').checked;
    btn.textContent = '登 录';
  }
}

function enterAfterLogin() {
  if (state.role === 'admin') showView('admin');
  else startChat();
}

async function logout() {
  try {
    await api.logout();
  } catch {
    /* 忽略：本地态照常清理 */
  }
  setToken('');
  state.role = null;
  state.sessionId = null;
  state.messages = [];
  state.reportHtml = '';
  state.conversationReady = false;
  state.pendingOptions = [];
  $('#chatBody').innerHTML = '';
  showView('home');
}
$('#btnLogout').addEventListener('click', logout);
$('#btnLogoutChat').addEventListener('click', logout);

// ============================================================
// 管理后台
// ============================================================
const STATUS_LABEL = {
  unused: '未使用',
  used: '已使用',
  expired: '已过期',
  revoked: '已作废',
};

async function loadUsers() {
  const box = $('#userList');
  try {
    const { users } = await api.listUsers();
    if (!users || !users.length) {
      box.innerHTML = '<p class="muted">还没有创建账号。在上面输入手机号生成第一个。</p>';
      return;
    }
    box.innerHTML = users
      .map((u) => {
        const cls = u.status === 'used' ? ' used' : u.status === 'unused' ? '' : ' ' + u.status;
        return `<div class="user-row">
          <span class="user-phone">${escapeHtml(u.phone)}</span>
          <span class="user-status${cls}">${STATUS_LABEL[u.status] || u.status}</span>
          <span class="user-ops">
            <button data-reset="${escapeHtml(u.phone)}">重生成</button>
            <button data-revoke="${escapeHtml(u.phone)}">作废</button>
          </span>
        </div>`;
      })
      .join('');
    box.querySelectorAll('[data-reset]').forEach((b) =>
      b.addEventListener('click', () => resetUser(b.dataset.reset))
    );
    box.querySelectorAll('[data-revoke]').forEach((b) =>
      b.addEventListener('click', () => revokeUser(b.dataset.revoke))
    );
  } catch (e) {
    box.innerHTML = `<p class="muted">加载失败：${escapeHtml(e.message)}</p>`;
  }
}

async function resetUser(phone) {
  try {
    const r = await api.resetUser(phone);
    showPassword(r.password);
    loadUsers();
  } catch (e) {
    toast(e.message || '操作失败');
  }
}

async function revokeUser(phone) {
  try {
    await api.revokeUser(phone);
    loadUsers();
  } catch (e) {
    toast(e.message || '操作失败');
  }
}

function showPassword(pwd) {
  $('#pwdText').textContent = pwd;
  $('#pwdBox').hidden = false;
}

$('#btnCreate').addEventListener('click', async () => {
  const phone = $('#newPhone').value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    toast('请输入正确的 11 位手机号');
    return;
  }
  const btn = $('#btnCreate');
  btn.disabled = true;
  try {
    const r = await api.createUser(phone);
    showPassword(r.password);
    $('#newPhone').value = '';
    loadUsers();
  } catch (e) {
    toast(e.message || '生成失败');
  } finally {
    btn.disabled = false;
  }
});

$('#btnCopy').addEventListener('click', async () => {
  const text = $('#pwdText').textContent;
  try {
    await navigator.clipboard.writeText(text);
    toast('密码已复制');
  } catch {
    toast('复制失败，请手动选中复制');
  }
});

$('#btnChangePwd').addEventListener('click', async () => {
  const oldPwd = $('#oldPwd').value;
  const newPwd = $('#newPwd').value;
  const err = $('#pwdErr');
  err.textContent = '';
  if (!oldPwd || !newPwd) {
    err.textContent = '请输入当前密码与新密码';
    return;
  }
  try {
    await api.changeAdminPwd(oldPwd, newPwd);
    $('#oldPwd').value = '';
    $('#newPwd').value = '';
    toast('密码已修改');
  } catch (e) {
    err.textContent = e.message || '修改失败';
  }
});

// ============================================================
// 诊断对话
// ============================================================
function mdBlock(text) {
  return `<div class="md">${renderMd(text)}</div>`;
}

function addBubble(role, html, id) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `<div class="av">${role === 'user' ? '你' : '顾'}</div><div class="bubble">${html}</div>`;
  if (id) wrap.id = id;
  $('#chatBody').appendChild(wrap);
  scrollBottom();
  return wrap;
}

function scrollBottom() {
  const body = $('#chatBody');
  body.scrollTop = body.scrollHeight;
}

function renderPendingOptions() {
  const box = $('#optArea');
  if (!state.pendingOptions.length || isMuted() || state.busy) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.innerHTML =
    '<div class="opt-hint">选一个最像你的</div>' +
    state.pendingOptions
      .map(
        (o) =>
          `<button class="opt-item" data-key="${escapeHtml(o.key)}" data-label="${escapeHtml(
            o.label
          )}"><span class="opt-key">${escapeHtml(o.key)}</span><span>${escapeHtml(o.label)}</span></button>`
      )
      .join('');
  box.hidden = false;
  box.querySelectorAll('.opt-item').forEach((b) =>
    b.addEventListener('click', () => {
      const { key, label } = b.dataset;
      box.querySelectorAll('.opt-item').forEach((x) => (x.disabled = true));
      sendMessage(`选 ${key}：${label}`);
    })
  );
  scrollBottom();
}

function refreshStatus() {
  const el = $('#chatStatus');
  if (state.status === 'reported') {
    el.textContent = isMuted() ? '对话已结束' : `报告已生成 · 还可追问 ${state.postReportTurnsLeft} 轮`;
  } else {
    el.textContent = '诊断中';
  }

  $('#btnReport').hidden = state.status === 'reported';
  $('#btnDownload').hidden = !state.conversationReady;

  const input = $('#msgInput');
  input.disabled = state.busy || isMuted();
  $('#btnSend').disabled = state.busy || isMuted();
  input.placeholder = isMuted() ? '本轮诊断已结束' : '说说你的情况…';
}

async function startChat() {
  showView('chat');
  $('#chatBody').innerHTML = '';
  try {
    const cfg = await api.getConfig();
    state.maxInputChars = cfg.maxInputChars || 1000;
    state.maxPostReportRounds = cfg.maxPostReportRounds || 10;
    $('#msgInput').maxLength = state.maxInputChars;
    updateCounter();
  } catch {
    /* 配置失败不阻断，使用默认值 */
  }

  try {
    const mine = await api.mySessions();
    if (mine.session) {
      await loadSession(mine.session.id);
      return;
    }
  } catch {
    /* 无历史会话，继续创建 */
  }
  await newSession();
}

async function newSession() {
  const data = await api.createSession();
  state.sessionId = data.sessionId;
  state.status = 'collecting';
  state.messages = [{ role: 'assistant', content: data.greeting }];
  state.reportHtml = '';
  state.conversationReady = false;
  const { options } = splitOptions(data.greeting);
  state.pendingOptions = options;
  addBubble('assistant', mdBlock(splitOptions(data.greeting).text));
  renderPendingOptions();
  refreshStatus();
}

async function loadSession(id) {
  const s = await api.getSession(id);
  state.sessionId = id;
  state.status = s.status;
  state.messages = s.messages || [];
  state.postReportTurnsLeft = s.postReportTurnsLeft;
  state.reportHtml = s.reportHtml || '';
  state.conversationReady = !!s.conversationReady;
  $('#chatBody').innerHTML = '';
  state.messages.forEach((m) => {
    const { text } = splitOptions(m.content);
    addBubble(m.role, mdBlock(text));
  });
  const last = state.messages[state.messages.length - 1];
  state.pendingOptions = last && last.role === 'assistant' ? splitOptions(last.content).options : [];
  renderPendingOptions();
  refreshStatus();
}

function updateCounter() {
  const len = $('#msgInput').value.length;
  const el = $('#charCount');
  el.textContent = `${len} / ${state.maxInputChars}`;
  el.classList.toggle('over', len > state.maxInputChars);
}

$('#msgInput').addEventListener('input', () => {
  updateCounter();
  const el = $('#msgInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
});

$('#msgInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSend();
  }
});
$('#btnSend').addEventListener('click', doSend);

function doSend() {
  const el = $('#msgInput');
  const text = el.value.trim();
  if (!text || state.busy || isMuted()) return;
  if (text.length > state.maxInputChars) {
    toast(`单轮输入不能超过 ${state.maxInputChars} 字`);
    return;
  }
  el.value = '';
  el.style.height = 'auto';
  updateCounter();
  sendMessage(text);
}

async function sendMessage(content) {
  if (!state.sessionId || state.busy) return;
  addBubble('user', mdBlock(content));
  state.pendingOptions = [];
  renderPendingOptions();

  const typing = addBubble('assistant', '<span class="typing">思考中…</span>');
  setBusy(true, '正在分析…');
  renderPendingOptions();

  try {
    const data = await api.sendMessage(state.sessionId, content);
    typing.remove();
    const { text, options } = splitOptions(data.reply);
    addBubble('assistant', mdBlock(text));
    state.pendingOptions = options;
    state.postReportTurnsLeft =
      data.postReportTurnsLeft !== undefined ? data.postReportTurnsLeft : state.postReportTurnsLeft;
    if (data.conversationReady) state.conversationReady = true;
    renderPendingOptions();
    if (data.conversationJustReady) {
      toast('对话整理已生成，点「下载报告」保存');
    }
  } catch (e) {
    typing.remove();
    toast(e.message || '发送失败');
  } finally {
    setBusy(false, '说说你的情况…');
    renderPendingOptions();
    refreshStatus();
  }
}

// ---------- 生成报告 ----------
$('#btnReport').addEventListener('click', async () => {
  if (!state.sessionId || state.busy) return;
  if (!confirm('生成后本次诊断将不能再补充信息。确定现在生成报告吗？')) return;
  setBusy(true, '正在生成报告…');
  const tip = addBubble('assistant', '<span class="typing">正在生成诊断报告…</span>');
  try {
    const data = await api.generateReport(state.sessionId);
    tip.remove();
    state.status = 'reported';
    state.reportHtml = data.reportHtml;
    state.postReportTurnsLeft = state.maxPostReportRounds;
    const { text, options } = splitOptions(data.followup || '');
    if (text) addBubble('assistant', mdBlock(text));
    state.pendingOptions = options;
    renderPendingOptions();
    refreshStatus();
    openReport();
  } catch (e) {
    tip.remove();
    toast(e.message || '报告生成失败');
  } finally {
    setBusy(false, '说说你的情况…');
    refreshStatus();
  }
});

// ---------- 下载 ----------
function doDownload() {
  if (!state.conversationReady) {
    toast('报告文件还没生成。在对话里回复「需要」，我会整理成可下载的文件。');
    return;
  }
  window.location.href = api.downloadUrl(state.sessionId);
}
$('#btnDownload').addEventListener('click', doDownload);
$('#btnDownload2').addEventListener('click', doDownload);

// ============================================================
// 报告视图
// ============================================================
function openReport() {
  const body = $('#reportBody');
  body.innerHTML =
    `<div class="md">${state.reportHtml}</div>` +
    '<div class="report-tip">报告生成 24 小时后自动删除，请及时下载保存。<br/>本建议基于经典管理学理论，仅供参考，不构成管理决策唯一依据。</div>';
  showView('report');
}

// ============================================================
// 启动
// ============================================================
window.addEventListener('auth:expired', () => {
  if (state.role) toast('登录已失效，请重新登录');
  state.role = null;
  state.sessionId = null;
  showView('home');
});

(async function bootstrap() {
  try {
    const cfg = await api.getConfig();
    state.maxInputChars = cfg.maxInputChars || 1000;
    state.maxPostReportRounds = cfg.maxPostReportRounds || 10;
    $('#msgInput').maxLength = state.maxInputChars;
    updateCounter();
  } catch {
    /* 后端未就绪时静默降级，便于静态预览 */
  }

  if (getToken()) {
    try {
      const me = await api.me();
      state.role = me.role;
      state.phone = me.phone;
      if (me.role === 'admin') {
        // 管理员保留在首页，通过返回键进入后台；不自动跳转，避免遮挡首页
      }
    } catch {
      setToken('');
    }
  }
  refreshStatus();
})();
