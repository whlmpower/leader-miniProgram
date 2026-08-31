// 对话整理 HTML 渲染：将「到报告生成为止」的完整对话流渲染为可下载的 HTML 文件。
// 含标题区（脱敏手机号 + 生成时间 + 行业包），报告那条做视觉高亮。
// 说明：下载文件走浅底版式（打印友好），品牌识别由深墨蓝顶边 + 青绿强调承担。
// Markdown 渲染统一使用 marked（与 H5 前端渲染效果一致），避免下载文件呈现原始 Markdown 符号。

import { marked } from 'marked';
import { stripOptions } from './options.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function maskPhone(p) {
  if (!p || p.length < 7) return p || '用户';
  return p.slice(0, 3) + '****' + p.slice(-4);
}

function renderMarkdown(content) {
  const md = stripOptions(content || '').trim();
  if (!md) return '';
  return marked.parse(md);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// 文件名安全版脱敏：Windows 文件名不允许 * ? : " < > | 等字符，
// 直接用 139****1234 作为文件名会抛 ENOENT（Linux 合法、Windows 非法）。
function maskPhoneForFile(p) {
  return maskPhone(p).replace(/[*?"<>|:]/g, 'X');
}

// 生成文件名：脱敏手机号_YYYYMMDD_HHmm.html
export function buildConversationFileName(phone, date = new Date()) {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${maskPhoneForFile(phone)}_${stamp}.html`;
}

const PACK_LABEL = { generic: '通用', postal: '中国邮政' };

export function renderConversationHtml({ phone, pack, messages, generatedAt = Date.now() }) {
  const dt = new Date(generatedAt);
  const timeStr = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const packLabel = PACK_LABEL[pack] || '通用';

  const rows = messages
    .map((m) => {
      const isUser = m.role === 'user';
      const isReport = m.role === 'assistant' && m.isReport;
      const bubbleCls = isUser ? 'user' : isReport ? 'ai report' : 'ai';
      const avatar = isUser ? '你' : '顾';
      const body = renderMarkdown(m.content);
      const tag = isReport ? '<div class="msg-tag">诊断报告</div>' : '';
      return `<div class="msg ${bubbleCls}">${tag}<div class="av">${avatar}</div><div class="bubble">${body}</div></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>全向领导力诊断对话记录 - ${maskPhone(phone)}</title>
<style>
  :root{
    --ink:#14202E; --muted:#5A6B7D; --line:#E1E7EE; --brand:#14202E; --accent:#0F6E56;
    --bg:#F5F7FA; --card:#FFFFFF; --user-bg:#E8EDF4; --report-bg:#EDF7F4; --report-line:#35B89A;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    line-height:1.7;font-size:16px;}
  .topbar{height:6px;background:var(--brand);}
  header.meta{max-width:820px;margin:0 auto;padding:26px 20px 12px;}
  header.meta .eyebrow{font-size:12px;letter-spacing:2px;color:var(--accent);margin:0 0 6px;text-transform:uppercase;}
  header.meta h1{font-size:23px;margin:0 0 10px;letter-spacing:.5px;color:var(--brand);}
  header.meta .sub{color:var(--muted);font-size:13px;}
  header.meta .sub span{margin-right:16px;}
  main{max-width:820px;margin:0 auto;padding:8px 20px 80px;}
  .msg{display:flex;gap:10px;margin:18px 0;align-items:flex-start;}
  .av{flex:0 0 36px;height:36px;border-radius:50%;background:var(--brand);color:#fff;
    display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;}
  .msg.user{flex-direction:row-reverse;}
  .msg.user .av{background:#8BA0B5;color:#0F1B26;}
  .msg-tag{width:100%;font-size:12px;color:var(--accent);font-weight:600;margin-bottom:4px;letter-spacing:1px;}
  .msg.report{flex-direction:column;align-items:stretch;}
  .msg.report .av{align-self:flex-start;background:var(--accent);}
  .bubble{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;max-width:88%;}
  .msg.user .bubble{background:var(--user-bg);border-color:#D3DCE7;}
  .msg.report .bubble{background:var(--report-bg);border:1px solid var(--report-line);max-width:100%;}
  .bubble h1{font-size:21px;margin:6px 0 14px;color:var(--brand);}
  .bubble h2{font-size:18px;margin:22px 0 10px;padding-left:10px;border-left:3px solid var(--report-line);}
  .bubble h3{font-size:16px;margin:18px 0 6px;color:var(--accent);}
  .bubble h4{font-size:15px;margin:14px 0 6px;color:var(--accent);}
  .bubble h5,.bubble h6{font-size:14px;margin:12px 0 6px;color:var(--muted);}
  .bubble p{margin:8px 0;}
  .bubble ul,.bubble ol{margin:8px 0;padding-left:22px;}
  .bubble li{margin:5px 0;}
  .bubble li > ul,.bubble li > ol{margin:4px 0;}
  .bubble blockquote{margin:12px 0;padding:10px 14px;background:#F1F5F9;border-left:3px solid var(--muted);
    border-radius:8px;color:var(--muted);}
  .bubble blockquote p{margin:4px 0;}
  .bubble hr{border:0;border-top:1px dashed var(--line);margin:20px 0;}
  .bubble pre.code{background:#0F1B26;color:#E8EEF4;padding:12px;border-radius:10px;overflow:auto;font-size:13px;}
  .bubble code{background:#EDF1F6;color:#0F6E56;padding:2px 6px;border-radius:5px;font-size:13px;
    font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;}
  .bubble pre.code code{background:transparent;color:inherit;padding:0;}
  .bubble table{border-collapse:collapse;margin:12px 0;width:100%;font-size:14px;}
  .bubble th,.bubble td{border:1px solid var(--line);padding:8px 10px;text-align:left;}
  .bubble th{background:#EDF2F7;font-weight:600;color:var(--brand);}
  .bubble tr:nth-child(even) td{background:#FAFBFD;}
  .bubble a{color:var(--accent);text-decoration:underline;}
  .bubble img{max-width:100%;border-radius:8px;margin:8px 0;}
  .bubble strong{font-weight:700;color:#0A131C;}
  .bubble em{font-style:italic;}
  .footnote{text-align:center;color:var(--muted);font-size:12px;margin-top:34px;padding-top:18px;
    border-top:1px solid var(--line);}
  @media print{
    body{background:#fff;}
    main{max-width:none;}
    .topbar{height:4px;}
  }
</style>
</head>
<body>
  <div class="topbar"></div>
  <header class="meta">
    <p class="eyebrow">Omni Leadership Advisor</p>
    <h1>全向领导力诊断对话记录</h1>
    <div class="sub">
      <span>用户：${maskPhone(phone)}</span>
      <span>行业包：${escapeHtml(packLabel)}</span>
      <span>生成时间：${timeStr}</span>
    </div>
  </header>
  <main>
${rows}
    <div class="footnote">本记录基于经典管理学理论生成，仅供参考，不构成管理决策唯一依据。生成 24 小时后自动删除。</div>
  </main>
</body>
</html>`;
}
