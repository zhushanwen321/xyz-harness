---
name: xyz-harness-subagent-driven-development
description: Subagent-driven-development 编码模式参考。主 agent 按 plan.md 的 task 逐个派遣独立的执行/评审 subagent，实现上下文隔离和 TDD 质量保障。不作为 skill 加载到 subagent 上下文中，仅由主 agent 参考使用。
---

## 架构说明

**本 skill 是参考模式文档，不作为 skill 加载到任何 subagent 的上下文中。**

由 dev-flow 主 agent（纯调度器）在阶段 ③ 开始时读取，理解分 task 迭代调度的流程后，直接使用 subagent tool 派遣 subagent。

**不允许的调用链：** 主 agent → 派 executor → executor 加载本文档 → executor 再派 subagent ❌

**正确的调用链：** 主 agent 读取本文档 → 主 agent 按本文档模式直接派遣 subagent ✅

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | ③ 编码实现 |
| 触发方式 | 由 dev-flow 主 agent 在阶段 ③ 开始时读取（作为调度参考，不加载到 subagent 上下文） |
| 上游 | ② 需求评审通过 + 用户确认 |
| 下游（完成后进入） | 所有 task 完成后由主 agent 进入 ④ 编码评审 |
| 回退目标 | spec 合规不通过 → 当前 task 内修复；编码评审不通过 → 回退到 ③ 重新派遣 |

# Subagent-Driven Development

Execute plan by dispatching fresh subagent per task: TDD coder (writes failing tests) → implementer (writes code to pass tests) → spec compliance review.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh subagent per task: TDD coder (tests first) → executor (code to pass tests) → spec compliance review = high quality, fast iteration

**Task tracking:** Stage 1 内部的 plan Task 使用 `todolist` 工具跟踪进度（自由任务模式）。每完成一个 Task，调用 `todolist complete_task(taskId, summary="...")`，summary 自动写入 memory.md。Phase 2 的 7 个 Stage 由 `loop_task_tracker` 管理。

**重要：subagent 内部也使用 `todolist`（而非 `loop_task_tracker`）管理自己的多步骤流程。** `loop_task_tracker` 是全局状态，subagent 调用 `create_tasks` 会覆盖主 agent 的 Stage 列表。subagent 使用 `todolist create_tasks`（自由任务模式）注册自己的步骤。

**Spec deviation tracking:** 如果 executor 返回了 `spec_deviations`（非空数组），主 agent 必须将偏差追加到 `spec.md` 的 `## 实现偏差记录` 章节。追加格式：
```markdown
### Task {N}: {标题} ({日期})
- **Spec 章节**: {spec_section}
- **偏差描述**: {description}
- **影响范围**: {impact}
- **涉及文件**: {files}
```

**Continuous execution:** Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping. The only reasons to stop are: BLOCKED status you cannot resolve, ambiguity that genuinely prevents progress, or all tasks complete. "Should I continue?" prompts and progress summaries waste their time — they asked you to execute the plan, so execute it.

## When to Use

```dot
digraph when_to_use {
    "Have implementation plan?" [shape=diamond];
    "Tasks mostly independent?" [shape=diamond];
    "Stay in this session?" [shape=diamond];
    "xyz-harness-subagent-driven-development" [shape=box];
    "Manual execution or brainstorm first" [shape=box];

    "Have implementation plan?" -> "Tasks mostly independent?" [label="yes"];
    "Have implementation plan?" -> "Manual execution or brainstorm first" [label="no"];
    "Tasks mostly independent?" -> "Stay in this session?" [label="yes"];
    "Tasks mostly independent?" -> "Manual execution or brainstorm first" [label="no - tightly coupled"];
    "Stay in this session?" -> "xyz-harness-subagent-driven-development" [label="yes"];
    "Stay in this session?" -> "Manual execution or brainstorm first" [label="no - parallel session"];
}
```

**vs. manual execution:**
- Same session (no context switch)
- Fresh subagent per task (no context pollution)
- TDD coder writes tests first, implementer writes code to pass them
- Spec compliance review after each task
- Faster iteration (no human-in-loop between tasks)

