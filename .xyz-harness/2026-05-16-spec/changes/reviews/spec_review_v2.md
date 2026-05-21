---
review:
  type: spec_review
  round: 2
  timestamp: "2026-05-16T21:30:00"
  target: "spec.md"
  verdict: fail
  summary: "Spec评审第2轮，v1的13条MUST FIX已全部修复，但新发现2条MUST FIX（函数签名与代码库不一致），需修改后重审"

statistics:
  total_issues: 5
  must_fix: 2
  low: 2
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "§已有基础设施 — 关键函数签名表"
    title: "StateManager.advanceTo 签名与代码库不一致"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "§已有基础设施 — 关键函数签名表"
    title: "GateRunner.run 签名与代码库不一致"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "D12 类型系统扩展"
    title: "currentPhase 行号标注偏差（types.ts:11 非 types.ts:12）"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "D4.4 通用证据 JSON 格式"
    title: "state.completedItems 的去重逻辑与 D13 时序规则的关系可进一步明确"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 5
    severity: INFO
    location: "§验收标准 AC4"
    title: "AC4 的三种 ERROR 场景（CDP 断开/元素找不到/API 超时）在 v1 LOW #15 基础上已改善，记录观察"
    status: open
    raised_in_round: 2
    resolved_in_round: null
---

# Spec 评审 v2

## 评审记录
- 评审时间：2026-05-16 21:30
- 评审类型：Spec 独立评审（第 2 轮）
- 评审对象：spec.md（修复后版本）
- 评审轮次：第 2 轮
- v1 报告：spec_review_v1.md（13 条 MUST FIX）

### v1 MUST FIX 修复验证

| v1 # | 问题 | 修复方式 | 验证结果 |
|------|------|---------|---------|
| 1 | `harness_loop_round_complete` 工具参数签名未定义 | 新增 D10 章节，定义 `LoopRoundCompleteParams` 和 `LoopExitParams` | ✅ 已修复 |
| 2 | `itemSource: "plan_tasks"` 提取逻辑未定义 | 新增 D11 章节，定义提取步骤和字段映射 | ✅ 已修复 |
| 3 | `currentPhase` 类型 `1 | 2` 需扩展 | 新增 D12 章节，明确改为 `1 | 2 | 3 | 4` | ✅ 已修复 |
| 4 | Phase 3 Stage A 健康检查失败回退目标不明确 | D7.3 明确回退到 Stage 10（编码实现） | ✅ 已修复 |
| 5 | `{topicDir}` 替换时机未说明 | D13 数据流时序规则 #1 明确引擎初始化时从 WorkflowState 读取并替换 | ✅ 已修复 |
| 6 | 缺少数据流图 | 新增 D13 章节，包含数据流图 + 6 条时序规则 + JSON 写入规则 | ✅ 已修复 |
| 7 | AC1 与 D9 确认点矛盾 | D9 明确标注"Phase 2→Phase 3 过渡无确认（AC1）" | ✅ 已修复 |
| 8 | L2 检查实现方式未说明 | D4.5 明确"复用现有 gate-verifier.ts 的 verifyGateL2 框架" | ✅ 已修复 |
| 9 | Phase 3 使用字母编号与 number 类型冲突 | D8 重新分配为数字编号 Stage 13 + Loop | ✅ 已修复 |
| 10 | 缺少函数签名表和技术债务 | 已有基础设施章节新增"关键函数签名表"和"已知技术债务"子表 | ✅ 已修复 |
| 11 | 数据结构章节不充分 | 数据结构章节现引用 D4.4/D7.1/D13 并补充读写规则 | ✅ 已修复 |
| 12 | `state.completedItems` 计算时机未说明 | D13 时序规则 #3 明确引擎每轮结束遍历 rounds 统计 | ✅ 已修复 |
| 13 | `harness_loop_start` prompt 注入方式未说明 | D5 步骤 2 改为"引擎发送 round prompt"（通过工具交互隐含说明），D10 定义工具行为 | ⚠️ 基本修复（见 LOW #4） |

**v1 结论：13/13 MUST FIX 已全部修复。**

### 六要素覆盖矩阵

