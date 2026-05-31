# SKILL 状态追踪工具 — 设计调研与 ADR

> 日期：2026-05-31
> 状态：方案设计中

---

## 一、背景与目标

### 问题

用户有一套精心设计的 skill 体系（70+ 个），但 usage 数据显示 **57 个 skill 从未触发**。更关键的是：即使 skill 被加载执行，也无法知道执行是否成功、AI 是否遇到困难、skill 是否有设计缺陷。

现有的 `skill-memory-keeper` 尝试解决"记录 skill 使用问题"，但**从未被 AI 触发**——因为它依赖 AI 的自我觉察（"这个 skill 有问题，我应该记录"），而 AI 没有这种元认知能力。

### 目标

构建一个**基于状态机**的 SKILL 执行追踪工具：
- Hook 自动检测 skill 加载，无需 AI 主动触发
- 状态机驱动 AI 在适当时机流转状态
- 异常累积到阈值自动触发问题记录
- 数据可跨 session 恢复

### 替代方案分析

| 方案 | 思路 | 失败原因 |
|------|------|---------|
| **skill-memory-keeper**（已废弃） | 依赖 AI 主动说"记录 skill 问题" | AI 没有自我觉察，从未触发 |
| **纯被动数据分析（evolve 增强）** | 收集 hook 数据，周期性分析 | 只能检测"异常信号"，不能区分"skill 困难"和"正常多步骤执行" |
| **AI 自我评估** | skill 执行完毕后让 AI 评估 | 每次额外消耗 LLM 调用，成本不可接受 |
| **本次方案：状态机追踪** | Hook 自动检测加载，状态机驱动 AI 流转，异常阈值强制记录 | — |

---

## 二、Pi Agent Loop 生命周期

以下是 Pi 中一次用户输入到响应完成的完整生命周期：

```
用户输入 "帮我优化这个 skill"
  │
  ├─ input                    # 用户输入事件
  ├─ before_agent_start       # 可注入提示词（返回 message）
  ├─ agent_start              # Agent loop 开始
  │
  ├─ [Turn 0] ──────────────────────────────────────────
  │   ├─ turn_start (turnIndex: 0)
  │   ├─ context              # 构建消息列表
  │   ├─ before_provider_request  # 发送前可修改 payload
  │   ├─ after_provider_response # 收到响应
  │   ├─ message_start        # AI 开始输出
  │   │   ├─ [Tool Call 1] read("skills/xxx/SKILL.md")
  │   │   │   ├─ tool_call (toolName: "read", input: {path: "..."})
  │   │   │   ├─ tool_execution_start
  │   │   │   ├─ tool_execution_end
  │   │   │   └─ tool_result (content, details)
  │   │   ├─ [Tool Call 2] edit("skills/xxx/SKILL.md", ...)
  │   │   │   └─ tool_call → tool_execution_* → tool_result
  │   │   └─ ...
  │   ├─ message_end          # AI 输出完成
  │   └─ turn_end (turnIndex: 0, messages, toolResults)
  │
  ├─ [Turn 1] ──────────────────────────────────────────
  │   ├─ turn_start (turnIndex: 1)
  │   ├─ ...（AI 继续处理）
  │   └─ turn_end (turnIndex: 1)
  │
  ├─ ...（更多 turn）
  │
  └─ agent_end               # Agent loop 结束
```

### "轮"的定义

**Turn = AI 的一次完整思考+工具调用+响应。**

一个 Turn 内 AI 可能调用多个工具（并行或串行）。每次 `turn_end` 时 `turnIndex` 递增。

**示例：** 用户说"优化这个 skill 的 description"

| Turn | AI 行为 | 工具调用 |
|------|---------|---------|
| 0 | 思考 → 读 skill 文件 | `read("skills/xxx/SKILL.md")` |
| 1 | 分析 → 读 rule-template | `read("skills/meta-sk-skill-writer/references/rule-templates.md")` |
| 2 | 写改进版 | `edit("skills/xxx/SKILL.md", oldText, newText)` |
| 3 | 总结完成 | （无工具调用，纯文本响应） |

在这个例子中，Turn 0 时 skill 被加载（read SKILL.md），Turn 3 时 skill 执行完成。

### 关键 Hook 点

| 事件 | 用途 | 可修改 |
|------|------|--------|
| `before_agent_start` | 注入提示词 | 返回 `message`（注入到 AI 上下文） |
| `turn_end` | 计数 turn、检测 skill 加载 | `turnIndex` |
| `tool_call`（toolName: "read"） | 检测 AI read SKILL.md | 可阻止（`block: true`） |
| `tool_result` | 检测工具执行结果 | 可修改结果 |
| `session_start` / `session_tree` | 恢复状态 | — |

---

## 三、设计演进

### V1：skill-memory-keeper（已废弃）

纯 AI 触发模式。Description 写了"当用户说'记录这个skill问题'时触发"。

**失败原因：** AI 没有"skill 出问题"的自我意识。当 skill 工作不顺时，AI 的反应是"修复输出"，不是"记录问题"。

### V2：被动数据分析（已否决）

扩展 evolve，增加 skill 健康度维度。

