---
title: 跨项目复盘扫描——对 Harness 工程建设的发现汇总
date: 2026-05-22
source_projects:
  - llm-simple-router (26 份复盘, 10 topics)
  - xyz-agent (9 份复盘, 6 topics)
  - dag-executor (3 份复盘, 3 topics)
  - xyz-harness-engineering (8 份复盘, 8 topics)
total_retrospects: 46
---

# 跨项目复盘扫描

扫描了 4 个项目共 46 份复盘文件，提取对 harness 工程建设有直接意义的发现。忽略项目业务内容，只关注工作流机制、AI 行为模式、skill 设计、gate 检查、subagent 调度等方面。

## 核心结论

**AI 的核心弱点不是"写错"，而是"遗漏"。** 9 条 MUST FIX 中 8 条是"应该想到但没想到"的遗漏型缺陷。这意味着 harness 的防御重心应从"发现错误"转向"防止遗漏"——自检清单比审查深度更重要。

---

## P0：必须立即修复

### F-01. YAML Frontmatter 嵌套是最高频摩擦点

review subagent 持续产出嵌套 YAML（`review.verdict` 而非顶层 `verdict`），至少 8 份独立复盘记录了同一问题。主 agent 每次需手动修复，累计浪费 4-5 轮交互。

- 来源：llm-simple-router / stream-db, ok, ai-retry-rule 多个 topic 的 spec/plan/overall 复盘
- 影响：每次工作流浪费 4-5 轮交互在格式修复上
- 对策：gate-check.py 增加 frontmatter 自修复（读到嵌套自动提取到顶层）；或 review subagent task prompt 强制给出正确 frontmatter 模板

### F-02. 评审可被跳过——最严重的流程漏洞

用户要求跳过评审直接 PR，主 agent 执行了。MUST FIX bug 进入 main 分支。merge-worktree / pr-worktree skill 未检查评审文件存在性。

- 来源：llm-simple-router / adaptive-concurrency-v2
- 影响：bug 进入 main，最严重的流程违规
- 对策：pr-worktree skill 增加"评审文件存在性"前置检查；coding-workflow 扩展在 Phase 5 前强制验证 Phase 3-4 的 review 文件存在

### F-03. 各 Phase 缺少内建自检清单

9 条 MUST FIX 中 8 条是"应该想到但没想到"的遗漏（异常传播缺失、对称路径遗漏、迁移遗漏）。AI 倾向于覆盖 happy path，边缘场景在写的时候自己注意不到。

- 来源：跨 4 个项目反复出现。xyz-harness / coding-workflow-extension (overall), llm-simple-router / 2026-05-21 多个 topic
- 影响：50%+ 的 MUST FIX 可通过自检清单避免
- 对策：每个 Phase skill 末尾增加轻量自检清单
  - Spec：按生命周期维度逐条检查（spawn→运行→退出→清理）；每个 FR 枚举值是否都有对应 AC 断言
  - Plan：scope 覆盖声明（每个 spec 指标标注 adopted/rejected/postponed）
  - Dev：影响半径检查（修复 MUST FIX 时强制检查同路径相关调用点）；迁移用 checklist 驱动

---

## P1：显著影响质量或效率

### F-04. Gate 检查深度不统一

spec gate 检查 verdict/must_fix 字段值，plan gate 只检查文件存在。不同 Phase 的 gate 验证强度差异大。

- 来源：llm-simple-router / stream-db-plan, stream-db-overall
- 对策：所有 Phase gate 统一检查 frontmatter 关键字段（verdict + must_fix 数量）

### F-05. Spec→Plan→Test 指标传递断裂

Spec 的量化指标在 Plan 阶段未被显式采纳或拒绝；TC 编号与 Plan Task 无映射关系；Dev Phase scope 缩减未正式记录。

- 来源：llm-simple-router / ok-test, ok-overall, stream-db-test, 2026-05-21-overall
- 对策：
  - Plan 编写时显式标注每个 spec 指标的采纳状态（adopted/rejected/postponed）
  - test_cases_template.json 增加 `planTaskId` 和 `ac_ref` 字段
  - scope 缩减必须在 plan 中正式声明