| 要素 | 覆盖状态 | 说明 |
|------|---------|------|
| Outcomes | ✅ | 明确终态：AI 只做执行不做法官，四阶段重组结构完整 |
| Scope boundaries | ✅ | in-scope 9 项 + out-of-scope 5 项，边界清晰 |
| Constraints | ✅ | C1-C7 覆盖依赖、编号、Gate 模型、上下文隔离、确认点、Loop 上限、AI 角色 |
| Decisions made | ✅ | D1-D13 共 13 项决策，每项有方案描述和理由 |
| Verification | ✅ | AC1-AC13 共 13 条，每条有场景和验证方式 |
| 已有基础设施 | ✅ | 12 项基础设施 + 关键函数签名表（有签名问题，见 MUST FIX #1/#2）+ 技术债务表 |

### 自包含性检查

v1 的主要自包含性缺陷（工具签名缺失、itemSource 解析、数据流、回退机制）已全部通过 D10-D13 补充。以下逐项复核：

| 检查项 | 判定 |
|--------|------|
| 文件路径完整性 | ✅ 所有引用均从项目根写完整，如 `extensions/coding-workflow/loop-engine.ts` |
| 函数签名明确 | ⚠️ 关键函数签名表有 2 处与代码库不一致（见 MUST FIX #1/#2） |
| 接口/类型定义位置 | ✅ D12 标注了 types.ts 中的类型扩展位置 |
| 无隐含知识 | ✅ 不存在"大家都知道"类假设 |
| 无模糊引用 | ✅ 无"那个文件"类不精确引用 |

### 发现的问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 1 | MUST FIX | 类型签名 | §已有基础设施 — 关键函数签名表 | `StateManager.advanceTo` 签名写为 `(state, targetStage: number)`，实际签名为 `(state, completedStage: number, nextStage: number, nextPhase: 1 \| 2, summary: string, nextStageName?: string)`。spec 的签名遗漏了 4 个必需参数。Phase 2 agent 按错误签名调用会导致编译错误。 | 修正为：`advanceTo(state, completedStage: number, nextStage: number, nextPhase: 1\|2\|3\|4, summary: string, nextStageName?: string)` |
| 2 | MUST FIX | 类型签名 | §已有基础设施 — 关键函数签名表 | `GateRunner.run` 签名写为 `(script: string, args: string[], signal?) => Promise<GateResult>`，实际签名为 `(gateNumber: string, projectRoot: string, signal?) => Promise<GateResult>`。无 `args: string[]` 参数，第二个参数是 `projectRoot`。 | 修正为：`run(gateNumber: string, projectRoot: string, signal?: AbortSignal) => Promise<GateResult>` |
| 3 | LOW | 准确性 | D12 | `WorkflowState.currentPhase` 标注为 `types.ts:12`，实际在 `types.ts:11`。StageDefinition.phase 标注为 `types.ts:49`，实际约在 `types.ts:47`。行号偏差不影响实现但影响精确定位。 | 更新行号为实际值 |
| 4 | LOW | 自包含性 | D5 步骤 2 + D10 | v1 #13 关于"Loop prompt 注入方式"已基本修复（D5 说"引擎发送 prompt"，D10 说工具由 index.ts 注册），但 D5 步骤 2 的"AI 收到 `harness_loop_start` prompt"仍然未明确注入机制（是 sendMessage？是 system prompt 追加？还是注册为工具后的自动注入？）。鉴于 D10 已定义了 `harness_loop_round_complete` 工具的行为，推测 prompt 通过 `sendMessage` 注入。这不会阻塞实现，但 Phase 2 agent 需要自行推断。 | 建议在 D5 步骤 2 增加一句说明注入方式（如"引擎通过 pi.sendMessage 注入 round prompt"） |
| 5 | INFO | 观察 | AC4 | v1 LOW #15 指出 AC4 触发条件模糊。本轮 AC4 已改善，明确列出三种 ERROR 场景（CDP 连接断开、元素找不到、API 超时）。记录改善。 | 无需操作 |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

### 结论

需修改后重审

### Summary

Spec 评审完成，第 2 轮。v1 的 13 条 MUST FIX 已全部修复，文档质量显著提升。本轮新发现 2 条 MUST FIX（关键函数签名表中有 2 处签名与代码库不一致：`StateManager.advanceTo` 遗漏 4 个参数、`GateRunner.run` 参数列表完全错误），需修改后重审。另有 2 条 LOW + 1 条 INFO。