## The Process

```dot
digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="Per Task";
        "Dispatch TDD coder (harness-tdd-coder)" [shape=box];
        "TDD coder writes failing tests" [shape=box];
        "Dispatch implementer (harness-executor)" [shape=box];
        "Implementer subagent asks questions?" [shape=diamond];
        "Answer questions, provide context" [shape=box];
        "Implementer writes code to pass tests, commits, self-reviews" [shape=box];
        "Dispatch spec reviewer (harness-reviewer)" [shape=box];
        "Spec reviewer subagent confirms code matches spec?" [shape=diamond];
        "Implementer subagent fixes spec gaps" [shape=box];
        "Mark task complete via todolist (write spec deviations if any)" [shape=box];
    }

    "Read plan, extract all tasks with full text, note context, create_tasks" [shape=box];
    "More tasks remain?" [shape=diamond];
    "Use merge-worktree skill" [shape=box style=filled fillcolor=lightgreen];

    "Read plan, extract all tasks with full text, note context, create_tasks" -> "Dispatch TDD coder (harness-tdd-coder)";
    "Dispatch TDD coder (harness-tdd-coder)" -> "TDD coder writes failing tests";
    "TDD coder writes failing tests" -> "Dispatch implementer (harness-executor)";
    "Dispatch implementer (harness-executor)" -> "Implementer subagent asks questions?";
    "Implementer subagent asks questions?" -> "Answer questions, provide context" [label="yes"];
    "Answer questions, provide context" -> "Dispatch implementer (harness-executor)";
    "Implementer subagent asks questions?" -> "Implementer writes code to pass tests, commits, self-reviews" [label="no"];
    "Implementer writes code to pass tests, commits, self-reviews" -> "Dispatch spec reviewer (harness-reviewer)";
    "Dispatch spec reviewer (harness-reviewer)" -> "Spec reviewer subagent confirms code matches spec?";
    "Spec reviewer subagent confirms code matches spec?" -> "Implementer subagent fixes spec gaps" [label="no"];
    "Implementer subagent fixes spec gaps" -> "Dispatch spec reviewer (harness-reviewer)" [label="re-review"];
    "Spec reviewer subagent confirms code matches spec?" -> "Mark task complete via todolist (write spec deviations if any)" [label="yes"];
    "Mark task complete via todolist (write spec deviations if any)" -> "More tasks remain?";
    "More tasks remain?" -> "Dispatch TDD coder (harness-tdd-coder)" [label="yes"];
    "More tasks remain?" -> "Use merge-worktree skill" [label="no"];
}
```

## 主 Agent 上下文管理

主 agent（调度器）自身的上下文也需要管理。Stage 1 内按 plan task 逐个派遣 subagent，每个 subagent 返回的 summary 都会占用主 agent 的上下文。大量 task 后主 agent 可能退化。

**规则：**

1. **subagent summary 不保留原文**：subagent 返回的 summary 通常是 500-1000 token。主 agent 收到后，提取关键信息（status + 一句话摘要），通过 `todolist complete_task(taskId, summary="...")` 写入 memory.md，然后不再在上下文中引用原始 summary。

2. **每 5 个 task 后主动 compact**：完成第 5、10、15...个 task 后，主动执行 `/compact`。compact 前确保 memory.md 已更新。compact 后从 memory.md 恢复进度。

3. **大型 plan（>8 task）考虑拆分 session**：如果 plan.md 有超过 8 个 task，建议在 task 5-6 完成后暂停，提交一次 git commit，然后在新 session 中继续剩余 task。新 session 通过读取 memory.md 恢复进度。

4. **调度决策写 memory**：如果某个 task 的派遣过程中做了非显而易见的决策（比如选了特定模型、调整了 task 顺序），通过 `todolist update_memory(content="决策：...")` 记录，不要只留在对话历史中。

## Context Diet（上下文瘦身）

