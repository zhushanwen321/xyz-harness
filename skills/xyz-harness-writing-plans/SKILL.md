---
name: xyz-harness-writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 2 (plan) |
| 触发方式 | 由主 agent 在 brainstorming 完成后直接执行 |
| 上游 | xyz-harness-brainstorming（产出 spec.md） |
| 下游（完成后进入） | 产出 plan.md → 进入 review plan stage |
| 回退目标 | 如评审不通过 → 回退到 Phase 2 修改 plan |

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `using-git-worktrees` skill at execution time.

**Save plans to:** `.xyz-harness/${主题}/plan.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## Complexity Assessment (L1/L2)

Before writing the plan, assess the architectural complexity of the spec. This determines whether the plan is a single file or requires parallel frontend/backend design.

### Assessment Dimensions

| Dimension | L1 (Simple — no split) | L2 (Complex — split design) |
|-----------|------------------------|-----------------------------|
| Domain impact | Extend existing models, no new concepts | New domain modeling or cross-domain coordination |
| Storage impact | Add fields/indexes to existing tables | New tables, new storage engines, sharding strategy |
| Data flow | Simple, synchronous, short path | Cross-service async, event-driven, long path |
| API impact | Few new/modified endpoints | Multiple endpoints requiring parallel frontend/backend work |
| Non-functional | No special requirements | High concurrency / low latency / strong consistency / special security |

**Any single dimension hitting L2 → overall L2.**

### L1 Flow (Simple)

Produce a single `plan.md` with all tasks inline. Backend design is described within the relevant tasks. No parallel design needed.

### L2 Flow (Complex)

1. Produce `plan.md` as a **master document** (goal, architecture overview, task list with frontend/backend labels, dependency graph, sub-document index, **Execution Groups**, Wave schedule)
2. Dispatch **harness-backend-planner** agent → produces `plan-backend.md` + `plan-api-contract.md`
3. Dispatch **harness-frontend-planner** agent → produces `plan-frontend.md`
4. After both complete, dispatch **harness-api-alignment** agent → aligns `plan-frontend.md` with `plan-api-contract.md`
5. Update `docs/architecture.md` (backend-planner handles this)

**L2 parallel execution:**
- Steps 2 and 3 can run in parallel (both read spec.md + plan.md master)
- Step 4 runs after both 2 and 3 complete
- Step 5 is part of step 2 (backend-planner updates architecture doc)

L2 Flow 保留子文档模式（plan-backend.md + plan-frontend.md + plan-api-contract.md），但 plan.md 总纲中**必须包含 Execution Groups**。Groups 负责"执行编排"（分组、subagent 配置、Wave 编排），子文档负责"设计细节"。

**L2 plan.md master structure:**

```markdown
# [Feature Name] Implementation Plan

**Goal:** ...
**Complexity:** L2
**Architecture:** ...

## Sub-documents
- Backend design: `plan-backend.md`
- API contract: `plan-api-contract.md`
- Frontend design: `plan-frontend.md`

## Task List
| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | ... | backend | — | BG1 |
| 2 | ... | frontend | 1 | FG1 |

## Execution Groups
{与 L1 格式完全相同，见 Execution Groups 章节}

## Dependency Graph & Wave Schedule
...
```

The master plan.md does NOT duplicate the detailed design from sub-documents. It provides:
- Global goal and architecture overview
- Complete task list with dependencies
- Index to sub-documents for details
- Integration points between frontend and backend

L2 时 Execution Groups 中的每个 group 的"设计细节"引用子文档章节（如"设计详见 plan-backend.md §3"），L1 时设计细节直接写在 group 内部。

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

File structure 表格必须包含 Group 列，标注每个文件属于哪个 Execution Group：

| File | Type | Group | Description |
|------|------|-------|-------------|
| `src/models/user.py` | create | BG1 | 用户模型 |
| `src/api/user.py` | create | BG1 | 用户 API |
| `src/views/UserPage.vue` | create | FG1 | 用户管理页面 |
| `tests/test_user.py` | create | BG1 | 用户模型测试 |

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

> **Harness 模式下的注意：** 在 V5 Phase 3 (dev) 中，Task 内部不需要细化到上述 5 步。TDD coder subagent 和 executor subagent 会自动执行"写失败测试→实现"的 TDD 流程。Plan 中的 Task 粒度应与 subagent 调度粒度对齐——每个 Task 对应一次 TDD coder → executor → reviewer 的完整 subagent 链。不要把一个 subagent 的工作拆成多个 Task。

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Type:** backend | frontend

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember
- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Execution Groups

Plan 必须将 Task 按前后端类型分组，形成 Execution Groups。每个 Group 绑定一个 subagent 执行。

### 分组原则

1. **按类型分组**：前端 Task 和后端 Task 分到不同的 Group（前端 Group 前缀 `FG`，后端 Group 前缀 `BG`）
2. **功能关联度**：关联紧密的 Task 放同一组（如用户模型 + 用户 API 放一组）
3. **文件数上限**：每组新增+修改文件总数 ≤ 10 个。超过则拆分
4. **独立可执行**：每组内的 Task 可以由一个 subagent 独立完成，不依赖组外的文件变更
5. **测试文件计算**：TDD 产出的测试文件计入文件数

### Group 内部结构

每个 Group 必须包含以下信息：

```markdown
#### BG1: {后端分组名}

