# Agent 自主循环机制调研：Codex `/goal` vs Ralph Loop vs Pi `/loop`

> 调研日期：2026-05-19
> 调研范围：Codex CLI `/goal` 源码、Anthropic ralph-wiggum 插件、snarktank/ralph、jthack/claude-goal、Pi force-loop 扩展

---

## 1. Codex `/goal` 深度分析

### 1.1 概述

`/goal` 是 Codex CLI（v0.128.0+）引入的**持久化目标驱动循环机制**。用户设定一个目标，Codex 自动持续工作直到目标达成、被阻断、或预算耗尽。

**启用方式：**

```toml
# ~/.codex/config.toml
[features]
goals = true
```

**命令列表：**

| 命令 | 作用 |
|------|------|
| `/goal <objective>` | 创建或替换当前目标 |
| `/goal` | 查看当前目标状态 |
| `/goal pause` | 暂停目标（停止自动续写） |
| `/goal resume` | 恢复暂停的目标 |
| `/goal clear` | 清除目标 |

### 1.2 架构设计

源码位于 `~/GitApp/codex-cli/codex-rs/`，核心涉及以下模块：

```
┌─────────────────────────────────────────────────────────┐
│                       TUI Layer                          │
│  goal_menu.rs (命令交互)    goal_status.rs (状态显示)      │
│  /goal, /goal pause, /goal resume, /goal clear           │
└──────────────────────┬──────────────────────────────────┘
                       │ AppEvent::SetThreadGoal*
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    Session (core)                         │
│                                                          │
│  goals.rs ─── GoalRuntimeState ─── GoalRuntimeEvent      │
│    │           │                  (12种事件)               │
│    │           ├─ accounting (token + wall-clock)         │
│    │           ├─ continuation_lock + continuation_turn_id │
│    │           └─ budget_limit_reported_goal_id           │
│    │                                                      │
│    ├── create_thread_goal()                               │
│    ├── set_thread_goal()                                  │
│    ├── goal_runtime_apply() ← 事件分发器                   │
│    ├── maybe_start_goal_continuation_turn()               │
│    └── account_thread_goal_progress()                     │
│                                                          │
│  Templates:                                              │
│    continuation.md → GoalContext → inject to model        │
│    budget_limit.md → GoalContext → inject to model        │
│    objective_updated.md → GoalContext → inject to model   │
└──────────┬──────────────────────┬────────────────────────┘
           │                      │
    Tool Handlers           State Layer (SQLite)
    (create/update/get)     GoalStore (codex-state)
           │                thread_goals 表
           ▼
    Extension Layer (codex-ext-goal)
    GoalExtension<C> + GoalToolBackend
    (轻量版，用于非 CLI 场景)
```

### 1.3 完整生命周期

Goal 有 6 种状态（定义在 `state/src/model/thread_goal.rs`）：

```
用户/系统调用 create_goal
         │
         ▼
      Active ──────────────────────┐
        │  │  │                    │
        │  │  └─tokens_used≥budget ──► BudgetLimited (终态)
        │  │                       (注入 budget-limit steering)
        │  └─ 使用配额达到全局上限 ──► UsageLimited
        │
        ├─ 用户暂停 ────────────────► Paused
        │                              │
        │   用户恢复 ◄─────────────────┘
        │
        ├─ 同一阻塞条件连续3+turn ──► Blocked
        │   (模型通过 update_goal 设置)
        │
        └─ 目标达成 ────────────────► Complete (终态)
            (模型通过 update_goal 设置)
```

**关键设计约束：**

- `BudgetLimited` 是终态，不能被 `Paused`/`Blocked`/`Active` 覆盖。SQL 里用 `CASE WHEN status = 'budget_limited' AND new_status IN ('paused','blocked') THEN status` 保护。
- `UsageLimited` 只能从 `Active` 或 `BudgetLimited` 转入。
- 每个 thread 只能有一个 goal。`replace_thread_goal` 用 `ON CONFLICT(thread_id) DO UPDATE` 实现替换。
- goal_id 是 UUID v4，用于乐观并发控制（`expected_goal_id` 参数）。

