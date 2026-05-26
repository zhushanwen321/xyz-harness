---
verdict: pass
complexity: L1
---

# Harness Plan/Dev/Review/Retrospect Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强 xyz-harness 的 Plan 阶段交付物、Dev 阶段审查流程、Retrospect 吸收追踪三大模块。

**Architecture:** 新建 4 个 Reference Skill（business-logic-reviewer、integration-reviewer、standards-reviewer、robustness-reviewer）+ 1 个项目级 Skill（retrospect-collector），更新 5 个现有文件（gate-check.py、brainstorming SKILL.md、writing-plans SKILL.md、phase-dev SKILL.md、harness-retrospect SKILL.md）。

**Tech Stack:** TypeScript (Pi Extension API)、Python 3 + PyYAML、Markdown (Skill 定义)

---

## File Structure

| File | Type | Group | Description |
|------|------|-------|-------------|
| `skills/xyz-harness-business-logic-reviewer/SKILL.md` | create | BG1 | 业务逻辑审查 skill（plan + dev 双模式） |
| `skills/xyz-harness-integration-reviewer/SKILL.md` | create | BG1 | 集成审查 skill |
| `skills/xyz-harness-standards-reviewer/SKILL.md` | create | BG1 | 规范审查 skill（lint + CLAUDE.md 对比） |
| `skills/xyz-harness-robustness-reviewer/SKILL.md` | create | BG1 | 健壮性审查 skill（六维度） |
| `skills/harness-retrospect-collector/SKILL.md` | create | BG2 | Retrospect 收集器 skill |
| `skills/harness-retrospect-collector/scripts/collect.py` | create | BG2 | 收集脚本（scan/absorb/aggregate） |
| `.pi/skills/harness-retrospect-collector` | create (symlink) | BG2 | 项目级 skill 发现 symlink |
| `extensions/coding-workflow/gate-check.py` | modify | BG3 | Phase 2/3 gate 规则更新 |
| `skills/harness-retrospect/SKILL.md` | modify | BG4 | YAML frontmatter 格式增强 |
| `skills/xyz-harness-brainstorming/SKILL.md` | modify | BG5 | spec.md 增加业务用例章节要求 |
| `skills/xyz-harness-writing-plans/SKILL.md` | modify | BG5 | plan 阶段增加 use-cases.md + non-functional-design.md |
| `skills/xyz-harness-phase-dev/SKILL.md` | modify | BG6 | Step 4 从 code_review 改为 5 步审查 |

---

## Interface Contracts

### Module: gate-check.py

#### Function: PHASE_SPECS (dict literal)

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| Phase 2 deliverables | `list[FileCheck]` | — | 新增 use-cases.md 和 non-functional-design.md | AC-11 |
| Phase 2 reviews | `list[ReviewCheck]` | — | L2 时额外检查 plan_bl_review | AC-11 |
| Phase 3 reviews | `list[ReviewCheck]` | — | 5 个新 review prefix 替换 code_review_v | AC-11 |

#### Function: validate_plan_bl_review (new)

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| validate_plan_bl_review | `(topic_dir: str, checks: list) -> None` | None | 仅当 plan.md complexity=L2 时检查 | AC-11 |

### Module: collect.py

#### Class: RetrospectFile (dataclass)

| Field | Type | Description |
|-------|------|-------------|
| path | str | 文件绝对路径 |
| phase | str | Phase 名称 |
| topic | str | Topic 目录名 |
| absorbed | bool | 是否已吸收 |
| harness_issues | list[str] | 改进建议列表 |

#### Function: main

| Method | Signature | Returns | Edge Cases | Spec Ref |
|--------|-----------|---------|------------|----------|
| scan | `(root: str) -> list[RetrospectFile]` | — | 旧文件无 absorbed 字段视为 false | AC-8 |
| absorb | `(files: list[str], summary: str) -> None` | — | 更新 YAML frontmatter | AC-8 |
| aggregate | `(files: list[RetrospectFile]) -> dict[str, int]` | issue→频率 | 去重+频率排序 | AC-8 |

### Module: SKILL.md (各 reviewer skill)

每个 reviewer skill 的 review 产出格式:

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| verdict | str | yes | "pass"/"fail" | 审查结论 |
| must_fix | int | yes | 0+ | 必须修复问题数 |
| review_metrics | object | no | — | 价值追踪数据（FR-12） |

---

## Spec Coverage Matrix

