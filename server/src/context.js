import { config } from './config.js';

// CJK 及中文标点的码点下界（部首扩展 0x2E80 起，覆盖汉字、中文标点、全角字符）。
const CJK_THRESHOLD = 0x2e80;

/**
 * 估算一段文本的 token 数。
 * 中文（含标点）按 ~1 token/字；其余（英文/数字）按 ~4 字符/token。
 * 这是轻量估算，不是精确 tokenizer；刻意对中文略保守（高估），优先保证不撞窗。
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.codePointAt(0) >= CJK_THRESHOLD) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 1 + other / 4);
}

/** 估算一组对话消息的总 token（含 role 标签开销）。 */
export function estimateMessages(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m?.content);
    total += 4; // role 标签 + 消息结构基线
  }
  return total;
}

/**
 * 从报告 markdown 抽取核心结论摘要，用于每轮 system 注入，
 * 替代旧实现「报告后每轮把整篇报告塞进 extraSystem」的冗余。
 * 取【问题定位】与【诊断依据】两段——通常已足够模型回忆诊断上下文，且远短于全文。
 */
export function extractReportSummary(md) {
  if (!md) return '';
  const grab = (header) => {
    const re = new RegExp(`##\\s*【${header}】([\\s\\S]*?)(?=\\n##\\s*【|$)`);
    const m = md.match(re);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  };
  const loc = grab('问题定位');
  const basis = grab('诊断依据');
  const lines = [];
  if (loc) lines.push('问题定位：' + loc.slice(0, 400));
  if (basis) lines.push('诊断依据：' + basis.slice(0, 300));
  return lines.join('\n');
}

/** 由 session 组装常驻 system 的状态快照（结构化诊断记忆）。 */
function buildStateSnapshot(s) {
  const parts = [];
  const reportSummary = s?.state?.reportSummary;
  if (s?.status === 'reported' && reportSummary) {
    parts.push('【已生成诊断报告，核心结论摘要（无需重复生成报告）】\n' + reportSummary);
  }
  const facts = s?.state?.keyFacts;
  if (Array.isArray(facts) && facts.length) {
    parts.push('【用户已确认的关键事实】\n' + facts.join('\n'));
  }
  return parts.join('\n\n');
}

/** 更早对话被压缩后的同步占位提示（不调用 LLM；结构化状态已常驻 system）。 */
function summarizeOlder() {
  return '（以上为更早的对话，已压缩；关键结论已固化在上方「诊断报告摘要 / 关键事实」中，请基于这些上下文继续作答。）';
}

/**
 * 组装传给 chat() 的上下文。
 * - history：压缩后的对话消息数组（不含 system）。
 * - extraSystem：合并后的 system 附加段（含状态快照）。
 *
 * @param {object} s session
 * @param {object} [opts]
 * @param {string} [opts.extraSystem] 调用方附加的 system 段（如报告生成指令）
 * @param {boolean} [opts.preserveAll] 为 true 时不压缩，原样返回全部历史（用于报告生成，需读全量诊断对话）
 */
export function buildContext(s, { extraSystem = '', preserveAll = false } = {}) {
  const stateExtra = buildStateSnapshot(s);
  const fullExtra = [extraSystem, stateExtra].filter(Boolean).join('\n\n');
  const sysOverhead = estimateTokens(fullExtra) + 200; // +200 给 base system prompt 基线缓冲
  const messages = Array.isArray(s?.messages) ? s.messages : [];

  if (preserveAll) {
    return { history: messages, extraSystem: fullExtra };
  }

  const window = config.contextWindowTokens;
  const budget = Math.floor(window * config.contextBudgetRatio);
  let avail = budget - sysOverhead;
  if (avail <= 0) {
    // 极端兜底：系统开销已占满，仅保留最近 1 轮
    return { history: messages.slice(-2), extraSystem: fullExtra };
  }

  const recentCount = config.recentTurns * 2;
  const recent = messages.slice(-recentCount);
  const older = messages.slice(0, Math.max(0, messages.length - recentCount));

  if (estimateMessages(recent) <= avail) {
    // recent 放得下：把 older 尽量塞入（从靠近 recent 的一端往回，保留更相关的早期轮）
    const kept = [];
    let used = estimateMessages(recent);
    for (let i = older.length - 1; i >= 0; i--) {
      const t = estimateTokens(older[i]?.content) + 4;
      if (used + t <= avail) {
        kept.unshift(older[i]);
        used += t;
      } else break;
    }
    return { history: [...kept, ...recent], extraSystem: fullExtra };
  }

  // recent 本身超预算：插入 older 摘要占位，再截断 recent 早期部分（保留最近的）
  const summary = older.length ? [{ role: 'system', content: summarizeOlder() }] : [];
  const keptRecent = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = estimateTokens(recent[i]?.content) + 4;
    if (used + t <= avail) {
      keptRecent.unshift(recent[i]);
      used += t;
    } else break;
  }
  return { history: [...summary, ...keptRecent], extraSystem: fullExtra };
}
