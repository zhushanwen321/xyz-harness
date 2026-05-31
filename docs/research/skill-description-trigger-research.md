# Skill 描述与触发机制调研报告

> 调研日期：2026-05-31
> 调研范围：Claude Code 官方文档、Anthropic 官方指南、社区经验、学术研究

---

## 核心结论

**Skill 的 description 字段是触发率的唯一决定因素。** 在 Claude Code 的架构中，模型在 session 启动时只能看到所有 skill 的 `name` + `description`（组合上限 1536 字符）。模型基于这段文本做概率匹配，决定是否加载 skill。这是概率性的，不是确定性的——精心编写的 description 也可能 0% 触发。

---

## 1. Description 字段最佳实践

### 1.1 Anthropic 官方指南（The Complete Guide to Building Skills for Claude）

**结构公式：**

```
[What it does] + [When to use it] + [Key capabilities]
```

三条缺一不可。官方明确要求 description 必须包含：
- **做什么**：skill 的核心能力
- **何时用**：触发条件（trigger phrases）
- **关键能力**：用户可能提到的具体任务

**好例子：**

```yaml
# 好 - 具体且有触发词
description: Manages Linear project workflows including sprint planning, task creation, and status tracking. Use when user mentions "sprint", "Linear tasks", "project planning", or asks to "create tickets".

# 好 - 包含明确的价值主张
description: End-to-end customer onboarding workflow for PayFlow. Handles account creation, payment setup, and subscription management. Use when user says "onboard new customer", "set up subscription", or "create PayFlow account".
```

**坏例子：**

```yaml
# 太模糊
description: Helps with projects.

# 缺触发词
description: Creates sophisticated multi-page documentation systems.

# 太技术化，没有用户视角触发词
description: Implements the Project entity model with hierarchical relationships.
```

**硬限制：**
- description 本身上限 1024 字符
- description + when_to_use 组合在 skill listing 中被截断到 **1536 字符**
- 禁止 XML 标签（`<` `>`）
- 禁止 skill name 包含 "claude" 或 "anthropic"

### 1.2 generativeprogrammer.com 的 14 个 Skill Authoring Patterns

这篇文章从 Anthropic 的最佳实践中提炼了 14 个设计模式，其中最关键的两个是：

#### 模式 1：Activation Metadata（激活元数据）

> "The description field is not just a summary; it is the only signal Claude has at selection time."

核心建议：
- **写"有攻击性"的 description**。Anthropic 的 skill-creator 推荐刻意写得更强势，因为 Claude 有**欠触发倾向**（under-trigger tendency）
- 示例措辞："Make sure to use this skill whenever the user mentions dashboards, data visualization, or internal metrics, **even if they do not explicitly ask for a dashboard**."
- 每句话都在和正面触发词、排除子句、领域关键词争夺空间

#### 模式 2：Exclusion Clause（排除子句）

> 正面触发把 skill 拉进来，排除子句把它推出去。两者都需要。

示例："Do NOT use for blog articles, newsletters, emails, tweets, or long-form content."

Ruben Hassid（社区知名开发者）认为**排除子句是 description 中最重要的单行**，比正面触发更重要。

### 1.3 触发率测试基准

Anthropic 官方给的量化目标：
- **Skill 应在 90% 的相关查询中触发**
- 测试方法：跑 10-20 个应该触发的测试查询，追踪自动触发 vs 需要手动调用的比率

---

## 2. Anthropic 关于结构化指令的最佳实践

### 2.1 Context Engineering（2025.09 Anthropic 工程博客）

核心原则：**用最小的 token 集合最大化期望行为的概率。**

**System Prompt 的"正确海拔"：**

```
过低海拔：模糊、高层指导，模型没有具体信号
  ↓
正确海拔：足够具体以指导行为，足够灵活让模型运用判断力
  ↓
过高海拔：硬编码 if-else 逻辑，脆弱且难以维护
```

**结构化建议：**
- 用独立段落组织 prompt：`<background_information>`, `<instructions>`, `## Tool guidance`, `## Output description`
- 用 XML tag 或 Markdown headers 划分段落（格式本身不如内容重要）
- **Minimal ≠ Short**：需要给足够信息，但每个 token 都要 justify 自己的存在

