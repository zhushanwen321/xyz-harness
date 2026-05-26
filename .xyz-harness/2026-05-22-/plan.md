---
verdict: pass
---

# Harness V5 跨项目复盘优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use xyz-harness-subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 46 份复盘的 16 项发现，优化 harness 的 gate 脚本、扩展代码和 skill 文档，消除遗漏型缺陷的最高频摩擦点。

**Architecture:** 按修改面分 4 个 Execution Group。BG1（gate-check.py）统一 frontmatter 解析、gate 深度、topic 隔离和竞态修复。BG2（扩展代码）增加 review 前置检查和 retrospect 流程验证。BG3（5 个 Phase Skill）增加自检清单和指标传递规则。BG4（3 个 Reference Skill）增加 LOW 收紧、增量审查和 TDD 上下文规则。

**Tech Stack:** Python 3 + PyYAML (gate-check.py), TypeScript + js-yaml (扩展代码), Markdown (skill 文档)

**Complexity:** L1 — 所有维度均为简单（扩展现有模式、无新领域建模、无跨服务协调）

---

## Spec Metrics Traceability

| Spec 指标 | 采纳状态 | 对应 Task |
|-----------|---------|----------|
| AC-1 Frontmatter 兼容性 | adopted | Task 1 (FR-1) |
| AC-2 评审不可跳过 | adopted | Task 2 (FR-2) |
| AC-3 自检清单存在 | adopted | Task 3 (FR-3) |
| AC-4 Gate 深度统一 | adopted | Task 1 (FR-4) |
| AC-5 指标传递 | adopted | Task 3 (FR-5) |
| AC-6 验收标准 | adopted | Task 3 (FR-6) |
| AC-7 验证方式标注 | adopted | Task 1 (FR-7) |
| AC-8 跨 topic 隔离 | adopted | Task 1 (FR-8) |
| AC-9 竞态修复 | adopted | Task 1 (FR-9) |
| AC-10 LOW 收紧 | adopted | Task 4 (FR-10) |
| AC-11 增量审查 | adopted | Task 4 (FR-11) |
| AC-12 Plan 禁止实现代码 | adopted | Task 3 (FR-15) |
| AC-13 Spec 数据模型预检 | adopted | Task 3 (FR-14) |
| AC-14 Retrospect 流程验证 | adopted | Task 2 (FR-12) |

## File Structure

| File | Type | Group | Description |
|------|------|-------|-------------|
| `extensions/coding-workflow/gate-check.py` | modify | BG1 | Gate 验证脚本（FR-1, FR-4, FR-7, FR-8, FR-9） |
| `extensions/coding-workflow/index.ts` | modify | BG2 | 扩展入口（FR-2 review 前置检查） |
| `extensions/coding-workflow/lib/review-dispatcher.ts` | modify | BG2 | Review 调度（FR-1 frontmatter 模板注入, FR-12 retrospect 流程验证） |
| `skills/xyz-harness-brainstorming/SKILL.md` | modify | BG3 | Spec Skill 自检清单 (FR-3, FR-14) |
| `skills/xyz-harness-writing-plans/SKILL.md` | modify | BG3 | Plan Skill 自检清单 (FR-3, FR-5, FR-15) |
| `skills/xyz-harness-phase-dev/SKILL.md` | modify | BG3 | Dev Skill 自检清单 (FR-3) |
| `skills/xyz-harness-phase-test/SKILL.md` | modify | BG3 | Test Skill 自检清单 (FR-3, FR-5, FR-7) |
| `skills/xyz-harness-phase-pr/SKILL.md` | modify | BG3 | PR Skill 自检清单 (FR-3) |
| `skills/xyz-harness-expert-reviewer/SKILL.md` | modify | BG4 | LOW 收紧 + 增量审查 (FR-10, FR-11) |
| `skills/xyz-harness-test-driven-development/SKILL.md` | modify | BG4 | TDD 上下文传递 (FR-6, FR-16) |
| `skills/xyz-harness-subagent-driven-development/SKILL.md` | modify | BG4 | Subagent 验收标准 (FR-6) |

## Task List

