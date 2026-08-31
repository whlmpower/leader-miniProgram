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

export const api = {
  getConfig: () => request('/api/config'),

  captcha: () => request('/api/auth/captcha', { method: 'POST' }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/me'),

  listUsers: () => request('/api/admin/users'),
  createUser: (phone) => request('/api/admin/users', { method: 'POST', body: { phone } }),
  resetUser: (phone) => request(`/api/admin/users/${encodeURIComponent(phone)}/reset`, { method: 'POST' }),
  revokeUser: (phone) => request(`/api/admin/users/${encodeURIComponent(phone)}/revoke`, { method: 'POST' }),
  changeAdminPwd: (oldPwd, newPwd) =>
    request('/api/admin/password', { method: 'PUT', body: { oldPwd, newPwd } }),

  mySessions: () => request('/api/sessions/mine'),
  createSession: () => request('/api/session', { method: 'POST' }),
  getSession: (id) => request(`/api/session/${encodeURIComponent(id)}`),
  sendMessage: (id, content) =>
    request(`/api/session/${encodeURIComponent(id)}/message`, { method: 'POST', body: { content } }),
  generateReport: (id) => request(`/api/session/${encodeURIComponent(id)}/report`, { method: 'POST' }),

  downloadUrl: (id) => `/api/session/${encodeURIComponent(id)}/conversation/download`,
};
