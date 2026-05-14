---
name: xyz-harness-writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | ① 需求分析（后半段） |
| 触发方式 | 由主 agent 在 brainstorming 完成后直接执行 |
| 上游 | xyz-harness-brainstorming（产出 spec.md） |
| 下游（完成后进入） | 产出 plan.md → 由 dev-flow 进入 ② 需求评审（expert-reviewer 计划评审模式） |
| 回退目标 | 如评审不通过 → 回退到 ① 修改 spec/plan |

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

1. Produce `plan.md` as a **master document** (goal, architecture overview, task list with frontend/backend labels, dependency graph, sub-document index)
2. Dispatch **harness-backend-planner** agent → produces `plan-backend.md` + `plan-api-contract.md`
3. Dispatch **harness-frontend-planner** agent → produces `plan-frontend.md`
4. After both complete, dispatch **harness-api-alignment** agent → aligns `plan-frontend.md` with `plan-api-contract.md`
5. Update `docs/architecture.md` (backend-planner handles this)

**L2 parallel execution:**
- Steps 2 and 3 can run in parallel (both read spec.md + plan.md master)
- Step 4 runs after both 2 and 3 complete
- Step 5 is part of step 2 (backend-planner updates architecture doc)

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
| # | Task | Type | Depends on | Sub-document |
|---|------|------|-----------|-------------|
| 1 | ... | backend | — | plan-backend.md §3 |
| 2 | ... | frontend | 1 | plan-frontend.md §2 |

## Dependency Graph
...
```

The master plan.md does NOT duplicate the detailed design from sub-documents. It provides:
- Global goal and architecture overview
- Complete task list with dependencies
- Index to sub-documents for details
- Integration points between frontend and backend

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

> **Harness 模式下的注意：** 在 xyz-harness Phase 2 中，Task 内部不需要细化到上述 5 步。TDD coder subagent 和 executor subagent 会自动执行"写失败测试→实现"的 TDD 流程。Plan 中的 Task 粒度应与 subagent 调度粒度对齐——每个 Task 对应一次 TDD coder → executor → reviewer 的完整 subagent 链。不要把一个 subagent 的工作拆成多个 Task。

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

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `.xyz-harness/${主题}/plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use xyz-harness-subagent-driven-development
- Fresh subagent per task + spec compliance review

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
