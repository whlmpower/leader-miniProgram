import { config, isMock } from './config.js';

export async function chat(
  systemPrompt,
  history,
  { temperature = config.llmTemperature, extraSystem = '' } = {}
) {
  if (isMock()) return mockChat(history);
  return openaiChat(systemPrompt, history, temperature, extraSystem);
}

async function openaiChat(systemPrompt, history, temperature, extraSystem) {
  if (!config.llmApiKey) {
    throw new Error('未配置 LLM_API_KEY，且未开启 LLM_MOCK，无法调用真实大模型');
  }
  const sysContent = extraSystem ? `${systemPrompt}\n\n${extraSystem}` : systemPrompt;
  const resp = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llmApiKey}`,
    },
    body: JSON.stringify({
      model: config.llmModel,
      temperature,
      messages: [{ role: 'system', content: sysContent }, ...history],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM API error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

function opts(...lines) {
  return `[[OPTIONS]]\n${lines.join('\n')}\n[[/OPTIONS]]`;
}

// ---------- Mock 模式：无需 API Key 即可演示完整诊断流程 ----------
// 序列刻意演示「方向定位 → 情境画像 → 锚点对号入座」链路，并输出 [[OPTIONS]] 块，
// 供前端验证选项卡片渲染。接入真实模型后由 skill 驱动，本段不再生效。
function mockChat(history) {
  const userTurns = history.filter((m) => m.role === 'user').length;
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const lastText = lastUser ? lastUser.content : '';

  if (userTurns <= 1) {
    return `明白了。被上级一句话否掉，那种憋屈我懂——你不是在抱怨，是在问"我该怎么把事办成"。我们按标准诊断来，想更深随时说。

这是定位方向的第 2 步：他给你布置任务时，你对"要做什么、做到什么标准"清楚吗？

${opts(
  'A|完全不清晰：不知道领导到底要什么',
  'B|大致知道：知道方向，但标准模糊',
  'C|明确KPI：有清晰指标和交付标准',
  'D|懂战略意图：连为什么做、长远目标都清楚'
)}`;
  }

  if (userTurns === 2) {
    return `收到。接着第 3 步——你平时是怎么跟他同步工作的？

${opts(
  'A|只在被催才报：出了事才说',
  'B|定期报进度：按节奏同步，但不主动暴露风险',
  'C|主动报风险：提前同步卡点和风险',
  'D|带方案请示：提问题同时给选项和推荐'
)}`;
  }

  if (userTurns === 3) {
    return `你刚才提到「${lastText.slice(0, 14)}…」，这点很关键。我想确认一个事：你说你已经在主动同步了，那提想法被否的时候，他通常是怎么回你的？

给我一个具体的场景——上一回你想提改进、被挡回来，当时你说的是什么，他怎么答的？`;
  }

  if (userTurns === 4) {
    return `这个细节很有用。最后一个锚点——你估计他平时是怎么管过程的？

${opts(
  'A|放手型：只问结果，不干预过程',
  'B|关注节点：关键里程碑才介入',
  'C|过程管控：要按既定流程走，常过问细节',
  'D|微管理：大小事都要经手、亲自把关'
)}`;
  }

  const openers = [
    `我大概看清了。再补一个细节：那次之后，你是照原方案执行了，还是偷偷按自己的想法做了一点？结果如何？`,
    `顺着这个再走一步：他在别人面前否过你的想法吗？还是只在私下？这个区别很关键。`,
    `你说"不想就这么算了"——我想问的是，你更想要的是"让他听进去"，还是"保住自己想做事的那口气"？`,
    `还有一个变量：他上面还有人吗？他这么做，有多少是因为他自己也被上面压着？`,
  ];
  return openers[userTurns % openers.length];
}

// 演示用示例报告（结构合规，接入真实模型后会被个性化内容替代）
export function mockReport() {
  return `# 全向领导力诊断报告

## 【问题定位】
你与强势指令型直属上级之间，表达个人想法即被系统性否定 → **向上影响失效**。根因不在"你不主动"，而在"你已足够主动 + 想法偏离既定框架 → 触发了对方的控制保护机制"。方向：向上。理论标签：向上管理 + 金字塔原理。

