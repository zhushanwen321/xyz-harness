---
phase: plan
verdict: pass
---

# Plan Phase Retrospect

## 1. Phase Execution Review

### Summary

Phase 2 产出了一份高质量的实现计划，覆盖 4 个 task、4 个文件、完整的代码骨架和自审矩阵。计划经历了两轮审查：

- **v1 审查**：发现 1 条 MUST_FIX（`activeSubprocesses` 未填充导致 abort 无法终止子进程）+ 5 LOW + 3 INFO。裁定 fail。
- **v2 审查**：MUST_FIX 已修复，调用链路完整（spawn 注册 → dispatch 传入 → abort 终止 → exit 清理）。v1 中 2 条 LOW 同步修复，新发现 1 条 LOW（dispatchReviewSubagent 成功路径未返回 result）。裁定 pass。

关键设计决策：
1. 采用 `processRegistry?: ChildProcess[]` 参数方案解决进程生命周期管理，比返回 `{ result, process }` 更简洁
2. 通过 `before_agent_start` 中缓存 `cachedSkills` 解决 gate tool 无法访问 `systemPromptOptions` 的问题
3. Task 4 保持 14 steps 不拆分，依赖代码骨架完整度降低 subagent 执行风险

### Problems Encountered

1. **MUST_FIX 导致重审。** `activeSubprocesses` 始终为空是最初计划的明确缺陷。根本原因：`runSingleAgent` 在函数内部 spawn 进程但不暴露引用，设计时没有考虑到调用方需要管理进程生命周期的场景。这是一个典型的「封装过度」问题——spawn 逻辑封装得越好，外部越无法介入。

2. **usage 统计信息无效。** v1 审查指出 `usageLine` 变量创建后未使用（Issue #3），v2 修复了使用问题，但同时发现 `dispatchReviewSubagent` 成功路径不返回 `result` 字段（Issue #10），导致 `usageLine` 始终为空字符串。两轮审查接力才揭示完整问题链。

3. **`resolveModel()` 是纯死代码。** plan 中所有调用走 `resolveModelByComplexity`，`resolveModel` 从未被使用。在计划阶段写入未使用的函数增加了审查噪音。

### What Would You Do Differently

1. **代码骨架只写会被调用的代码。** `resolveModel()` 和两个 INFO 级别的 API 疑问（`compact` 回调、`registerMessageRenderer`）都不应该在计划中写入未验证的代码。应该标注为「实现时验证后决定是否添加」。

2. **dispatch helper 的返回类型应该一开始就设计完整。** `dispatchReviewSubagent` 返回 `{ success, reviewPath }` 而遗漏 `result`，是因为写代码骨架时没想清楚调用方需要什么。如果先写 gate tool 的消费逻辑，再写 dispatch helper 的签名，就不会出现这种不匹配。

3. **Task 4 确实偏大。** 14 steps、预估 700-800 行，单个 subagent 执行风险不可忽视。如果重新规划，会把 tools + dispatch helpers（Step 3-5）拆为 Task 4a，commands + events + state + widget（Step 6-12）拆为 Task 4b，依赖关系为 4a → 4b。

### Key Risks for Later Phases

1. **3 条 INFO 问题留给实现阶段验证。** `THINKING_TO_PI` 映射、`ctx.compact()` 回调签名、`pi.registerMessageRenderer` 是否存在——这些在 Phase 3 dev 阶段如果验证不通过，可能需要修改计划。
2. **Issue #10 未修复。** usage 统计信息在当前计划中始终为空，dev 阶段需要补充 `result` 字段返回。
3. **Issue #4（`resolveModel` 死代码）未清理。** dev 阶段应直接删除，不要保留「万一以后用到」的代码。
4. **E2E test plan 有 13 个 scenario，但缺少 AC-7 的专属测试。** Phase 4 test 阶段需要补充或明确声明由环境隐含覆盖。

---

## 2. Harness Usability Review

### Flow Friction

无明显流程摩擦。plan phase 的 skill 指引清晰，产出结构（plan.md + e2e-test-plan.md + test_cases_template.json）明确。审查循环（v1 fail → 修复 → v2 pass）运转正常，两轮审查之间的修复工作量可控。

### Gate Quality

审查工具（expert-reviewer subagent）在 v1 正确识别了 MUST_FIX 问题。Issue #1 的定位精确到具体代码位置和调用链路，修复方案建议也给出了两个选项并推荐了更优方案。

v2 审查不仅验证了 MUST_FIX 的修复，还通过逐项调用链路检查（6 个检查点的表格）确认修复的完整性。这种结构化验证比笼统的「已修复」更有说服力。

v2 新发现的 Issue #10 也证实了多轮审查的价值——第一轮关注 MUST_FIX，第二轮有精力检查更细微的不一致。

### Prompt Clarity

skill 中对 plan phase 的描述足够清晰。审查方法论（expert-reviewer）的三模式设计（计划评审、编码评审、测试评审）让 subagent 能针对性执行。

一个小的改进点：审查方法论没有明确要求「检查 dispatch helper 的返回类型与调用方的消费逻辑是否匹配」。Issue #10 正是这类跨函数接口一致性问题。如果审查 checklist 中有「调用方是否使用了被审查函数的全部返回值」这一项，可能在 v1 就能发现。

### Automation Gaps

1. **审查版本号手动管理。** `getNextReviewVersion` 需要实现代码来 glob 文件并解析版本号，这个逻辑在 gate tool 中手动编写。如果 harness 本身提供版本号递增的工具函数，plan 中就不需要为这个辅助函数写代码骨架。
2. **MUST_FIX 到修复的往返没有结构化跟踪。** v1 的 Issue #1 标记为 MUST_FIX，但修复验证依赖 v2 审查重新读取修改后的 plan.md 并逐项检查。如果有结构化的「修复清单 + 验证状态」机制，修复验证会更高效。

### Time Sinks

1. **Task 4 代码骨架篇幅过大。** plan.md 中 Task 4 占了约 60% 的篇幅（Step 1-14 的完整 TypeScript 代码），审查 subagent 需要读取并理解大量代码。这不是 harness 流程的问题，而是计划本身的设计选择——完整骨架 vs 精简接口描述的权衡。
2. **两轮审查的覆盖范围重复。** v2 需要重新审查整个 plan（不只是修复部分），才能确认 v1 的 LOW/INFO 是否有变化。如果审查能增量进行（只审变更部分），时间效率会更高。但考虑到审查的独立性和客观性要求，全量重审是合理的取舍。
