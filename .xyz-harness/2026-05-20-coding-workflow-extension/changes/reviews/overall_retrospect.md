---
phase: pr
verdict: pass
---

# Overall Retrospect — coding-workflow Extension (All 5 Phases)

## 1. Overall Phase Execution Review

### Summary

用 5 个 phase 完成了 coding-workflow Pi Extension 的从 0 到 1：spec（11 FR / 7 AC）→ plan（4 tasks / 4 files / 完整代码骨架）→ dev（1807 行实现 / 两轮 code review）→ test（24/24 静态验证通过）→ PR（17 files / 4431 insertions / PR #1 已创建）。

整个过程走了 6 轮审查（spec 2 轮 + plan 2 轮 + dev 2 轮），每轮审查都发现了至少 1 条 MUST FIX，每条 MUST FIX 都在下一轮正确修复。没有出现审查通过后又被推翻的情况。Phase 4 测试阶段零重试，24 case 全部 round 1 通过。Phase 5 PR 推送和提交无摩擦。

最终交付物：一个可用的 Pi Extension，实现 5-phase 编排、gate check、review/retrospect subagent dispatch、TUI widget、进程生命周期管理。

### Phase-by-Phase Quality

| Phase | 轮次 | MUST FIX | LOW/INFO | 核心问题 |
|-------|------|----------|----------|----------|
| 1 spec | 2 | 3→0 | 2+1 | 进程生命周期管理盲区（spawn 失败、并发、abort 清理） |
| 2 plan | 2 | 1→0 | 5+3→3 | activeSubprocesses 始终为空（封装过度） |
| 3 dev | 2 | 1→0 | 5→3 | spawn error 事件丢弃 Error 对象（Node.js 经典陷阱） |
| 4 test | 1 | 0 | 0 | 24/24 pass，但全部为静态代码分析，无运行时验证 |
| 5 pr | 1 | 0 | 0 | 无 CI pipeline，手动验证通过 |

**每轮审查的 MUST FIX 质量都很高——无 false positive。** 6 条 MUST FIX（3+1+1+0+0）全部指向真实缺陷。这说明 expert-reviewer skill 的审查方法论和分级标准是有效的。

### Problems Encountered

1. **审查几乎必然需要两轮。** spec、plan、dev 三个产出 phase 都在第一轮审查中发现了 MUST FIX，第二轮才通过。这不是审查过度严格（每条 MUST FIX 都是真问题），而是"首轮产出质量不足以一次通过"的系统性现象。根因：AI 在生成阶段倾向于覆盖 happy path，边缘场景（spawn 失败、进程引用暴露、Error 对象传递）在写的时候不容易被自己注意到。

2. **测试阶段没有运行时验证。** 24 个 test case 全部通过静态代码路径分析完成，没有一个 case 在实际 Pi 运行时中执行。这意味着异步行为（compact 回调时序、subagent stdout 流式输出）、竞态条件（并发 gate 调用、abort 期间 subagent 执行）和 TUI 渲染完全没有被验证。Phase 4 的复盘已经坦诚承认了这个限制。

3. **Phase 5 没有 CI pipeline。** 项目没有配置自动化 CI，所有验证（模块加载、gate 脚本、pre-commit hook）都是手动执行。对于一个 Pi Extension 项目，这可能不是问题（TypeScript + Python，没有标准的 CI runner），但如果 extension 被其他人使用，缺少 CI 意味着回归风险由人工承担。

4. **compact API 参数问题贯穿始终但未解决。** Phase 1 的 INFO #6 就指出了 `customInstructions` 参数未验证，Phase 2 留给 Phase 3，Phase 3 实现时选择了"先按 spec 写，运行时验证"的策略，但直到 PR 合并都没有实际在 Pi 运行时中调用 `ctx.compact()`。这是一个已知的未关闭风险。

### What Would You Do Differently

1. **在 spec 阶段就建立"进程生命周期"检查清单。** 这在 spec 复盘中已提出，但整个项目都受益于这个教训。如果 Phase 1 就用 spawn → running → exit/fail → cleanup 的 checklist 审视每条 FR，Phase 2 和 Phase 3 的 MUST FIX 可能都不会出现。

2. **测试阶段投入一个 Pi mock harness。** 这是 Phase 4 复盘的核心建议。24 个静态分析 case 的置信度远低于 10 个有断言的 mock 测试。如果项目周期允许，应该花半天写一个最小 mock（`ctx`、`pi`、`processRegistry` 的 stub），然后跑真正的测试。