### 1.4 自动续写（Continuation）机制

这是 goal 最核心的能力。当一个 turn 结束后，如果 goal 仍然 Active 且 thread 空闲，系统自动注入一个 continuation turn。

**触发位置**：`tasks/mod.rs:810`，在 turn 的 active_turn 被清理后触发 `MaybeContinueIfIdle`。

**触发条件**（`goal_continuation_candidate_if_active`），全部必须满足：

1. `Feature::Goals` feature flag 启用
2. 当前协作模式不是 Plan 模式
3. 没有 active turn 正在执行
4. `input_queue` 中没有排队的 response items
5. `input_queue` 中没有 trigger-turn mailbox items
6. thread 是持久化的（非 ephemeral）
7. DB 中存在 status=Active 的 goal（BudgetLimited 不会触发 continuation）
8. goal_id 和 status 在启动 continuation 前会被再次验证，防止竞争

**防抖设计**：如果 continuation turn 完成但没有实际活动（token delta = 0），不会再次触发 continuation。

### 1.5 预算管理

三层预算管理机制：

| 层级 | 机制 | 说明 |
|------|------|------|
| Token 预算 | `token_budget: Option<i64>` | 扣除 cached tokens，不重复计算 reasoning tokens |
| Wall-clock 时间 | `time_used_seconds` | 从 goal active 开始实时追踪（`Instant`） |
| 全局 Usage Limit | `UsageLimited` 状态 | 账户级配额耗尽时触发 |

**会计流程**：每次非 `update_goal` 的 tool 完成时触发，获取 `accounting_lock` 信号量保证串行，原子更新 SQLite。如果 tokens 超预算，SQL CASE 表达式自动将 status 改为 `BudgetLimited`。

**Budget Limit Steering**：首次达到 token budget 时，注入 `budget_limit.md` prompt 引导模型收尾。

### 1.6 Prompt 注入方式

通过 `GoalContext` 以 `<goal_context>` 标签的 user message 注入，模型自然将其视为上下文。

**三套 prompt 模板：**

| 模板 | 触发场景 | 核心指令 |
|------|----------|----------|
| `continuation.md` | continuation turn 开始 | 继续工作、保持 fidelity、完成审计 |
| `budget_limit.md` | 首次达到 token budget | 收尾当前 turn、总结进展 |
| `objective_updated.md` | 外部修改了 goal objective | 调整方向、不要继续旧目标 |

### 1.7 数据持久化

**SQLite**（`state-db` 的 `thread_goals` 表），核心字段：

```sql
CREATE TABLE thread_goals (
    thread_id        TEXT PRIMARY KEY,
    goal_id          TEXT,          -- UUID v4
    objective        TEXT,
    status           TEXT,          -- active/paused/blocked/usage_limited/budget_limited/complete
    token_budget     INTEGER,       -- nullable
    tokens_used      INTEGER,
    time_used_seconds INTEGER,
    created_at_ms    INTEGER,
    updated_at_ms    INTEGER
);
```

运行时状态（内存，不持久化）：`GoalRuntimeState` 包含 `accounting_lock`(Semaphore)、`continuation_lock`(Semaphore)、`continuation_turn_id`、`budget_limit_reported_goal_id` 等。

### 1.8 Extension 机制

Goal 有两套实现并行存在：

1. **Core 内置实现**（`codex-core`）：功能完整，拥有 continuation、accounting、steering 全部能力。
2. **Extension 实现**（`codex-ext-goal` crate）：通过 `GoalExtension<C>` 注册到 `ExtensionRegistryBuilder`，用于非 CLI 场景（app-server、SDK），目前仍在完善中。

---

## 2. Pi `/loop` 分析

### 2.1 概述