**Few-shot 示例：**
- 不推荐塞一堆 edge case → 推荐精选 **diverse, canonical examples**
- "For an LLM, examples are the 'pictures' worth a thousand words."

### 2.2 Prompt Engineering 最佳实践（Anthropic 官方文档摘要）

| 原则 | 说明 |
|------|------|
| 清晰明确 | 假设 AI 是一个聪明但零背景的新员工 |
| 说明"为什么" | 解释原因比只给规则更有效（Explain-the-Why pattern） |
| 说"做什么"而非"不做什么" | 正面指令 > 负面指令，但排除子句在 skill 中是必要的 |
| 分步组织 | 多步骤任务用编号列表或分段 |
| 控制自由度 | 脆弱操作用精确脚本，开放任务用判断力 |

---

## 3. 社区经验：高触发率 vs 低触发率的差异

### 3.1 Corporate Waters 的测试报告（Mikhail Shcheglov）

**残酷数据：**
- 编写了一个精心设计的 CPO review skill
- 跑了 20 个明显应该触发的 prompt："do a CPO review", "give me a go/no-go assessment", "poke holes in this product strategy"
- **触发率：0/20 = 0%**

**关键洞察：**

> "Skills sit in a list that Claude sees in its system prompt. When you type a request, the model decides whether to consult a skill based on pattern-matching your words against the skill's description. It's probabilistic, not deterministic. There is no guarantee your skill fires."

> "Why not just stick with a well-written system prompt in your CLAUDE.md? It's simpler, always loads, doesn't have trigger reliability issues."

### 3.2 CloudZero 的企业实践

CloudZero 团队为他们的云成本分析产品写了一整套 skill（12+），每条 description 遵循：

```
## Trigger keywords
deep dive, analyze, breakdown, detailed, specific service, EC2, RDS, S3, Lambda

## Example prompts
Do a deep dive on my EC2 costs
Analyze my RDS spending in detail
```

他们在 description 中直接嵌入 trigger keywords 和 example prompts。

### 3.3 高触发率 vs 低触发率差异总结

| 维度 | 高触发率 Skill | 低触发率 Skill |
|------|---------------|---------------|
| Description 长度 | 300-800 字符，密集 | < 100 字符，模糊 |
| 触发词 | 包含用户实际会说的短语 | 只有抽象描述 |
| 用户视角 | "当用户说 X、Y、Z 时使用" | "帮助处理文档" |
| 排除子句 | 明确边界，减少误触发 | 无边界，可能被误触发后"声誉下降" |
| 领域关键词 | 包含具体技术名词 | 只用泛泛的行业术语 |
| 文件类型关联 | 提及相关文件格式（.fig, .csv） | 不提及任何具体格式 |
| 自信度 | 推荐式"Make sure to use..." | 中性描述式"Helps with..." |

### 3.4 Skill 触发预算机制

Claude Code 中所有 skill 的 description 列表占用 **context window 的 2%**（fallback 16000 字符）。如果 skill 太多，超出预算的 skill 会被**静默排除**。可通过 `/context` 检查排除警告，或设置 `SLASH_COMMAND_TOOL_CHAR_BUDGET` 环境变量覆盖。

---

## 4. LLM 规则遵守率的影响因素（学术研究）

### 4.1 The Instruction Gap（Yellow.ai Research, 2025）

对 13 个主流 LLM 的系统评估发现：

- **Instruction following 在模型间差异巨大**，Claude-Sonnet-4 和 GPT-5 表现最好
- 核心发现：模型在通用任务上很强，但在**精确遵循自定义指令**上存在根本性的 "instruction gap"
- 这种差距不是简单的"规则遵守"问题，而是**架构层面的限制**

### 4.2 位置偏差（Position Bias / Lost in the Middle）

多项研究证实：
- LLM 对 context 开头和结尾的信息注意力最高（primacy + recency effect）
- 中间位置的信息最容易被"遗忘"（lost in the middle 效应）
- 在 RAG 场景中，gold document 放在不同位置会显著影响准确率

