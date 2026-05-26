---
phase: pr
verdict: pass
---

# Overall Retrospect — Phase 1-5

## Phase Execution Review

### Summary

本次 harness 运行完成了跨项目复盘扫描优化（46 份复盘、4 个项目、26+ topic → 16 项发现），历经 5 个 phase，修改 12 个文件（2 代码 + 8 Skill 文档 + 2 文档），+534/-22 行，最终产出 PR #3（未 merge，按 skill 指令止步于创建 PR）。

**各 Phase 执行概要：**

| Phase | 产出 | Review 轮次 | 关键事件 |
|-------|------|------------|---------|
| 1 spec | spec.md（16 FR、14 AC）+ ADR-0006 | 2 轮（v1: 2 MUST FIX → v2: pass） | F-01 活体实例：写解决 F-01 的 spec 时遭遇 F-01 |
| 2 plan | plan.md + e2e-test-plan.md + test_cases_template.json | 1 轮（pass, 0 MUST FIX） | F-08/F-09/F-12 验证确认无需修改；3 个 LOW |
| 3 dev | 10 文件修改 + code_review_v2 | 2 轮（v1: 1 MUST FIX → v2: pass） | Wave 并行调度；Plan Skill 缺少强制章节 |
| 4 test | test_execution.json（16/16 passed, round 1） | — | 零返工；automated 37% / code_review 62% |
| 5 pr | PR #3 + pr_evidence.md + ci_results.md | — | 无 CI 配置，本地三重验证通过 |

### Problems Encountered — 跨 Phase 汇总

**P1: Review subagent 一致性产出嵌套 YAML frontmatter（Phase 1/2/3）**

贯穿整个流程的最大摩擦点。Phase 1 的 spec_review_v2、Phase 2 的 plan_review_v1、Phase 3 的 code_review_v1 都出现了 `verdict`/`must_fix` 放在嵌套对象下的情况。即使手动在 task prompt 中加了"frontmatter 在顶层"的约束，reviewer subagent 仍然产出嵌套格式。

讽刺的是——本次修改的核心目标之一就是修复这个问题（F-01/M1-1），而在修改 F-01 的过程中反复遭遇 F-01。Phase 3 dev 完成后，`_flatten_review_fields()` 统一解析生效，此问题理论上消失。但需要在下一轮 harness 运行中验证。

**影响**：3 次 review 中至少 2 次需要手动干预，浪费约 2-3 轮交互（占总交互量约 15%）。

**P2: "验证无需修改"的反复确认（Phase 1/2/3/4）**

F-08（跨 topic 隔离）、F-09（dirty check）、F-12（retrospect 流程）在 Phase 1 spec 中列为 FR → Phase 2 plan 中分配验证步骤 → Phase 3 dev 中 subagent 再次验证 → Phase 4 test 中通过 TC 再次确认。四个 phase 重复验证同一个 no-op 结论。

**根因**：Phase 1 spec 没有提前做代码验证，将"可能需要修改"保守地列入 FR。如果在 spec 阶段就 grep 确认，这 3 个 FR 可以标注为"已验证无需修改"而非"待验证"。

**影响**：每个 phase 浪费约 1 个步骤在已知 no-op 上，累计浪费约 4 个步骤。

**P3: Spec FR 精度不足 → review MUST FIX → Phase 3 额外工作（Phase 1/3）**

- FR-12 未指定具体变更目标文件（"在 skill 文档中记录"过于模糊）→ Phase 1 review MUST FIX
- FR-13 与 FR-3 完全重复 → Phase 1 review MUST FIX
- FR-5（"Plan Skill 增加 Scope 覆盖声明"）被 plan 解读为 Self-Check Checklist 检查项而非独立强制章节 → Phase 3 code review MUST FIX

这 3 条 MUST FIX 的共同特征是"遗漏"（omission）而非"错误"（error），与跨项目复盘的核心发现一致：AI 的主要弱点是遗漏。

**P4: Phase 5 无 CI 配置**

项目没有 GitHub Actions workflow，PR 无法通过 CI 自动验证。`ci_results.md` 只能记录本地验证结果（pre-commit hook + TypeScript 编译 + lint）。99 个预存 lint error 使得判断"是否有新引入的问题"需要手动 diff。

### What Would You Do Differently

