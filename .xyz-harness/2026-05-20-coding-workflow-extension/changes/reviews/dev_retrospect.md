---
phase: dev
verdict: pass
---

# Dev Phase Retrospect — coding-workflow Extension

## 1. Phase Execution Review

### Summary

Phase 3 完成了 coding-workflow Pi Extension 的编码实现，产出 4 个文件共 1807 行代码（`index.ts` 869 行, `lib/model-resolve.ts` 167 行, `lib/subagent.ts` 322 行, `gate-check.py` 449 行）。实现覆盖了 spec 中 FR-1 到 FR-11 全部 11 条功能需求，以及 AC-1 到 AC-7 全部 7 条验收标准。代码经历了两轮评审：v1 发现 1 条 MUST FIX + 5 条 LOW/INFO，v2 确认 MUST FIX 和 2 条 LOW 已修复，剩余 3 条 LOW/INFO 可接受。测试结果全部通过（模块加载、gate 脚本运行、FR 覆盖验证）。

关键决策：
- 从 `xyz-pi-extensions/subagent` 提取了 `model-resolve` 和 `subagent` 两个 lib 模块，简化为只保留 single foreground mode，去掉了 parallel/chain/background 逻辑
- Retrospect subagent 失败时采用优雅降级（warn 不阻塞 gate），而非强制中断
- `cachedSkills` 中 expert-reviewer skill 走 fallback 文件读取路径（因为不是 phase skill，不在 cachedSkills 列表中）

### Problems Encountered

1. **MUST FIX: spawn 错误消息丢失**（issue #1）。`proc.on("error")` 回调忽略了 Error 对象，导致 spawn 失败时返回 "Unknown error"。这是调试可见性问题——功能上 spawn 失败已被捕获（非零退出码），但用户看到的错误信息完全无用。v2 中已修复：`err.message` 写入 `result.stderr`。

2. **formatTokens 百万分支多余字符**（issue #2）。模板字符串中多了一个 `}`，导致 token 统计显示为 `1.5M}` 而非 `1.5M`。纯显示问题，v2 中已修复。

3. **Phase Start retrospect 检查与 spec 不一致**（issue #4）。spec 要求 "不存在→报错"，实现用了 `console.warn`。v2 中对应代码已因重构移除，场景不再存在。

### What Would You Do Differently

1. **spawn 错误处理应在首次编写时就到位**。`proc.on("error")` 丢 Error 对象是经典的 Node.js 陷阱——error 事件的回调签名自带 Error 参数，忽略它是没有理由的。写 spawn 封装时应该直接写 `(err) => { ... }`，而不是事后通过 code review 发现。

2. **lib 模块提取时的死代码清理不够彻底**。`resolveModel()` 从源模块提取后未被使用，应该在提取时就验证 import 消费者并移除多余 export。提取时带着"可能以后用到"的想法保留了它，但 coding-workflow 明确不需要这个函数。

3. **spec 中"不存在→报错"这类约束应优先用 gate-check.py 脚本验证**，而非依赖 AI 在运行时检查。gate-check.py 已经在做文件存在性校验，phase-start 中的检查是重复防御，且容易与 spec 产生不一致。

### Key Risks

1. **GATE_SCRIPT_PATH 硬编码 `os.homedir()`**（issue #6）。当前部署路径固定，但如果 extension 被 symlink 到其他位置或通过其他方式安装，路径会断裂。应在后续迭代中改为 `import.meta.dir` 相对路径。

2. **parseReviewVerdict 的 mustFix 解析**（issue #5）。当 review YAML 结构变化（must_fix 嵌套在其他字段下）时可能误判通过。当前依赖 gate-check.py 的独立 YAML 校验作为防御，但如果 gate-check.py 的校验逻辑也漏了同样的问题，就会形成盲区。

3. **resolveModel 死代码**（issue #3）。虽不影响功能，但如果后续有人 import 它并依赖其行为，会增加不必要的耦合和维护负担。

---

## 2. Harness Usability Review

### Flow Friction

整体流程顺畅。Phase 3 的 skill 描述（`xyz-harness-phase-dev`）清晰地引导了编码、测试、评审三个阶段。两轮 code review 的 dispatch-resolve-redispatch 循环运作正常。

唯一的小摩擦：**评审 subagent 的 expert-reviewer skill 通过文件系统 fallback 获取**，而非从 cachedSkills 读取。这不影响功能，但意味着代码中存在一条永远不会成功的 fast path（`getSkillContent(cachedSkills, "xyz-harness-expert-reviewer")`），每次都会 throw 后走 fallback。如果 harness 能在 dispatch subagent 时自动注入需要的 skill 到 cachedSkills，会更干净。

### Gate Quality

Gate check 正确识别了所有问题。两轮评审的 MUST FIX / LOW / INFO 分级准确，v1 中唯一一条 MUST FIX（spawn 错误消息丢失）确实是最高优先级的可调试性缺陷。评审未产生误报。

### Prompt Clarity

Phase 3 skill 中关于 TDD、编码规范、评审 subagent dispatch 的指引足够清晰，AI 能独立完成从编码到测试到评审的全流程。没有出现"不知道下一步该做什么"的情况。

### Automation Gaps

1. **FR 覆盖验证仍为手工检查**。test_results.md 中的 FR 覆盖矩阵是人工对照 spec 逐条确认的。如果 extension 的 FR 列表发生变化，需要重新手动验证。可以考虑写一个简单的 grep 脚本自动化覆盖率检查。

2. **评审 subagent 的 model 选择**。gate tool 中 review subagent 使用 `resolveModelByComplexity` 选择模型，但模型选择逻辑是硬编码的复杂度映射。如果需要针对不同 phase 使用不同模型，需要修改代码而非配置。

### Time Sinks

1. **两轮评审的完整 turnaround**。v1 发现 1 条 MUST FIX，修复本身只需改 1 行代码（`err.message` 赋值），但完整的 v2 重新评审需要再次扫描全部 4 个文件。对于这种"改 1 行"的修复，可以考虑差异化评审机制，只审查变更部分。

2. **lib 模块提取的边界确认**。从 xyz-pi-extensions 提取代码时，需要确认哪些函数需要保留、哪些可以移除、类型定义如何组织。这个过程比预期耗时，因为原始模块的职责边界不完全是 coding-workflow 需要的。

---

## Overall Assessment

Phase 3 质量良好。1807 行代码覆盖了 11 条功能需求，经历了严格的两轮评审，最终 0 条 MUST FIX 通过。编码过程中踩了一个 Node.js spawn 的经典陷阱（error 事件丢 Error 对象），被评审及时发现并修复。harness 流程本身运行顺畅，skill 指引清晰，评审分级准确。主要改进空间在自动化验证和 lib 提取的边界管理上。
