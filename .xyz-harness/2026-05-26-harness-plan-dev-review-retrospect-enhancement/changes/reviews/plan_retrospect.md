---
phase: plan
verdict: pass
absorbed: false
topic: "2026-05-26-harness-plan-dev-review-retrospect-enhancement"
harness_issues:
  - "gate-check.py 的 _flatten_review_fields 不检查 review.must_fix 嵌套路径，导致 review subagent 产出嵌套 YAML 时 must_fix 字段丢失"
  - "expert-reviewer skill 的 review 输出 YAML 格式无统一规范，不同 subagent 产出不同嵌套结构（顶层 vs review.嵌套 vs statistics.嵌套）"
  - "writing-plans skill 的 L1 plan 不产出 use-cases.md/non-functional-design.md 的模板，但 gate-check.py Phase 2 会检查这两个文件——skill 文件和 gate 脚本需要同步更新"
---

# Plan Phase Retrospect

## 1. Phase Execution Review

### Summary

Phase 2 产出 11 个 Task、6 个 Execution Group、2 个 Wave 的实施计划，判定 complexity L1（无前后端分离）。同时产出 5 个业务用例（use-cases.md）、非功能性设计文档、9 个 E2E 测试场景、11 个测试用例模板。两轮审查迭代（1 MUST FIX → resolved），外加一个 gate-check.py 的 runtime bug 修复。

### Problems Encountered

**1. gate-check.py `_flatten_review_fields` 不检查 `review.must_fix`（最大意外）**

v2 审查通过后，运行 gate-check.py Phase 2 报 FAIL：`plan_review_v2 must_fix` 字段丢失。根因：review subagent 将 `must_fix: 0` 放在 `review:` 嵌套对象中（YAML 结构为 `review: { verdict: pass, must_fix: 0 }`），但 `_flatten_review_fields` 只检查顶层 `must_fix` 和 `statistics.must_fix`，不检查 `review.must_fix`。

这暴露了一个更深层的问题：review subagent 的 YAML 输出格式没有统一规范。v1 审查（spec_review_v1.md）用的是顶层字段，v2 审查（plan_review_v2.md）用的是 `review:` 嵌套。gate-check.py 的 `_flatten_review_fields` 需要覆盖更多嵌套路径。

修复方式：在 `_flatten_review_fields` 中增加 `review.must_fix` 的检查路径。这个修复是本次 plan 的 Task 10 的一部分（gate-check.py 更新），但也修复了一个已有的 bug。

**2. 向后兼容策略未在 Task 10 中显式声明**

v1 审查者指出 Task 10 未说明 gate-check.py 如何区分新旧 topic。ADR-0006 明确"不兼容历史 Topic 格式"，所以策略是：新规则无条件生效，旧 topic 如需重新跑 gate 需补齐新 deliverables。但 plan 首稿中 Task 10 没有写出这个决策，审查者无法判断是"遗漏"还是"有意设计"。

**3. E2E 测试缺少 typecheck 场景**

AC-5 要求 standards_review 支持可选的 `typecheck_passed` 字段，但 E2E 测试只有"无 lint 项目"场景（TS-8），缺少"有 lint + typecheck"的正面测试。补了 TS-9。

### What Would You Do Differently

1. **Task 10 应先写向后兼容策略再写改动内容**：这次是先写了改动列表，审查者追问后才补充。应该在 Task 描述中先声明策略（ADR-0006），再列出改动。
2. **Gate-check.py 修改应包含 _flatten_review_fields 的增强**：这次是在 gate 运行时意外发现的。应该在 plan 中就把"增强 must_fix 字段查找路径"列为一个改动点。
3. **E2E 测试设计时应逐条过 AC**：AC-5 有 4 个子句（linter_passed、typecheck_passed、可选省略、对比结果），但 E2E 只覆盖了其中 2 个。

### Key Risks for Later Phases

1. **Phase 3 实施时 reviewer skill 的 YAML 输出格式必须统一**：4 个 reviewer skill 都需要包含 `verdict`、`must_fix`、`review_metrics`，且 gate-check.py 需要能正确解析。如果 subagent 将字段放在不同嵌套层级，gate 会再次失败。
2. **Plan 中 `_flatten_review_fields` 的修复是 pre-existing bug fix**：这个改动在 Task 10 的 scope 内，但需要在 Phase 3 dev 中确保不会被遗漏。
3. **v2 审查者提出 spec AC-11 与 ADR-0006 措辞矛盾**：spec 写"旧 topic 不受新规则影响"，ADR-0006 说"不兼容历史 Topic"。plan 选择了 ADR 路线（无条件生效），但 spec 还没修正。Phase 3 之前最好修一下 spec 措辞。

## 2. Harness Usability Review

### Flow Friction

**writing-plans skill 对 L1 plan 的 use-cases.md/non-functional-design.md 缺少模板。** 这两个文件是本次 spec 新增的 Phase 2 deliverables，但 writing-plans skill 还没有更新（那是 Task 8 的工作）。在本次 plan 执行中，主 agent 需要参考 spec 的 FR-1/FR-2 来推断这两个文件的格式，而不是从 skill 中获取现成模板。这验证了 spec_review_v2 的 LOW #7（Phase skill 文件更新未在 spec 中显式声明）。

**Execution Groups 的 Wave 编排与 Semaphore 限制的交互不够清晰。** writing-plans skill 说"同一 Wave 内最多 3 个 subagent 并行"，但本次 Wave 1 有 5 个 Group，需要拆成 Batch 1 (3) + Batch 2 (2)。这个拆分逻辑在 plan 中需要手动推导，没有 skill 指导。

### Gate Quality

**Gate 脚本本身的可靠性问题：** `_flatten_review_fields` 的嵌套路径覆盖不完整导致了 gate FAIL。这是一个 gate-check.py 的 bug（不检查 `review.must_fix`），不是 plan 的问题。Gate 脚本应该对所有已知的 review YAML 格式做兼容。

**审查质量较高：** v1 审查者准确指出了向后兼容策略缺失（MUST FIX #1），这个问题如果不在 plan 阶段解决，Phase 3 实施时会导致 gate-check.py 对旧 topic 的行为未定义。v2 审查者也发现了 spec 措辞矛盾（NEW LOW #6）。

### Prompt Clarity

writing-plans skill 的指导足够清晰：File Structure → Interface Contracts → Spec Coverage Matrix → Task List → Execution Groups → Wave Schedule 的流程定义明确。L1 plan 不需要 interface_chain.json 的判断也清晰。

### Automation Gaps

**Review YAML 格式校验没有自动化。** review subagent 产出的 YAML frontmatter 格式不一致（顶层 vs 嵌套），gate-check.py 需要尝试多个路径才能找到字段。如果有一个 review YAML 格式规范（linter 或 schema），可以在 subagent 产出时就统一格式。

### Time Sinks

1. **gate-check.py 的 _flatten_review_fields bug 调试**：gate PASS 之前意外遇到 FAIL，需要诊断是 YAML 格式问题还是 gate-check.py 逻辑问题。消耗了 1 轮 read + edit + re-run。
2. **E2E 测试的 AC 覆盖完整性检查**：缺少 typecheck 场景是 v1 审查者指出的。如果写 E2E 时逐条过 AC 的每个子句，可以避免这个遗漏。
