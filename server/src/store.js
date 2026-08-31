import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, WRITE_OPTS } from './config.js';
import { extractReportSummary } from './context.js';

const sessions = new Map();

function ensureDirs() {
  fs.mkdirSync(config.sessionsDir, { recursive: true });
  fs.mkdirSync(config.reportsDir, { recursive: true });
  fs.mkdirSync(config.conversationsDir, { recursive: true });
}

function loadAll() {
  ensureDirs();
  try {
    for (const f of fs.readdirSync(config.sessionsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(config.sessionsDir, f), 'utf8'));
        // 跳过无 id / id 非法的脏数据，避免 undefined 等会话污染内存并指向空壳文件
        if (!s || typeof s.id !== 'string' || s.id.length < 8) {
          fs.unlinkSync(path.join(config.sessionsDir, f));
          continue;
        }
        sessions.set(s.id, s);
      } catch {
        /* corrupt file, ignore */
      }
    }
  } catch {
    /* empty */
  }
}

export function createSession(pack = 'generic', phone = null) {
  const id = crypto.randomUUID();
  const s = {
    id,
    phone, // 归属用户手机号（鉴权后必填，用于恢复历史与会话隔离）
    createdAt: Date.now(),
    status: 'collecting', // collecting | reported
    pack, // 行业包快照：会话创建时的 ACTIVE_PACK，避免中途切换导致话术漂移
    title: '', // 列表展示标题：首条用户消息自动写入，可被用户改名覆盖
    messages: [],
    // 结构化诊断记忆：常驻 system，使压缩掉旧对话后模型仍握有关键结论。
    // reportSummary 在生成报告时抽取；keyFacts 预留给未来锚点/事实回写。
    state: { keyFacts: [], reportSummary: '' },
    report: null,
    postReportTurns: 0,
    conversationFile: null, // 对话整理 HTML 路径（用户确认需要后生成）
    conversationReady: false,
  };
  sessions.set(id, s);
  persist(s);
  return s;
}

// 返回该用户最近一个「有效」会话：reported 会话在 reportTtlHours 内有效；
// collecting 会话在 abandonTtlDays 内有效。无则 null。
export function getLatestValidSessionForPhone(phone) {
  const now = Date.now();
  const ttl = config.reportTtlHours * 3600 * 1000;
  const abandonTtl = config.abandonTtlDays * 24 * 3600 * 1000;
  let best = null;
  for (const s of sessions.values()) {
    if (!phone || s.phone !== phone) continue;
    let valid;
    if (s.status === 'reported' && s.report) {
      valid = now - s.report.generatedAt <= ttl;
    } else {
      valid = now - s.createdAt <= abandonTtl;
    }
    if (!valid) continue;
    if (!best || s.createdAt > best.createdAt) best = s;
  }
  return best;
}

export function getSession(id) {
  return sessions.get(id);
}

export function persist(s) {
  fs.writeFileSync(path.join(config.sessionsDir, `${s.id}.json`), JSON.stringify(s), WRITE_OPTS);
}

export function addMessage(s, role, content) {
  s.messages.push({ role, content, ts: Date.now() });
  // 首条用户消息自动作为会话标题（列表展示用），可被 renameSession 覆盖
  if (role === 'user' && !s.title && content) {
    s.title = content.replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  persist(s);
}

// 列表展示用的标题：优先存好的 title，否则取首条用户消息前 14 字，再否则回退「行业包名·日期」
const PACK_LABELS = { generic: '通用诊断', postal: '邮政行业' };
export function deriveTitle(s) {
  if (s.title) return s.title;
  const firstUser = s.messages.find((m) => m.role === 'user');
  if (firstUser && firstUser.content) {
    return firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 14);
  }
  const d = new Date(s.createdAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${PACK_LABELS[s.pack] || '诊断'} · ${mm}-${dd}`;
}

export function renameSession(s, title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!t) return false;
  s.title = t;
  persist(s);
  return true;
}

// 删除会话：从内存与磁盘移除，并清理对话整理 HTML（若存在）
export function deleteSession(s) {
  sessions.delete(s.id);
  try {
    fs.unlinkSync(path.join(config.sessionsDir, `${s.id}.json`));
  } catch {
    /* 文件可能已不存在 */
  }
  if (s.conversationFile) {
    try {
      fs.unlinkSync(s.conversationFile);
    } catch {
      /* ignore */
    }
  }
}

// 列出某手机号下的全部会话（倒序：最新在前），仅返回列表所需轻量字段
export function listSessionsForPhone(phone) {
  const list = [];
  for (const s of sessions.values()) {
    if (!phone || s.phone !== phone) continue;
    const lastMsg = s.messages[s.messages.length - 1];
    list.push({
      id: s.id,
      title: deriveTitle(s),
      status: s.status,
      pack: s.pack,
      createdAt: s.createdAt,
      lastActiveAt: lastMsg ? lastMsg.ts : s.createdAt,
      messageCount: s.messages.length,
      reportReady: !!s.report,
      conversationReady: !!s.conversationReady,
    });
  }
  list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return list;
}

export function setReport(s, markdown, html) {
  s.status = 'reported';
  s.report = { markdown, html: html || '', generatedAt: Date.now() };
  // 抽取核心结论摘要，常驻 system 状态快照，避免报告后每轮重复塞整篇报告
  s.state = s.state || { keyFacts: [], reportSummary: '' };
  s.state.reportSummary = extractReportSummary(markdown);
  s.postReportTurns = 0;
  persist(s);
}

// 标记对话整理 HTML 已生成（文件由调用方写入 conversationsDir）
export function setConversation(s, filePath) {
  s.conversationFile = filePath;
  s.conversationReady = true;
  persist(s);
}

// 隐私清理：报告生成后保留 reportTtlHours，超时删对话+报告；长期未报告(abandon)的会话按 abandonTtlDays 删
export function cleanup() {
  const now = Date.now();
  const ttl = config.reportTtlHours * 3600 * 1000;
  const abandonTtl = config.abandonTtlDays * 24 * 3600 * 1000;
  for (const [id, s] of sessions) {
    let expired = false;
    if (s.status === 'reported' && s.report) {
      expired = now - s.report.generatedAt > ttl;
    } else {
      expired = now - s.createdAt > abandonTtl;
    }
    if (expired) {
      sessions.delete(id);
      try {
        fs.unlinkSync(path.join(config.sessionsDir, `${id}.json`));
      } catch {
        /* ignore */
      }
      if (s.conversationFile) {
        try {
          fs.unlinkSync(s.conversationFile);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

loadAll();
// unref：清理定时器不应阻止进程退出，否则 `node --test` 会因事件循环被持续持有而挂住不返回。
// 生产环境由 app.listen 保活，不受影响。
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
export { cleanupTimer };