| Spec AC | Interface Method | Data Flow | Task |
|---------|-----------------|-----------|------|
| AC-1 use-cases.md 格式 | writing-plans SKILL.md 更新 | Task 8 | Task 8 |
| AC-2 non-functional-design.md 覆盖 | writing-plans SKILL.md 更新 | Task 8 | Task 8 |
| AC-3 BLR 双模式 | business-logic-reviewer SKILL.md | Task 1 | Task 1 |
| AC-4 Integration Reviewer | integration-reviewer SKILL.md | Task 2 | Task 2 |
| AC-5 Standards Reviewer | standards-reviewer SKILL.md | Task 3 | Task 3 |
| AC-6 Robustness Reviewer | robustness-reviewer SKILL.md | Task 4 | Task 4 |
| AC-7 Retrospect YAML | harness-retrospect SKILL.md 更新 | Task 9 | Task 9 |
| AC-8 Collector 脚本 | collect.py | Task 5, 6 | Task 5, 6 |
| AC-9 Phase 1 业务用例 | brainstorming SKILL.md 更新 | Task 7 | Task 7 |
| AC-10 Phase 3 五步审查 | phase-dev SKILL.md 更新 | Task 11 | Task 11 |
| AC-11 Gate-check 更新 | gate-check.py 修改 | Task 10 | Task 10 |
| AC-12 Retrospect 审查价值 | review_metrics 字段定义 | Task 1-4, 9 | Task 1-4 |

---

## Spec Metrics Traceability

| Spec 指标 | 采纳状态 | 对应 Task |
|-----------|---------|----------|
| AC-1 use-cases.md 格式和内容 | adopted | Task 8 |
| AC-2 non-functional-design.md 五维度 | adopted | Task 8 |
| AC-3 BLR 双模式可 dispatch | adopted | Task 1 |
| AC-4 Integration Reviewer 可消费上游 | adopted | Task 2 |
| AC-5 Standards Reviewer lint + 规范对比 | adopted | Task 3 |
| AC-6 Robustness Reviewer 六维度 | adopted | Task 4 |
| AC-7 Retrospect YAML 吸收元数据 | adopted | Task 9 |
| AC-8 Collector 脚本可用 | adopted | Task 5, 6 |
| AC-9 Phase 1 spec 业务用例 | adopted | Task 7 |
| AC-10 Phase 3 五步审查可执行 | adopted | Task 11 |
| AC-11 Gate-check.py 新规则 | adopted | Task 10 |
| AC-12 Retrospect 审查价值 | adopted | Task 1-4 (review_metrics), Task 9 |

---

## Task List

| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | 创建 business-logic-reviewer skill | backend | — | BG1 |
| 2 | 创建 integration-reviewer skill | backend | — | BG1 |
| 3 | 创建 standards-reviewer skill | backend | — | BG1 |
| 4 | 创建 robustness-reviewer skill | backend | — | BG1 |
| 5 | 创建 retrospect-collector SKILL.md | backend | — | BG2 |
| 6 | 创建 collect.py 脚本 | backend | 5 | BG2 |
| 7 | 更新 brainstorming SKILL.md | backend | — | BG5 |
| 8 | 更新 writing-plans SKILL.md | backend | — | BG5 |
| 9 | 更新 harness-retrospect SKILL.md | backend | — | BG4 |
| 10 | 更新 gate-check.py | backend | — | BG3 |
| 11 | 更新 phase-dev SKILL.md | backend | 1,2,3,4 | BG6 |

---

### Task 1: 创建 business-logic-reviewer skill

**Type:** backend

**Files:**
- Create: `skills/xyz-harness-business-logic-reviewer/SKILL.md`

**描述：** 创建业务逻辑审查 Reference Skill，支持 plan 模式（L2 only）和 dev 模式（L1+L2）。

**SKILL.md 结构：**

YAML frontmatter:
```yaml
---
name: xyz-harness-business-logic-reviewer
description: >-
  Business logic reviewer for xyz-harness. Validates business use case coverage
  against plan design (plan mode, L2 only) or actual code (dev mode, L1+L2).
  Trigger: "business logic review", "BLR", "verify business coverage".
tools:
  - read
  - write
  - bash
---
```

Body 包含：
1. **概述**：双模式说明（plan vs dev），上游消费（use-cases.md），下游产出（business_logic_review_v1.md）
2. **Plan 模式章节**：
   - 输入：use-cases.md + plan.md + interface_chain.json（L2 only）
   - 方法：逐个 UC 遍历，追踪 plan 的 task chain + interface contracts + data flows，验证设计方案是否覆盖每个 UC 的主流程和异常路径
   - 产出格式：`plan_bl_review_v1.md`（YAML: verdict, must_fix, review_metrics）
