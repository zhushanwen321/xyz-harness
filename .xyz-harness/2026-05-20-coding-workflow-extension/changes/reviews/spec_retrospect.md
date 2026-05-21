---
phase: spec
verdict: pass
---

# Spec Phase Retrospect

## 1. Phase Execution Review

### Summary

Phase 1 产出了一份完整的 `coding-workflow` Pi Extension spec，目标是将 xyz-harness V5 的手动 skill-driven 流程自动化为 extension-driven 流程。spec 包含 11 个 FR、7 个 AC、完整的技术约束（Pi API 使用范围、文件结构、Phase-Skill 映射）和代码复用策略。

审查经过 2 轮：
- **v1**：发现 3 条 MUST FIX（spawn 失败无处理、并发启动无防护、abort 无子进程清理）+ 2 条 LOW + 1 条 INFO
- **v2**：3 条 MUST FIX 全部修复，新增 1 条 LOW（review subagent 未加入 activeSubprocesses）和 1 条遗留 INFO（compact API 参数未验证），verdict: pass

### Problems Encountered

**v1 的 3 条 MUST FIX 全部集中在进程生命周期管理这一盲区。** spec 原版覆盖了"正常路径"和"subagent 非零退出"，但忽略了更上游的 spawn 失败（ENOENT、资源不足）和并发场景下的状态竞争。这不是偶然——写 spec 时容易聚焦于 happy path 和"已知会失败"的地方，而 spawn 本身失败属于"不太会想到"的底层错误。

**Review subagent 的 activeSubprocesses 追踪不对称**（v2 #7）是一个典型的"写完一边忘了另一边"问题。FR-3 step 4（retrospect）写了进程追踪，step 3（review）漏了，reviewer 在第二轮才注意到。说明第一轮审查的注意力集中在 MUST FIX 的修复验证上，对非修复区域的回归检查不够彻底。

### What Would You Do Differently

1. **在写 FR 时按"进程生命周期"维度做 checklist 检查**，而不是按功能模块逐个写。spawn → 运行中 → 退出/失败 → 清理，每个 subagent 都走一遍这个链路，就不会漏掉 spawn 失败和 abort 清理。
2. **Review subagent 的 task prompt 中加入"检查一致性"指令**。当前审查方法论按完整性/约束/FR 逐项检查，但不要求"同一文件内相似代码路径的对称性检查"。#7 这种不对称问题在方法论层面就不会被发现。

### Key Risks for Later Phases

1. **compact API 的 `customInstructions` 参数**（INFO #6，两轮未修复）：Phase 3（dev）实现 compact 调用时才会验证。如果 Pi API 不支持，需要临时方案（写入 session entries → compact 后 sendUserMessage 附带），这会改变 FR-4 的实现方式。
2. **Gate 脚本同步**：spec 约定从 `xyz-harness-gate/scripts/check_gate.py` 复制到 extension 目录。后续 `check_gate.py` 更新时需要手动同步，没有自动机制。
3. **1000-1500 行的预估**：spec 的 Complexity Assessment 偏乐观。11 个 FR、7 个 AC、subagent spawn + JSON 流解析 + 模型路由 + 状态持久化 + TUI widget，实际代码量可能超过 1500 行。

---

## 2. Harness Usability Review

### Flow Friction

Phase 1 的手动流程执行顺畅。用户说"start Phase 1"→ AI 加载 brainstorming skill → 产出 spec → dispatch 审查 subagent → 审查修复 → 再次 dispatch → pass。没有出现"不知道下一步该做什么"的情况。

**唯一的摩擦点**：审查 subagent 产出的 review 文件需要 AI 手动读取并逐条修复 spec，修复完成后再次调用 gate。这个过程是串行的（gate → review → 修复 → gate → review → pass），两轮审查意味着 AI 与 spec 的交互至少 4 次往返。这是设计如此（保证审查独立性），但确实有成本。

### Gate Quality

Gate check 在本阶段未独立执行（复盘在 gate 之前/同时进行），所以无法评价 gate 脚本的准确性。但从审查结果看，v1 发现的 3 条 MUST FIX 都是真问题，不是 false positive。v2 的 #7 也是合理发现。

### Prompt Clarity

brainstorming skill 的指令足够清晰——AI 按 guide 产出了一份结构完整的 spec（Background、FR、AC、Constraints、Complexity Assessment 全部覆盖，无 TBD 项）。skill 的"做什么"部分没有歧义。

expert-reviewer skill 在 task prompt 中指定了"计划评审"模式和"spec 完整性"重点，两轮审查的覆盖范围合理（完整性、约束、FR 逐项、错误处理、遗漏决策）。

### Automation Gaps

1. **审查修复后的 spec diff 未自动生成**。v2 的审查需要人工对照"v1 提出的问题是否在当前 spec 中修复"，没有 diff 工具辅助。审查 subagent 需要重新阅读完整 spec，成本较高。
2. **Review 版本号管理是手动的**。当前由 gate tool 扫描目录确定 nextVersion，但这只是编号管理。审查内容的增量对比（v1 vs v2 改了什么）没有自动化。
3. **Retrospect 的 dispatch 依赖人工触发**。本复盘是手动 dispatch，不是 spec 中设计的"gate 通过后自动 dispatch retrospect subagent"。

### Time Sinks

审查往返是最大的时间消耗。v1 发现 3 条 MUST FIX → 修复 → v2 回归验证 → 通过。如果 v1 的 spec 在写的时候就做了进程生命周期 checklist（见上文"Would Do Differently"），可能一轮就通过，节省一轮完整的审查-subagent 往返。
