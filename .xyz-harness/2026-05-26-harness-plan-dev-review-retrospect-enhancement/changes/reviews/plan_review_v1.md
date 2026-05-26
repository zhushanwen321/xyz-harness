---
review:
  type: plan_review
  round: 1
  timestamp: "2026-05-26T18:44:00"
  target: ".xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md, plan.md, e2e-test-plan.md"
  verdict: fail
  summary: "计划评审完成，第1轮，1条MUST FIX，需修改后重审"

statistics:
  total_issues: 5
  must_fix: 1
  low: 2
  info: 2

issues:
  - id: 1
    severity: MUST_FIX
    location: "plan.md → Task 10 (gate-check.py)"
    title: "缺少 gate-check.py 向后兼容的具体实现策略"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: LOW
    location: "plan.md → Dependency Graph & Wave Schedule"
    title: "Wave 编排未明确 subagent 粒度（Group 级 vs Task 级）"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "e2e-test-plan.md → TS-8"
    title: "缺少有 typecheck 配置时的场景测试"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: INFO
    location: "plan.md → Spec Metrics Traceability 表格"
    title: "Spec Metrics Traceability 与 Spec Coverage Matrix 内容重复"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: INFO
    location: "e2e-test-plan.md"
    title: "缺少 AC-12 (review_metrics + retrospect 价值评估) 的测试场景"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录
- 评审时间：2026-05-26 18:44
- 评审类型：计划评审（spec.md + plan.md + e2e-test-plan.md）
- 评审对象：Harness Plan/Dev/Review/Retrospect Enhancement

---

## 1. Spec 完整性

### 1.1 目标明确性
✅ **通过。** 目标明确：解决三个结构性缺陷（Plan 缺业务用例、Dev 审查维度单一、Retrospect 缺吸收追踪），给出了一组可执行的 FR 和 AC。

### 1.2 范围合理性
✅ **通过。** 范围边界清晰。Constraints > 范围约束 列出了 6 个 P2 不做的项（不含 py-taste-check、gate-check 配置外部化、Phase 5 CI 结构化、index.ts 改动、review 文件子目录分组），有效防止范围蔓延。

### 1.3 验收标准可量化
✅ **通过。** 所有 12 个 AC 都是可验证的：
- 文件存在检查（AC-1: use-cases.md 存在 + verdict）
- YAML 字段验证（AC-7: absorbed/topic/harness_issues）
- 脚本执行（AC-8: collect.py scan/absorb/aggregate）
- 流程编排（AC-10: 5 步审查可执行）

### 1.4 [待决议] 项
✅ **无。** 所有 FR 和 AC 都没有标注 [待决议]。状态明确。

---

## 2. Plan 可行性

### 2.1 任务拆分粒度
✅ **合理。** 11 个 Task，每个可由一个 subagent 独立完成。最小 Task 是修改单个 SKILL.md（如 Task 7 更新 brainstorming SKILL.md），最大 Task 是创建含双模式的 BLR skill（Task 1）。粒度适中。

### 2.2 依赖关系
✅ **正确。**
- BG6 (Task 11) → BG1 (Task 1-4)：phase-dev 需要引用 4 个 reviewer skill ✓
- Task 6 → Task 5：collect.py 需要 SKILL.md 目录结构 ✓
- 其余 Task 无依赖，可并行 ✓

### 2.3 工作量估算
✅ **现实。** 4 个新建 SKILL.md（各 80-150 行）+ 1 个 Python 脚本（约 200-300 行）+ 5 个 SKILL.md 修改 + gate-check.py 修改 + symlink。总修改量约 800-1200 行，对应 11 个 Task，合理。

### 2.4 遗漏的 Task（Spec 逐条覆盖检查）

| Spec 元素 | 对应 Task | 状态 |
|-----------|-----------|------|
| FR-1 use-cases.md | Task 8 | ✅ |
| FR-2 non-functional-design.md | Task 8 | ✅ |
| FR-3 BLR (双模式) | Task 1 | ✅ |
| FR-4 Integration Reviewer | Task 2 | ✅ |
| FR-5 Standards Reviewer | Task 3 | ✅ |
| FR-6 Robustness Reviewer | Task 4 | ✅ |
| FR-7 Retrospect YAML 元数据 | Task 9 | ✅ |
| FR-8 Collector Skill + Script | Task 5, 6 | ✅ |
| FR-9 Phase 1 业务用例 | Task 7 | ✅ |
| FR-10 Phase 3 五步审查 | Task 11 | ✅ |
| FR-12 review_metrics 字段 | Task 1-4, 9 | ✅ |
| FR-13 Gate-check.py 更新 | Task 10 | ⚠️ 见 Issue #1 |

