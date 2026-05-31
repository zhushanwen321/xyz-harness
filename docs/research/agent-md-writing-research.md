# Agent.md 编写调研报告

> 日期：2026-05-31
> 来源：Claude Code 源码（`~/GitApp/claude-code-source-code/`）+ 官方文档 + 已安装 agent 分析

---

## 一、agent.md 的完整 Frontmatter 规范

从源码 `src/tools/AgentTool/loadAgentsDir.ts` 的 `parseAgentFromMarkdown` 函数提取：

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | agent 唯一标识符。缺失则文件被忽略（当作普通 reference 文档） |
| `description` | string | **必填**，缺失则 parse 失败。用于 agent 发现和选择（同 skill 的 description） |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型选择：`inherit`（继承父 agent）, `sonnet`, `opus`, `haiku`, 或完整模型 ID。默认 `inherit` |
| `tools` | string 或 string[] | 允许的工具列表。`undefined`/`"*"` = 所有工具。如 `"Read, Bash, Write"` 或 `["Read", "Bash"]` |
| `disallowedTools` | string 或 string[] | 禁止的工具列表 |
| `skills` | string 或 string[] | 启动时预加载的 skill 列表（逗号分隔） |
| `color` | string | 终端颜色标识。支持：`blue`, `green`, `yellow`, `red`, `magenta`, `cyan` 等 |
| `effort` | string 或 number | 推理努力级别。字符串（如 `"high"`）或正整数 |
| `maxTurns` | number | 最大 agentic 轮次。正整数 |
| `memory` | string | 持久记忆范围：`"user"`, `"project"`, `"local"` |
| `background` | boolean | 始终作为后台任务运行 |
| `initialPrompt` | string | 在第一轮用户输入前注入的提示（支持 slash commands） |
| `permissionMode` | string | 权限模式 |
| `mcpServers` | array | 专用 MCP 服务器配置 |
| `hooks` | object | Session 级别的 hooks |
| `isolation` | string | 隔离模式：`"worktree"`（在独立 git worktree 中运行） |
| `omitClaudeMd` | boolean | 省略 CLAUDE.md 层级注入（只读 agent 节省 token） |

### 文件位置

```
~/.claude/agents/<name>.md       # 用户级（所有项目可见）
<project>/.claude/agents/<name>.md  # 项目级（仅当前项目）
```

文件名不必与 `name` 字段匹配，但 `name` 是实际的标识符。

---

## 二、agent.md vs SKILL.md 的定位差异

| 维度 | agent.md | SKILL.md |
|------|----------|----------|
| **加载时机** | 被主动分派时加载（`agent: "name"`） | 始终在 system prompt 中注入 name+description |
| **触发机制** | 主 agent 显式调用，无概率匹配 | 概率匹配（模型根据 description 决定） |
| **核心定位** | 独立执行者（有自己的 system prompt） | 参考文档（被主 agent 或 subagent 读取） |
| **上下文** | 独立上下文，不继承父 agent 对话历史 | 在主 agent 上下文中工作 |
| **description 作用** | 被 `/agents` 列表展示，主 agent 选择参考 | 触发的唯一入口（概率匹配） |
| **工具控制** | 可限制工具集（tools/disallowedTools） | 无工具限制 |
| **模型选择** | 可指定专用模型 | 使用主 agent 的模型 |

### 关键差异：description 的写法

- **skill description**：只写触发条件（"Use when..."），因为模型用它做概率匹配
- **agent description**：写用途摘要，因为主 agent 在选择 agent 时需要理解 agent 的能力范围。**不需要"Use when"格式**，因为触发是确定性的（代码指定 agent name）

---

## 三、已安装 Agent 分析

| Agent | model | tools | 定位 |
|-------|-------|-------|------|
| `general-purpose` | 默认 | 全部 | 通用执行者 |
| `code-reviewer` | glm-5.1 | 全部 | 代码审查（正确性/安全/性能） |
| `ts-taste-check` | 默认 | 全部 | TS/Vue 品味审查 |
| `rust-taste-check` | 默认 | 全部 | Rust 品味审查 |
| `harness-retrospect` | 默认 | read/write/bash | Harness 复盘 |
| `bug-fixer` | 默认 | 全部 | Bug 修复 |
| `code-fixer` | 默认 | 全部 | 代码修复 |
| `batch-code-tracer` | 默认 | 全部 | 批量调用链路分析 |
| `batch-issue-tracer` | 默认 | 全部 | 批量问题验证 |
| `batch-review-tracer` | 默认 | 全部 | 批量审查质量评估 |

### 模式总结

1. **独立方法论型**：agent.md 内含完整方法论（如 code-reviewer 的审查维度）
2. **引用 skill 型**：agent.md 只指定"read xxx skill 获取方法论"（如 review-* agent）
3. **参数化型**：agent.md 定义参数接口，通过 task prompt 传参

推荐模式 2（引用 skill 型）：agent 精简，方法论维护在 skill 中。

---

## 四、agent.md 编写最佳实践

### 1. Description 写法

agent 的 description 不需要"Use when..."格式（触发是确定性的）。推荐格式：

```yaml
# 好 — 简洁的能力描述
description: "业务逻辑审查。验证代码覆盖所有业务用例，构造模拟数据推演执行路径。"

# 差 — 太模糊
description: "审查代码。"

# 差 — 包含触发词（agent 不需要触发词）
description: "Use when you need BLR review. Triggers: BLR, business logic."
```

### 2. Model 选择

| 场景 | 推荐 model | 原因 |
|------|-----------|------|
| 审查/分析（质量敏感） | `sonnet` 或具体模型 ID | 需要高准确率 |
| 快速操作（速度敏感） | `haiku` | 低延迟 |
| 默认 | `inherit` | 灵活，跟随父 agent |

### 3. Tools 限制

- **审查类 agent**：`tools: "Read, Bash, Grep, Glob"` — 只读 + 搜索，不需要写文件（或限制写路径）
- **修复类 agent**：`tools: "Read, Edit, Bash"` — 需要修改文件
- **默认**：不设 tools 字段 = 所有工具可用

### 4. 正文结构

```markdown
# Agent 名称

一句话定位。

## 输入
task prompt 中必须包含的参数。

## 执行步骤
1. 读取方法论（read skill 文件）
2. 获取数据（git diff / read 文件）
3. 执行分析
4. 输出结果

## 输出格式
具体的输出格式定义。

## 约束
- 每条约束都有后果链
```

### 5. 与 Skill 的引用关系

```
agent.md（~30-50 行）
  → read {skill_path}/SKILL.md（方法论）
  → read {references/}（详细参考）
```

agent 只定义"做什么"和"输出什么"，方法论由 skill 提供。这样修改方法论只需要更新 skill，不需要改 agent。

---

## 五、meta-sk-agent-writer 的设计建议

定位：类似 meta-sk-skill-writer，但专门针对 agent.md 的编写。

核心差异（与 skill-writer）：
- **不需要触发词优化**（agent 触发是确定性的）
- **需要 model/tools 选择指导**
- **正文结构是"输入 → 步骤 → 输出"而非 skill 的"Overview → When to Use → Pattern"**
- **需要考虑与 skill 的引用关系**

可以作为 meta-sk-skill-writer 的 references/ 补充，也可以作为独立 skill。