每个 subagent 只传入完成任务所需的最小上下文。不要全量传 spec/plan。主 agent 从 spec/plan 中提取必要片段传入，避免 subagent 上下文被无关信息占满。

| 角色 | 必传 | 可选 | 不传 |
|------|------|------|------|
| TDD coder | 当前 task 描述、被测接口签名、测试框架信息 | 同文件已有代码 | 完整 spec 背景章节、其他 task |
| executor | 当前 task 描述、TDD coder 产出的测试文件路径、相关已有代码片段 | CLAUDE.md 编码规范摘要（仅相关部分） | 完整 spec 背景章节、其他 task 描述 |
| 前端 developer | 当前 task 描述、相关设计稿路径、已有组件代码片段 | CLAUDE.md 前端规范摘要（tokens、组件库约束） | 完整 spec 背景章节、其他 task |
| spec reviewer | 当前 task 的 spec 验收标准（AC 部分）、git diff（仅当前 task 变更） | plan 中当前 task 的文件变更表 | 完整 spec 背景章节、其他 task 内容 |
| E2E tester | e2e-test-plan.md、spec.md 验收标准 | 测试环境配置摘要 | 编码过程上下文、其他无关 spec 章节 |

**操作方式**：主 agent 在派遣 subagent 前，先 read spec.md 和 plan.md，从中提取当前 task 对应的片段，作为 subagent task 参数的一部分传入。subagent 不需要自己读 spec/plan 文件。

### L2 复杂度下的额外上下文

当 plan.md 标注为 L2 复杂度时，除了 plan.md 总纲，还存在子设计文档。主 agent 需要根据 task 类型传入额外上下文：

| Task 类型 | 必传额外文档 | 说明 |
|-----------|-------------|------|
| 后端 task（API/数据库/业务逻辑） | `plan-backend.md` 对应章节 | 领域模型、状态机、存储设计、数据流等 |
| 后端 task | `plan-api-contract.md` 相关端点 | API 端点的请求/响应结构 |
| 前端 task（UI/页面/组件） | `plan-frontend.md` 对应章节 | 组件设计、交互逻辑、暂定 API（已对齐） |
| 跨前后端 task | 两份文档的相关章节 | 集成点、API 合约 |

**L1 不需要额外文档**——所有设计都在 plan.md 单文件中。

**提取策略**：主 agent 读取子文档后，只提取当前 task 涉及的章节（如 Task 3 涉及 §5 领域模型和 §8 存储设计），不传整个子文档。这避免了 subagent 上下文被无关信息占满。

## Model Selection

使用能满足任务要求的最经济模型以节省成本和提升速度。在 pi 环境中使用 `provider/model` 格式指定模型。

**机械性实现任务**（独立函数、清晰 spec、1-2 个文件）：`llm-simple-router/glm-5-turbo`。plan 足够清晰时大部分任务都属于此类。

**集成和判断型任务**（跨文件协调、模式匹配、调试）：`llm-simple-router/glm-5.1`。

**架构、设计和评审任务**：`llm-simple-router/glm-5.1`。

**任务复杂度信号：**
- 涉及 1-2 个文件，spec 完整 → `llm-simple-router/glm-5-turbo`
- 涉及多个文件，有集成关注点 → `llm-simple-router/glm-5.1`
- 需要设计判断或广泛的代码库理解 → `llm-simple-router/glm-5.1`

## Handling TDD Coder Status

TDD coder subagents report one of three statuses. Handle each appropriately:

**DONE:** TDD coder wrote failing tests, all tests FAIL as expected → proceed to dispatch implementer subagent.

**NEEDS_CONTEXT:** TDD coder needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** TDD coder cannot write tests. Assess the blocker:
1. If it's a context problem, provide more context and re-dispatch
2. If the spec is unclear, clarify with the human
3. If the task design is fundamentally flawed, escalate to the human

**Never** skip the TDD coder step. Tests-first is a hard requirement.

## Handling Implementer Status