### F-06. Subagent task prompt 缺少量化验收标准

task 只说"创建 TransportExecutor"，未说"简化 hook 到 20 行以下"，导致首轮失败。后端 subagent 21 分钟 vs 前端 2 分钟，粒度不均。

- 来源：llm-simple-router / ok-dev, stream-db-dev, xyz-harness / coding-workflow-extension
- 对策：task prompt 必须包含明确的输出验收标准（量化指标 + 文件路径 + 约束）

### F-07. Gate 无法区分"自动化测试"和"代码审查替代"

25/25 passed 表象掩盖了 44% 是代码审查替代。`test_execution.json` 格式无法反映真实测试覆盖。

- 来源：llm-simple-router / ai-retry-rule/test, ai-retry-rule/overall
- 对策：test_execution.json 增加 `verification_method` 字段（automated/code_review/manual）

### F-08. 多 topic 目录导致 gate 跨 topic 污染

`.xyz-harness/` 下存在多个历史 topic 时，gate 扫描了整个目录而非当前 topic，旧报告被纳入检查导致误判。

- 来源：xyz-agent / skill-use, agent-use
- 对策：gate-check.py 限定只扫描当前 topic 目录；支持 `--topic-dir` 显式参数

### F-09. Gate 竞态：stage_complete 写入 state 导致工作区变脏

`harness_stage_complete` 先更新 workflow-state.json，然后 gate 检查"工作区干净"——state.json 的修改导致工作区变脏，gate 永远失败。

- 来源：xyz-harness / 2026-05-16-spec
- 对策：gate 检查排除 `.xyz-harness/workflow-state.json`；或先运行 gate 再更新 state

---

## P2：改进效率或减少返工

### F-10. 审查分级 LOW 偏松 + 跨阶段积压

~20 条 LOW/INFO 从各阶段累积从未清理，其中 dev #4（requestLoggingHook no-op）直接导致 AC2 不达标。"预存行为"豁免被滥用——需求核心目标就是"消除 X"，却把 X 标为 LOW。缺乏"带条件通过"中间状态。

- 来源：llm-simple-router / monitor-recent-perf, 2026-05-21-overall, ai-retry-rule/spec
- 对策：收紧 LOW 准入标准；只有与本次需求完全无关的预存问题才可标 LOW；增加"带条件通过"中间状态

### F-11. 审查往返是最大时间消耗（30-40%）

6 轮审查 × 全量扫描。对于"改 1 行代码"的 MUST FIX 修复，全量重审成本不匹配。

- 来源：xyz-harness / coding-workflow-extension (overall)
- 对策：MUST FIX 修复后支持增量审查（只审 diff）；或根据 MUST FIX 数量决定全量/增量

### F-12. Retrospect 流程缺陷

两种异常：①被跳过——gate pass 后用户立即说话，系统跳过了 retrospect；②被过早触发——review fail 后就 dispatch retrospect，基于不完整数据写成。

- 来源：llm-simple-router / stream-db-plan, ok-test
- 对策：phase-start 强制检查 retrospect 文件存在（已实现但需验证覆盖率）；retrospect 只在 gate pass + review pass 后才触发

### F-13. 修复 MUST FIX 缺少影响半径检查

修 catch 块时没考虑同路径其他调用点，v2→v3 又发现回归。缩进修复引入新缩进回归，缩进占了全部 MUST FIX 的 ~40%。

- 来源：llm-simple-router / 2026-05-21-dev, 2026-05-21-overall, xyz-agent / agent-use
- 对策：修复 MUST FIX 时强制执行"同路径相关调用点检查"；对缩进修复使用 whitespace-fixer skill 而非手动编辑

### F-14. Spec 阶段数据模型验证不足

写 FR 时不 grep 真实代码，假设字段值一定存在。Plan 伪代码直接传播错误到实现（parseMappingReason 伪代码假设 `parsed.stages` 是对象包裹数组，DB 实际存纯数组）。

