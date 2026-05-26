---
verdict: pass
must_fix: 0
review:
  type: code_review
  round: 2
  timestamp: "2026-05-22T17:00:00"
  target: "跨项目复盘优化（v1→v2 增量审查）"
  summary: "增量审查完成。上一轮 1 条 MUST FIX 已修复，未引入回归。Verdict: PASS。"

statistics:
  total_issues: 3
  must_fix: 0
  must_fix_resolved: 1
  low: 2
  info: 0

issues:
  # ── FIXED (来自 Round 1) ──
  - id: 1
    severity: MUST_FIX
    location: "skills/xyz-harness-writing-plans/SKILL.md"
    title: "缺少 Spec Metrics Traceability 强制章节"
    status: fixed
    raised_in_round: 1
    resolved_in_round: 2
    fix_evidence: >
      第 160-184 行新增 `## Spec Metrics Traceability (强制章节)` 章节，
      包含 Markdown 表格模板（Spec 指标 / 采纳状态 / 对应 Task），
      定义了 adopted / rejected / postponed 三种采纳状态，
      并明确声明"缺少此章节的 plan 不应通过 gate"。

  # ── LOW (继承自 Round 1，不做重新评估) ──
  - id: 2
    severity: LOW
    location: "skills/xyz-harness-brainstorming/SKILL.md + skills/harness-retrospect/SKILL.md"
    title: "缺少 retrospect 流程行为记录（FR-12）"
    status: open
    raised_in_round: 1
    resolved_in_round: null
    note: "增量审查不重新评估 LOW 项"

  - id: 3
    severity: LOW
    location: "extensions/coding-workflow/index.ts"
    title: "review-mandatory 检查的 reviewsDir 路径硬编码为 changes/reviews"
    status: open
    raised_in_round: 1
    resolved_in_round: null
    note: "增量审查不重新评估 LOW 项"

---

# Code Review v2 — 增量审查

## 审查范围

v2 diff 涉及 11 个文件。本审查为增量模式，只关注：

1. Round 1 MUST_FIX #1 是否已修复
2. 修复是否引入回归
3. v2 新增代码是否有新的 MUST_FIX

## MUST FIX 修复验证

### #1 — Plan Skill 缺少 Spec Metrics Traceability 章节

**状态：FIXED**

`skills/xyz-harness-writing-plans/SKILL.md` 第 160-184 行新增完整章节：

- 定义了表格模板：`| Spec 指标 | 采纳状态 | 对应 Task |`
- 三种采纳状态：adopted / rejected / postponed
- 明确声明缺少此章节的 plan 不应通过 gate
- 章节位置在 Plan Document Header 之前，符合逻辑顺序（先定义追踪表，再定义文档模板）

**验证结论：** 修复完整，无遗漏。

## 回归检查

### gate-check.py 变更

1. **`ReviewCheck.nested` 字段移除**：合理。`_flatten_review_fields` 已经同时处理了 top-level 和 nested 两种格式（先查 `data.verdict`，再 fallback 到 `data.review.verdict`），因此 `nested` 标志位是冗余的。移除后统一走 `_flatten_review_fields`，逻辑更简洁。

2. **Phase 3 code_review 统一使用 `_flatten_review_fields`**：原先 Phase 3 走 `nested=True` 分支，其他 Phase 走 else 分支（`check_field_str`/`check_field_int`）。统一后所有 Phase 走同一路径。验证 `_flatten_review_fields` 的行为：
   - 先查 `data["verdict"]`（top-level）→ 若为 None，查 `data["review"]["verdict"]`（nested）
   - 先查 `data["must_fix"]`（top-level）→ 若为 None，查 `data["statistics"]["must_fix"]`（nested）
   - 这覆盖了两种 frontmatter 格式，不存在回归风险。

3. **Verification method statistics（新增）**：纯信息性，不改变 gate pass/fail 判定。`method_counts` 统计后 append 一个 PASS 类型的 check，无副作用。

### index.ts 变更

4. **review-mandatory 检查（Phase 3+ 前置校验）**：新增逻辑在 phase-start 时检查所有前序 Phase 是否有 review 文件。设计意图清晰——防止跳过 review 直接推进。实现正确：
   - 遍历 `p = 1..currentPhase-1`，检查 `PHASES[p-1].reviewPrefix`
   - 若 `reviewsDir` 不存在，视为缺失（合理——没有 reviews 目录就没有 review）
   - 错误信息明确列出缺失项

   潜在注意点：`fs.readdirSync` 是同步调用，但这是 phase-start 工具内部（非高频路径），可接受。

### Skill 文件变更（新增 Self-Check Checklist + 方法论补充）

5-11. 7 个 Skill 文件新增了 Self-Check Checklist 或方法论补充。这些是纯文档变更，不影响运行时行为，无回归风险。

## 结论

- MUST_FIX #1：已修复
- 回归：未发现
- 新增 MUST_FIX：无
- **Verdict: PASS**