| # | Task | Type | Depends on | Group |
|---|------|------|-----------|-------|
| 1 | gate-check.py 统一修改 | python | — | BG1 |
| 2 | 扩展代码 review 前置检查 + retrospect 流程 | typescript | 1 | BG2 |
| 3 | 5 个 Phase Skill 自检清单 + 规则 | markdown | — | BG3 |
| 4 | 3 个 Reference Skill 规则更新 | markdown | — | BG4 |

## Execution Groups

#### BG1: gate-check.py 统一修改

**Description:** gate-check.py 的 5 项修改高度内聚（frontmatter 解析、gate 深度、topic 隔离、dirty check、test_execution schema），全在同一个文件内，放一组。

**Tasks:** Task 1

**Files (预估):** 1 个文件（1 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | 按 taskComplexity 自动选择（medium） |
| 注入上下文 | Task 1 描述（含 5 项修改的详细说明）+ gate-check.py 当前代码 |
| 读取文件 | `extensions/coding-workflow/gate-check.py`, `.xyz-harness/2026-05-22-/spec.md` (FR-1/4/7/8/9) |
| 修改/创建文件 | `extensions/coding-workflow/gate-check.py` |

**Execution Flow (BG1 内部):** 单 Task，直接执行。

**Dependencies:** 无

#### BG2: 扩展代码 review 前置检查 + retrospect 流程

**Description:** index.ts 增加 review 前置检查（FR-2），review-dispatcher.ts 增加 frontmatter 模板注入（FR-1）和 retrospect 流程验证（FR-12）。两个文件密切关联——review 前置检查依赖 frontmatter 解析的正确性。

**Tasks:** Task 2

**Files (预估):** 2 个文件（2 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | 按 taskComplexity 自动选择（high） |
| 注入上下文 | Task 2 描述 + index.ts gate execute 函数 + review-dispatcher.ts 完整代码 + spec.md FR-1/2/12 |
| 读取文件 | `extensions/coding-workflow/index.ts`, `extensions/coding-workflow/lib/review-dispatcher.ts`, `.xyz-harness/2026-05-22-/spec.md` |
| 修改/创建文件 | `extensions/coding-workflow/index.ts`, `extensions/coding-workflow/lib/review-dispatcher.ts` |

**Execution Flow (BG2 内部):** 单 Task，直接执行。

**Dependencies:** BG1（frontmatter 扁平化必须先完成，review 前置检查才能正确解析 review 文件）

#### BG3: 5 个 Phase Skill 自检清单 + 规则

**Description:** 为 5 个 Phase Skill 增加 Self-Check Checklist 章节和相关规则（scope 覆盖声明、数据模型预检、禁止实现代码、验证方式标注、planTaskId/ac_ref 字段说明）。

**Tasks:** Task 3

**Files (预估):** 5 个文件（5 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | 按 taskComplexity 自动选择（medium） |
| 注入上下文 | Task 3 描述（含每个 skill 的具体 checklist 项和规则） + spec.md FR-3/5/6/14/15 |
| 读取文件 | 5 个 Phase Skill 的 SKILL.md + `.xyz-harness/2026-05-22-/spec.md` |
| 修改/创建文件 | 5 个 Phase Skill 的 SKILL.md |

**Execution Flow (BG3 内部):** 单 Task，逐文件修改。

**Dependencies:** 无（纯文档修改，与代码改动独立）

#### BG4: 3 个 Reference Skill 规则更新

**Description:** expert-reviewer 增加 LOW 收紧规则和增量审查模式；TDD skill 增加上下文传递规则；subagent-driven-dev 增加验收标准规则。

**Tasks:** Task 4

**Files (预估):** 3 个文件（3 modify）

**Subagent 配置:**

| 配置项 | 值 |
|--------|---|
| Agent | general-purpose |
| Model | 按 taskComplexity 自动选择（medium） |
| 注入上下文 | Task 4 描述（含具体规则文本） + spec.md FR-6/10/11/16 |
| 读取文件 | 3 个 Reference Skill 的 SKILL.md + `.xyz-harness/2026-05-22-/spec.md` |
| 修改/创建文件 | 3 个 Reference Skill 的 SKILL.md |

**Execution Flow (BG4 内部):** 单 Task，逐文件修改。

**Dependencies:** 无

## Dependency Graph & Wave Schedule

```
  BG1 (gate-check.py) ──→ BG2 (扩展代码)
  BG3 (Phase Skills) ──┘
  BG4 (Reference Skills) ─┘
```

