// 装配 omni-leadership-advisor（全向领导力专属顾问）的 system prompt。
// 结构：SKILL.md（角色与流程） + knowledge/（锚点、诊断规则、行动模板、学习路径）
//      + references/（理论详述） + industry-packs/<pack>/（行业话术）
//      + prompts/（H5 专用：开场白、锚点选项协议、报告模板）

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const SKILL = config.skillDir;

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function readIfExists(rel) {
  return read(path.join(SKILL, rel));
}

// 角色与流程骨架
const CORE_FILES = ['SKILL.md'];

// 诊断知识（硬约束：锚点与匹配规则必须进 prompt，否则模型无从执行）
const KNOWLEDGE_FILES = [
  'knowledge/anchored-scales.yaml',
  'knowledge/diagnosis-rules.yaml',
  'knowledge/action-templates.md',
  'knowledge/learning-paths.md',
];

// 理论详述
const REFERENCE_FILES = [
  'references/situational-leadership.md',
  'references/managerial-grid.md',
  'references/grow-model.md',
  'references/managing-up.md',
  'references/lateral-collaboration.md',
];

// H5 运行时协议
const PROTOCOL_FILES = [
  'prompts/options-protocol.md',
  'prompts/report-template.md',
];

// 行业包：把目录下所有 .md / .yaml 拼进来（pack 只改话术与语境，不改理论骨架）
function packFiles() {
  const pack = config.activePack === 'postal' ? 'postal' : 'generic';
  const dir = path.join(SKILL, 'knowledge', 'industry-packs', pack);
  let files = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => /\.md$|\.yaml$/.test(f))
      .sort();
  } catch {
    return { pack, parts: [] };
  }
  const parts = files
    .map((f) => {
      const c = read(path.join(dir, f));
      return c ? `\n\n# 行业包文件: industry-packs/${pack}/${f}\n${c}` : '';
    })
    .filter(Boolean);
  return { pack, parts };
}

export function activePack() {
  return config.activePack === 'postal' ? 'postal' : 'generic';
}

let cachedPrompt = null;

export function buildSystemPrompt() {
  if (cachedPrompt) return cachedPrompt;

  const parts = [];
  for (const f of CORE_FILES) {
    const c = readIfExists(f);
    if (c) parts.push(`\n\n# 文件: ${f}\n${c}`);
  }
  for (const f of KNOWLEDGE_FILES) {
    const c = readIfExists(f);
    if (c) parts.push(`\n\n# 知识文件: ${f}\n${c}`);
  }
  for (const f of REFERENCE_FILES) {
    const c = readIfExists(f);
    if (c) parts.push(`\n\n# 理论文件: ${f}\n${c}`);
  }

  const { pack, parts: packParts } = packFiles();
  if (packParts.length) {
    parts.push(`\n\n# 当前行业包: ${pack}（只用于话术与语境本地化，不得改动理论骨架与匹配逻辑）`);
    parts.push(...packParts);
  }

  for (const f of PROTOCOL_FILES) {
    const c = readIfExists(f);
    if (c) parts.push(`\n\n# 运行时协议: ${f}\n${c}`);
  }

  const runtime = [
    '',
    '# 运行时约定',
    `- 当前行业包：${pack}。`,
    '- 你正在一个 H5 网页里与用户对话。用户每轮输入不超过 1000 字。',
    '- 禁止让用户打分，只能用情境化文字选项（见 options-protocol.md）。',
    '- 每轮提问前用半句说明进度（如「这是定位方向的第 2 步」），降低用户的不确定性。',
    '- 用户流露情绪消耗时，先一句共情确认，再继续诊断。',
    '- 报告由用户主动触发；在此之前不要提前输出完整报告。',
  ].join('\n');
  parts.push(runtime);

  cachedPrompt = parts.join('\n');
  return cachedPrompt;
}

// 确定性开场白：避免空历史下让模型自由发挥导致开场不一致、或混入无关信息。
export function buildGreeting() {
  const c = readIfExists('prompts/greeting.md').trim();
  return (
    c ||
    '你好，我是全向领导力顾问，陪你处理向上汇报、向下管理、横向协调这三类职场困境。先说说最近让你最卡的一件事吧——它发生在你和谁之间？'
  );
}

// 生成报告时注入：报告模板 + 当前行业包语境
export function buildReportInstruction() {
  const tpl = readIfExists('prompts/report-template.md');
  const { pack, parts } = packFiles();
  const packCtx = parts.length
    ? `\n\n# 生成报告时的行业语境（${pack}）——仅用于话术与案例本地化\n${parts.join('\n')}`
    : '';
  return `${tpl}${packCtx}\n\n要求：\n- 只输出报告正文，不要输出任何额外解释或寒暄。\n- 不要输出 [[OPTIONS]] 标记块。`;
}
