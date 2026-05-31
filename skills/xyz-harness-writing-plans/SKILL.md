---
name: xyz-harness-writing-plans
description: >-
  Phase 2 (plan) of the xyz-harness workflow. Creates implementation plan, E2E test plan, and test case templates from an approved spec. Use when the user says "start Phase 2", "plan phase", "write plan", or after spec.md is done to produce plan.md + E2E test plan + test cases template.
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 2 (plan) |
| 执行者 | 主 agent（规划 + 编排） |
| 上游 | xyz-harness-brainstorming（产出 spec.md） |
| 下游（完成后进入） | Phase 3 (dev) — 加载 phase-dev skill |
| 回退目标 | 如评审不通过 → 回退到 Phase 2 修改 plan |

## Phase Loop 机制

- **Gate FAIL（plan 不完整）**：回到 plan.md 编写，根据 gate 反馈补充缺失内容
- **Review FAIL（must_fix > 0）**：根据 review 反馈修改 plan，重新 dispatch review subagent
- **Self-Review 发现问题**：直接修复，不需要回退

**Auto Mode：** coding-workflow 扩展自动管理 loop，skill 中无需处理。

### Agent/Skill 关联

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| Write plan.md | 主 agent | — | writing-plans (本 skill) | 主 agent 上下文加载 |
| ADR evaluation | 主 agent | — | 无 | MUST + Nullable |
| L2: plan-backend + api-contract | subagent | general-purpose | writing-plans (L2 章节) | task prompt 指定 read |
| L2: plan-frontend | subagent | general-purpose | writing-plans (L2 章节) | task prompt 指定 read |
| L2: API 对齐 | subagent | general-purpose | 无 | 读取 sub-documents 对比 |
| Plan Review | subagent | general-purpose | expert-reviewer | task prompt 指定 read |
| Retrospect | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

## Phase 2 Additional Deliverables

除了 plan.md、e2e-test-plan.md、test_cases_template.json 之外，Phase 2 还需产出:

### use-cases.md

从 spec.md 的"业务用例"章节提取并细化的业务用例文档。

**YAML frontmatter:**
```yaml
---
verdict: pass
---
```

**格式要求:**
- 每个 UC 包含: Actor、Preconditions、Main Flow（编号步骤）、Alternative/Exception Paths、Postconditions、Module Boundaries
- UC 编号格式: UC-{N}
- 所有 UC 必须能追溯到 spec AC（覆盖映射表）

### non-functional-design.md

非功能性设计文档，覆盖五个维度:

**YAML frontmatter:**
```yaml
---
verdict: pass
---
```

**五个维度:**
1. **稳定性**: 改动对系统稳定性的影响，风险缓解
2. **数据一致性**: 数据存储方案，并发控制，YAML frontmatter 修改的安全性
3. **性能**: 文件扫描、YAML 解析的性能评估
4. **业务安全**: Skill 文件作为 AI 行为指令的安全影响
5. **数据安全**: 敏感信息处理，文件操作的权限控制

**格式:** 每个维度 2-3 句话，聚焦于"为什么这样设计"而非实现细节。如果某维度不适用，标注"不适用"并说明原因。

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
2. Dispatch **general-purpose subagent** → reads spec.md + plan.md 总纲, produces `plan-backend.md` + `plan-api-contract.md`
   - Task prompt: "read `skills/xyz-harness-writing-plans/SKILL.md` 的 L2 后端设计指导章节，read `{spec_path}` 和 `{plan_path}`，产出 plan-backend.md 和 plan-api-contract.md"
3. Dispatch **general-purpose subagent** → reads spec.md + plan.md 总纲, produces `plan-frontend.md`
   - Task prompt: "read `skills/xyz-harness-writing-plans/SKILL.md` 的 L2 前端设计指导章节，read `{spec_path}` 和 `{plan_path}`，产出 plan-frontend.md"
4. After both complete, dispatch **general-purpose subagent** → reads plan-frontend.md + plan-api-contract.md, aligns frontend API calls with backend contract
   - Task prompt: "read `{plan_frontend_path}` 和 `{plan_api_contract_path}`，检查前端 API 调用与后端 API 契约是否对齐，更新 plan-frontend.md 中的 API 调用"