| Wave | Groups | 说明 |
|------|--------|------|
| Wave 1 | BG1, BG3, BG4 | 三组无依赖，可并行 |
| Wave 2 | BG2 | 依赖 BG1 的 frontmatter 扁平化 |

---

## Task 1: gate-check.py 统一修改

**Type:** python

**Files:**
- Modify: `extensions/coding-workflow/gate-check.py`

**涉及的 FR:** FR-1, FR-4, FR-7, FR-8, FR-9

### 修改清单

#### M1-1: Frontmatter 扁平化（FR-1, F-01）

**目标：** 所有 review 文件统一走 `_flatten_review_fields()` 解析路径，删除 `ReviewCheck.nested` 区分。

**修改点：**

1. `ReviewCheck` dataclass：删除 `nested: bool = False` 字段
2. `PHASE_SPECS[3].reviews[0]`：删除 `nested=True`（变为 `ReviewCheck(prefix="code_review_v")`）
3. `run_phase_checks()` 的 review 检查逻辑：删除 `if rc.nested` 分支，统一使用 `_flatten_review_fields()` 解析 verdict 和 must_fix
4. `_flatten_review_fields()` 保持不变（已正确处理嵌套和扁平两种格式）

**具体代码修改：**

```python
# ReviewCheck dataclass — 删除 nested 字段
@dataclass
class ReviewCheck:
    prefix: str  # e.g. "spec_review_v"
    # nested 字段已删除：所有 review 统一走 _flatten_review_fields()

# PHASE_SPECS[3] — 删除 nested=True
3: PhaseSpec(
    ...
    reviews=[
        ReviewCheck(prefix="code_review_v"),
    ],
),

# run_phase_checks 的 review 检查 — 统一使用 _flatten_review_fields
for rc in spec.reviews:
    review_path = find_latest_review(topic_dir, rc.prefix)
    if not review_path:
        checks.append((f"{rc.prefix}*", FAIL, f"no {rc.prefix}*.md found"))
    else:
        data, err = parse_yaml_frontmatter(review_path)
        if err:
            checks.append((rc.prefix, FAIL, err))
        else:
            review_name = os.path.basename(review_path).replace(".md", "")
            verdict, must_fix = _flatten_review_fields(data)
            # Check verdict
            if verdict is None:
                checks.append((f"{review_name} verdict", FAIL, "'verdict' field missing (checked top-level and review.verdict)"))
            elif not isinstance(verdict, str) or verdict != "pass":
                checks.append((f"{review_name} verdict", FAIL, f"'verdict'={repr(verdict)}, expected 'pass'"))
            else:
                checks.append((f"{review_name} verdict", PASS, f"'verdict'={repr(verdict)}"))
            # Check must_fix
            if must_fix is None:
                checks.append((f"{review_name} must_fix", FAIL, "'must_fix' field missing (checked top-level and statistics.must_fix)"))
            elif not isinstance(must_fix, int) or must_fix != 0:
                checks.append((f"{review_name} must_fix", FAIL, f"'must_fix'={must_fix}, expected 0"))
            else:
                checks.append((f"{review_name} must_fix", PASS, f"'must_fix'={must_fix}"))
```

#### M1-2: Gate 深度统一（FR-4, F-04）

**目标：** Phase 2 的 plan gate 增加与 Phase 1 相同的 review 检查深度（must_fix==0）。Phase 4/5 无 review，保持不变。

**修改点：** 无需修改——M1-1 统一了 review 解析路径后，Phase 2 的 `ReviewCheck(prefix="plan_review_v")` 已自动使用 `_flatten_review_fields()` 检查 verdict 和 must_fix，与 Phase 1 完全一致。

#### M1-3: 跨 topic 隔离（FR-8, F-08）

**目标：** `find_latest_review()` 和所有文件搜索限定在 `topic_dir` 内。

**修改点：**

1. `find_latest_review()` 已接收 `topic_dir` 参数，搜索路径是 `os.path.join(topic_dir, "changes", "reviews", ...)`——已经限定在 topic_dir 内。
2. 检查 `main()` 函数：`topic_dir = sys.argv[1]` 直接传给 `run_phase_checks()`，所有路径拼接都基于 `topic_dir`。
3. `validate_test_cases_template()` 和 `validate_test_execution()` 也使用 `os.path.join(topic_dir, ...)` 限定路径。

