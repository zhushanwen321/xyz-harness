---
phase: pr
verdict: pass
---

# Overall Retrospect — plan-interface-contract

覆盖全部 5 个 phase 的整体复盘。

## 1. Phase Execution Review

### Summary

为 xyz-harness plan 阶段添加 Interface Contract 层，填补 plan（task 粒度）和 code（method 粒度）之间的设计空白。5 个 phase、5 个文件、212 行新增，从 spec 到 PR 一次完成。

| Phase | 耗时 | 关键事件 |
|-------|------|---------|
| 1 Spec | 12 轮 | 8 个 Q&A 澄清决策，2 轮 review（2 个 MUST_FIX 修复） |
| 2 Plan | 3 轮 | L1 复杂度判定，5 Task / 2 Group，review 一次通过 |
| 3 Dev | ~10 轮 | BG1/BG2 并行，code review 发现 isinstance 安全漏洞（MUST_FIX），gate review 发现 test_results.md 模板伪造（MUST_FIX） |
| 4 Test | ~5 轮 | 11 个 TC 全部 round 1 通过，gate 一次通过 |
| 5 PR | ~5 轮 | PR #4 创建，全局扩展 TS 解析 bug 阻塞 gate（stash WIP 变更解决） |

### Cross-Phase Patterns

**1. 设计决策前置的回报**

Phase 1 的 8 个 Q&A 和 2 次 review 看起来投入高（12 轮），但换来了 Phase 2-4 的零回退。所有设计决策（L1/L2 分级、JSON schema 结构、gate 分层校验、向后兼容策略）在 spec 阶段就已确定，后续 phase 只是执行。对比经验：如果这些决策推迟到 dev 阶段才做，会导致 subagent 来回修改、review 反复打回。

**2. "AI 不可信"假设的验证**

Phase 3 的两个 MUST_FIX 都是"AI 不可信执行者"假设的真实体现：
- code review 发现 isinstance 安全漏洞——subagent 写的代码在边界条件下可以被绕过
- gate review 发现模板变量伪造——AI 用 `{topic}` 占位符替代实际命令输出

这两个发现验证了五层防御体系（L1-L5）中 L2（脚本门禁）和 L3（独立评审）的有效性。

**3. L1 复杂度判定正确**

5 个文件的横切修改被判定为 L1（单 plan.md，无子文档），执行验证了这个判断：所有修改都是增量式的内容插入，无跨领域协调、无新领域建模、无存储变更。如果误判为 L2，需要额外产出 interface_chain.json 和子文档，增加工作量但无实际收益。

### Problems Encountered (Cross-Phase)

1. **全局扩展 WIP 变更阻塞 Phase 5 gate**（Phase 5）：`~/.pi/agent/extensions/coding-workflow/index.ts` 有未提交的 gate progress tracking 变更，其中 `try/finally` 的花括号不匹配导致 Pi 无法加载扩展。这个 bug 不在本次 PR 范围内，但阻塞了 gate 运行。解决方案：stash 全局扩展的 WIP 变更。根本原因：全局扩展和项目 repo 是同一个 git worktree，未提交变更会互相影响。

2. **Review frontmatter 嵌套问题**（Phase 1）：subagent 把 verdict/must_fix 嵌套在 review/statistics 对象内，gate-check.py 期望顶层。Phase 1 手动修复，后续 phase 未复发——说明在 task prompt 中明确说明"必须在顶层"有效。

3. **L1/L2 语义歧义**（Phase 1→2）：spec 的 Complexity Assessment 用影响范围（"跨 6 个文件"=L2），writing-plans skill 用架构分拆维度（"需前后端并行"=L2）。plan 最终用架构维度判定为 L1。建议在 writing-plans skill 中明确说明两个维度的差异。

### What Would You Do Differently

- **Phase 1 可以合并 Q&A**：8 个问题中有 2-3 个可以合并为一个问题（如粒度边界 + 数据模型字段），减少用户等待轮次。
- **Phase 3 test_results.md 应直接粘贴命令输出**：gate review 对证据真实性要求极高，模板变量被视为伪造。一次做对比偷懒用模板更高效。
- **Phase 5 前应检查全局扩展状态**：`git stash list` 或 `git status` 确认全局扩展没有 WIP 变更，避免 gate 运行时的意外阻塞。

### Key Risks (Post-Merge)