Implementer subagents report one of four statuses. Handle each appropriately:

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding. If the concerns are about correctness or scope, address them before review. If they're observations (e.g., "this file is getting large"), note them and proceed to review.

**NEEDS_CONTEXT:** The implementer needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:
1. If it's a context problem, provide more context and re-dispatch with the same model
2. If the task requires more reasoning, re-dispatch with `llm-simple-router/glm-5.1`
3. If the task is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human

**Never** ignore an escalation or force the same model to retry without changes. If the implementer said it's stuck, something needs to change.

## Agent 角色

每个 agent 自带完整的执行指令（在 agent.md 中），主 agent 只需传入 task 上下文即可，无需额外加载 prompt 模板。

| 角色 | Agent | 职责 |
|------|-------|------|
| TDD coder | harness-tdd-coder | 写失败测试（不写实现代码） |
| 后端实现者 | harness-executor | 写后端代码使测试通过 |
| 前端实现者 | harness-frontend-developer | 前端三阶段开发（骨架→功能→美化） |
| Spec 合规检查 | harness-reviewer | 验证代码是否实现 spec 要求 |

### 前端 task 路由

当 task 涉及 UI 组件、页面、布局、样式时，派遣 `harness-frontend-developer` 而非 `harness-executor`。

**判断信号：**
- 文件路径包含 `frontend/`、`src/components/`、`src/views/`、`src/pages/`
- task 描述中包含组件名、页面名、布局、样式、交互等关键词
- plan.md 中 task 标注了 `type: frontend`
- spec.md 描述了 UI 行为

**前端 agent 不走 TDD 流程**。前端 agent 采用自己的"骨架→功能→美化"三阶段工作流，不需要先派遣 TDD coder。派遣前端 agent 时直接传 task，不需要先写测试。

**派遣模式：**
```
前端 task:
  跳过 TDD coder
  agent: harness-frontend-developer
  model: 按项目配置（默认 kimi-coding-plan/kimi-for-coding）
  完成后: spec 合规检查 → todolist complete_task

后端 task:
  TDD coder → executor → spec 合规检查 → todolist complete_task
```

## Example Workflow

```
You: I'm using Subagent-Driven Development to execute this plan.

[Read plan file once: .xyz-harness/${topic}/plan.md]
[Extract all 5 tasks with full text and context]
[Call create_tasks with all tasks]

Task 1: Hook installation script

[Get Task 1 text and context (already extracted)]
[Dispatch TDD coder subagent via pi subagent tool, agent: harness-tdd-coder]

TDD coder: [No questions, proceeds]
TDD coder:
  - Wrote failing tests for install-hook command
  - Tests cover: user-level install, --force flag, error cases
  - All 3 tests FAIL as expected
  - Committed test file

[Dispatch implementer subagent via pi subagent tool, agent: harness-executor]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/superpowers/hooks/)"

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Implemented install-hook command to pass all tests
  - All 3 tests now PASS
  - Self-review: All good
  - Committed

[Dispatch spec compliance reviewer]
Spec reviewer: ✅ Spec compliant - all requirements met, nothing extra

[Call todolist complete_task for Task 1, summary="安装脚本完成，支持用户级和系统级安装"]
[If executor returned spec_deviations, append them to spec.md ## 实现偏差记录 section]

Task 2: Recovery modes

[Get Task 2 text and context (already extracted)]
[Dispatch TDD coder subagent, agent: harness-tdd-coder]

TDD coder: [No questions, proceeds]
TDD coder:
  - Wrote failing tests for verify/repair modes
  - Tests cover: mode switching, progress reporting, error handling
  - All 4 tests FAIL as expected
  - Committed test file

[Dispatch implementer subagent, agent: harness-executor]

Implementer: [No questions, proceeds]
Implementer:
  - Added verify/repair modes to pass all tests
  - 4/4 tests passing
  - Self-review: All good
  - Committed

[Dispatch spec compliance reviewer]
Spec reviewer: ❌ Issues:
  - Missing: Progress reporting (spec says "report every 100 items")
  - Extra: Added --json flag (not requested)

[Implementer fixes issues]
Implementer: Removed --json flag, added progress reporting

[Spec reviewer reviews again]
Spec reviewer: ✅ Spec compliant now

[Call todolist complete_task for Task 2, summary="verify/repair 模式完成，含进度上报"]
[If executor returned spec_deviations, append them to spec.md ## 实现偏差记录 section]

...

[After all tasks]
[All plan tasks complete via todolist]
[Now call loop_task_tracker complete_task 1 to mark Stage 1 done]
[Proceed to Stage 2: 编码评审]

Done!
```