**结论：** gate-check.py 已经天然限定在 topic_dir 内搜索，不存在跨 topic 污染问题。F-08 的问题可能出在 TS 侧或旧版本。**验证即可，无需修改。**

#### M1-4: 删除 dirty check（FR-9, F-09）

**目标：** gate-check.py 不包含 dirty check 逻辑（检查工作区是否干净）。

**修改点：** 扫描 gate-check.py 全文，确认没有 `pre_checks` 中包含 dirty check。当前代码中 `PHASE_SPECS` 的 `pre_checks` 全部为空列表 `[]`，不存在 dirty check。

**结论：** F-09 描述的问题可能已在旧版本修复，或出现在其他位置。**验证即可，无需修改。**

#### M1-5: test_execution.json 验证方式统计（FR-7, F-07）

**目标：** `validate_test_execution()` 统计每个 test case 的 `verification_method` 字段（automated/code_review/manual），输出占比。

**修改点：**

在 `validate_test_execution()` 的第 6 步（final round all passed）之后增加：

```python
# 7. Verification method statistics (optional, informational only)
method_counts = {"automated": 0, "code_review": 0, "manual": 0, "unspecified": 0}
for rec in records:
    method = rec.get("verification_method", "unspecified")
    if method in method_counts:
        method_counts[method] += 1
    else:
        method_counts["unspecified"] += 1

total = len(records)
method_summary = ", ".join(
    f"{k}: {v} ({v*100//total}%)" for k, v in method_counts.items() if v > 0
)
checks.append(("verification methods", PASS, f"{total} records: {method_summary}"))
```

同时更新 `validate_test_cases_template()` 在每个 case 的必要字段检查中增加 `verification_method` 为可选字段说明（不强制）。

- [ ] **Step 1: 修改 ReviewCheck dataclass** — 删除 `nested` 字段
- [ ] **Step 2: 修改 PHASE_SPECS[3]** — 删除 `nested=True`
- [ ] **Step 3: 修改 run_phase_checks()** — 统一使用 `_flatten_review_fields()`，删除 `if rc.nested` 分支
- [ ] **Step 4: 增加 verification_method 统计** — 在 `validate_test_execution()` 末尾增加
- [ ] **Step 5: 验证跨 topic 隔离** — 确认 `find_latest_review()` 已限定搜索范围
- [ ] **Step 6: 验证 dirty check** — 确认不存在 dirty check 逻辑
- [ ] **Step 7: 运行 `python3 extensions/coding-workflow/gate-check.py .xyz-harness/2026-05-22- 1 --json`** — 确认不引入回归

---

## Task 2: 扩展代码 review 前置检查 + retrospect 流程

**Type:** typescript

**Files:**
- Modify: `extensions/coding-workflow/index.ts`
- Modify: `extensions/coding-workflow/lib/review-dispatcher.ts`

**涉及的 FR:** FR-1 (frontmatter 模板注入), FR-2 (review 前置检查), FR-12 (retrospect 流程验证)

### 修改清单

#### M2-1: Review 前置检查（FR-2, F-02）

**目标：** Phase 3+ gate 检查所有前置 phase 的 review 文件存在且 verdict=="pass"。Phase 5 额外检查 Phase 3/4 的 review。

**修改位置：** `index.ts` 的 `coding-workflow-gate` execute 函数，在 "Verify ALL prior phases have passed" 循环之后、mutex 检查之前插入。

**具体逻辑：**

```typescript
// Verify ALL prior phases have review files (Phase 3+ only)
if (state.currentPhase >= 3) {
    const missingReviews: string[] = [];
    for (let p = 1; p < state.currentPhase; p++) {
        const prevConfig = PHASES[p - 1]!;
        if (prevConfig.reviewPrefix) {
            // Check if any review file exists for this phase
            const reviewsDir = path.join(state.topicDir, "changes", "reviews");
            if (fs.existsSync(reviewsDir)) {
                const files = fs.readdirSync(reviewsDir);
                const hasReview = files.some(f =>
                    f.startsWith(prevConfig.reviewPrefix + "_v") && f.endsWith(".md")
                );
                if (!hasReview) {
                    missingReviews.push(`Phase ${p} (${prevConfig.name}): no ${prevConfig.reviewPrefix}_v*.md found`);
                }
            } else {
                missingReviews.push(`Phase ${p} (${prevConfig.name}): reviews/ directory not found`);
            }
        }
    }
    if (missingReviews.length > 0) {
        return {
            content: [{
                type: "text",
                text: `BLOCKED: Reviews are mandatory and cannot be skipped.\n\nMissing reviews:\n${missingReviews.map(m => `  - ${m}`).join("\n")}\n\nAll prior phases must have review files before proceeding.`,
            }],
            isError: true,
        };
    }
}
```

