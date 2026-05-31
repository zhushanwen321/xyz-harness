# meta-sk-* 元技能系列设计调研

> 日期：2026-05-31
> 目标：设计 `meta-sk-*` 元技能系列，替代从未触发的 `skill-creator`、`claude-md-improver`、`intent-discovery`

---

## 一、Usage 数据分析

### 数据来源

- `~/.pi/agent/evolution-data/daily-reports/`（2026-05-30、05-31）
- `~/.pi/agent/evolution-data/daily/`（2026-05-27 ~ 05-31）

### 活跃 Skills（最近 7 天）

| Triggers | Days | Skill | 触发方式 |
|----------|------|-------|---------|
| 44x | 3d | harness-retrospect | coding-workflow 自动 dispatch |
| 20x | 4d | xyz-harness-brainstorming | before_agent_start 强制注入 |
| 6x | 3d | xyz-harness-gate-reviewer | coding-workflow 自动 dispatch |
| 3x | 1d | xyz-harness-subagent-driven-development | 同上 |
| 3x | 1d | playwright-automation | AI 主动触发 |
| 2-3x | 1-2d | create/remove-worktree | AI 主动触发 |
| 2x | 1d | ts-taste-check | AI 主动触发 |
| 2x | 2d | rethink | 用户手动触发 |
| 2x | 2d | xyz-harness-expert-reviewer | coding-workflow 自动 dispatch |
| 1x | 1d | zcommit | AI 主动触发 |

### 核心发现

- **真正由 AI 主动触发的 skill 只有约 5 个**：playwright-automation、create/remove-worktree、ts-taste-check、zcommit
- **harness 系列全部由 coding-workflow 自动 dispatch**，不是 AI 主动触发
- **57 个 skill 从未触发**（含 skill-creator、claude-md-improver、intent-discovery）

### Never Triggered（57 个）

```
anysearch, batch-tracer, bug-fix-recorder, cc-agent-design, chrome-automation,
code-review-worktree, code-taste-review, code-trace, diagnose, evolve,
evolve-apply, evolve-report, grill-with-docs, handoff, impeccable,
improve-codebase-architecture, intent-discovery, issue-trace, lightmerge-branch,
manage-worktree, merge-worktree, playwright-automation(May31), pr-worktree,
py-preference, python-refactor, qwen-fast-coder, recheck-code,
remotion-best-practices, remotion-video-design, remotion-video-development,
remotion-video-review, remove-worktree(May31), review-tracer, rust-taste-check,
skill-creator, skill-memory-keeper, task-group-planner, tavily-web-search,
to-prd, token-counter, ts-taste-check(May31), usage-analyzer, vision-analysis,
web-fetch, whitespace-fixer, xyz-harness-backend-dev,
xyz-harness-code-standard-protection, xyz-harness-expert-reviewer(May31),
xyz-harness-frontend-dev, xyz-harness-gate, xyz-harness-gate-reviewer(May31),
xyz-harness-phase-dev, xyz-harness-phase-pr, xyz-harness-phase-test,
xyz-harness-subagent-driven-development(May31),
xyz-harness-test-driven-development, zcommit(May31)
```

---

## 二、现有 Meta Skill 失败原因分析

### skill-creator（480+ 行，从未触发）

**description：**
```
"Create new skills, modify and improve existing skills, and measure skill performance."
```

**失败原因：**
1. **没有用户视角触发词** — 用户不会说 "measure skill performance"
2. **功能太泛** — 创建/修改/测量三个方向，模型不知道何时该用
3. **内容过重** — 356 行 SKILL.md + 11 个 Python 脚本，context 消耗大
4. **eval pipeline 大面积失效** — Issue #556: 8 个 skill 144 条查询 0% 触发率

**值得吸收的能力：**
- description 优化方法论（三段式公式 + 排除子句）
- 渐进加载结构（SKILL.md < 500 行 + references/）
- "泛化而非过拟合"原则

### claude-md-improver（从未触发）

**失败原因：**
1. 局限于 CLAUDE.md，触发范围窄
2. 5 阶段工作流太重
3. CLAUDE.md 始终加载，无触发率问题 — 它的核心问题（规则质量）被 meta-sk-rule-template 覆盖

**结论：不需要替代。** CLAUDE.md 的优化本质是规则质量优化，rule-template 的反模式检测 + 后果链模板已覆盖。

### intent-discovery（从未触发）

**description：**
```
"Use when the user gives a concrete code modification instruction that describes how
to do something (specific files, components, functions, APIs) but does not explain why
or what problem it solves."
```

**失败原因：**
1. **太抽象** — "gives a concrete code modification instruction that describes how to do something but does not explain why" 是需要推理的条件判断，不是用户说的话
2. **缺触发词** — 用户不会说 "intent discovery"
3. **缺排除子句** — 有 Do NOT trigger 部分，但埋在内容里

**结论：触发诊断能力合并到 meta-sk-skill-writer。**

---

## 三、Superpowers Writing-Skills 分析

> 来源：`~/GitApp/superpowers/skills/writing-skills/`
> 项目：14.4 万 star 的 Claude Code skill 生态

### 核心设计理念