**结论：** 所有 FR 都有对应 Task，但 FR-13 的向后兼容要求在 plan 中缺少具体实现策略。

---

## 3. Spec 与 Plan 一致性

### 3.1 Plan 是否覆盖所有 spec 需求项
✅ 逐条对照 spec 的 AC 对应 plan 的 Task：

| AC | Plan Task | 状态 |
|----|-----------|------|
| AC-1 use-cases.md 格式 | Task 8 | ✅ |
| AC-2 non-functional-design.md 覆盖 | Task 8 | ✅ |
| AC-3 BLR 双模式 | Task 1 | ✅ |
| AC-4 Integration Reviewer | Task 2 | ✅ |
| AC-5 Standards Reviewer | Task 3 | ✅ |
| AC-6 Robustness Reviewer | Task 4 | ✅ |
| AC-7 Retrospect YAML | Task 9 | ✅ |
| AC-8 Collector 脚本 | Task 5, 6 | ✅ |
| AC-9 Phase 1 业务用例 | Task 7 | ✅ |
| AC-10 Phase 3 五步审查 | Task 11 | ✅ |
| AC-11 Gate-check 更新 | Task 10 | ⚠️ 见 Issue #1 |
| AC-12 Retrospect 审查价值 | Task 1-4, 9 | ✅ |

### 3.2 Plan 中是否有 spec 未提及的额外工作
✅ **无。** 所有 Task 都可追溯到 spec 的 FR/AC。

### 3.3 AC 是否能通过 plan 的 Task 实现
✅ 所有 12 个 AC 都能通过对应 Task 的可验证产出物（文件存在、YAML 字段正确、脚本功能可用）来满足。

---

## 4. Execution Groups 合理性

### 4.1 分组合理性
✅ **合理。**
- **BG1（4 个 reviewer skills）**：功能关联度高（都是 reviewer），结构相似，相互独立 → 分组合适
- **BG2（retrospect collector）**：skill + script + symlink，属于同一功能单元 → 分组合适
- **BG3（gate-check.py）**：单一文件修改，独立分组 → 合理
- **BG4（retrospect skill update）**：单一文件修改，独立分组 → 合理
- **BG5（Phase 1/2 skills）**：brainstorming + writing-plans，都属于 Phase 产出物扩展 → 合理
- **BG6（phase-dev）**：依赖 BG1，独立分组 → 合理

每组 Task 数 ≤ 4，文件数 ≤ 4。均未超限。

### 4.2 类型划分
✅ **正确。** 所有 Task 同为 backend（纯文档/脚本项目，无前后端分离）。

### 4.3 功能关联度
✅ 同组 Task 功能关联紧密，不同组之间边界清晰。

### 4.4 依赖关系
✅ **正确。** BG6 → BG1（phase-dev 需引用 4 个 reviewer skill），其余无依赖。

### 4.5 Wave 编排
⚠️ **见 Issue #2。** Wave 1 将 BG1/BG2/BG3 放在 Batch 1（3 并行），BG4/BG5 放在 Batch 2。但 plan 没有明确说明每个 Group 是由 1 个 subagent 整体执行还是每个 Task 1 个 subagent。如果是 Task 级 subagent，Wave 1 共 10 个 subagent，远超 semaphore 限制（最多 3 并行）。Batch 1 的 3 并行暗示 Group 级 subagent，但未明确声明，执行时有歧义风险。

### 4.6 Subagent 配置完整性
✅ **完整。** 每个 Group 都包含 Agent、Model、注入上下文、读取文件、修改/创建文件。注入上下文充分（引用 spec FR + 现有 skill 参考）。

### 4.7 文件数预估
✅ **合理。**
- BG1: 4 files ✓（≤ 10）
- BG2: 3 files ✓
- BG3: 1 file ✓
- BG4: 1 file ✓
- BG5: 2 files ✓
- BG6: 1 file ✓

---

## 5. 后端设计充分性（L1）

plan 标注 complexity: L1，按 L1 标准检查。

| 检查项 | 评估 | 说明 |
|--------|------|------|
| 后端 Task 是否说明了"为什么" | ✅ | 每个 Task 有明确目的（如 Task 1 "支撑双模式审查"） |
| 存储变更选型理由 | ✅ | 无数据库变更（纯配置文件/脚本项目） |
| API 端点设计 | ✅ | 无 API 变更 |
| 边界条件/异常处理 | ✅ | 在合适的粒度（subagent 注入信息中带 spec 的 Constraints） |
| 非功能性要求 Task 对应 | ✅ | spec Non-functional Considerations 中的向后兼容、subagent 调度、文件大小等可以在实现时由 subagent 处理 |