3. **Dev 模式章节**：
   - 输入：use-cases.md + git diff + 源代码文件
   - 方法：对每个 UC 构造模拟业务数据（具体值），沿代码执行路径推演，记录经过的文件/类/方法/预测结果
   - 产出格式：`business_logic_review_v1.md`（YAML: verdict, must_fix, review_metrics）
   - 模拟数据格式：`{ "user_id": 123, "order_items": [{"sku": "ABC", "qty": 2}], "expected_total": 199.8 }`
   - 执行路径记录：`UC-1 → src/order.py:OrderService.create() → src/inventory.py:InventoryService.check() → 预测: order created / 异常: insufficient stock`
4. **Review 输出模板**：YAML frontmatter 含 verdict, must_fix, review_metrics(files_reviewed, issues_found, must_fix_count, low_count, info_count, duration_estimate)

- [ ] Step 1: 创建 `skills/xyz-harness-business-logic-reviewer/` 目录
- [ ] Step 2: 写入 SKILL.md（含 YAML frontmatter + 双模式方法 + 输出模板）
- [ ] Step 3: 验证 YAML frontmatter 可被 Python 解析

### Task 2: 创建 integration-reviewer skill

**Type:** backend

**Files:**
- Create: `skills/xyz-harness-integration-reviewer/SKILL.md`

**描述：** 创建集成审查 Reference Skill。消费 business_logic_review 的模拟数据和执行路径，聚焦模块边界衔接问题。

**SKILL.md 结构：**

YAML frontmatter:
```yaml
---
name: xyz-harness-integration-reviewer
description: >-
  Integration reviewer for xyz-harness. Checks module boundary correctness
  using simulated data paths from business_logic_review. Trigger:
  "integration review", "check module boundaries".
tools:
  - read
  - write
  - bash
---
```

Body 包含：
1. **概述**：审查模块间衔接问题，依赖 business_logic_review 产出
2. **输入**：business_logic_review_v*.md（提取模拟数据和执行路径）+ 代码文件
3. **审查方法**：
   - 从 BLR 产出中提取每个 UC 的执行路径
   - 在模块边界处检查：数据格式转换是否正确、错误传播是否完整、接口契约是否一致
   - 前后端上下游检查：API 请求/响应体字段是否匹配、状态码处理是否完整
4. **产出格式**：`integration_review_v1.md`（YAML: verdict, must_fix, review_metrics）
5. **与 BLR 的依赖说明**：必须等待 BLR 完成后执行

- [ ] Step 1: 创建目录 + 写入 SKILL.md
- [ ] Step 2: 验证 YAML frontmatter

### Task 3: 创建 standards-reviewer skill

**Type:** backend

**Files:**
- Create: `skills/xyz-harness-standards-reviewer/SKILL.md`

**描述：** 创建规范审查 Reference Skill。运行项目 lint/typecheck + 对比 CLAUDE.md 编码规范。

**SKILL.md 结构：**

YAML frontmatter:
```yaml
---
name: xyz-harness-standards-reviewer
description: >-
  Standards reviewer for xyz-harness. Runs project lint/typecheck and checks
  code against CLAUDE.md coding conventions. Trigger: "standards review",
  "check coding standards", "lint check".
tools:
  - read
  - write
  - bash
---
```

Body 包含：
1. **概述**：两阶段审查——自动 lint/typecheck + AI 规范对比
2. **Phase A: 自动检查**：
   - 检测项目 lint 配置（package.json 的 scripts.lint、pyproject.toml 的 linter、Makefile lint target）
   - 如果找到 lint 命令：运行并记录结果
   - 如果找到 typecheck 命令：运行并记录结果
   - 如果都没找到：标注"项目未配置 lint/typecheck，跳过自动检查"
3. **Phase B: AI 规范对比**：
   - read CLAUDE.md 中的编码规范章节
   - 对比 git diff 中的代码变更与规范要求
   - 逐项标注符合/不符合
4. **产出格式**：`standards_review_v1.md`
   - YAML: verdict, must_fix, review_metrics
   - 可选字段：linter_passed (bool, 仅当项目有 lint 时), typecheck_passed (bool, 仅当项目有 typecheck 时)
   - 无 lint 配置时：不设 linter_passed，报告中标注
5. **边界条件**：纯文档仓库无 lint 时，所有自动检查标记为"skipped"，仅执行 Phase B