Pi 的 `/loop` 命令由 `~/.pi/agent/extensions/force-loop/index.ts`（~350 行 TypeScript）实现，通过 Pi Extension API 的 `agent_end` + `sendUserMessage` 机制实现循环。

### 2.2 能力矩阵

| 能力 | 状态 | 实现方式 |
|------|------|----------|
| `/loop <prompt> [--max N]` | 有 | `pi.registerCommand("loop", ...)` |
| `/loop pause / resume / status` | 有 | 命令解析 + 状态切换 |
| 任务追踪 | 有 | `loop_task_tracker` tool（create_tasks / complete_task / list_tasks） |
| Stall 检测 | 有 | 连续无进展轮数计数 |
| 上下文空间保护 | 有 | `getContextUsage()` 超过 80% 自动暂停 |
| 状态栏/Widget 显示 | 有 | `ctx.ui.setWidget()` + `ctx.ui.setStatus()` |
| Session 重启后状态重建 | 有 | 从 session entries 重建 |
| Token 预算 | **无** | - |
| 时间预算 | **无** | - |
| Evidence-based completion | **无** | 靠 complete_task 调用次数 |
| Blocked 状态检测 | **无** | 只有 stall 计数 |
| Steering 模板 | **粗糙** | 硬编码 prompt 片段 |

### 2.3 循环机制

```
用户: /loop "修复所有测试" --max 20
  → state 初始化 (isActive=true, maxLoops=20)
  → pi.sendUserMessage(prompt)
  → AI 执行一个 turn...
  → agent_end 事件触发
  → 检查 tasks 是否全部 complete
  → 如未完成且未达 maxLoops → loopCount++
  → pi.sendUserMessage(continuation prompt)
  → AI 继续执行...
  → 重复直到全部完成或达到 maxLoops
```

### 2.4 数据持久化

通过 `pi.appendEntry("force-loop", state)` 写入 session entries（JSONL）。Session 重启时通过 `ctx.sessionManager.getEntries()` 逆向遍历恢复状态。

---

## 3. 开源社区同类实现

### 3.1 项目列表（按 stars 排序）

| 项目 | Stars | 平台 | 循环机制 | 完成判断 | 预算控制 |
|------|-------|------|----------|----------|----------|
| **Anthropic ralph-wiggum**（claude-code 仓库内） | ~124k | Claude Code | Stop hook 拦截退出 | `<promise>` 字符串精确匹配 | max-iterations |
| **Ruflo** | ~53k | Claude Code/Codex | 多种（autopilot/loop-workers/daemon） | 多种模式 | 可配置 |
| **snarktank/ralph** | ~19k | Claude Code/Amp | 外部 bash `while` 循环 | prd.json 的 `passes: true` | 无内置 |
| **ghuntley/how-to-ralph-wiggum** | ~1.6k | 任意 CLI agent | 外部 bash 循环 | IMPLEMENTATION_PLAN.md 读文件 | 无 |
| **jthack/claude-goal** | ~91 | Claude Code | Stop hook + Skill | `<objective>` 完成审计 | `--tokens` 软预算 |

### 3.2 Anthropic 官方 ralph-wiggum

**位置**：`anthropics/claude-code/plugins/ralph-wiggum/`

**核心机制**：Stop hook（`hooks/stop-hook.sh`）拦截 Claude 的退出行为。

**工作流程**：
1. `/ralph-loop "任务描述" --max-iterations 50 --completion-promise "ALL_DONE"` 创建 `.claude/ralph-loop.local.md` 状态文件（YAML frontmatter + prompt）
2. Claude 正常执行一个 turn
3. Claude 试图退出时，Stop hook 读取状态文件
4. 如果 iteration < max_iterations 且 assistant 输出不包含 `<promise>ALL_DONE</promise>`，返回 `{"decision": "block", "reason": "<原始 prompt>", "systemMessage": "🔄 Ralph iteration N..."}`
5. Claude 被迫继续工作