1. **Spec 阶段就做代码验证**：对"可能已修复"的 FR，在 Phase 1 就 grep 确认。避免后续 3 个 phase 重复验证 no-op。具体做法：spec 中增加"代码验证"步骤，对每个 FR 先 grep 目标代码确认变更需求是否真实存在。

2. **FR 必须包含目标文件路径**：模糊的 FR（"在 skill 文档中记录"）必然导致 review MUST FIX。每个 FR 应该列出具体的文件路径和预期变更类型（追加/修改/删除）。

3. **拆分 index.ts（950 行）**：这是贯穿所有 phase 的 context 消耗大户——Phase 2 读它写 plan，Phase 3 读它构造 task prompt，Phase 4 读它验证逻辑。至少 3 次完整读取，每次消耗 ~950 行 context。应拆为 3-4 个模块文件（gate-handler.ts、state-manager.ts、review-handler.ts）。

4. **在 Phase 3 之前建立 TypeScript 测试 mock**：TC-2-01 无法做 automated 测试（需要 Pi runtime），导致 index.ts 的核心修改（review 前置检查）只有 code_review 覆盖。如果有 mock Pi API 的测试 harness，可以在编码时就写好自动化测试。

5. **Plan 中不写完整代码示例**：plan.md 的 20KB 中包含大量 Python/TypeScript 代码片段，但 Phase 3 的 subagent 更多依赖 task prompt 中的代码而非 plan 中的伪代码。plan 应只说明"改什么"和"改成什么"，具体代码放在 task prompt 中。

### Key Risks — 后续观察项

| 风险项 | 来源 | 监控方式 |
|--------|------|---------|
| index.ts 持续膨胀（当前 950+ 行） | Phase 2/3/4 各读 1 次 | 后续 PR 监控文件行数 |
| Review subagent frontmatter 格式回归 | Phase 1/2/3 一致性出现 | 下一轮 harness 运行观察 `_flatten_review_fields()` 是否生效 |
| Skill 文档追加内容的一致性（`---` 问题） | Phase 3 expert-reviewer | pre-commit hook 扩展或 lint 检查 |
| 无 CI 保障 | Phase 5 | 所有验证依赖本地，merge 前无法自动拦截 |
| Lint 预存 error 掩盖新增问题 | Phase 3/5 | 99 个预存 error 使 diff 判断困难 |

---

## Harness Usability Review

### Flow Friction

**Review 流程是最大的摩擦源。** 5 个 phase 共触发 5 次 review（spec×2 + plan×1 + code×2），其中 3 次涉及 frontmatter 格式问题。Review 本应是质量保障，但格式问题让它变成了"修 frontmatter → 重跑 gate"的体力活。本次修改（M1-1 扁平化解析）应能消除这个摩擦。

**Subagent 调度模式在 Phase 3 表现优秀。** Wave 1（BG1 + BG3 + BG4 并行，3 个 subagent）→ Wave 2（BG2，1 个 subagent）的设计合理，并行执行节省了约 60% 的时间。但 task prompt 构造占了主 agent 约 30% 的工作时间——需要读取代码片段、文件路径、修改位置等上下文。

**Phase 4 几乎无摩擦。** 16/16 TC 一轮通过，是整个流程中最顺畅的 phase。这验证了 Phase 3 的编码质量（code review v2 确认无 MUST FIX 后，测试阶段零返工）。

**Phase 5 的 PR 创建流程顺畅。** `gh pr create` 一步完成，pre-commit hook 自动验证了 8 个 SKILL.md 的 YAML frontmatter。但无 CI 导致"等待 CI"步骤变成了"写本地验证记录"。

### Gate Quality

Gate 在整个流程中发挥了关键拦截作用，**4 次拦截全部为真阳性，零 false positive**：

| Phase | Gate 拦截 | 真阳性 |
|-------|----------|--------|
| 1 | spec_review_v2 frontmatter 嵌套 | 是 — F-01 活体实例 |
| 1 | 2 条 MUST FIX（FR-12 模糊、FR-13 重复） | 是 — spec 质量问题 |
| 3 | code review v1 MUST FIX（Plan Skill 缺章节） | 是 — 模板不完整 |
| 4 | TC-7-01 test_execution.json 路径错误 | 是 — 文件位置不对 |

Gate 的精确度值得肯定。但有一个设计盲区：gate 只检查文件存在性和 frontmatter 格式，不检查 review 产出的逻辑一致性（如 verdict=pass + must_fix=2 的矛盾组合不会被拦截）。