- [ ] Step 1: 创建目录 + 写入 SKILL.md
- [ ] Step 2: 验证 YAML frontmatter

### Task 4: 创建 robustness-reviewer skill

**Type:** backend

**Files:**
- Create: `skills/xyz-harness-robustness-reviewer/SKILL.md`

**描述：** 创建健壮性审查 Reference Skill，覆盖六维度。

**SKILL.md 结构：**

YAML frontmatter:
```yaml
---
name: xyz-harness-robustness-reviewer
description: >-
  Robustness reviewer for xyz-harness. Checks error handling, exception
  management, logging, fail-fast, testability, and debug-friendliness.
  Trigger: "robustness review", "check error handling", "resilience check".
tools:
  - read
  - write
  - bash
---
```

Body 包含：
1. **概述**：六维度健壮性审查
2. **审查维度清单**（每维度含具体检查项）：
   - 错误处理：是否该 catch 的 catch、该降级的降级、错误传播链是否完整
   - 异常处理：异常类型是否妥当、是否有静默吞掉异常的空 catch/except
   - 日志：关键路径是否有日志、日志级别是否合理（error/warn/info/debug）
   - Fail-fast：该立即失败的路径是否立即失败（不 return None 默默继续）
   - 测试友好性：依赖注入、mock 友好、可测试的纯函数
   - 调试友好性：错误信息是否有意义（包含 context）、是否方便用户上报
3. **审查方法**：逐文件扫描 git diff，按维度逐项检查，每个发现标注维度和严重度
4. **产出格式**：`robustness_review_v1.md`（YAML: verdict, must_fix, review_metrics）

- [ ] Step 1: 创建目录 + 写入 SKILL.md
- [ ] Step 2: 验证 YAML frontmatter

### Task 5: 创建 retrospect-collector SKILL.md

**Type:** backend

**Files:**
- Create: `skills/harness-retrospect-collector/SKILL.md`
- Create: `skills/harness-retrospect-collector/scripts/` (directory)

**描述：** 创建 Retrospect 收集器 skill 定义文件。

**SKILL.md 结构：**

YAML frontmatter:
```yaml
---
name: harness-retrospect-collector
description: >-
  Retrospect collector for xyz-harness. Scans retrospect files, tracks
  absorption status, aggregates improvement suggestions. Trigger:
  "collect retrospects", "retrospect status", "scan retrospects",
  "absorb retrospect".
tools:
  - read
  - write
  - bash
---
```

Body 包含：
1. **概述**：功能说明（scan/absorb/aggregate 三种模式）
2. **使用方式**：
   - `python3 skills/harness-retrospect-collector/scripts/collect.py` — 默认：列出未吸收
   - `--all` — 全部
   - `--absorb <file> --summary "..."` — 标记吸收
   - `--aggregate` — 聚合 harness_issues
   - `--json` — JSON 输出
   - `--root <path>` — 指定扫描根目录
3. **脚本路径**：`skills/harness-retrospect-collector/scripts/collect.py`
4. **输出格式示例**（默认、聚合、JSON 三种）
5. **YAML 更新规则**：`--absorb` 操作的具体行为
6. **向后兼容**：旧版 retrospect 无 absorbed 字段视为 false

- [ ] Step 1: 创建目录结构
- [ ] Step 2: 写入 SKILL.md
- [ ] Step 3: 验证 YAML frontmatter

### Task 6: 创建 collect.py 脚本

**Type:** backend

**Depends on:** Task 5

**Files:**
- Create: `skills/harness-retrospect-collector/scripts/collect.py`

**描述：** 创建 Python 扫描脚本，实现 scan/absorb/aggregate 功能。

**核心逻辑：**

1. **scan(root)**: 递归扫描 root 下所有 `*retrospect*.md` 文件，解析 YAML frontmatter，提取 phase/topic/absorbed/harness_issues。旧文件无 absorbed 字段默认 false。

2. **absorb(files, summary)**: 对每个文件，解析 frontmatter，设置 `absorbed: true`、`absorbed_date: <today>`、`absorption_summary: summary`，写回文件。

3. **aggregate(files)**: 从所有未吸收文件中提取 harness_issues，去重（去除标点后比较），按频率降序排序。

4. **CLI**: argparse 处理 --all / --json / --aggregate / --root / --absorb / --summary。

**依赖：** 仅 Python 3 标准库 + PyYAML。