5. Update `docs/architecture.md` (backend subagent handles this)

**L2 parallel execution:**
- Steps 2 and 3 can run in parallel
- Step 4 runs after both 2 and 3 complete
- Step 5 is part of step 2

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

## Interface Contracts

接口契约填补 plan 和 code 之间的设计空白。传统 plan 只定义 Task 粒度（如"创建 UserService"），接口契约进一步明确每个 Task 产出的方法签名、数据流链和 AC 覆盖关系。这能在 plan 阶段就检测 AC 遗漏和逻辑断裂，而非等到 dev 或 test 阶段才发现。

接口契约包含三类信息：
- **方法签名表**：按模块分组的公有方法签名（方法名、参数类型、返回类型、边界条件）
- **数据流链**：方法间的调用关系和类型传递链（A.method → B.method → C.method）
- **AC 覆盖矩阵**：spec AC → interface method → data flow → task 的完整追踪

### L1/L2 分级规则

接口契约的强制程度根据 plan 复杂度分级（与 spec FR-3 对齐）：

| 维度 | L1（简化版） | L2（完整版） |
|------|-------------|-------------|
| interface_chain.json | 可选 | 强制 |
| methods 表 | 强制（plan.md markdown） | 强制（plan.md + JSON） |
| data_flows | 可选 | 强制 |
| AC 覆盖矩阵 | 强制 | 强制 |

plan.md 的 YAML frontmatter 必须包含 `verdict` 和 `complexity` 字段：

```yaml
---
verdict: pass
complexity: L1  # 或 L2
---
```

`complexity` 供 gate-check.py 做条件判断。L2 plan 缺失 interface_chain.json 时 gate FAIL；L1 plan 不产出此文件也能过 gate。

### 方法签名表模板

plan.md 中 Interface Contracts 章节按模块分组，格式如下：

<!-- TEMPLATE-START: do not grep this code block as real section headings -->
```markdown
## Interface Contracts

### Module: {module-name}

#### Class: {ClassName}

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| methodName | (param: Type) -> ReturnType | ReturnType | boundary condition | AC-N |

#### Data: {CustomTypeName}

| Field | Type | Description |
|-------|------|-------------|
| fieldName | FieldType | description |
```
<!-- TEMPLATE-END -->

### AC 覆盖矩阵模板（强制章节）

plan.md 必须包含 Spec Coverage Matrix 章节，追踪 spec AC 的完整覆盖：

```markdown
## Spec Coverage Matrix

| Spec AC | Interface Method | Data Flow | Task |
|---------|-----------------|-----------|------|
| AC-N | Class.method | flow-id | Task N |
| AC-M | [GAP] | [GAP] | [GAP] |
```

矩阵中任何 `[GAP]` 条目表示 plan 遗漏，必须在完成 plan 前解决或显式声明为 `[POSTPONED]`（附原因）。postponed 的 AC 不算 GAP。

> **注意：** 此矩阵与 "Spec Metrics Traceability" 章节互补——Traceability 追踪采纳状态，Coverage Matrix 追踪接口级覆盖。两者都不可省略。

### interface_chain.json 产出指引（仅 L2）

L2 plan 额外产出 `interface_chain.json`，与 plan.md 同目录。JSON schema 参见 spec.md FR-1 定义。

产出流程：
1. 完成 plan.md 的 Interface Contracts 章节后，根据签名表和 data_flows 生成 JSON
2. 确保 JSON 中每个 method 的 name、class、params、returns 与 plan.md markdown 表一致
3. 确保 data_flows[].chain 中的方法名全部存在于 methods[] 表中
4. 独立验证：`python3 -c "import json; json.load(open('interface_chain.json'))"`

### 粒度边界

**纳入接口契约：**
- 公开接口类的公有方法
- 数据类 / DTO / Model 的字段定义

**不纳入接口契约：**
- 私有方法 / 内部 helper 方法
- 工具类（除非被多个模块共享，作为共享契约）
- 框架 / 平台生成的代码（prisma、ORM 生成的方法等）

### "禁止实现代码"豁免说明

接口签名是设计契约（方法名 + 参数类型 + 返回类型），不是实现代码。plan 中的接口签名表不受 Self-Check Checklist 中"禁止实现代码"规则的限制。签名表中可以包含参数类型和返回类型的名称，但不允许包含方法体、算法逻辑或完整的类定义。

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

