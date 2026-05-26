---
phase: plan
verdict: pass
---

# Plan Phase Retrospect

## Phase Execution Review

### Summary

Phase 2 完成了 4 Task / 4 Execution Group 的实施计划。产出 `plan.md`（20KB）、`e2e-test-plan.md`（8 个测试场景）、`test_cases_template.json`（16 个 TC）。

关键决策：
- **复杂度评估为 L1**，不需要前端/后端拆分子文档。事后证明判断正确——实际修改都是 gate-check.py（Python）和 Skill 文档（Markdown），无前后端拆分需求
- **3 个 FR 验证后无需修改**：F-08（跨 topic 隔离）、F-09（dirty check）、F-12（retrospect 流程）在代码审查后确认已正确处理。16 个 FR 中只有 13 个需要实际修改
- **BG1-BG4 重新分组**：与 spec 的 B1-B5 略有不同，按执行依赖关系重组（BG2 依赖 BG1 的 frontmatter 扁平化结果）

### Problems Encountered

1. **评审 frontmatter 再次嵌套**：plan_review_v1.md 的顶层 `verdict`/`must_fix` 正确，但同时存在 `review.verdict` 和 `statistics.must_fix` 嵌套。这是 F-01 的第三次出现（Phase 1 spec_review_v2、Phase 1 plan_review_v1... 本质上每次 review subagent 都会产出嵌套格式）。这验证了 BG1 统一解析的必要性。

2. **M1-3/M1-4 占用了 plan 篇幅但无实际产出**：F-08 和 F-09 的验证步骤只产出了"已确认无需修改"的结论。这些步骤在 plan 中占约 800 字，但不产生任何代码变更。

3. **Plan.md 20KB 偏长**：对纯文档修改类任务，plan 中的代码示例和步骤描述过于详细。Phase 3 实际执行时，subagent 更多依赖 task prompt 中的代码片段而非 plan.md 中的伪代码。

### What Would You Do Differently

- **F-08/F-09 应在 spec 阶段就验证完毕**，而不是在 plan 中分配验证步骤。Spec 中标注"待验证"→ Plan 中验证→ Dev 中确认，三个 phase 重复确认同一件事
- **Plan 中的代码示例应更精简**：每个修改点只需说明"改什么"和"改成什么"，不需要写出完整的替换代码（完整代码放在 Phase 3 的 task prompt 中更合适）
- **BG 分组应在 spec 阶段就确定**，而不是在 plan 阶段重新组织。B1-B5 到 BG1-BG4 的映射关系在 plan 中没有显式说明，增加了理解成本

### Key Risks

- **BG2（index.ts）中风险已验证可控**：Phase 3 实际新增 35 行，无编译错误，逻辑正确
- **Task 3 修改 5 个 skill 文件**：Phase 3 subagent 批量追加成功，pre-commit hook 验证了 YAML frontmatter 完整性
- **最大的实际风险未被 plan 覆盖**：Phase 3 code review v1 发现 Plan Skill 缺少 `## Spec Metrics Traceability` 强制章节。这个 MUST FIX 来源于 spec FR-5 的"Plan Skill 增加 Scope 覆盖声明"被 plan 解读为"在 Self-Check Checklist 中增加检查项"，而非"增加独立强制章节"

## Harness Usability Review

### Flow Friction

- **Execution Groups 模板有效但增加编写时间**：BG1-BG4 的分组逻辑需要在 plan 中显式描述 Wave 调度策略（Wave 1: BG1+BG3+BG4 并行，Wave 2: BG2 串行），这个信息对 Phase 3 的 subagent 调度至关重要
- **Spec Metrics Traceability 追踪表**在 plan 中手动维护——13/16 adopted + 3/3 verified-only 的追踪对齐帮助有限，因为数值直接来自 spec

### Gate Quality

- Gate 正确解析了 plan_review_v1.md 的混合格式 frontmatter（顶层 + 嵌套并存），`_flatten_review_fields()` 的优先级逻辑工作正常
- Phase 2 gate 的 5 项检查（plan.md verdict + e2e-test-plan.md verdict + test_cases_template.json 格式 + plan_review verdict + plan_review must_fix）覆盖完整

### Prompt Clarity

- **Writing-plans skill 的 L1/L2 评估指导清晰**，快速判断为 L1 后省去了不必要的拆分
- **Execution Groups 模板的 BG≠B 说明缺失**：plan 中使用了 BG1-BG4 编号但未解释与 spec B1-B5 的映射关系，这增加了 review 的理解成本（plan_review 标注为 LOW 问题）

### Automation Gaps

- **"验证即可"的结论需要手动读代码**：F-08/F-09/F-12 的验证各消耗了 1 次 read + grep，如果有预检脚本可以自动确认"此 FR 是否需要实际修改"
- **Plan 文件大小无预警**：20KB 的 plan 对纯文档修改来说偏大，如果 skill 中有"plan 建议不超过 N KB"的指引会更好

### Time Sinks

- **读取 index.ts 的多段内容（~950 行）**消耗了最多 context。Phase 2 和 Phase 3 各读取了一次完整文件，未来可考虑在 plan 阶段只读关键函数签名
- **Test cases template 的 16 个 TC 编写**需要与 spec 的 14 个 AC 逐一映射，工作量不小但必要
- **Plan review 的 LOW 问题回复**：review 发现了 3 个 LOW 问题（BG≠B 未解释、verification-only 步骤未标注、model 选择不一致），虽然不影响 gate 但需要决定是否修复