- 来源：跨 4 个 topic 反复出现。llm-simple-router / monitor-recent-perf, client-session-config, ai-retry-rule, issue-feature
- 对策：FR 编写前增加"数据模型预检"——涉及 DB 字段或 API 响应体的 FR，先 grep 该字段的读写方式；Plan 中涉及 DB JSON 字段的伪代码必须标注数据来源和实际序列化格式

### F-15. Plan 阶段写死代码增加审查噪音

`resolveModel()` 在 plan 中被写出但从未被调用，从 Phase 2 带到 Phase 3 仍未清理。

- 来源：xyz-harness / coding-workflow-extension (plan_retrospect)
- 对策：Plan skill 增加规则——plan 中只写接口签名和调用关系，不写实现代码

### F-16. TDD RED 阶段 subagent 写的测试偏离实际设计

TC 要求 loopConfig 嵌套在 stage 中、调用不存在的 StateManager 方法。根因：subagent 没有足够上下文理解 spec 设计。

- 来源：xyz-harness / 2026-05-16-spec
- 对策：TDD subagent 的 task prompt 必须传递 spec 的关键数据模型定义，而非只传"为 X 写测试"

---

## P3：方法论完善

### F-17. Expert-reviewer skill 缺少"接口对称性"检查维度

同一文件内相似代码路径的接口不对称问题反复出现，审查方法论没有"检查调用方是否使用了被审查函数的全部返回值"这一项。

- 来源：xyz-harness / coding-workflow-extension (overall)

### F-18. 审查缺乏"向后兼容性"固定检查维度

pre_route phase 不再被 emit 的问题第 3 轮才被发现。

- 来源：llm-simple-router / 2026-05-21-spec, 2026-05-21-overall

### F-19. 审查缺乏"组合异常场景"系统性覆盖

当前审查主要检查 happy path 完整和单点错误修复，对"多个错误同时发生"缺乏检查项。

- 来源：llm-simple-router / 2026-05-21-dev, 2026-05-21-overall

### F-20. 审查缺乏"字段命名一致性"检查

`ctx.metadata.get('resilienceResult')` vs `ctx.resilienceResult` 的不一致在 spec/plan/dev 三阶段都未被捕获。

- 来源：llm-simple-router / 2026-05-21-overall

### F-21. E2E test plan 与 test case template 冗余

两份测试描述重叠严重，维护开销大。

- 来源：xyz-harness / coding-workflow-extension (test_retrospect)
- 对策：template 即 E2E plan，或 E2E plan 引用 template case ID

### F-22. Spec 模板应增加 NFR 章节和 Risk 章节

性能、安全、兼容性约束分散在各个 FR 中，集中呈现有助于评审。

- 来源：dag-executor / deploy-plugin-package

### F-23. Brainstorming skill 缺少"失败场景"引导

3 条 MUST_FIX（升级回滚、依赖安装回滚、日志端点生命周期）是关于"失败怎么办"的，本应在 brainstorming 阶段的边界探索中被提出。

- 来源：dag-executor / deploy-plugin-package

### F-24. Pi Extension 无法脱离运行时做单元测试

24 个 test case 全部通过静态代码路径分析完成，异步行为、竞态条件、TUI 渲染完全未验证。

- 来源：xyz-harness / coding-workflow-extension (test_retrospect)
- 对策：构建通用 Pi mock harness（ctx、pi、processRegistry 的 stub + 断言工具）

### F-25. 测试 evidence 格式自由文本

`evidence: "looks good"` 也能通过 gate。建议改为结构化格式 `{file, line, assertion}`。

- 来源：xyz-harness / coding-workflow-extension (test_retrospect)

### F-26. Rebase 后自动编译检查

rebase origin/main 后测试文件 import 路径因并行分支重构失效。

- 来源：llm-simple-router / monitor-recent-perf
- 对策：rebase 步骤后增加 `tsc --noEmit`