> **Harness 模式下的注意：** 在 V5 Phase 3 (dev) 中，Task 内部不需要细化到上述 5 步。TDD coder subagent 和 executor subagent 会自动执行"写失败测试→实现"的 TDD 流程。Plan 中的 Task 粒度应与 subagent 调度粒度对齐——每个 Task 对应一次 TDD coder → executor → reviewer 的完整 subagent 链。不要把一个 subagent 的工作拆成多个 Task。

## Spec Metrics Traceability (强制章节)

每个 plan 必须包含以下章节，显式追踪 spec 指标的采纳状态：

```markdown
## Spec Metrics Traceability

| Spec 指标 | 采纳状态 | 对应 Task |
|-----------|---------|----------|
| AC-1 xxx | adopted | Task 1 |
| AC-2 xxx | postponed | — (reason) |
```

采纳状态：
- `adopted` — 纳入本次 plan，有对应 Task
- `rejected` — 不需要，说明原因
- `postponed` — 后续迭代处理，说明原因

此章节确保 spec→plan→test 的指标传递链不断裂。缺少此章节的 plan 不应通过 gate。

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
| Agent | general-purpose → general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（executor: high、tdd-coder: medium） |
| 注入上下文 | {列出具体内容：哪些 task 描述、spec 章节、编码规范} |
| 读取文件 | {列出需要读取的已有文件路径} |
| 修改/创建文件 | {列出将要创建或修改的文件路径} |

**Execution Flow (BG1 内部):** 串行派遣，每个 Task 走完整 subagent 链后再开始下一个 Task。

  Task 1:
    1. general-purpose (read xyz-harness-test-driven-development + xyz-harness-backend-dev) → 写失败测试
    2. general-purpose (read xyz-harness-backend-dev) → 写实现代码
    3. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

  Task 3 (depends on Task 1):
    1. general-purpose (read xyz-harness-test-driven-development + xyz-harness-backend-dev) → 写失败测试
    2. general-purpose (read xyz-harness-backend-dev) → 写实现代码
    3. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查

**Dependencies:** {无 | BG1（说明原因）}

**设计细节:** {L1: 直接写在此处 | L2: 见 plan-backend.md §3}
```

前端 Group 类似，但 Agent 链和 Model 不同：

```markdown
#### FG1: {前端分组名}

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose → general-purpose |
| Model | 按 taskComplexity 自动选择（前端: medium） |
| 注入上下文 | {task 描述 + spec UI 规格 + 前端规范 + 设计稿路径} |
| 读取文件 | {参考组件、路由文件等} |
| 修改/创建文件 | {见 Task Files 列表} |

**Execution Flow (FG1 内部):** 串行派遣，每个 Task 走前端 subagent 链。

  Task 2:
    1. general-purpose (read xyz-harness-frontend-dev) → 骨架→功能→美化
    2. general-purpose (read xyz-harness-expert-reviewer) → spec 合规检查
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
| 后端 Group | general-purpose → general-purpose → general-purpose | 标准 TDD 流程（分别读取 TDD + backend-dev + reviewer skill） |
| 前端 Group | general-purpose → general-purpose | 骨架→功能→美化（分别读取 frontend-dev + reviewer skill），跳过 TDD |

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## ADR Evaluation Step

**MUST + Nullable：** 必须执行，但产出可为空。

plan 交付物全部完成后、dispatch review subagent 前，执行 ADR 评估：

1. **Read `docs/adr/` 目录**，确认当前已有 ADR 编号（延续 Phase 1 的编号）
2. **Read 项目根目录 `CONTEXT.md`**（如果存在），确认术语定义
3. **扫描 plan.md 中的新决策**（Phase 1 未覆盖的），逐个评估三条件：
   - **难以逆转：** 架构选型、技术锁定、集成模式等
   - **无上下文会惊讶：** 与常规做法不同的决策
   - **真实权衡：** 存在替代方案但选择了特定方案
4. **满足三条件的决策，创建 ADR**：`docs/adr/{NNNN}-{slug}.md`
5. **不满足三条件，不创建 ADR**