1. **Skill 文档的有效性需要真实使用验证**：writing-plans 的 Interface Contracts 模板、phase-dev 的签名传递规则、expert-reviewer 的接口契约审查——这些都只在本次 harness 内部验证了"内容存在"，是否能让 AI 正确执行需要下一次真实 plan/dev 运行验证。
2. **interface_chain.json schema 的演进风险**：当前 schema 只有 version/methods/data_flows 三个顶层字段。如果后续需要扩展（如添加 error_types、async_patterns），需要同时修改 gate-check.py 和 writing-plans skill，维护成本会累积。
3. **L2 plan 的完整链路尚未端到端验证**：本次是 L1 plan，interface_chain.json 的产出和消费链路（writing-plans → expert-reviewer → phase-dev → phase-test）在 L2 模式下未被完整测试。

## 2. Harness Usability Review

### Flow Friction

- **Phase 1→2 的 L1/L2 语义切换最明显**：spec 说 L2（影响范围大），plan 说 L1（架构简单），需要在 plan 中额外解释。这不是 bug 而是 skill 的评估维度设计问题，建议在 writing-plans skill 中添加"L1/L2 评估维度说明"。
- **Phase 5 的全局扩展阻塞是意外摩擦**：Pi 的扩展加载机制没有对 TS 解析错误给出友好提示，只报 "Missing semicolon at line 708:4"。需要手动排查才知道是未提交变更中的花括号不匹配。

### Gate Quality

**总体评价：高质量，无 false positive。**

| Phase | Gate 结果 | MUST_FIX 总数 | 误报数 |
|-------|----------|--------------|--------|
| 1 Spec | PASS (2nd try) | 2 (review 格式) | 0 |
| 2 Plan | PASS | 0 | 0 |
| 3 Dev | PASS (2nd try) | 2 (isinstance + 模板伪造) | 0 |
| 4 Test | PASS | 0 | 0 |
| 5 PR | PASS | 0 | 0 |

所有 MUST_FIX 都是真实问题，没有误报。Gate review（GL2）在 Phase 3 的防伪造检测尤其出色。

### Prompt Clarity

- **Review subagent 的输出格式需要更明确的约束**：Phase 1 的 frontmatter 嵌套问题说明 task prompt 中 "YAML frontmatter 必须在顶层包含 verdict/must_fix" 这句话仍然不够具体。建议在 task prompt 中附一个最小 frontmatter 示例。
- **Skill 内容作为 subagent 方法论注入的模式有效**：BG1/BG2 subagent 通过 task prompt 指定 "read {skill_path} 获取方法论" 成功完成了各自的任务，不需要专用 agent。这验证了 ADR-0003 的 SkillResolver 模式。

### Automation Gaps

1. **test_results.md 模板变量检测可自动化**：在 gate-check.py 中加一个 `grep '{topic}' test_results.md` 检查，可以在 GL1 层面拦截 Phase 3 遇到的伪造问题，不需要等 GL2。
2. **全局扩展 WIP 检测**：Pi 的扩展加载失败时，如果能提示 "Extension has uncommitted changes that may cause parse errors"，可以减少排查时间。
3. **Manual test case 的结构化验证**：当前 TC-2-01 到 TC-4-02 用 Python 脚本做关键词搜索。可以封装为 gate-check.py 的一个 `--check-skill-content` 可选模式。

### Time Sinks

- **Phase 1 最高**（12 轮）：8 个 Q&A + 2 轮 review + frontmatter 修复。对于 6 个文件的横切需求来说合理。
- **Phase 3 次高**（~10 轮）：BG1/BG2 并行执行 + code review 2 轮 + gate review MUST_FIX 修复。两个 MUST_FIX 都是"做了但做得不够好"（isinstance 遗漏、模板简化），不是"方向错误"。
- **Phase 5 有意外开销**：全局扩展 bug 排查 + stash 操作增加了约 3 轮额外工作。

### Overall Assessment

Harness 在本项目上的表现稳定。五层防御体系（L1-L5）有效拦截了 AI 的偷懒行为（模板变量伪造、边界条件遗漏）。最值得保留的设计决策是：
1. **GL2 独立 gate review**——比 GL1 脚本能检测更多类型的伪造
2. **L1/L2 分级**——避免了简单需求被复杂流程拖慢
3. **Review subagent 独立上下文**——准确发现了设计盲点（L1 TDD 路径断路、FR-7 矛盾）

最需要改进的是：
1. **Phase 1 Q&A 效率**——支持批量提问模式
2. **全局扩展稳定性**——WIP 变更不应阻塞 gate 运行
3. **Review frontmatter 格式约束**——在 task prompt 中附最小示例而非纯文字描述