**对 skill 的启示：** 如果 skill 的关键触发词埋在 description 的中间段落，可能不如放在开头或结尾有效。

### 4.3 Instruction Adherence 的关键影响因素

| 因素 | 影响 | 来源 |
|------|------|------|
| 指令的具体性 | 具体 > 抽象，明确 > 模糊 | Anthropic 官方 |
| 指令的位置 | 开头/结尾 > 中间 | Lost in the Middle 研究 |
| 指令的正面表述 | "做 X" > "不做 Y"（但排除子句例外） | Anthropic Prompt Engineering |
| 示例的存在 | few-shot > zero-shot | 广泛共识 |
| 规则数量 | 少而精 > 多而泛 | Anthropic Context Engineering |
| 任务复杂度 | 简单规则遵守率高，复杂流程低 | The Instruction Gap |
| 模型能力 | 更强的模型遵守率更高 | 多项基准测试 |
| Context 长度 | 越长，对中间部分遵守率越低 | Context Rot 研究 |

---

## 5. 实操建议：写高触发率 Skill Description 的 Checklist

### Description 编写

1. **第一句写核心能力**：直接说这个 skill 做什么，不含糊
2. **第二句写触发条件**：`Use when user says "X", "Y", "Z"` 或 `Trigger: "A", "B", "C"`
3. **第三句写排除边界**：`Do NOT use for X, Y, Z` 或 `不触发场景：A, B`
4. **提及具体名词**：文件格式、技术栈、产品名、命令名
5. **用"攻击性"措辞**：`Make sure to use` / `Ensure this fires` / `Even if not explicitly mentioned`
6. **控制在 800 字符以内**（为排除子句和 when_to_use 留空间）

### Skill 内容结构

7. **SKILL.md 控制在 500 行以内**：太长浪费 context，用 progressive disclosure（拆到 references/）
8. **引用文件保持一层深度**：SKILL.md → references/xxx.md，不要嵌套
9. **开头的指令最关键**：模型对开头内容注意力最高
10. **用 canonical examples 而非 edge cases**：2-3 个典型用例比 10 个边界情况有效

### 测试验证

11. **跑 10-20 个触发测试**：确保 90% 命中率
12. **跑 5-10 个反触发测试**：确保不误触发
13. **直接问 Claude**：`"When would you use the [skill-name] skill?"`——Claude 会引用 description 回答，据此调优
14. **检查 context 预算**：`/context` 确认 skill 没有被静默排除

### 规避策略

15. **关键 workflow 用 `disable-model-invocation: true` + 手动调用**：避免触发率问题
16. **对核心行为用 CLAUDE.md 而非 skill**：system prompt 始终加载，零触发失败
17. **用 `when_to_use` 补充 description**：额外的触发上下文，计入 1536 字符预算

---

## 参考来源

| 来源 | URL | 关键贡献 |
|------|-----|---------|
| Anthropic 官方 Skill 构建指南 | resources.anthropic.com/.../The-Complete-Guide-to-Building-Skill-for-Claude.pdf | Description 公式、触发测试基准、YAML 规范 |
| Anthropic Context Engineering | anthropic.com/engineering/effective-context-engineering-for-ai-agents | 最小 token 集合、System prompt 海拔校准 |
| Skill Authoring Patterns (generativeprogrammer.com) | generativeprogrammer.com/p/skill-authoring-patterns-from-anthropics | 14 个设计模式、Activation Metadata、Exclusion Clause |
| Corporate Waters (Substack) | corpwaters.substack.com/p/the-ultimate-guide-to-claude-code | 触发率实测（0/20）、skill vs CLAUDE.md 对比 |
| Claude Code Power User Guide (DEV.to) | dev.to/.../the-complete-claude-code-power-user-guide | 触发预算机制（2% context）、排除机制 |
| The Instruction Gap (arXiv:2601.03269) | arxiv.org/html/2601.03269v1 | 13 个 LLM 的 instruction following 评估 |