## 【理论依据】
- **匹配理论**：向上管理（Managing Up）+ 金字塔原理——属**实践框架**，非因果科学，效果因人而异。
- **为什么是它**：你的锚点组合是「预期清晰度 = 明确KPI」+「汇报主动性 = 带方案请示」。按标准规则，这个组合本应给出"带方案请示、结论先行"的建议——**但你已经这么做了，仍然被拒**。这说明标准规则不足以解释你的处境，真正的卡点在第三个变量上：他对"偏离既定方案"的容忍度极低。
- **置信度**：中。理论本身成熟，但"高主动仍受阻"这一分支属情景化扩展，非规则直接命中。

## 【根因分析】
1. **预期极清晰（C），但路径被锁死**：他把任务拆到了"怎么做"这一层，而你的创造性恰恰出现在"怎么做"上——正好撞进他的控制区。
2. **"面带笑容但态度强硬"= 控制保护，不是对你个人的否定**：强势管理者会把"不同的想法"潜意识读成"挑战权威 / 可能失控"，所以用微笑的方式拒绝。这是他的安全感问题，不是你的价值问题。
3. **价值观错位**：你成长于"给予自主"的管理环境，把"有想法空间"视为常态；他信奉"拆解 + 执行"。这是管理哲学层面的冲突——技巧能缓解，解决不了。

## 【行动清单】

### 立即做（今 / 明日）
把"想法"重新包装进他的框架：任何想提的改进，先认他的目标，再附数据，只申请"小试验"而非"大辩论"。

- 💬 话术 A：「关于 X（他的目标），我按您的思路先把 A 落地了；另外我试了个小变种 B，在〔某指标〕上比 A 快 20%。下一块能不能先用 B 跑一下，拿数据给您看？」
- 💬 话术 B（被拒时）：「明白，那我按原方案走。B 我先记着，下次有合适场景再提。」——不纠结、不个人化。

### 本周做
建一个"信用账户"：把他拆细的活，**超额、零返工**地交完 2-3 个，再用"我能不能自己定实现方式、出份对比给您"去换一小块自主权。信用够了，控制才会松动。

### 跟进指标
- 他主动问"你怎么看"的频率；
- 你"自选实现方式"的任务占比，是否从 0 往上走；
- 每周自评：被否定后的情绪消耗是否下降。

### ⚠️ 避坑
- 别在**公开场合**抛不同想法——当众挑战控制，必被拒。要私下、小范围、带数据。
- 别说"我觉得有更好的方法"——会触发"你在教我做事"。要说"为达成您的目标，我试了…，数据表明…"。
- 别因被拒就消极执行——那会反过来证实他"给你自主 = 不可控"的担忧，他会收得更紧。
- 别把"他否定了想法"等同于"他否定了你这个人"。

## 【预期效果】
- 具体、有数据、且在框架内的想法，被**部分**采纳——从 0 突破到偶尔，就已经是进展。
- 不再把每一次否定都当成对自己的打击，消耗感明显下降。
- 逐步挣到**局部**自主权：先一小块，再扩大。

## 【置信度拆解】
| 来源 | 内容 | 说明 |
|---|---|---|
| 规则命中 | 向上管理 + 金字塔原理；锚点 C / D 组合 | 来自理论库，可信度较高 |
| 模型扩展 | "框架内微提案" + "信用账户" + 目标与方法解耦 | 针对本次情境的即时推断，低置信，供参考 |

## 【诊断依据】
用户输入（强势指令型 / 表达即被拒 / 来自自主型管理背景 / 不认可其方法）→ 锚点 up_expectation = C、up_proactivity = D、up_leader_control = D → 理论 references/managing-up.md + 金字塔原理 → 置信度：中 → 出处：理论库规则 + 情景化扩展。

## 【理论延伸】
- 读：《Managing Up》（Rosanne Badowski）。练：列出上级最在意的 3 个核心关注点，对齐之后再开口。
- 反思题：这一周，我对他的"否定"有没有过度个人化的解读？
- 关于创造力保护（**通用经验，非理论**）：向上管理换不来一个"自主型的上级"。真正护住创造力的是两件事——①在"达成他的目标"前提下，把创新塞进 HOW 层的小试验；②在工作之外保留一个完全自主的创造出口。别把全部的自我实现都押在"让他改变"上。

> 本建议基于经典管理学理论，仅供参考，不构成管理决策唯一依据，请结合实际情况调整。

> （示例报告 · 当前为演示模式 LLM_MOCK=true，接入真实大模型后将基于你的真实对话生成个性化内容。）
`;
}