- [ ] Step 1: 写入 collect.py
- [ ] Step 2: 创建 symlink: `.pi/skills/harness-retrospect-collector` → `../../skills/harness-retrospect-collector`
- [ ] Step 3: 测试脚本：`python3 skills/harness-retrospect-collector/scripts/collect.py --root .xyz-harness/`

### Task 7: 更新 brainstorming SKILL.md

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-brainstorming/SKILL.md`

**描述：** 在 spec.md 的交付物要求中增加"业务用例"章节。

**改动范围：**

1. 在"交付物：spec.md"章节的模板中，在 `## Constraints` 和 `## Complexity Assessment` 之间增加：

```markdown
## 业务用例

> 初版简述（Phase 2 会在此基础上细化）。纯技术性需求可标注"无业务用例"。

### UC-1: {用例名称}
- **Actor**: {谁执行}
- **场景**: {什么情况下}
- **预期结果**: {成功后的状态}
```

2. 在六要素检查（Six-Element Completeness）表格中增加一行：

| Element | What to check | If missing |
|---------|--------------|------------|
| **Business use cases** | Is there a "业务用例" section with at least one UC? | Add from FR descriptions or mark [AMBIGUOUS] |

- [ ] Step 1: 在 spec.md 模板中增加"业务用例"章节模板
- [ ] Step 2: 在六要素检查表格中增加 Business use cases 行
- [ ] Step 3: 验证 YAML frontmatter 未被改动

### Task 8: 更新 writing-plans SKILL.md

**Type:** backend

**Files:**
- Modify: `skills/xyz-harness-writing-plans/SKILL.md`

**描述：** 在 Phase 2 plan 阶段的交付物中增加 use-cases.md 和 non-functional-design.md。

**改动范围：**

1. 在 Overview 之后增加"Phase 2 Additional Deliverables"章节，定义 use-cases.md 和 non-functional-design.md 的格式要求和模板。

2. 在 Self-Check Checklist 中增加：
   - use-cases.md 存在且 verdict: pass
   - non-functional-design.md 存在且 verdict: pass
   - use-cases.md 中所有 UC 与 spec AC 有覆盖映射

- [ ] Step 1: 增加 use-cases.md 和 non-functional-design.md 交付物说明
- [ ] Step 2: 在 Self-Check 中增加对应的检查项
- [ ] Step 3: 验证 YAML frontmatter 未被改动

### Task 9: 更新 harness-retrospect SKILL.md

**Type:** backend

**Files:**
- Modify: `skills/harness-retrospect/SKILL.md`

**描述：** 增加 YAML frontmatter 的吸收追踪字段定义。

**改动范围：**

在 "Output Format" 章节中，更新 YAML 模板为：
```yaml
---
phase: spec
verdict: pass
absorbed: false
topic: "{topic_directory_name}"
harness_issues: []
---
```

增加字段说明表格（absorbed, absorbed_date, absorption_summary, topic, harness_issues）。在 Rules 之前增加"吸收工作流"章节。

- [ ] Step 1: 更新 YAML 模板增加吸收追踪字段
- [ ] Step 2: 增加字段说明表格和吸收工作流章节
- [ ] Step 3: 验证 YAML frontmatter 可被解析

### Task 10: 更新 gate-check.py

**Type:** backend

**Files:**
- Modify: `extensions/coding-workflow/gate-check.py`

**描述：** 更新 Phase 2 和 Phase 3 的 gate 检查规则。

**向后兼容策略（ADR-0006）：** gate-check.py 不区分新旧 topic。新规则对旧 topic 的影响：Phase 2 旧 topic 缺少 use-cases.md/non-functional-design.md 时 gate FAIL，Phase 3 旧 topic 缺少 5 个新 review 文件时 gate FAIL。这是 ADR-0006 的预期行为——“不兼容历史 Topic 格式，所有改动只对新 topic 生效”。旧 topic 如果需要重新跑 gate，需要按新规则补齐 deliverables。

**改动范围：**

1. Phase 2 deliverables 新增 use-cases.md 和 non-functional-design.md（直接加入 PHASE_SPECS[2].deliverables 列表）
2. 新增 validate_plan_bl_review 函数（L2 plan 时检查 plan_bl_review，挂载到 Phase 2 pre_checks）
3. Phase 3 reviews 替换 code_review_v 为 5 个新 prefix（直接修改 PHASE_SPECS[3].reviews 列表）
4. 新增 validate_standards_linter 函数（检查 standards_review 的 linter_passed，挂载到 Phase 3 pre_checks）