#### M2-2: Frontmatter 模板注入（FR-1, F-01 源头防护）

**目标：** `buildReviewTaskPrompt()` 的 task prompt 已经包含"YAML frontmatter 必须包含（在顶层，不能嵌套）"的提示。确认该提示已足够明确。

**验证：** 当前代码（review-dispatcher.ts 第 67-68 行）已经写入：
```
`4. YAML frontmatter 必须包含（在顶层，不能嵌套）:`,
`   - verdict: "pass" 或 "fail"`,
```

**结论：** 源头防护已存在。结合 M1-1 的 gate 侧自动兼容，双重保障。**无需额外修改。**

#### M2-3: Retrospect 流程验证（FR-12, F-12）

**目标：** 确认 `buildRetrospectFollowUp()` 只在 gate PASS + review PASS 后被调用。

**验证：** 读 index.ts 的 execute 函数流程：
1. gate-check.py 运行 → 失败则 return FAIL
2. review subagent dispatch → 失败则 return FAIL
3. parseReviewVerdict → mustFix > 0 则 return FAIL（不发 followUp）
4. 只有 mustFix == 0 时才调用 `buildRetrospectFollowUp()` 并 `sendUserMessage`

**结论：** retrospect 只在 gate PASS + review PASS 后触发，逻辑正确。**无需修改。** 但需要在 skill 文档中记录此行为（Task 3 的 BG3 部分处理）。

- [ ] **Step 1: 在 index.ts 增加 review 前置检查** — 在 "Verify ALL prior phases" 之后插入
- [ ] **Step 2: 验证 buildReviewTaskPrompt 的 frontmatter 提示** — 确认已有"在顶层，不能嵌套"
- [ ] **Step 3: 验证 retrospect 触发时机** — 确认只在 review pass 后调用
- [ ] **Step 4: 编译检查** — `cd extensions/coding-workflow && npx tsc --noEmit`

---

## Task 3: 5 个 Phase Skill 自检清单 + 规则

**Type:** markdown

**Files:**
- Modify: `skills/xyz-harness-brainstorming/SKILL.md`
- Modify: `skills/xyz-harness-writing-plans/SKILL.md`
- Modify: `skills/xyz-harness-phase-dev/SKILL.md`
- Modify: `skills/xyz-harness-phase-test/SKILL.md`
- Modify: `skills/xyz-harness-phase-pr/SKILL.md`

**涉及的 FR:** FR-3 (自检清单), FR-5 (指标传递), FR-6 (验收标准, 部分), FR-14 (数据模型预检), FR-15 (禁止实现代码)

### 修改清单

#### M3-1: Spec Skill 自检清单 + 数据模型预检

**文件:** `skills/xyz-harness-brainstorming/SKILL.md`

**在 Self-Check 章节之前增加 `<Self-Check Checklist>` 章节：**

```markdown
## Self-Check Checklist

在完成 spec 编写后、dispatch review 前，逐项检查：

### 生命周期维度
- [ ] 对每个核心实体（系统、组件、数据流），走一遍：创建→运行→销毁 链路
- [ ] 每个链路节点回答："如果这一步失败了怎么办？"
- [ ] 是否存在"只有成功路径，没有失败场景"的 FR？

### 枚举值覆盖
- [ ] 每个 FR 中出现的枚举值/可选值，是否都有对应的 AC 断言覆盖？
- [ ] 是否存在 FR 提到"N 种类型"但 AC 只验证了其中几种？

### 数据模型预检（FR 涉及 DB/API 时）
- [ ] FR 引用的 DB 字段或 API 响应体——是否 grep 了真实代码确认字段存在和类型？
- [ ] 是否有凭记忆而非实证写出的字段名或数值？
```

#### M3-2: Plan Skill 自检清单 + 指标传递 + 禁止实现代码

**文件:** `skills/xyz-harness-writing-plans/SKILL.md`