**Description:** {功能关联说明，为什么这些 task 放一组}

**Tasks:** Task 1, Task 3

**Files (预估):** {N} 个文件（{X} create + {Y} modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | `harness-tdd-coder` → `harness-backend-developer` → `harness-reviewer` |
| Model | `llm-simple-router/glm-5.1`（executor）、`llm-simple-router/glm-5-turbo`（tdd-coder） |
| 注入上下文 | {列出具体内容：哪些 task 描述、spec 章节、编码规范} |
| 读取文件 | {列出需要读取的已有文件路径} |
| 修改/创建文件 | {列出将要创建或修改的文件路径} |

**Execution Flow (BG1 内部):** 串行派遣，每个 Task 走完整 subagent 链后再开始下一个 Task。

  Task 1:
    1. harness-tdd-coder → 写失败测试
  2. harness-backend-developer → 写实现代码
  3. harness-reviewer → spec 合规检查

  Task 3 (depends on Task 1):
  1. harness-tdd-coder → 写失败测试
  2. harness-backend-developer → 写实现代码
    3. harness-reviewer → spec 合规检查

**Dependencies:** {无 | BG1（说明原因）}

**设计细节:** {L1: 直接写在此处 | L2: 见 plan-backend.md §3}
```

前端 Group 类似，但 Agent 链和 Model 不同：

```markdown
#### FG1: {前端分组名}

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | `harness-frontend-developer` → `harness-reviewer` |
| Model | `kimi-coding-plan/kimi-for-coding` |
| 注入上下文 | {task 描述 + spec UI 规格 + 前端规范 + 设计稿路径} |
| 读取文件 | {参考组件、路由文件等} |
| 修改/创建文件 | {见 Task Files 列表} |

**Execution Flow (FG1 内部):** 串行派遣，每个 Task 走前端 subagent 链。

  Task 2:
    1. harness-frontend-developer → 骨架→功能→美化
    2. harness-reviewer → spec 合规检查
```

### Wave 编排

Group 之间的依赖关系用 Wave 编排表示。同一 Wave 内的 Group 可以并行执行（Semaphore 允许的前提下），不同 Wave 之间串行。

```markdown
## Dependency Graph & Wave Schedule

  BG1 (backend基础) ──┬──→ BG2 (backend扩展)
         │
         └──→ FG1 (frontend页面) ──→ FG2 (frontend交互)

| Wave | Groups | 说明 |
|------|--------|------|
| Wave 1 | BG1 | 后端基础，无依赖 |
| Wave 2 | BG2, FG1 | BG2 依赖 BG1；FG1 依赖 BG1 API 就绪 |
| Wave 3 | FG2 | 依赖 FG1 |
```

**并行约束:**
- 同一 Wave 内最多 3 个 subagent 并行（Semaphore 限制）
- 同一文件不允许多个 subagent 同时修改
- 前端 Group 通常需要对应后端 Group 的 API 已就绪

### Group 模板选择

| Task 类型 | Agent 链 | 说明 |
|-----------|---------|------|
| 后端 Group | tdd-coder → executor → reviewer | 标准 TDD 流程 |
| 前端 Group | frontend-developer → reviewer | 骨架→功能→美化，跳过 TDD |

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `.xyz-harness/${主题}/plan.md`. Two execution options:**

**1. Group-Driven (recommended)** - I dispatch subagents per Execution Group, following Wave schedule

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Group-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use xyz-harness-subagent-driven-development
- Fresh subagent per group + spec compliance review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use executing-plans
- Batch execution with checkpoints for review

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
