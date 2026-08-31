// 锚点选项协议的共用解析：
// 模型在需要用户「对号入座」时，会在回复末尾输出
//   [[OPTIONS]]
//   A|描述
//   [[/OPTIONS]]
// 前端把它渲染成可点击卡片；落到 HTML（报告预览 / 下载文件）时，
// 必须把它转成可读的 Markdown 列表，否则用户会看到裸露的标记。
const OPT_RE = /\[\[OPTIONS\]\]([\s\S]*?)\[\[\/OPTIONS\]\]/g;

export function stripOptions(content) {
  const src = String(content || '');
  if (!src.includes('[[OPTIONS]]')) return src;
  return src.replace(OPT_RE, (_full, body) => {
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf('|');
        if (i < 0) return `- ${l}`;
        const key = l.slice(0, i).trim();
        const label = l.slice(i + 1).trim();
        return `- **${key}**　${label}`;
      });
    return lines.length ? `\n\n${lines.join('\n')}\n` : '';
  });
}