**优点**：简单、官方内置、同一 session 保持上下文。
**缺点**：无预算管理、无 evidence audit、依赖 `<promise>` 标签精确匹配（模型可能误触）。

### 3.3 snarktank/ralph（外部循环）

**核心机制**：外部 bash 脚本 `ralph.sh` 反复启动新的 agent 实例。

```bash
# 极简形式（Geoffrey Huntley 原始版本）
while :; do cat PROMPT.md | claude-code; done
```

**工作流程**：
1. 用户准备 `prd.json`（用户故事列表，每个有 `passes: true/false`）
2. `ralph.sh` 启动 Claude Code，输入 prompt
3. Agent 执行任务，更新 `prd.json` 和 `progress.txt`，commit 后退出
4. bash 循环重启 agent（**全新上下文**）
5. Agent 读取 `prd.json` 找到下一个 `passes: false` 的故事
6. 重复直到所有 `passes: true` 或达到迭代上限

**优点**：通用（支持 Claude Code、Amp、Codex 等任意 CLI agent）、上下文隔离干净。
**缺点**：每次迭代全新上下文，成本极高；无精细控制。

### 3.4 jthack/claude-goal（Codex goal 的 Claude Code 移植）

**核心机制**：Claude Code Skill + Stop hook + SQLite 持久化。

**与 Codex goal 的对应关系**：

| Codex `/goal` | jthack/claude-goal | 差异 |
|---------------|-------------------|------|
| 内核 continuation engine | Stop hook 拦截退出 | 机制不同，效果类似 |
| SQLite thread_goals 表 | `~/.claude/goal/goals.sqlite` | 相同 |
| evidence-based completion | completion-audit guardrails | 相同理念 |
| Token + 时间 + usage 三层预算 | `--tokens` 软预算 | Codex 更精细 |
| 6 种状态 | active/paused/cleared/complete | Codex 多 Blocked/BudgetLimited/UsageLimited |
| 三套 steering 模板 | Codex 风格 continuation instructions | Codex 更丰富 |
| `CLAUDE_GOAL_MAX_STOP_CONTINUES` 环境变量控制上限（默认500） | 无上限控制 | Codex 有 budget 自动停止 |

---

## 4. 全面对比

### 4.1 循环机制对比

| 维度 | Codex `/goal` | Pi `/loop` | ralph-wiggum | claude-goal | snarktank/ralph |
|------|--------------|------------|-------------|-------------|-----------------|
| **循环位置** | 内核 event-driven | Extension 层回调 | Stop hook | Stop hook | 外部 bash |
| **上下文保持** | 同一 thread | 同一 session | 同一 session | 同一 session | **每次全新** |
| **成本效率** | 高（cached tokens 复用） | 高 | 中 | 中 | **极低** |

### 4.2 完成判断对比

| 方案 | 判断机制 | 可靠性 |
|------|----------|--------|
| Codex `/goal` | 模型对照 objective 逐项审计 evidence（文件、测试、benchmark） | 高 |
| Pi `/loop` | `complete_task` 调用次数 | 中（模型可能虚假标记完成） |
| ralph-wiggum | `<promise>` 标签精确字符串匹配 | 低（模型可能误触） |
| claude-goal | completion-audit guardrails | 中高 |
| snarktank/ralph | prd.json 的 `passes` 字段 | 中（靠模型自行更新 JSON） |

### 4.3 预算控制对比

| 方案 | Token 预算 | 时间预算 | 全局 Usage | Stall/Blocked 检测 |
|------|-----------|---------|-----------|-------------------|
| Codex `/goal` | 有（排除 cached） | 有（wall-clock） | 有（UsageLimited） | 有（Blocked 3+ turn） |
| Pi `/loop` | 无 | 无 | 无 | Stall 计数（仅信息，不改状态） |
| ralph-wiggum | 无 | 无 | 无 | 无 |
| claude-goal | 软预算（无实时 token 数据） | 有（本地计时） | 无 | 有（max-continues 500） |
| snarktank/ralph | 无 | 无 | 无 | 无 |