#### 1. TDD 驱动（核心方法论）

```
RED:   没有 skill 时跑失败场景（看 agent 怎么犯错）
GREEN: 写 skill 解决这些具体失败
REFACTOR: 找新借口 → 堵漏洞 → 重测
```

铁律：**没有看过 agent 失败，你不知道 skill 应该教什么。**

#### 2. CSO（Claude Search Optimization）

**关键发现：description 只写"何时用"，不写"做什么"。**

实测证据：description 写了 "code review between tasks"（工作流摘要）→ Claude 只做了 ONE 次 review，跳过了 SKILL.md 中 flowchart 明确要求的 TWO 阶段 review。

改为 "Use when executing implementation plans with independent tasks"（只有触发条件）→ Claude 正确读了 flowchart 并遵循两阶段 review。

**原因：** description 被 inject 到 system prompt。如果 description 总结了工作流，模型会把它当作"快捷版 skill"直接执行，跳过 SKILL.md 的完整内容。

#### 3. 渐进加载

```
Metadata (name + description) → 始终在 context（~100 词）
SKILL.md body → 触发时加载（< 500 行）
references/ → 按需读取（一层深度，不嵌套）
```

Token 预算：
- getting-started workflows: < 150 词
- 频繁加载 skills: < 200 词
- 其他 skills: < 500 词

#### 4. 自由度分级

| 自由度 | 适用 | 格式 |
|--------|------|------|
| 高 | 多种方案可行 | 文字指导 |
| 中 | 有偏优方案 | 伪代码/模板 |
| 低 | 操作脆弱/必须一致 | 具体脚本，无参数 |

类比：窄桥有悬崖（低自由）vs 开阔平地（高自由）。

#### 5. 压力测试（Bulletproofing）

用 3+ 压力组合（时间 + 沉没成本 + 疲惫 + 权威）测试 skill 是否能约束 agent。

对纪律类 skill（TDD、编码规范）特别重要。方法是：
- 列出常见借口 + 现实
- 红旗清单
- 显式禁止每种绕过方式

#### 6. Anti-patterns

| 反模式 | 表现 |
|--------|------|
| 叙事示例 | "In session 2025-10-03, we found..." |
| 多语言稀释 | example-js.js, example-py.py, example-go.go |
| 流程图里写代码 | 无法 copy-paste |
| 泛化标签 | helper1, step3, pattern4 |

### Anthropic 官方 best-practices（同仓库内）

与 superpowers SKILL.md 互补的官方指南：

1. **Concise is key** — context window 是公共资源，每个 token 都要 justify
2. **Default assumption: Claude is already very smart** — 只加 Claude 不知道的
3. **Degree of freedom** — 匹配具体程度到任务脆弱性
4. **Test with all models** — Haiku 需要更多指导，Opus 不需要过度解释
5. **Evaluation-driven development** — 先建 eval 再写文档
6. **Claude A / Claude B 迭代模式** — A 帮写 skill，B 实际使用，观察 B 的行为反馈给 A

---

## 四、Description 写法分歧

### Anthropic 官方 Guide vs Superpowers 实测

| 观点 | 来源 | 理由 |
|------|------|------|
| 三段式：做什么 + 何时用 + 排除 | Anthropic 官方 Guide | 通用建议，面向新手 |
| 只写"何时用"，不写"做什么" | Superpowers（实测） | 写"做什么"→ Claude 跳过 SKILL.md |

### 我们的决策

**采用 superpowers 的"只写何时用"方案。**

理由：
1. superpowers 有实测数据（description 写了工作流摘要 → Claude 跳过完整内容）
2. Anthropic 官方 Guide 是通用建议，不是针对 skill 触发的专项研究
3. Corporate Waters 实测：精心写的 description 20 条查询 0% 触发率 — 说明触发本身就不稳定，更应该避免让 description 承担"教 Claude 做什么"的职责

折中：保留排除子句（"Not for..."），因为它不是"做什么"而是"何时不用"。

---

## 五、最终 meta-sk-* 系列

| Skill | 职责 | 替代 | 状态 |
|-------|------|------|------|
| `meta-sk-rule-template` | 规则写作模板 + 反模式检测 | — | 已完成 |
| `meta-sk-skill-writer` | SKILL.md 创建/优化 + 触发诊断 | skill-creator、intent-discovery | 已完成 |

**不替代 claude-md-improver** — CLAUDE.md 始终加载无触发问题，其核心问题（规则质量）被 rule-template 覆盖。

### 设计原则总结

从调研中提炼的 skill 写作铁律：

1. **Description 只写触发条件** — 写了工作流 → Claude 跳过 SKILL.md
2. **先看失败再写** — TDD 式：观察 agent 没有这个 skill 时怎么失败
3. **渐进加载** — SKILL.md < 200 行，详细内容放 references/
4. **Token 效率** — Claude 已经知道的不要写，每个 token 都 justify
5. **反合理化** — 纪律类 skill 需要显式禁止绕过方式
6. **自由度匹配** — 脆弱操作用脚本，开放任务用指导
7. **触发测试** — 5 正向 + 3 反向，目标 90% 命中率