## Advantages

**vs. Manual execution:**
- Subagents follow TDD naturally
- Fresh context per task (no confusion)
- Parallel-safe (subagents don't interfere)
- Subagent can ask questions (before AND during work)

**Efficiency gains:**
- No file reading overhead (controller provides full text)
- Controller curates exactly what context is needed
- Subagent gets complete information upfront
- Questions surfaced before work begins (not after)

**Quality gates:**
- Self-review catches issues before handoff
- Spec compliance review prevents over/under-building
- Review loops ensure fixes actually work
- Code quality review is handled separately by dev-flow 阶段④的 expert-reviewer skill
- Spec deviation tracking ensures spec.md stays in sync with implementation, preventing false positives in later reviews

**Cost:**
- Three subagent invocations per task (TDD coder + implementer + reviewer)
- Controller does more prep work (extracting all tasks upfront)
- Review loops add iterations but only for spec compliance
- Catches issues early (cheaper than debugging later)

## Red Flags

**Never:**
- Start implementation on main/master branch without explicit user consent
- Skip spec compliance review
- Proceed with unfixed issues
- Dispatch multiple implementation subagents in parallel (conflicts)
- Make subagent read plan file (provide full text instead)
- Skip scene-setting context (subagent needs to understand where task fits)
- Ignore subagent questions (answer before letting them proceed)
- Accept "close enough" on spec compliance (spec reviewer found issues = not done)
- Skip review loops (reviewer found issues = implementer fixes = review again)
- Let implementer self-review replace actual spec review (both are needed)
- Move to next task while spec review has open issues

**If subagent asks questions:**
- Answer clearly and completely
- Provide additional context if needed
- Don't rush them into implementation

**If reviewer finds issues:**
- Implementer (same subagent) fixes them
- Reviewer reviews again
- Repeat until approved
- Don't skip the re-review

**If subagent fails task:**
- Dispatch fix subagent with specific instructions
- Don't try to fix manually (context pollution)

## Integration

**Required workflow skills:**
- **create-worktree** - Ensures isolated workspace (creates one or verifies existing)
- **xyz-harness-writing-plans** - Creates the plan this skill executes
- **merge-worktree** - Complete development after all tasks

**Subagents should use:**
- **TDD coder** uses harness-tdd-coder agent - writes failing tests only
- **Implementer** uses harness-executor agent - writes code to pass tests

**Code quality review:**
- Code quality review is handled by dev-flow 阶段④的 expert-reviewer skill，不在此流程中执行

<!-- LOCAL-OVERRIDE:START -->
## 本地目录覆盖规则

**以下规则覆盖本文档中所有关于输出目录的路径指定**（如 `.xyz-harness/${主题}/` 下）：

- **主目录：** `.xyz-harness/`（项目根目录下）
- **子目录命名：** `${yyyy-MM-dd}-${主题简短标题}`（例：`2026-04-14-core-proxy`）
- **路径映射：**
  - （原始路径）→ `.xyz-harness/${主题}/spec.md`
  - （原始路径）→ `.xyz-harness/${主题}/plan.md`
  - 其他文档按需拆分到 `.xyz-harness/${主题}/` 下
- **不同主题使用不同子目录，禁止混放**

**文档精简：** 单次写入超过 1000 字时优先拆分子文档，主文档保留概述和索引。使用 agent 并行编写各模块文档（并发度 ≤ 2），最后合成精简主文档。
<!-- LOCAL-OVERRIDE:END -->