**结论：** L1 后端设计充分性合格。

---

## 发现的问题

### MUST FIX

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | MUST FIX | plan.md → Task 10 | **缺少 gate-check.py 向后兼容的具体实现策略。** spec AC-11 和 FR-13 Constraints 明确要求"旧 topic 目录不受新规则影响"，但 plan 的 Task 10 步骤只列出了"新增"操作（新增 validate_plan_bl_review、新增 Phase 2 deliverables、替换 Phase 3 review prefix），没有说明 gate-check.py 如何区分新旧 topic 来条件性检查新增 deliverable。Task 10 Step 5 "运行 gate 测试确保旧 topic 不受影响"只是测试步骤，不是实现步骤。如果直接按 plan 修改 gate-check.py 而不做旧 topic 兼容，所有旧 topic 的 Phase 2 gate 会因找不到 use-cases.md / non-functional-design.md 而全部 FAIL。 | 在 Task 10 中增加步骤说明实现策略：gate-check.py 的 PHASE_SPECS 中，Phase 2 的 use-cases.md 和 non-functional-design.md 作为 optional field 检查（文件存在时才验证 verdict，不存在则跳过）。或者通过 topic 创建日期/版本标记来区分新旧 topic。具体方案参照 AC-11 中"通过 phase spec 的可选字段实现"的约束。 |

### LOW

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 2 | LOW | plan.md → Dependency Graph & Wave Schedule | **Wave 编排未明确 subagent 粒度。** Wave 1 的并行约束写了"Batch 1: BG1, BG2, BG3（3 并行）"，隐含了 Group 级 subagent 的假设（每个 Group 由 1 个 subagent 整体执行）。但 plan 没有明确声明每个 Group 的执行粒度，也没有说明 BG1 内部 4 个 Task 的串行/并行方式（一个 subagent 依次创建 4 个 SKILL.md vs 4 个 subagent 各创建 1 个）。如果执行者按 Task 级 subagent 理解，Wave 1 总共 10 个 subagent 会超出 semaphore 限制。 | 在 Wave 编排中加入说明："每个 Group 由 1 个 subagent 整体执行（Group 内 Task 依次串行）。Wave 1 共 5 个 subagent，受 semaphore 限制分 2 批调度。" |
| 3 | LOW | e2e-test-plan.md → TS-8 | **缺少有 typecheck 配置时的场景测试。** TS-8 只测试了"无 lint 项目"场景（本项目 harness-engineering），但 AC-5 要求"当项目有 typecheck 配置时，YAML 含 typecheck_passed: true"。没有对应的测试场景验证 typecheck_passed 字段的正确生成。 | 增加 TS-8b：对有 typecheck 配置的项目（如使用 TypeScript 的业务项目）dispatch standards_review，验证产出含 linter_passed + typecheck_passed。 |

### INFO

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 4 | INFO | plan.md → Spec Metrics Traceability | **Spec Metrics Traceability 表格与 Spec Coverage Matrix 内容重复。** 两个表格都列出了所有 12 个 AC 及其对应 Task。Spec Coverage Matrix 已经包含了 Task 映射（含数据流），Spec Metrics Traceability 只是重复了"adopted"状态（且全部为 adopted，无信息增量）。增加了维护成本（修改 Task 对应关系时需要更新两个表格）。 | 可删除 Spec Metrics Traceability 表格（或者只在 AC 被 rejected/postponed 时才需要，此时全部 adopted 时省略）。 |
| 5 | INFO | e2e-test-plan.md | **缺少 AC-12 (review_metrics + retrospect 价值评估) 的测试场景。** AC-12 要求 retrospect 记录审查价值（从 review_metrics 汇总各 step 的问题数和耗时），但 E2E 测试计划没有对应的场景验证这一功能。虽然完整测试需要 Phase 3 执行（覆盖成本高），但可以设计一个最小验证：准备含 review_metrics 的 mock review 文件，运行 retrospect subagent，验证 dev_retrospect.md 中包含价值评估摘要。 | 在 E2E 测试计划中增加 TS-9：准备含 review_metrics 的 mock review 文件 → dispatch retrospect → 验证产出包含 review-value 记录。 |

---

## 结论

**需修改后重审。** 存在 1 条 MUST FIX（gate-check.py 向后兼容策略缺失），不修复则旧 topic 的 Phase 2 gate 会全部因新 deliverable 检查而 FAIL。2 条 LOW 建议和 2 条 INFO 记录不影响本轮通过但建议关注。

### Summary

计划评审完成，第1轮，1条MUST FIX，需修改后重审。