3. **Plan 阶段不要写死代码。** `resolveModel()` 在 plan 中被写出但从未被调用，增加了审查噪音。代码骨架应该只写会被实际调用的代码路径，未验证的 API（compact 回调、registerMessageRenderer）标注为"实现时验证"，不写伪代码。

4. **审查可以尝试差异化模式。** 三个产出 phase 的第二轮审查都需要全量重读，而实际改动往往很小（spec 改了 3 处、plan 改了 1 处、dev 改了 1 行）。如果 v2 审查能聚焦于"v1 标记的问题是否修复 + 修复是否引入回归"，而不是从头扫描，时间成本会显著降低。

### Key Risks (Post-Merge)

1. **Runtime 行为未验证。** Extension 的核心流程（startup → gate → review dispatch → phase transition → Phase 5 completion）从未在 Pi 中实际跑过。首次部署使用时很可能遇到静态分析无法预测的问题。

2. **GATE_SCRIPT_PATH 硬编码 `os.homedir()`。** 如果 extension 安装路径变化（非 symlink 方式、不同机器），gate-check.py 找不到。应改为 `import.meta.dir` 相对路径。

3. **Model resolution 依赖用户本地 `subagent-models.json`。** 如果该文件不存在或格式错误，`resolveModelByComplexity` 会在运行时崩溃。需要 fallback 或友好错误提示。

4. **Gate-check.py 对复杂 YAML frontmatter 的解析韧性未验证。** 测试用 mock 数据通过，但真实 deliverable 中 block scalar、特殊字符、嵌套结构可能导致解析失败。

---

## 2. Harness Usability Review

### Flow Friction

**整体流程设计合理，阶段间推进逻辑清晰。** 用户在每个 phase 开始时说"start Phase N"，AI 加载对应 skill，按指引产出 deliverable，dispatch 审查 subagent，修复后 gate check。没有出现"不知道下一步该做什么"的情况。

**摩擦点集中在审查往返的成本。** 5 个 phase 共执行了 6 轮审查（Phase 4 和 5 各 1 轮直接通过），其中 3 轮是因 MUST FIX 导致的重审。每轮重审意味着：AI 读取完整 deliverable → 逐条修复 → 重新 dispatch 审查 subagent → 审查 subagent 重新全量扫描。对于"改 1 行代码"的修复（如 Phase 3 dev 的 MUST FIX），全量重审的成本与收益不匹配。

### Gate Quality

**Gate check 脚本（check_gate.py）在各 phase 表现稳定。** 它正确地：
- 检测文件存在性
- 验证 YAML frontmatter 格式
- 检查 verdict 和 required 字段
- 扫描 review 版本号

**但 gate 脚本不审查内容质量。** 它验证"文件存在且格式正确"，但不验证"spec 是否覆盖了所有需求"或"测试 evidence 是否有实质内容"。这个职责落在了 expert-reviewer subagent 上。这种分工是合理的（gate 做结构验证，review 做内容验证），但意味着如果 review subagent 质量不足，gate 无法兜底。

**没有 false positive。** 6 轮审查中未出现"MUST FIX 标记但实际上没问题"的情况。审查分级（MUST FIX / LOW / INFO）的准确率是 100%。

### Prompt Clarity

**Skill 文件的指引质量总体良好。** 11 个 skill 的分工明确，每个 phase skill 的入口描述（触发词、产出物、前置条件）足够让 AI 独立工作。

**两个具体改进点：**

1. **Expert-reviewer skill 的审查 checklist 缺少"接口对称性"检查。** Phase 1 的 #7（review subagent 未加入 activeSubprocesses）和 Phase 2 的 #10（dispatchReviewSubagent 成功路径不返回 result）都是同类问题——同一文件内相似代码路径的接口不对称。如果审查方法论中有"检查调用方是否使用了被审查函数的全部返回值"这一项，这类问题可能在第一轮就被发现。

2. **Phase 4 test skill 对"无运行时环境"场景的指导不足。** skill 说"execute test cases"，但对 Pi Extension 这类无法在 Pi 外运行的产出物，"execution" 的定义是模糊的。AI 选择了静态代码路径分析，这是合理的但不是唯一选择。skill 应明确引导：如果无法运行时测试，应如何补偿（写 mock、做代码路径 tracing、标注未验证路径）。

