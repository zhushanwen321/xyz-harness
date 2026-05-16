---
review:
  type: plan_review
  round: 2
  timestamp: "2026-05-16T16:30:00"
  target: ".xyz-harness/2026-05-16-spec/plan.md"
  verdict: pass
  summary: "计划评审完成，第2轮，0条MUST-FIX，4条LOW，3条INFO，结论：通过"

statistics:
  total_issues: 7
  must-fix: 0
  must-fix_resolved: 5
  low: 4
  info: 3

v1_must-fix_resolution:
  - id: v1-1
    title: "T2+T3 同文件合并"
    status: resolved
    resolution: "T3 已标记为'已并入 T2'，Group 2 说明合并为一个 agent 执行，Wave 2 写为 [T2+T3]。保留 T3 编号用于需求追溯，实际执行合并。"
  - id: v1-2
    title: "requiresConfirmation Stage 15"
    status: resolved
    resolution: "T2 验收标准已修正为 Stage 2/8/15，并添加注释说明 Spec D9 编号歧义及 plan 选择理由。Spec D9 已同步修正。"
  - id: v1-3
    title: "T4 依赖 T9"
    status: resolved
    resolution: "T4 头部显式声明依赖 T9，依赖图显示 T9→T4→T7，Wave 编排将 T9 放在 Wave 1 先于 Wave 3 的 T4。"
  - id: v1-4
    title: "T8 依赖修正"
    status: resolved
    resolution: "T8 头部仅声明依赖 T1，依赖图中 T8 仅连接 T1。"
  - id: v1-5
    title: "Phase 3 控制流"
    status: resolved
    resolution: "T7 新增 5 步 Phase 3 控制流详细说明，覆盖 Stage 13 pass → Loop 初始化 → Loop 执行 → Gate PASS → Stage 14 推进完整链路。"