**产出可为空：** 如果 plan 中无新决策满足三条件（常见于简单需求），不写 ADR。但必须执行评估。

## 交付物：e2e-test-plan.md

e2e-test-plan.md 必须包含 YAML frontmatter：

| 字段 | 类型 | 必填 | 允许值 | 说明 |
|------|------|------|--------|------|
| `verdict` | string | 是 | `"pass"` | 门禁通过标志 |

**模板：**
```markdown
---
verdict: pass
---

# E2E Test Plan — {topic}

## Test Scenarios
{describe test scenarios covering AC from spec}

## Test Environment
{test environment setup details}
```

## 交付物：test_cases_template.json

| 字段 | 类型 | 必填 | 允许值 | 说明 |
|------|------|------|--------|------|
| `test_cases` | array | 是 | — | 测试用例数组，不能为空 |
| `.id` | string | 是 | `"TC-{N}-{N}"` | 用例唯一 ID |
| `.type` | string | 是 | `"api"` / `"ui"` / `"integration"` / `"manual"` | 用例类型 |
| `.title` | string | 是 | 任意 | 用例标题 |
| `.description` | string | 否 | 任意 | 用例详细描述 |
| `.steps` | array | 否 | — | 执行步骤列表 |

**模板：**
```json
{
  "test_cases": [
    {
      "id": "TC-1-01",
      "type": "api",
      "title": "GET /api/config returns config items",
      "description": "Verify that the config endpoint returns all config items",
      "steps": ["call GET /api/config", "verify 200 response contains items array"]
    }
  ]
}
```

注意：
- 必须是有效 JSON（无 trailing comma）
- `test_cases` 是数组，不是对象
- 每个元素至少包含 `id`、`type`、`title` 三个字段

## Plan Review (独立审查)

写完所有 plan 交付物后，dispatch 独立审查 subagent：

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: 由 coding-workflow 扩展按 taskComplexity 自动选择（review: medium）
   - **Task prompt**:
     ```
     你是独立审查专家。按以下步骤执行审查：

     1. read `skills/xyz-harness-expert-reviewer/SKILL.md`，找到「模式一：计划评审」章节
     2. read `CLAUDE.md`（获取项目架构约束和编码规范）
     3. read 以下待审查文件：
        - `{topic_dir}/spec.md`
        - `{topic_dir}/plan.md`
        - `{topic_dir}/e2e-test-plan.md`
        - `{topic_dir}/use-cases.md`
        - `{topic_dir}/non-functional-design.md`
     4. 按方法论逐项审查（spec 完整性、plan 可行性、spec-plan 一致性、Execution Groups 合理性），将结果写入：
        `{topic_dir}/changes/reviews/plan_review_v1.md`
     5. YAML frontmatter 必须包含:
        - `verdict`: "pass" 或 "fail"
        - `must_fix`: 数字（open MUST_FIX 问题数量）
     ```

2. 审查轮次：
   - must_fix == 0 → 通过
   - must_fix > 0 → 修复 plan 后重新 dispatch（产出 plan_review_v2.md），最多 3 轮
   - 3 轮后仍有 must_fix > 0 → 停止，记录未解决问题，由用户决定

### plan_bl_review（仅 L2，独立审查）

L2 复杂度的 plan 在 `plan_review` 之外，还需要 `plan_bl_review`（业务逻辑审查）。验证 plan 中的接口定义、数据流、前后端契约是否与 spec 一致。

1. Dispatch subagent（**仅在 complexity=L2 时**）：
   - **Agent**: general-purpose
   - **Model**: 由 coding-workflow 扩展按 taskComplexity 自动选择（review: medium）
   - **Task prompt**:
     ```
     你是独立审查专家。按以下步骤执行 L2 业务逻辑审查：

     1. read `skills/xyz-harness-expert-reviewer/SKILL.md`，找到「模式一：计划评审」章节
     2. read 以下文件：
        - `{topic_dir}/spec.md`
        - `{topic_dir}/plan.md`
        - `{topic_dir}/interface_chain.json`（L2 专属）
        - `{topic_dir}/use-cases.md`
     3. 重点审查：
        - interface_chain.json 中的每个 method 是否在 spec 中有对应的 AC 覆盖
        - 前后端 plan 子文档的接口契约是否一致（参数类型、返回类型、edge_cases）
        - use-cases 的业务流程是否被 plan 的 Execution Groups 完整覆盖
     4. 将结果写入：`{topic_dir}/changes/reviews/plan_bl_review_v1.md`
     5. YAML frontmatter 必须包含:
        - `verdict`: "pass" 或 "fail"
        - `must_fix`: 数字
     ```