### 4.4 状态管理对比

| 方案 | 持久化方式 | 状态数量 | 跨 session | 并发安全 |
|------|-----------|---------|-----------|---------|
| Codex `/goal` | SQLite | 6 种 | 支持 | Semaphore + SQL CAS |
| Pi `/loop` | Session entries JSONL | 2 种 (Active/Paused) | 支持 | 内存锁 |
| ralph-wiggum | .md 文件 frontmatter | 2 种 (active/cancelled) | 不支持 | 文件锁 |
| claude-goal | SQLite | 4 种 | 支持 | SQLite 锁 |
| snarktank/ralph | prd.json + progress.txt | 二元（完成/未完成） | 支持（磁盘文件） | 文件锁 |

### 4.5 Steering（引导模型行为）对比

| 方案 | 注入方式 | 模板化 | 审计要求 |
|------|---------|--------|---------|
| Codex `/goal` | `<goal_context>` user message | 3 套模板（continuation/budget_limit/objective_updated） | 强制 evidence 检查 |
| Pi `/loop` | custom message | 硬编码 prompt 片段 | complete_task 标记 |
| ralph-wiggum | Stop hook `reason` + `systemMessage` | 无模板 | 无审计 |
| claude-goal | `<objective>` 包裹 | Codex 风格 instructions | completion-audit |
| snarktank/ralph | PROMPT.md / CLAUDE.md 文件 | 用户自定义 | 无内置 |

---

## 5. Pi `/loop` 改进建议

基于以上对比，Pi 的 `/loop` 在以下方面有提升空间，按优先级排序：

### P0：Evidence-based Completion

**现状**：靠 `complete_task` 调用次数判断完成，模型可能虚假标记。
**建议**：在 `agent_end` 回调中，不直接信任 AI 的 complete_task，而是要求 AI 在完成前输出具体 evidence（如 `tests pass: <command output>`），由扩展做基础校验。

### P1：Token 预算

**现状**：只有轮数上限（max 50），无法控制 token 消耗。
**建议**：Pi Extension API 已有 `getContextUsage()`，可在每轮结束后检查累计消耗，接近预算时注入收尾 steering。

### P2：Blocked 状态检测

**现状**：只有 stall 计数（连续无进展轮数），不改变状态机。
**建议**：当 stallCount >= 3 时，将状态切换为类似 Blocked 的状态，停止自动循环，通知用户介入。

### P3：Steering 模板化

**现状**：硬编码 prompt 片段。
**建议**：将 continuation prompt、budget-limit prompt、stall-warning prompt 抽为外部模板文件，支持用户自定义。

### P4：时间预算

**现状**：无时间限制。
**建议**：在 `loop` 命令中增加 `--timeout <minutes>` 参数，从 goal 激活开始计时，超时自动暂停。

---

## 6. 参考资料

- [Codex CLI 源码](https://github.com/openai/codex) — `codex-rs/core/src/goals.rs` 等
- [Codex `/goal` 官方文档](https://developers.openai.com/codex/cli/slash-commands)
- [Using Goals in Codex (Cookbook)](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)
- [Anthropic ralph-wiggum 插件](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
- [snarktank/ralph](https://github.com/snarktank/ralph) — 外部 bash 循环
- [jthack/claude-goal](https://github.com/jthack/claude-goal) — Codex-style goal for Claude Code
- [ghuntley/how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum) — Ralph 方法论
- [Geoffrey Huntley: Ralph Wiggum as a "software engineer"](https://ghuntley.com/ralph/)
- [VentureBeat: Claude Code's '/goals'](https://venturebeat.com/orchestration/claude-codes-goals-separates-the-agent-that-works-from-the-one-that-decides-its-done)