issues:
  - id: 1
    severity: LOW
    location: "plan.md > Wave 3 描述"
    title: "Wave 3 描述写'依赖 T1+T3'但 T3 已并入 T2，应为'依赖 T1+T2+T9'"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "T4 头部正确列出依赖 T1+T2(LoopConfig)+T9，依赖图也正确。但 Wave 编排中 Wave 3 描述仍写'依赖 T1+T3'，T3 已并入 T2 且遗漏了 T9。实际执行顺序正确（T9 在 Wave 1 先完成），仅描述文字未同步更新。"
    suggestion: "将 Wave 3 描述改为'依赖 T1+T2（含 T3）+T9'"

  - id: 2
    severity: LOW
    location: "plan.md > Wave 4 描述"
    title: "Wave 4 描述写'依赖 T5, T4'但 T8 仅依赖 T1"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "Wave 4 写 [T6, T8] 并行（依赖 T5, T4），但 T8 只依赖 T1。T8 放在 Wave 4 不影响正确性（T1 在 Wave 1 已完成），但 Wave 4 描述暗示 T8 也需要等 T4 和 T5，这是不准确的。"
    suggestion: "将 Wave 4 描述改为'（T6 依赖 T5, T4；T8 依赖 T1）'"

  - id: 3
    severity: LOW
    location: "plan.md > T2 Stage→Gate 映射表"
    title: "映射表中 Stage 15（复盘）标注为无 gate，但原 Stage 16 也无 gate——需确认是否有意为之"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "映射表显示旧 Stage 16（复盘）和新 Stage 15（复盘）均无 gate。当前 stages.ts 中 Stage 16 的 requiresConfirmation=true，但不设 gate。复盘 stage 由 harness-reviewer subagent 执行并产出报告，无自动化验证——这是合理的。但 Stage 15 的 deliverables 包含 retrospective.md 和 metrics.json，没有 contentCheck。建议考虑是否需要添加 yaml_verdict 检查。"
    suggestion: "这是已有设计决策，不改也可。如果想增强，可在 T2 验收标准中为 Stage 15 的 retrospective.md 添加 yaml_verdict contentCheck。"

  - id: 4
    severity: LOW
    location: "plan.md > T12 > 验收标准"
    title: "T12 集成验证仍估算 ~50 行，v1 已指出偏低"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "v1 Issue #10 指出 T12 的 50 行估算偏低（需覆盖 Phase 2→3 过渡、Loop 初始化、Gate PASS/FAIL、Phase 3→4 过渡、确认点、向后兼容共 7 个场景）。当前 plan 未调整估算。工作量文件表中写了 ~150 行但 Task 描述仍写 ~50 行——两处自相矛盾。"
    suggestion: "统一 T12 估算为 ~150 行（与文件表一致）。"

  - id: 5
    severity: INFO
    location: "plan.md > Execution Groups > Group 3"
    title: "Group 3 标题仍为'串行依赖'但 T6 和 T8 可并行"
    status: open
    raised_in_round: 1
    resolved_in_round: null
    detail: "v1 Issue #11 已记录。T6 依赖 T5，T8 依赖 T1——两者互不依赖，可并行。但 Group 3 标题仍写'串行依赖'。实际上 Wave 4 已将 T6 和 T8 并行排列，仅 Group 3 标题未更新。"
    suggestion: "Group 3 标题改为'Loop 引擎 + Gate + State Manager（T4 串行，T6/T8 可并行）'"

  - id: 6
    severity: INFO
    location: "plan.md > T10 风险点"
    title: "T10 向后兼容策略已补充双模式说明，但缺少'检测 Loop 引擎是否存在'的具体机制"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "T10 风险点提到'Agent 通过检查 evidenceFile 环境变量是否存在来判断模式'——这是一个合理的运行时检测方案。但没有说明环境变量由谁注入（index.ts 的 Loop 初始化？）。建议在 T7 或 T10 中明确注入机制。"

  - id: 7
    severity: INFO
    location: "plan.md > T4 验收标准"
    title: "T4 提到'单元测试覆盖核心状态转换'但本项目暂无自动化测试"
    status: open
    raised_in_round: 2
    resolved_in_round: null
    detail: "CLAUDE.md 质量门禁写 'echo \"no tests yet\"（本项目暂未编写自动化测试）'。T4 验收标准中'单元测试覆盖核心状态转换'与项目现状矛盾。如果 T4 的测试属于本次新增的测试代码（合理），则应在 T12 集成验证或单独文件中明确。如果指现有测试框架，则当前项目无此框架。"
    suggestion: "将 T4 的'单元测试覆盖核心状态转换'移到 T12 集成验证范围，或明确标注为'新增测试文件'。"
---

# 计划评审 v2

## 评审记录
- 评审时间：2026-05-16 16:30
- 评审类型：计划评审（第 2 轮）
- 评审对象：`.xyz-harness/2026-05-16-spec/plan.md`（对照 `spec.md`）
- 前置审查：plan_review_v1.md（5 条 MUST-FIX）

## v1 MUST-FIX 验证

逐条验证 v1 的 5 条 MUST-FIX 是否在当前 plan 中已修复：

| v1# | 问题 | 验证结果 |
|-----|------|---------|
| 1 | T2+T3 同文件合并 | ✅ 已修复。T3 标记为"已并入 T2"，Group 2 说明合并执行，Wave 写为 [T2+T3]。保留 T3 编号用于追溯。 |
| 2 | requiresConfirmation Stage 15 | ✅ 已修复。T2 验收标准明确 Stage 2/8/15，添加了注释解释 Spec D9 编号歧义。Spec D9 已同步修正为 Stage 15。 |
| 3 | T4 依赖 T9 | ✅ 已修复。T4 头部列出 T9 依赖，依赖图显示 T9→T4，Wave 1 先执行 T9。Wave 3 描述有小瑕疵（见 Issue #1），但不影响执行。 |
| 4 | T8 依赖修正 | ✅ 已修复。T8 头部和依赖图仅连接 T1。Wave 4 描述有小瑕疵（见 Issue #2），但不影响执行。 |
| 5 | Phase 3 控制流 | ✅ 已修复。T7 新增 5 步控制流说明：Stage 13 pass → 检测 Phase 3 → 初始化 LoopEngine → Loop 执行（不走 harness_stage_complete）→ Gate PASS → advanceTo(13, 14, 4) → 恢复线性推进。 |

