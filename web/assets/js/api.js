// 网络层：统一封装 fetch。JWT 主载体是后端下发的 httpOnly Cookie，
// 这里额外保留一份 localStorage 副本用于前端判断角色与渲染，不参与安全决策。

const TOKEN_KEY = 'ola_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 隐私模式下 localStorage 不可用，忽略 */
  }
}

async function request(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && typeof opts.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { ...opts, headers, credentials: 'same-origin' });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;

  if (res.status === 401) {
    setToken('');
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `请求失败（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 注意：所有接口均为「相对路径」（不带前导 /），以便本项目可部署在子路径下
// （如 https://w-k-u-m.cn/leader/）。相对路径在根路径（本地开发 /）与子路径
// （/leader/）下都能正确解析为 /leader/api/...，由 Nginx 剥离 /leader/ 前缀后转发到本机 3002。
export const api = {
  getConfig: () => request('api/config'),

  captcha: () => request('api/auth/captcha', { method: 'POST' }),
  login: (payload) => request('api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('api/auth/logout', { method: 'POST' }),
  me: () => request('api/me'),

  // 邮箱自注册（邀请码门控）
  verifyInvite: (code) => request('api/auth/register/verify-invite', { method: 'POST', body: { code } }),
  registerSendCode: (email, inviteToken) =>
    request('api/auth/register/send-code', { method: 'POST', body: { email, inviteToken } }),
  registerVerifyEmail: (email, code) =>
    request('api/auth/register/verify-email', { method: 'POST', body: { email, code } }),
  registerComplete: (regToken, phone, password) =>
    request('api/auth/register/complete', { method: 'POST', body: { regToken, phone, password } }),

  listUsers: () => request('api/admin/users'),
  createUser: (phone, email) =>
    request('api/admin/users', { method: 'POST', body: email ? { phone, email } : { phone } }),
  resetUser: (phone) => request(`api/admin/users/${encodeURIComponent(phone)}/reset`, { method: 'POST' }),
  revokeUser: (phone) => request(`api/admin/users/${encodeURIComponent(phone)}/revoke`, { method: 'POST' }),
  changeAdminPwd: (oldPwd, newPwd) =>
    request('api/admin/password', { method: 'PUT', body: { oldPwd, newPwd } }),

  mySessions: () => request('api/sessions/mine'),
  listSessions: () => request('api/sessions'),
  renameSession: (id, title) =>
    request(`api/session/${encodeURIComponent(id)}`, { method: 'PUT', body: { title } }),
  deleteSession: (id) => request(`api/session/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createSession: () => request('api/session', { method: 'POST' }),
  getSession: (id) => request(`api/session/${encodeURIComponent(id)}`),
  sendMessage: (id, content) =>
    request(`api/session/${encodeURIComponent(id)}/message`, { method: 'POST', body: { content } }),
  generateReport: (id) => request(`api/session/${encodeURIComponent(id)}/report`, { method: 'POST' }),

  // 相对路径：在 /leader/ 下解析为 /leader/api/session/.../conversation/download
  downloadUrl: (id) => `api/session/${encodeURIComponent(id)}/conversation/download`,
};