### F-27. Phase 4 test skill 对"无运行时环境"场景指导不足

skill 说"execute test cases"，但对 Pi Extension 这类无法在 Pi 外运行的产出物，"execution" 的定义是模糊的。

- 来源：xyz-harness / coding-workflow-extension (test_retrospect)

---

## 正面发现（值得保持）

### P-01. 审查分级准确率 100%，无 false positive

6 轮审查中未出现"MUST FIX 标记但实际上没问题"的情况，MUST FIX / LOW / INFO 分级全部命中真问题。

- 来源：xyz-harness / coding-workflow-extension + dag-executor / deploy-plugin-package

### P-02. 评审独立验证价值被反复确认

评审 agent 发现的问题总和远大于用户发现的。典型案例：评审独立发现 parseMappingReason 数据格式 bug，TDD 因共享错误假设未检测到。

- 来源：llm-simple-router / issue-feature, adaptive-concurrency-v2, ai-retry-rule

### P-03. "禁码铁律"被严格执行

主 agent 确实没有写任何实现代码，只做调度。

- 来源：llm-simple-router / stream-db-dev, stream-db-overall

### P-04. 第二轮审查能发现第一轮遗漏

v1 关注 MUST FIX，v2 有精力发现跨函数接口不一致。两轮审查的注意力分布不同，v2 做回归验证时顺便发现新问题。

- 来源：xyz-harness / coding-workflow-extension (plan_retrospect)

### P-05. Phase 1 投入过半时间但产出质量高

16 stage 流水线中，需求/spec/plan/评审占 54% 时间，但 Phase 2 基本无返工。

- 来源：xyz-harness / 2026-05-16-spec

---

## 与已有 Gap 的对照

对比 `docs/harness-current-state-assessment.md` 中的已知 gap，复盘数据提供了实证：

| 已知 Gap | 复盘验证 | 新发现 |
|---------|---------|--------|
| G2.3 不可逆操作仅靠文字约束 | **验证**：评审被跳过、PR 未检查评审 | 需要硬性前置检查 |
| G3.2 无 Stage 级追踪 | **验证**：scope 缩减无记录 | Plan 需显式 scope 声明 |
| G4.1 Review 无增量模式 | **验证**：审查占 30-40% 时间 | MUST FIX 修复后应支持增量审查 |
| G4.3 无 Spec→Test 追溯 | **验证**：TC↔Task 无映射 | 需要 planTaskId + ac_ref |
| — | **新发现**：frontmatter 嵌套是 P0 | 8+ 次重复出现 |
| — | **新发现**：自检清单缺失是 MUST FIX 主因 | 8/9 = 遗漏型 MUST FIX |
| — | **新发现**：gate 跨 topic 污染 | 多项目环境系统性问题 |
| — | **新发现**：LOW 偏松 + 积压 | 需要分级制度收紧 |

---

## AI 行为模式汇总

从复盘中提取的 AI 系统性弱点，用于指导 skill 设计：

| 行为模式 | 出现频率 | 典型表现 | 防御机制 |
|---------|---------|---------|---------|
| 覆盖 happy path，忽略失败场景 | 极高 | spawn 失败、并发启动无防护、abort 无清理 | 生命周期维度自检清单 |
| "写完一边忘了另一边" | 高 | review 有进程追踪，retrospect 没有 | 对称性检查清单 |
| 凭记忆而非实证写 spec | 中 | handler 数量写"37 种"实际 28 个 | FR 编写前 grep 真实代码 |
| 决策修改后未全文搜索 | 中 | 删除文件后 AC 仍引用 | 决策变更后强制 grep |
| 对外部系统行为的假设未验证 | 低 | 假设 XML prompt 注入能触发事件 | TDD/E2E 阶段验证假设 |
| 修复引入回归 | 中 | 修缩进导致新缩进回归、修 catch 漏其他调用点 | 影响半径检查 |
| Plan 写死未验证的代码 | 中 | resolveModel() 死代码从 Phase 2 带到 Phase 3 | Plan skill 限制只写接口 |