**结论：5 条 MUST-FIX 全部已修复。**

## Spec 与 Plan 一致性复核

### v1 已覆盖项重新确认

| Spec 需求项 | Plan 覆盖 | 状态 |
|------------|----------|------|
| D1 Phase 2/3/4 拆分 | T2 | ✅ |
| D2 证据-判定分离 | T4 + T5 + T6 | ✅ |
| D3 JSON status 语义 | T4 + T10 | ✅ |
| D4 通用 Loop 抽象 | T2(LoopConfig) + T4(引擎) | ✅ |
| D5 Loop 执行流程 | T4 | ✅ |
| D6 E2E Loop 配置 | T2 | ✅ |
| D7 E2E 专用定制 | T9 + T4 | ✅ |
| D8 Stage 编号重分配 | T2 + 映射表 | ✅ |
| D9 确认点 | T2（已修正为 Stage 2/8/Phase 3 出口/Stage 15） | ✅ |
| D10 Loop 工具参数 | T7 | ✅ |
| D11 itemSource 解析 | T5（item_coverage 内部实现） | ✅ |
| D12 类型系统 | T1 | ✅ |
| D13 数据流 | T4 + T8 | ✅ |
| C1-C7 约束 | 全局 | ✅ |
| AC1-AC13 | T12 | ✅ |

### 新增一致性检查

**Plan 是否有超出 Spec 范围的内容？**

- T11（向后兼容处理）：Spec AC13 要求向后兼容，T11 实现了 legacy 检测和自动映射。✅ 在范围内。
- Stage→Gate 映射表（T2 附属）：Spec 没有显式要求映射表，但 C2（Stage 编号兼容性）隐含需要。✅ 合理补充。

**Plan 是否有遗漏 Spec 的内容？**

- Spec D7.3（集成健康检查失败回退到 Stage 10）：Plan T7 的 Phase 3 控制流没有明确提到健康检查失败时的回退路径。不过 spec D7.3 说"引擎自动执行 harness_rollback 回退到 Stage 10"，这属于 Loop 引擎内部行为。T4 的验收标准"init() 创建空 evidence JSON"只覆盖了成功路径。Stage 13 是独立的 automated stage（非 Loop 内部），其健康检查失败应通过现有的 `harness_stage_complete` 错误处理触发 `harness_rollback`。逻辑上可行，但 plan 没有显式说明这条回退路径。
  → 评估：这是 spec 提到的��为，plan 通过现有机制（Stage 13 fail → rollback）隐含覆盖。不标 MUST-FIX，因为 Stage 13 的健康检查失败属于 gate/交付物验证失败的标准流程，现有 `harness_stage_complete` handler 已有 fail 处理。但 plan 最好显式提及。

## Plan 可行性评估

**依赖关系正确性**：修正后关键路径为 T1 → T2 → T4 → T7，总串行深度 4 层。T9/T10/T5/T8/T6 均可并行或提前执行。编排合理。

**工作量估算**：~820 行新代码 + 728 行 index.ts 改动 + 342 行 stages.ts 改动。index.ts 是最大改动点（+120 行 Loop 命令 + ~30 行向后兼容 = ~150 行），对照现有 728 行规模，增量合理。但 T12 估算（50 行 vs 实际需要 150 行）偏低。