**增加章节：**

1. `<Self-Check Checklist>` 章节：

```markdown
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
```

2. `## Spec Metrics Traceability` 章节说明（在 Plan Document Header 之前增加强制章节模板）：

```markdown
## Spec Metrics Traceability (强制章节)

每个 plan 必须包含以下章节，显式追踪 spec 指标的采纳状态：

| Spec 指标 | 采纳状态 | 对应 Task |
|-----------|---------|----------|
| AC-1 xxx | adopted | Task 1 |
| AC-2 xxx | postponed | — (reason) |

采纳状态：`adopted`（纳入本次 plan）/ `rejected`（不需要且说明原因）/ `postponed`（后续迭代）
```

#### M3-3: Dev Skill 自检清单

**文件:** `skills/xyz-harness-phase-dev/SKILL.md`

```markdown
## Self-Check Checklist

### MUST FIX 修复后
- [ ] 修复 MUST FIX 时，是否检查了同路径/同文件中其他相关调用点？
- [ ] 修复是否可能引入回归？（特别是缩进修复、条件分支修改）
- [ ] 缩进修复应使用 whitespace-fixer skill，不手动编辑

### 迁移类工作
- [ ] 迁移前是否列出了所有被迁移的调用点/引用？
- [ ] 每个调用点是否逐个标注了覆盖状态？
- [ ] 是否存在"改了 A 忘了 B"的对称性遗漏？

### Task 验收标准
- [ ] 每个 subagent task prompt 是否包含量化验收标准？
  - 输出文件路径
  - 约束条件（如"函数不超过 N 行"）
  - 成功指标（如"测试通过"）
```

#### M3-4: Test Skill 自检清单 + 验证方式 + planTaskId

**文件:** `skills/xyz-harness-phase-test/SKILL.md`

```markdown
## Self-Check Checklist

### FR→TC 覆盖矩阵
- [ ] 每条 FR 至少有一个 TC 覆盖？
- [ ] TC 标题是否明确关联了对应的 FR/AC？

### 验证方式标注
- [ ] 每个 TC 是否标注了 `verification_method`？（automated/code_review/manual）
- [ ] 代码审查替代的测试是否被如实标注为 `code_review`？

### 指标传递
- [ ] test_cases_template.json 中每个 TC 是否有 `planTaskId`（关联 plan task）？
- [ ] test_cases_template.json 中每个 TC 是否有 `ac_ref`（关联 spec AC）？
```

同时在 test_cases_template.json 的字段说明中增加：

```json
{
  "test_cases": [
    {
      "id": "TC-1-01",
      "type": "api",
      "title": "...",
      "planTaskId": "Task 1",
      "ac_ref": "AC-1",
      "verification_method": "automated",
      "steps": [...]
    }
  ]
}
```

#### M3-5: PR Skill 自检清单

**文件:** `skills/xyz-harness-phase-pr/SKILL.md`

```markdown
## Self-Check Checklist

### 前置检查
- [ ] Phase 3 (Dev) 的 code_review 文件是否存在且 verdict==pass？
- [ ] Phase 4 (Test) 的测试执行记录是否存在且全部 passed？
- [ ] 所有 review 的 MUST_FIX 是否已修复？

### Lint 检查
- [ ] lint 检查是否在 Dev Phase 已完成？（不应在 PR Phase 首次发现 lint 问题）
- [ ] 如 PR Phase 发现新 lint 问题：回到 Dev Phase 修复

### PR 安全
- [ ] PR 描述是否引用了 spec 和 plan？
- [ ] 是否只 merge 代码，不执行其他不可逆操作？
```

- [ ] **Step 1: 修改 Spec Skill** — 增加 Self-Check Checklist + 数据模型预检
- [ ] **Step 2: 修改 Plan Skill** — 增加 Self-Check Checklist + Spec Metrics Traceability + 禁止实现代码
- [ ] **Step 3: 修改 Dev Skill** — 增加 Self-Check Checklist + 影响半径 + 验收标准
- [ ] **Step 4: 修改 Test Skill** — 增加 Self-Check Checklist + 验证方式 + planTaskId/ac_ref
- [ ] **Step 5: 修改 PR Skill** — 增加 Self-Check Checklist
- [ ] **Step 6: grep 验证** — 确认 5 个文件都包含 `Self-Check Checklist` 章节

