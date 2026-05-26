---
phase: spec
verdict: pass
---

# Spec Phase Retrospect

## Phase Execution Review

### Summary

Phase 1 完成了基于跨项目复盘扫描（46 份复盘、4 个项目、26+ topic）的 16 项优化 spec 编写。产出 `spec.md` 包含 16 个 FR（含 1 个合并项 FR-13）、14 个 AC，按修改面分为 B1-B5 五个批次。

关键决策：
- **方案 A**（按修改面分组而非按优先级串行），减少同一文件的反复修改。事后看这个决策完全正确——Phase 3 dev 中 BG1/BG3/BG4 并行执行，Wave 1 同时完成 3 组修改
- **不兼容旧 topic 格式**，记录为 ADR-0006。后续 5 个 phase 无任何向后兼容需求，说明决策合理
- **不区分 Auto/Manual Mode**，改动自然覆盖两种模式。gate-check.py 和 skill 文档的修改确实对两种模式都生效

### Problems Encountered

1. **Review subagent 产出嵌套 YAML frontmatter**：spec_review_v2.md 将 `verdict` 和 `must_fix` 放在 `review` 和 `statistics` 嵌套对象下。这是 F-01 要解决问题的活体实例——在写解决 F-01 的 spec 时就遇到了 F-01 的问题。手动修复后 gate 通过。讽刺的是，这个问题在后续 Phase 2 和 Phase 3 的 review 中继续出现，直到 Phase 3 dev 实际修改了 gate-check.py 才根本解决。

2. **Review 第 1 轮 2 条 MUST FIX**：
   - FR-12 未指定具体变更目标文件（"在 skill 文档中记录"过于模糊）
   - FR-13 与 FR-3 完全重复
   - 两条都是"遗漏"类问题（omission），与跨项目复盘的核心发现一致：AI 的主要弱点是遗漏而非错误

3. **Spec 高估了部分 FR 的修改量**：FR-8（跨 topic 隔离）和 FR-9（dirty check）在 Phase 3 代码验证后确认无需修改——gate-check.py 已正确处理。Spec 阶段应该先做代码验证再写入 FR，而不是基于假设写入。

### What Would You Do Differently

- **FR-12 应在初版就写明具体文件路径**（如 `skills/xyz-harness-phase-dev/SKILL.md`），不用"skill 文档"这种模糊说法。模糊的 FR 导致 review MUST FIX 是必然的
- **FR-8/FR-9 应标注为"待验证"**，而非直接列为需要修改的 FR。这会在 Phase 2 plan 中省去 2 个验证步骤
- **FR-13 不应独立列出**，在写 spec 时就合并进 FR-3。这浪费了 1 条 review MUST FIX
- **B1-B5 的分批策略应在 spec 中更明确地标注依赖关系**（B2 依赖 B1 的 frontmatter 扁平化），而不是只说"按修改面分组"

### Key Risks

- B2（index.ts 修改）是唯一的中风险批次。Phase 3 实际执行时证明风险可控——review 前置检查逻辑只增加了 35 行，且编译无新错误
- Spec 中"验证无需修改"的 FR（F-08/F-09/F-12）在 3 个 phase 中被重复验证，根因是 spec 没有区分"确认性验证"和"修改性需求"

## Harness Usability Review

### Flow Friction

- **Brainstorming 提问环节偏快但合理**：输入质量高（复盘扫描文档已列出 16 个发现和对策），3 个问题完成澄清是高效的
- **Design 分段展示有效**：B1-B5 五段设计逐一确认，比一次性展示完整设计更高效。Phase 3 的 Wave 调度完全按此分段执行
- **Approach 选择（A vs B）的决策点设计合理**：明确比较了两种方案的优劣，有记录有理由

### Gate Quality

- Gate 正确检测到 spec_review_v2.md 的嵌套 frontmatter 格式问题，验证了 GL1 的有效性
- 但这也暴露了 F-01 的严重性：review subagent 反复产出嵌套格式，Phase 1/2/3 的 review 各遇到一次
- Gate 对 spec.md 本身的检查（verdict 字段存在性）工作正常，无 false positive

### Prompt Clarity

- Brainstorming skill 的流程指引清晰：scan → 提问 → 方案探索 → 分段设计 → 写 spec → review → gate
- Spec 模板（## Requirements / ## Acceptance Criteria / ## Design）结构化程度高，AI 按模板填写的质量明显优于自由格式
- 缺少的指引：spec 中应标注哪些 FR 是"确认性"（需验证但不一定修改），哪些是"修改性"（确定需要改代码）

### Automation Gaps

- **Review subagent 的 frontmatter 格式应由 gate-check.py 自动兼容**——这正是 F-01 的优化内容，Phase 3 dev 完成后此问题消失
- **Spec 阶段的代码验证（grep 现有代码确认假设）应该有半自动化的预检步骤**，而不是全靠 AI 记忆或猜测。这导致了 FR-8/FR-9 的无效 FR

### Time Sinks

- **Review 消耗 3 次交互**：2 轮 review（第 1 轮 2 MUST FIX → 修复 → 第 2 轮通过）+ 1 次手动修复 frontmatter。如果 F-01 已修复且 FR 写得更精确，可以减少到 1 次
- **Approach 选择讨论**花了较多轮次，但这是必要的——方案选择影响后续所有 phase 的执行效率