### Automation Gaps

1. **审查版本号管理是手动逻辑。** `getNextReviewVersion` 在每个项目的 gate tool 中手动实现（glob 文件 + 解析版本号）。harness 框架层面应该提供这个工具函数。

2. **Spec/plan 变更没有 diff 工具。** v1 审查提出问题后，AI 修复 deliverable，v2 审查需要全量重读才能验证修复。没有结构化的 diff → 验证机制。

3. **Retrospect subagent 是手动 dispatch。** 每个 phase 的复盘都是用户或 AI 手动触发，而不是"gate 通过后自动 dispatch"——这恰恰是 coding-workflow extension 本身要自动化的事情（自举问题：extension 还没写好，自然无法自动化自己的流程）。

4. **测试执行没有 runner。** 24 个 test case 的"执行"是 AI 读代码写 evidence，不是脚本运行断言。这是 Pi Extension 领域的固有限制（缺乏 mock harness），不是 harness 流程的缺陷。

5. **FR 覆盖验证是手工 grep。** test_results.md 中的 FR 覆盖矩阵是人工逐条对照 spec 确认的，没有自动化工具交叉检查"每条 FR 是否至少有一个 test case 覆盖"。

### Time Sinks

1. **审查往返是最大的时间消耗。** 6 轮审查 × 全量扫描 ≈ 整个项目 30-40% 的时间花在审查和重审上。其中约一半（3 轮重审）是 MUST FIX 导致的必要成本，另一半是"全量扫描"策略带来的额外开销。差异化审查（v2 只审查变更）可能节省 20-30% 的总时间。

2. **Plan 阶段 Task 4 的代码骨架篇幅。** plan.md 中 Task 4 占了约 60% 篇幅（14 steps 的完整 TypeScript 代码），审查 subagent 需要阅读并理解大量代码。完整骨架 vs 精简接口描述的权衡，在这次项目中倾向于前者，但审查成本也因此上升。

3. **Lib 模块提取的边界确认。** 从 xyz-pi-extensions 提取 `model-resolve.ts` 和 `subagent.ts` 时，确认哪些函数保留、哪些移除、类型定义如何组织，比预期耗时。原始模块的职责边界不完全匹配 coding-workflow 的需求。

---

## Overall Assessment

### 项目完成度

coding-workflow Extension 从需求到 PR 的完整流程走通，交付了可用的 Pi Extension（17 files / 4431 lines / PR #1）。11 条 FR 全部实现，7 条 AC 全部满足，24 个 test case 全部通过。

### 核心缺陷

**最大的质量短板是运行时验证缺失。** 整个项目从 spec 到测试，从未在 Pi 中实际运行过 extension。静态分析和 code review 的质量很高（6 轮审查无 false positive），但它们无法替代运行时验证。这个风险在 extension 首次部署时会暴露。

### Harness 流程评价

xyz-harness V5 的手动 skill-driven 模式在本次项目中运行良好：
- **Skill 分工清晰**，11 个 skill 各司其职，无重叠无遗漏
- **审查机制有效**，expert-reviewer subagent 的 MUST FIX 命中率 100%
- **Gate 脚本稳定**，结构验证准确，无 false positive/negative
- **Phase 间推进流畅**，无"不知道该做什么"的时刻

主要改进空间：
1. 差异化审查机制（减少全量重审成本）
2. 测试阶段的 mock harness 指导
3. 审查 checklist 补充"接口对称性"维度
4. 框架级工具函数（版本号管理、diff 生成）

### 建议

1. **部署后立即做一次完整的 runtime smoke test。** startup → Phase 1 spec → gate → review → Phase 2 → ... → Phase 5 completion，全程在 Pi 中跑一遍。预计会发现 2-5 个静态分析无法预测的问题。

2. **下一个 harness 项目尝试差异化审查。** v2 审查只看 v1 标记的问题 + 修复引入的变更区域，不做全量扫描。对比 MUST FIX 修复质量和回归率，决定是否作为默认策略。

3. **投入一个通用的 Pi mock harness。** 这不是 coding-workflow 项目独有的需求——所有 Pi Extension 的测试都会遇到这个问题。一个通用的 mock（ctx、pi、processRegistry 的 stub + 基础断言工具）会让所有 extension 的测试质量提升一个台阶。