---

## Task 4: 3 个 Reference Skill 规则更新

**Type:** markdown

**Files:**
- Modify: `skills/xyz-harness-expert-reviewer/SKILL.md`
- Modify: `skills/xyz-harness-test-driven-development/SKILL.md`
- Modify: `skills/xyz-harness-subagent-driven-development/SKILL.md`

**涉及的 FR:** FR-6 (验收标准), FR-10 (LOW 收紧), FR-11 (增量审查), FR-16 (TDD 上下文)

### 修改清单

#### M4-1: Expert-reviewer LOW 收紧（FR-10）

**文件:** `skills/xyz-harness-expert-reviewer/SKILL.md`

在分级规则章节增加：

```markdown
### LOW 分级收紧规则

**只有与本次需求完全无关的预存问题才可标 LOW。**

以下情况必须标 MUST_FIX（不是 LOW）：
- 需求核心目标涉及的问题，即使该问题是预存的
  - 例：需求是"消除 X 性能问题"，评审发现 X 仍然存在 → MUST_FIX
  - 例：需求是"统一错误处理"，评审发现某路径缺少错误处理 → MUST_FIX
- 影响当前需求正确性的任何问题
- 用户在 spec/plan 中明确关注的维度

只有以下情况可以标 LOW：
- 与本次需求完全无关的预存代码质量问题
- 建议性的改进（不修复不影响当前需求交付）
```

#### M4-2: Expert-reviewer 增量审查模式（FR-11）

**文件:** `skills/xyz-harness-expert-reviewer/SKILL.md`

增加章节：

```markdown
## 增量审查模式

当审查文件名包含 `_v2.md` 及以上版本号时，自动启用增量审查模式：

1. **读取前一版本**：找到 `_v{N-1}.md` 文件，提取 MUST_FIX 列表
2. **验证修复**：逐条检查 MUST_FIX 是否已修复
3. **检查回归**：修复是否引入新问题
4. **不重做全量扫描**：跳过 LOW/INFO 的重新评估，只关注 MUST_FIX 修复和新引入的问题

增量审查的产出格式与全量审查相同，但 Issues Found 中区分：
- `[FIXED]` 原有 MUST_FIX 已修复
- `[REGRESSION]` 修复引入的新问题
- `[NEW]` 新发现的 MUST_FIX
```

#### M4-3: TDD Skill 上下文传递（FR-16）

**文件:** `skills/xyz-harness-test-driven-development/SKILL.md`

增加规则：

```markdown
### Task Prompt 上下文传递规则

TDD subagent 的 task prompt 必须包含：
1. **spec 的关键数据模型定义**（接口、类型、枚举值）——不能只传"为 X 写测试"
2. **被测函数的签名和预期行为**——不能让 subagent 猜测接口
3. **测试文件路径**——明确输出位置

违反示例（不要这样做）：
> "为 TransportExecutor 写 TDD 测试"

正确示例：
> "为 `src/transport/executor.ts` 的 `TransportExecutor` 类写 TDD 测试。
> 该类接收 `config: TransportConfig`（字段：retryCount: number, timeout: number），
> 暴露 `execute(request: TransportRequest): Promise<TransportResponse>` 方法。
> 测试文件：`tests/transport/executor.test.ts`"
```

#### M4-4: Subagent-driven-dev 验收标准（FR-6）

**文件:** `skills/xyz-harness-subagent-driven-development/SKILL.md`

增加规则：

```markdown
### Task Prompt 验收标准规则

每个 subagent task prompt 必须包含量化验收标准：

1. **输出文件路径**：具体到文件名（不只是"创建新文件"）
2. **约束条件**：行数限制、接口签名要求、禁止使用的模式
3. **成功指标**：可验证的条件（"测试通过"、"函数不超过 20 行"、"接口签名与 spec 一致"）

缺乏验收标准的 task prompt 会导致 subagent 首轮失败——产出不满足预期但 subagent 自认为已完成。
```

- [ ] **Step 1: 修改 expert-reviewer** — 增加 LOW 收紧规则 + 增量审查模式
- [ ] **Step 2: 修改 TDD skill** — 增加上下文传递规则
- [ ] **Step 3: 修改 subagent-driven-dev** — 增加验收标准规则
- [ ] **Step 4: grep 验证** — 确认包含新增规则