2. 审查轮次：同 plan_review（must_fix > 0 → 修复 → 重新 dispatch，最多 3 轮）

### plan_review 输出格式

| 字段 | 类型 | 必填 | 允许值 | 说明 |
|------|------|------|--------|------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志 |
| `must_fix` | number | 是 | `0` | 必须修复的问题数量 |

## Retrospect (复盘)

**触发时机：**
- **Auto Mode：** coding-workflow 扩展在 gate PASS 后自动 dispatch retrospect subagent
- **Manual Mode：** 当用户告知 gate check 通过后，手动 dispatch retrospect subagent

然后进入 Phase 3。

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: 由 coding-workflow 扩展按 taskComplexity 自动选择（retrospect: low）
   - **Task prompt**:
     ```
     你是复盘分析师。按以下步骤执行：

     1. 回顾 system prompt 中已包含的复盘方法论
     2. read 以下交付物文件：
        - `{topic_dir}/plan.md`
        - `{topic_dir}/e2e-test-plan.md`
        - `{topic_dir}/test_cases_template.json`
        - `{topic_dir}/changes/reviews/plan_review_v*.md`
     3. 按方法论覆盖两个维度（Phase 执行 + Harness 体验），将结果写入：
        `{topic_dir}/changes/reviews/plan_retrospect.md`
     4. YAML frontmatter: `phase: plan`, `verdict: pass`
     ```

## 交付物验证

**铁律：禁止在未实际运行验证命令的情况下声称完成。**

- [ ] plan.md 存在，YAML verdict: pass
- [ ] e2e-test-plan.md 存在，YAML verdict: pass
- [ ] test_cases_template.json 存在且是有效 JSON
- [ ] plan_review 存在，verdict: pass, must_fix: 0
- [ ] 运行 gate check 脚本确认：
  ```bash
  python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 2
  ```
- [ ] Tasks cover all acceptance criteria from spec
- [ ] use-cases.md 存在，YAML verdict: pass
- [ ] non-functional-design.md 存在，YAML verdict: pass
- [ ] use-cases.md 中所有 UC 与 spec AC 有覆盖映射

## 阶段完成提交

**阶段完成时，必须提交并推送所有代码和文档到远程仓库。**

```bash
git add -A
git commit -m "docs: plan for {topic}"
git push
```

确保 `.xyz-harness/` 和 `docs/` 目录下的所有产出文件都被 git 跟踪。

## Gate Handoff

在独立 Pi session 中检查 gate：

```bash
python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 2
```

或打开新的 Pi session，加载 xyz-harness-gate skill，告诉它：
> "Check Phase 2 gate for topic `{topic}`"

## Phase Transition

Phase 2 完成后，告知用户：

> "Phase 2 complete. All plan deliverables ready. Please run gate check in a separate session. When gate passes, come back and I'll run the retrospective. Then say 'start Phase 3' to continue."

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

## Self-Check Checklist

### Scope 覆盖声明
- [ ] spec 中每个量化指标/AC 是否在 plan 中标注了采纳状态（adopted/rejected/postponed）？
- [ ] 是否存在 spec 指标在 plan 中被静默忽略（无声明）？
- [ ] scope 缩减是否在 plan 中正式声明（不能静默缩小）？

### Task 粒度
- [ ] 单个 Task 是否超过 10 步？超过则考虑拆分
- [ ] 每个 Task 是否对应一次 subagent 调度（而非 TDD 内部的微步骤）？

### 禁止实现代码
- [ ] plan 中是否包含函数体、完整类定义或其他实现代码？
- [ ] 如包含：删除，只保留接口签名和调用关系

### 伪代码数据来源
- [ ] 涉及 DB JSON 字段的伪代码，是否标注了数据来源和实际序列化格式？
- [ ] 是否有未验证的假设（如"parsed.stages 是对象包裹数组"）？