**否决原因：** 只能检测"异常信号"（工具失败率、循环重试），不能区分"skill 困难"和"正常多步骤执行"。误报率高。

### V3：状态机追踪（当前方案）

核心转变：**不再要求 AI "发现问题"，而是要求 AI "流转状态"。**

- Hook 自动检测 skill 加载 → 创建追踪记录
- 注入提示词告知 AI 如何使用工具流转状态
- 10 turn 兜底提醒
- 异常累积 2 次强制触发 subagent 记录

---

## 四、最终方案

### 状态机

```
加载 skill → hook 检测 read SKILL.md → 自动创建 TrackedItem(status: "loaded")

loaded（执行中）:
  ├─ [AI 调用 skill-state 工具] → completed（终态）
  ├─ [AI 调用 skill-state 工具] → error（errorCount: 1）
  └─ [10 turn 提醒] → 注入提示，AI 决策（无限次，直到终态）

error（执行异常）:
  ├─ [AI 调用 skill-state 工具] → completed（终态）
  ├─ [AI 调用 skill-state 工具 error] → errorCount += 1（异常累加）
  ├─ [errorCount ≥ 2] → 强制 background subagent → recorded（终态）
  └─ [AI 调用 skill-state 工具] → recorded（终态，触发 subagent）

终态：completed、recorded
```

### AI 触发方式

| 时机 | 方式 | 说明 |
|------|------|------|
| **首次加载** | hook 注入提示词 | 告知 AI 可自行判断调用工具流转状态 |
| **10 turn 未终态** | hook 注入提醒 | 兜底提醒，无限次，直到 AI 完成流转 |
| **异常累积** | AI 主动调用 | AI 感到困难时调用工具累加异常 |
| **强制记录** | hook 自动触发 | 2 次异常后自动 subagent 记录 |

### 数据模型

```typescript
interface TrackedItem {
  id: number;
  type: "skill";           // 未来可扩展 "agent" 等
  name: string;            // skill name
  status: "loaded" | "completed" | "error" | "recorded";
  errorCount: number;      // 异常累加计数
  loadedAtTurn: number;    // 加载时的 turnIndex
  lastRemindAtTurn: number; // 上次提醒的 turnIndex
}
```

### 核心流程

```
session_start / session_tree
  → reconstructState（从 entries 恢复 TrackedItem 列表）

tool_call (toolName: "read", input.path matches "*/SKILL.md")
  → 检测 skill 加载
  → 创建 TrackedItem(status: "loaded")
  → 注入提示词：告知 AI 可调用 skill-state 工具流转状态

before_agent_start (每 turn 触发)
  → 检查非终态 TrackedItem
  → 距离 lastRemindAtTurn ≥ 10 → 注入提醒
  → 提醒内容：skill {name} 已加载 {N} turn，请调用工具流转状态

skill-state 工具调用 (AI 主动)
  → update: id, status
  → error 时 errorCount += 1
  → errorCount ≥ 2 → background subagent → recorded
```

### Session 恢复

Session 结束时不做兜底处理（用户可能未来继续）。下次加载 session 时：

1. `session_start` / `session_tree` → `reconstructState`
2. 从 entries 中找 skill-state 工具调用记录
3. 恢复 TrackedItem 列表
4. 继续追踪未终态的 item

### 与 skill-memory-keeper 的关系

skill-memory-keeper 的核心能力（记录问题、生成改进建议）作为 subagent 的任务：

```
2 次异常 → 触发 background subagent →
  subagent 读取异常 skill 的 SKILL.md +
  当前 session 中该 skill 的上下文 →
  生成问题记录 →
  自动流转到 recorded 状态
```

不再需要独立的 skill-memory-keeper skill。

### 可扩展性

`type` 字段支持未来扩展：

```typescript
type: "skill" | "agent" | "workflow" | ...
```

不同 type 可以有不同的状态机（如 agent 可能需要 "idle" / "running" / "failed"），但共享同一个追踪基础设施。

---

## 五、决策记录

| # | 决策 | 理由 |
|---|------|------|
| 1 | **不依赖 AI 自我觉察** | AI 没有"skill 出问题"的元认知，这是架构限制不是 prompt 能解决的 |
| 2 | **Hook 自动检测 skill 加载** | 通过 `tool_call` 检测 read SKILL.md，零 LLM 成本 |
| 3 | **10 turn 提醒，无限次** | token 消耗可接受，确保 AI 不会忘记流转状态 |
| 4 | **终态 skill 重新加载时新建追踪** | 同一 skill 可能被多次使用，每次是独立追踪 |
| 5 | **非终态不重复创建** | 防止 AI 多次 read 同一 SKILL.md 导致重复追踪 |
| 6 | **异常阈值 2 次（非 3 次）** | 2 次就足够确认异常，避免延迟记录 |
| 7 | **强制 subagent（非提醒）** | 2 次异常是明确信号，不需要再让 AI 决定是否记录 |
| 8 | **subagent 异步 background** | 不阻塞当前工作流 |
| 9 | **session_end 不做兜底** | 用户可能未来继续该 session，恢复状态后可继续流转 |
| 10 | **不做自动终态** | skill 产物千差万别，无法通用检测"完成"。依赖 AI 判断 + 10 turn 提醒兜底 |