- [ ] Step 1: Phase 2 deliverables 增加 use-cases.md 和 non-functional-design.md
- [ ] Step 2: 新增 validate_plan_bl_review 函数并挂载到 Phase 2 pre_checks
- [ ] Step 3: Phase 3 reviews 替换为 5 个新 prefix
- [ ] Step 4: 新增 validate_standards_linter 函数并挂载到 Phase 3 pre_checks
- [ ] Step 5: 运行 gate 测试验证旧 topic Phase 1 不受影响：`python3 extensions/coding-workflow/gate-check.py .xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement 1`
- [ ] Step 6: 测试 Phase 2 gate（预期 FAIL，因为新 deliverables 不存在）：`python3 extensions/coding-workflow/gate-check.py .xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement 2`

### Task 11: 更新 phase-dev SKILL.md

**Type:** backend

**Depends on:** Task 1, 2, 3, 4

**Files:**
- Modify: `skills/xyz-harness-phase-dev/SKILL.md`

**描述：** 将 Step 4（Code Review）从单步 code_review 改为 5 步专项审查编排。

**改动范围：**

替换 Step 4 的 code_review dispatch 逻辑为 Batch 1（4 并行: BLR + taste + robustness + standards）+ Batch 2（1 串行: integration，依赖 BLR 产出）。更新 self-check 中的 review 文件列表。

- [ ] Step 1: 替换 Step 4 的 code_review 逻辑为 5 步审查编排
- [ ] Step 2: 更新 self-check 中的 review 文件列表
- [ ] Step 3: 验证 YAML frontmatter 未被改动

---

## Execution Groups

#### BG1: 新建 Reviewer Skills

**Description:** 4 个新建的 reviewer skill，相互独立，可并行创建。

**Tasks:** Task 1, Task 2, Task 3, Task 4

**Files (预估):** 4 个文件（4 create）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | taskComplexity: high |
| 注入上下文 | spec.md FR-3/4/5/6 + expert-reviewer skill 格式参考 |
| 读取文件 | spec.md, skills/xyz-harness-expert-reviewer/SKILL.md |
| 修改/创建文件 | 4 个 SKILL.md |

**Dependencies:** 无

#### BG2: Retrospect Collector

**Description:** Retrospect 收集器 skill + collect.py 脚本 + symlink。

**Tasks:** Task 5, Task 6

**Files (预估):** 3 个文件（2 create + 1 symlink）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | taskComplexity: high |
| 注入上下文 | spec.md FR-8 + FR-7 的 YAML 字段定义 |
| 读取文件 | spec.md, skills/harness-retrospect/SKILL.md |
| 修改/创建文件 | SKILL.md, collect.py, symlink |

**Dependencies:** 无

#### BG3: Gate-check.py

**Description:** gate-check.py Phase 2/3 检查规则更新。

**Tasks:** Task 10

**Files (预估):** 1 个文件（1 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | taskComplexity: high |
| 注入上下文 | spec.md FR-13 + AC-11 + 现有 gate-check.py 结构 |
| 读取文件 | spec.md, extensions/coding-workflow/gate-check.py |
| 修改/创建文件 | extensions/coding-workflow/gate-check.py |

**Dependencies:** 无

#### BG4: Retrospect Skill Update

**Description:** harness-retrospect SKILL.md 的 YAML 格式增强。

**Tasks:** Task 9

**Files (预估):** 1 个文件（1 modify）

**Dependencies:** 无

#### BG5: Phase 1/2 Skill Updates

**Description:** brainstorming 和 writing-plans skill 的交付物扩展。

**Tasks:** Task 7, Task 8

**Files (预估):** 2 个文件（2 modify）

**Dependencies:** 无

#### BG6: Phase-dev Skill Update

**Description:** phase-dev SKILL.md 的审查编排重构（依赖 BG1 完成）。

**Tasks:** Task 11

**Files (预估):** 1 个文件（1 modify）

**Dependencies:** BG1

---

## Dependency Graph & Wave Schedule

| Wave | Groups | 说明 |
|------|--------|------|
| Wave 1 | BG1, BG2, BG3, BG4, BG5 | 全部并行，无互相依赖 |
| Wave 2 | BG6 | 依赖 BG1 完成 |

**并行约束:** Wave 1 有 5 个 Group，Semaphore 限制最多 3 个 subagent 并行。分两批：
- Batch 1: BG1, BG2, BG3（3 并行）
- Batch 2: BG4, BG5（2 并行）
- Wave 2: BG6（依赖 BG1 完成）
