import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, WRITE_OPTS } from './config.js';

// 邮箱验证码存储：内存 + 文件持久化。
// 同一份存储既服务「邮箱验证码登录」也服务「绑定邮箱」，均以邮箱地址为 key。

const FILE = path.join(config.dataDir, 'emailcodes.json');
const codes = new Map(); // email -> { code, expiresAt, lastSentAt, attempts, sendsWindow:[ts] }

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const [k, v] of Object.entries(d || {})) codes.set(k, v);
  } catch {
    /* 无持久化文件 */
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(codes)), WRITE_OPTS);
  } catch {
    /* 忽略写入失败 */
  }
}

export function requestCode(email) {
  const now = Date.now();
  const ttl = (config.emailCodeTtlMinutes || 10) * 60 * 1000;
  const cooldown = (config.emailSendCooldownSeconds || 60) * 1000;
  const maxSends = config.emailMaxSendsPerHour || 5;

  let rec = codes.get(email);
  if (rec) {
    if (now - (rec.lastSentAt || 0) < cooldown) {
      const wait = Math.ceil((cooldown - (now - rec.lastSentAt)) / 1000);
      throw new Error(`请 ${wait} 秒后再获取验证码`);
    }
    const recent = (rec.sendsWindow || []).filter((t) => now - t < 3600 * 1000);
    if (recent.length >= maxSends) {
      throw new Error('该邮箱获取验证码过于频繁，请稍后再试');
    }
    rec.sendsWindow = recent.concat(now);
  } else {
    rec = { code: '', expiresAt: 0, lastSentAt: 0, attempts: 0, sendsWindow: [now] };
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  rec.code = code;
  rec.expiresAt = now + ttl;
  rec.lastSentAt = now;
  rec.attempts = 0;
  codes.set(email, rec);
  persist();
  return code;
}

export function verifyCode(email, inputCode) {
  const rec = codes.get(email);
  if (!rec) throw new Error('请先获取验证码');
  if (Date.now() > rec.expiresAt) {
    codes.delete(email);
    persist();
    throw new Error('验证码已过期，请重新获取');
  }
  if ((rec.attempts || 0) >= (config.emailMaxVerifyAttempts || 5)) {
    codes.delete(email);
    persist();
    throw new Error('验证码尝试次数过多，请重新获取');
  }
  if (rec.code !== String(inputCode || '').trim()) {
    rec.attempts = (rec.attempts || 0) + 1;
    persist();
    throw new Error('验证码不正确');
  }
  codes.delete(email);
  persist();
  return true;
}

load();