**技术风险**：
- Loop 状态机正确性：plan 识别了风险点但未设计专项测试。T12 覆盖但估算不足。
- Phase 3 非线性控制流 vs 现有线性推进：plan 的 5 步说明清晰，但实现时 index.ts 的 `harness_stage_complete` handler 需要新增 Phase 3 分支——~30-50 行条件逻辑，plan 估算了 ~120 行给 T7（含 Loop 命令注册），基本够用。

**Execution Groups 合理性**：
- Group 1-5 文件互不冲突（除已合并的 T2+T3 和 T7+T11）✅
- 每组 ≤3 个文件 ✅
- Wave 依赖顺序正确 ✅
- Subagent 配置（model 选择）合理 ✅

## 发现的新问题

### Issue #1（LOW）：Wave 3 描述与依赖图不一致

**位置**：plan.md > 执行顺序 > Wave 3

**问题**：Wave 3 写 `[T4] 串行（依赖 T1+T3）`，但 T3 已并入 T2，且 T4 头部声明依赖 T1+T2+T9。实际执行顺序正确（Wave 1 的 T9 先完成，Wave 2 的 T2 先完成），仅 Wave 3 描述文字未更新。

**建议**：改为 `[T4] 串行（依赖 T1+T2+T9）`。

### Issue #2（LOW）：Wave 4 描述 T8 依赖不精确

**位置**：plan.md > 执行顺序 > Wave 4

**问题**：Wave 4 写 `[T6, T8] 并行（依赖 T5, T4）`，但 T8 仅依赖 T1（Wave 1 已完成），不需要等 T5/T4。将 T8 放在 Wave 4 不影响正确性，但描述暗示了不存在的依赖。

**建议**：改为 `[T6, T8] 并行（T6 依赖 T5+T4; T8 依赖 T1，可提前至 Wave 3）`。

### Issue #3（LOW）：Stage 15 复盘无 gate 无 contentCheck

**位置**：plan.md > T2 Stage→Gate 映射表

**问题**：映射表显示 Stage 15（复盘）无 gate。当前 Stage 16（复盘）也无 gate，这是已有设计。但 Stage 15 的 deliverables（retrospective.md）没有 yaml_verdict 检查，意味着复盘报告可以是空文件也能通过。

**建议**：这是已有设计决策，不影响本次改动。如需增强可在 Stage 15 的 deliverables 中添加 contentCheck。

### Issue #4（LOW）：T12 工作量估算自相矛盾

**位置**：plan.md > T12 > 文件表 vs Task 描述

**问题**：T12 文件表写 ~150 行，但 Task 描述中写 ~50 行。v1 Issue #10 已指出偏低，当前 plan 未修正。

**建议**：统一为 ~150 行。

### Issue #5（INFO）：Group 3 标题与实际编排不匹配

**位置**：plan.md > Execution Groups > Group 3

**问题**：v1 Issue #11 已记录。Group 3 标题写"串行依赖"但 Wave 4 已将 T6/T8 并行。标题未更新。

### Issue #6（INFO）：T10 向后兼容检测机制未明确

**位置**：plan.md > T10 风险点

**问题**：T10 说"Agent 通过检查 evidenceFile 环境变量是否存在来判断模式"，但未说明环境变量由谁注入。应在 T7（Loop 初始化）或 T10 中明确。

### Issue #7（INFO）：T4 单元测试 vs 项目无测试框架

**位置**：plan.md > T4 验收标准

**问题**：T4 验收标准写"单元测试覆盖核心状态转换"，但 CLAUDE.md 质量门禁写"no tests yet"。如果这是本次新增测试代码，应在 T12 或 T4 中明确标注。

## 结论

**通过**。v1 的 5 条 MUST-FIX 全部已修复。本轮发现 0 条 MUST-FIX、4 条 LOW（Wave 描述不精确、T12 估算矛盾）、3 条 INFO。

Wave 描述文字不精确不影响执行正确性（实际依赖顺序和执行编排都是正确的）。T12 估算矛盾是文档一致性问题。这些可在执行时由 subagent 自行调整。

> 优先级定义：
> - **MUST-FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作