### Prompt Clarity

**Skill 指令整体清晰**，各 phase 提供了充分的流程指导：
- Phase 1 brainstorming 的分段设计展示比一次性展示更高效
- Phase 2 writing-plans 的 L1/L2 评估指导快速判断复杂度
- Phase 3 的 subagent 调度参考提供了清晰的 wave 分组模式
- Phase 5 的 pr skill 明确禁止 merge（"MUST NOT merge the PR"），避免了不可逆操作

**不清晰的地方：**
- **Review subagent 的 frontmatter 约束无效**：即使 task prompt 中加了"frontmatter 在顶层"，reviewer 仍然产出嵌套格式。口头约束不可靠，需要代码层面强制（正是 M1-1 做的事）
- **test_cases_template.json 的 verification_method 标注不准确**：TC-2-01 标注为 automated 但实际降级为 code_review。模板标注与执行不一致
- **Plan 中 BG 编号与 Spec 中 B 编号的映射未说明**：BG1-BG4 ≠ B1-B5，但 plan 中没有显式解释映射关系，增加了 review 的理解成本

### Automation Gaps

| 缺口 | 影响 | 优先级 | 状态 |
|------|------|--------|------|
| Review subagent frontmatter 扁平化 | 每次 review 可能需要手动修复 | P0 | 已修复（M1-1） |
| TypeScript 扩展无自动化测试框架 | index.ts 核心逻辑只能 code_review | P1 | 未解决 |
| gate-check.py 无自动化回归测试 | 每次修改后手动构造 mock 目录 | P1 | 未解决 |
| 无 CI pipeline | 所有验证依赖本地 | P2 | 未解决 |
| Lint 只检查增量 | 99 个预存 error 掩盖新增问题 | P2 | 未解决 |
| Skill 文档追加格式检查 | `---` 问题无法自动检测 | P2 | 未解决 |

### Time Sinks

1. **index.ts 的反复读取**（Phase 2/3/4）：950 行文件在 3 个 phase 中被完整读取至少 3 次。是最大的 context 消耗源。建议拆分。

2. **Review 格式修复**（Phase 1/2/3）：每次 review 后手动修复 frontmatter 占约 15% 的总交互轮次。本次修改后应消除。

3. **Task prompt 构造**（Phase 3）：4 个 subagent 的 task prompt 各约 500-800 token，主 agent 需要读代码片段 + 文件路径 + 修改位置 + 约束条件。占主 agent 约 30% 工作时间。

4. **Mock 目录创建/清理**（Phase 4）：6 个 automated TC 各自创建独立 tmp 目录，每个 5-8 个 `cat >` 命令。总计约 40 次文件写入。

5. **Plan 编写**（Phase 2）：20KB 的 plan 对纯文档修改类任务偏长。代码示例和步骤描述过于详细，实际执行时 subagent 更多依赖 task prompt。

---

## Overall Assessment

本次 harness 运行的整体质量**良好**：

- **13/16 FR 实际修改 + 3/16 验证确认无需修改**，所有修改通过 16 个 TC 验证（16/16 passed, round 1）
- **Gate 的 4 次拦截全部为真阳性**，零 false positive，gate 精确度优秀
- **PR #3 的 12 个文件变更通过 pre-commit hook + TypeScript 编译 + lint 三重验证**
- **Subagent 调度模式的 Wave 并行设计**是最大亮点——10 个文件修改中只有 1 个需要手动修复（`---` 问题）

**最大的系统性问题是 review subagent 的 frontmatter 格式**——贯穿 3 个 phase，消耗约 15% 的总交互。本次修改（M1-1 `_flatten_review_fields()` 统一解析）应该能消除，但需下一轮运行验证。

**最值得改进的是 spec 阶段的代码验证**——如果 Phase 1 就 grep 确认了 F-08/F-09/F-12 无需修改，后续 3 个 phase 可以各省 1 个步骤，总效率提升约 15%。

**最值得保留的设计是 FR 的精确描述 + review 的质量闭环**——3 条 MUST FIX（Phase 1 的 2 条 + Phase 3 的 1 条）都是"遗漏"类问题，正好是跨项目复盘发现的核心弱点。Harness 的 review→gate→retrospect 闭环在发现遗漏方面表现出色。
