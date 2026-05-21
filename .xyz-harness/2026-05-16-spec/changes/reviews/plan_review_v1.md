---
review:
  type: plan_review
  round: 1
  timestamp: "2026-05-16T15:30:00"
  target: ".xyz-harness/2026-05-16-spec/plan.md"
  verdict: fail
  summary: "计划评审完成，第1轮，5条MUST-FIX，需修改后重审"

statistics:
  total_issues: 12
  must-fix: 5
  must-fix_resolved: 0
  low: 5
  info: 2

issues:
  - id: 1
    severity: MUST-FIX_
    location: "plan.md > Execution Groups > Group 2"
    title: "T2 与 T3 修改同一文件 stages.ts 但被放在同一 Group 并行执行"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: MUST-FIX_
    location: "plan.md > T2 验收标准"
    title: "Stage 15 requiresConfirmation=true 但 spec D9 表格列出 Stage 14 为确认点"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: MUST-FIX_
    location: "plan.md > Wave 编排 > Wave 3"
    title: "T4（Loop 引擎）依赖链不完整——缺少对 T9（Prompt 模板）的显式依赖声明"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 4
    severity: MUST-FIX_
    location: "plan.md > 依赖关系图"
    title: "T8 依赖声明错误：显示依赖 T1+T4，但实际只需要 T1（类型定义）"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 5
    severity: MUST-FIX_
    location: "plan.md > T7 验收标准 + T11"
    title: "Phase 3→4 过渡设计不完整——缺少 Stage 13→Loop 启动→Gate PASS→Stage 14 的完整控制流描述"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 6
    severity: LOW
    location: "plan.md > T2 风险点"
    title: "Stage 编号从 16 减至 15 后 gate 脚本编号映射表缺失"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 7
    severity: LOW
    location: "plan.md > T1 风险点"
    title: "遗漏了 state-manager.ts 中 startStage/advanceTo/rollback 的 phase 参数签名变更"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 8
    severity: LOW
    location: "plan.md > T5 验收标准"
    title: "L1 检查函数签名包含 itemSourcePath? 参数，但 itemSource 解析逻辑（D11）的 task 覆盖不明确"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 9
    severity: LOW
    location: "plan.md > T10 风险点"
    title: "T10 修改全局 agent 影响所有项目，但 plan 未说明向后兼容的具体实现策略"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 10
    severity: LOW
    location: "plan.md > T12"
    title: "集成验证（T12）仅描述为 ~50 行验证脚本，但作为端到端验证工作量明显低估"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 11
    severity: INFO
    location: "plan.md > Execution Groups"
    title: "Group 3 标题为串行依赖但包含 3 个独立 Task，编排方式未明确"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 12
    severity: INFO
    location: "spec.md > D8"
    title: "Spec 声称总共 15 Stage + 1 Loop，但 D9 Stage 15 确认点与 D8 Phase 4 Stage 14-15 的编号未统一说明"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录
- 评审时间：2026-05-16 15:30
- 评审类型：计划评审
- 评审对象：`.xyz-harness/2026-05-16-spec/plan.md`（对照 `spec.md`）

## Spec 完整性评估

### 1. 目标明确性：合格

Spec 目标清晰：将当前 Phase 2 拆分为 Phase 2/3/4，实现 E2E 测试的证据-判定分离。一段话能说清楚要做什么。

### 2. 范围合理性：合格

范围有明确边界（在范围/不在范围表格完整）。不在范围内的项目（Baseline 版本管理、Flaky 自动重试等）都有明确的暂缓理由。

### 3. 验收标准可量化性：合格

AC1-AC13 每条都有具体验证方式和场景描述。覆盖了关键流程转换。

### 4. 约束条件：合格

C1-C7 约束明确，行为约束的 Always/Never/Ask First 清晰可执行。

### 5. 已做决策：合格

D1-D13 决策记录完整，包含理由。数据结构、类型系统、数据流时序都有详细描述。

### 6. `[待决议]` 项

无显式标记，但 D11（itemSource 解析规则）提到"未来扩展其他 itemSource 时只需新增解析器"——当前仅支持 `plan_tasks`，这不是待决议项。

### 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | MUST-FIX | plan.md > Execution Groups > Group 2 | **T2 与 T3 修改同一文件 stages.ts 但被分在同一 Group**。Plan 正文已说明"T2 和 T3 修改同一文件，建议合并为一个 agent 执行"，但仍然将 T2 和 T3 列为 Group 2 中的两行——这意味着执行时要嘛合并（Group 名称含糊），要嘛冲突。若合并则 Group 2 实际只有 2 个 agent（T2+T3 合一，T5）；若不合并则有文件竞争。 | 方案 A：将 T2 和 T3 合并为一个 Task（T2 描述中已包含 LoopConfig 定义），Group 2 只需一个 agent 修改 stages.ts。方案 B：如果坚持分开，则 T3 必须排在 T2 之后串行执行，不能并行。推荐方案 A，因为两者是同一文件的同一次重构。 |
| 2 | MUST-FIX | plan.md > T2 验收标准 | **`requiresConfirmation` 仅 Stage 2/8/15 为 true，但 Spec D9 表格列出确认点为 Stage 2/8/Phase 3 出口/Stage 14**。Plan T2 写的是"Stage 15（自动复盘）"需要确认，但 Spec D9 写的是"Stage 14（Phase 4 复盘确认）"——D8 的编号表中 Stage 14=推送+CI+部署，Stage 15=自动复盘。Spec 内部自相矛盾：D9 表格说"Stage 14（Phase 4 终审）"，但 D8 的 Stage 14 是推送+CI+部署。Plan 选择了 Stage 15，但未解释为何不与 D9 对齐。 | (1) 先确认 Spec D9 中"Stage 14（Phase 4 终审）"实际指的应该是 Stage 15（自动复盘），还是说 Stage 14 应该是复盘。根据 D8 编号表，Stage 15 是自动复盘，Stage 14 是推送+CI+部署——推送不需要确认，复盘需要确认。所以应该是 Stage 15。(2) 修正 Plan T2 验收标准文字与 Spec D9 对齐：`requiresConfirmation` 仅 Stage 2/8/Phase 3 出口/Stage 15 为 true。(3) 同步修正 Spec D9 表格中的编号描述。 |
| 3 | MUST-FIX | plan.md > Wave 编排 > Wave 3 | **T4（Loop 引擎）依赖链不完整**。依赖关系图显示 "T4 依赖 T1+T3（loop-engine 需要类型 + Config）"，但 Loop 引擎的 `getPrompt()` 方法需要读取 round prompt 模板文件（T9），而 T9 被放在 Wave 1 且标注为 "T9 → T4 → T7"。但文字描述的 Wave 编排中 Wave 3 只列了 [T4]，没提 T9。如果 T4 的 `getPrompt()` 在编译期 import 了模板路径或读取模板文件，则 T4 运行时依赖 T9 的模板文件已存在。 | 两种处理：(1) 如果 T4 的 `getPrompt()` 使用运行时文件读取（`readFileSync` 模板文件），则 T9 必须在 T4 之前完成。将依赖图明确标注 T4 → T9。(2) 如果 T4 只是定义了模板路径常量（实际读取延迟到运行时），则 T4 不依赖 T9——但需在 T4 验收标准中说明"模板路径定义为字符串常量，不运行时读取"。当前 plan 的依赖图写了 `T9 → T4 → T7` 但 Wave 编排没有体现这个依赖，需要统一。 |
| 4 | MUST-FIX | plan.md > 依赖关系图 | **T8 依赖声明错误**。依赖图显示 "T8 依赖 T1 + T4（state manager 需要 LoopState 类型 + engine 初始化）"，但 T8（状态管理器 Loop 支持）的实际工作是：给 `WorkflowState` 加 `loopState?: LoopState` 字段 + 实现 `save()/load()` 序列化。这只需要 T1 的类型定义（`LoopState` 接口），不需要 T4（Loop 引擎实现）。`state-manager.ts` 不调用 `loop-engine.ts`——它只是存储和读取 LoopState 数据。 | 修正 T8 依赖为仅 T1。这将允许 T8 与 T4 并行执行（Wave 3 可以改为 [T4, T8] 并行），减少关键路径长度。 |
| 5 | MUST-FIX | plan.md > T7 验收标准 | **Phase 3→4 过渡设计不完整**。T7 列出了 Phase 2→3 过渡（Stage 12 pass 后自动触发 Loop 初始化）和 Phase 3→4 过渡（Gate PASS 后调用 advanceTo 推进到 Stage 14），但中间的控制流不清晰：Stage 13 pass 后如何进入 Loop？Loop 完成后如何回到 Stage 推进？当前 `index.ts` 的 `harness_stage_complete` 是基于线性 Stage 序列设计的——Stage 13 pass → findNextStage → Stage 14。但 Phase 3 中 Stage 13 是健康检查，pass 后不应该进入 Stage 14，而是进入 Loop。Plan 缺少对这一非线性的详细控制流描述。 | T7 需要补充完整的 Phase 3 控制流：(1) Stage 13（健康检查）通过 `harness_stage_complete` 完成 → 引擎检测到 Phase 3 且 Stage 13 pass → 不调用 findNextStage → 直接初始化 Loop 引擎。(2) Loop 执行期间不通过 `harness_stage_complete` 推进（Plan 已说明，但缺少具体实现路径——在 index.ts 的哪个分支处理？）。(3) Loop Gate PASS → 调用 `advanceTo` 从 Phase 3 推进到 Phase 4 Stage 14。(4) 需要明确 index.ts 中是否需要新增 Phase/Loop 状态分支，还是复用现有的 stage 推进逻辑。 |
| 6 | LOW | plan.md > T2 风险点 | **Stage 编号变更后 gate 脚本编号映射缺失**。T2 风险点提到"gate 脚本按 gateNumber 查找，与 stage number 无关"——这是对的。但原来 Stage 13→E2E 测试（gate_12）和 Stage 14→测试评审（gate_13）被移除/合并后，这些 gate 文件是删除还是保留？新编号下的 Stage 9-15 分别对应哪些 gate？需要一个映射表。 | 在 T2 验收标准中追加一条：产出 Stage → Gate 映射表（旧编号 → 新编号），列出哪些 gate 文件需要删除/新增/修改。 |
| 7 | LOW | plan.md > T1 风险点 | **遗漏了 state-manager.ts 的签名变更**。T1 风险点只提到 `index.ts` 和 `widget.ts` 使用 `currentPhase`，但 `state-manager.ts` 的 `startStage`、`advanceTo`、`rollback` 三个方法的 `phase` 参数类型都是 `1 \| 2`，扩展到 `1 \| 2 \| 3 \| 4` 是必须的。这虽然属于 T8 的范围，但 T1 作为"类型系统扩展"的 task 应识别所有需要变更的文件。 | 在 T1 风险点中补充 `state-manager.ts` 中 `startStage`/`advanceTo`/`rollback` 的 phase 参数签名变更。 |
| 8 | LOW | plan.md > T5 验收标准 | **L1 检查函数 `item_coverage` 需要 `itemSourcePath` 参数，但对应的 D11（itemSource 解析规则）没有对应的 Task**。T5 实现了 `item_coverage(evidence, config, planPath)` 需要 `planPath` 来解析 e2e-test-plan.md 的 YAML frontmatter，但解析 YAML frontmatter 提取 `test_groups[].cases[]` 的逻辑属于哪个 Task？如果是 T5 内部实现，应在 T5 验收标准中明确。如果复用已有的 YAML 解析（如 gates/common.ts 的 extractYamlBlock），也应说明。 | 在 T5 验收标准中追加：`item_coverage` 函数内部解析 e2e-test-plan.md 的 YAML frontmatter 提取 case 列表，依赖 `extractYamlBlock` + 简单的 YAML 行级解析（不引入新依赖，符合 C1）。 |
| 9 | LOW | plan.md > T10 风险点 | **T10 修改全局 agent 影响所有项目，但缺少向后兼容策略的具体实现**。风险点提到了这个问题，但只说"旧项目仍能使用旧语义"——如何做到？如果 agent.md 要求写 EXECUTED/ERROR，旧项目没有 Loop 引擎不认识这些 status。 | 在 T10 验收标准中补充：agent.md 应根据环境（是否有 Loop 引擎）切换语义，或者在描述中同时说明两种模式（有 Loop 时用 EXECUTED/ERROR，无 Loop 时用传统 PASS/FAIL）。或者将 T10 改为创建新 agent（`harness-e2e-loop-tester`），不影响旧 agent。 |
| 10 | LOW | plan.md > T12 | **集成验证工作量低估**。T12 估算 ~50 行，但需要验证：(1) Phase 2→3 自动过渡，(2) Loop 初始化，(3) 1 轮 Loop 完成 + JSON 写入，(4) Gate PASS/FAIL 行为，(5) Phase 3→4 过渡，(6) 确认点触发，(7) 向后兼容。这些验证点涉及状态机的多个分支，50 行代码不够覆盖。 | 将 T12 估算调整为 ~150-200 行，或拆分为多个验证场景文件。同时明确 T12 是手动集成测试还是自动化测试——当前描述模糊。 |
| 11 | INFO | plan.md > Execution Groups | **Group 3 标题为"串行依赖"但包含 3 个 Task**。T4/T6/T8 三个 Task 的文件互不冲突（loop-engine.ts / gate_phase3.ts / state-manager.ts），理论上 T6 和 T8 可以并行（T6 依赖 T5，T8 依赖 T1——修正 issue #4 后 T8 不依赖 T4）。Group 标题与实际编排不匹配。 | 澄清 Group 3 的执行方式：是串行执行 T4→T6→T8，还是 T4→[T6,T8] 并行？建议根据修正后的依赖图重新编排。 |
| 12 | INFO | spec.md > D8/D9 | **Spec D8 编号表与 D9 确认点编号不一致**。D8 中 Phase 4 是 Stage 14-15（推送+复盘），但 D9 表格说"Stage 14（Phase 4 终审）"需要确认。按 D8 语义，Stage 14 是推送+CI+部署，不需要确认；Stage 15 是自动复盘，才需要确认。这不是 Plan 的问题，但 Plan 应该识别并纠正 Spec 的不一致，而非盲目跟随或自行选择。 | Plan 应明确指出 Spec D9 的编号歧义，并给出 Plan 选择的解释。当前 Plan 选择了 Stage 15，这可能是正确的，但没有解释过程。 |

> 优先级定义：
> - **MUST-FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

### Spec 与 Plan 一致性逐条对照

| Spec 需求项 | Plan 覆盖 | 状态 |
|------------|----------|------|
| D1 Phase 2/3/4 拆分 | T2 Stage 定义重构 | ✅ 覆盖 |
| D2 证据-判定分离 | T4 Loop 引擎 + T5 L1 检查 + T6 Phase 3 Gate | ✅ 覆盖 |
| D3 JSON status 语义 | T4 + T10 | ✅ 覆盖 |
| D4 通用 Loop 抽象（D4.1-D4.5） | T3 LoopConfig 定义 + T4 引擎实现 | ✅ 覆盖 |
| D5 Loop 执行流程 | T4 引擎实现 | ✅ 覆盖 |
| D6 E2E Loop 具体配置 | T3 | ✅ 覆盖 |
| D7 E2E 专用定制（D7.1-D7.3） | T9 prompt 模板 + T4 evidence 格式 | ✅ 覆盖 |
| D8 Stage 编号重新分配 | T2 | ✅ 覆盖 |
| D9 确认点 | T2 | ⚠️ 编号不一致（见 Issue #2） |
| D10 Loop 工具参数签名 | T7 | ✅ 覆盖 |
| D11 itemSource 解析规则 | T5（隐含） | ⚠️ 缺少显式 Task（见 Issue #8） |
| D12 类型系统扩展 | T1 | ✅ 覆盖 |
| D13 数据流 | T4 + T8 | ✅ 覆盖 |
| C1 不新增外部依赖 | 全局约束 | ✅ 遵守 |
| C2 Stage 编号兼容性 | T2 + T11 | ⚠️ 缺映射表（见 Issue #6） |
| C3 Gate 模型一致性 | T6 | ✅ 覆盖 |
| C4 上下文隔离 | T7（Phase 2→3 过渡） | ✅ 覆盖 |
| C5 人工确认点 | T2 | ⚠️ 编号问题（见 Issue #2） |
| C6 Loop 最大轮数 | T4 | ✅ 覆盖 |
| C7 AI 不做判定 | T9 + T10 | ✅ 覆盖 |
| AC1-AC13 验收标准 | T12 集成验证 | ⚠️ 工作量低估（见 Issue #10） |

### Plan 可行性评估

**Task 粒度**：T1-T12 粒度适中，每个 Task 可由一个 subagent 独立完成。T2+T3 合并后更合理。

**依赖关系**：基本正确但有两处错误（Issue #3, #4），修正后关键路径可缩短。

**工作量估算**：总计 ~820 行、~1.5-2 小时。对照当前代码库规模（types.ts ~90 行、stages.ts ~190 行、state-manager.ts ~230 行、index.ts ~400 行），新增 180 行 loop-engine.ts 和 100 行 gates 扩展是合理的。但 T12 集成验证的 50 行估算偏低。

**技术风险**：
- Loop 状态机的正确性是最大风险——plan 识别了但没有详细说明状态转换测试策略
- Phase 3 的非线性控制流与现有线性 Stage 推进的冲突（Issue #5）
- 全局 agent 修改的向后兼容性（Issue #9）

### Execution Groups 合理性

**Group 1（T1/T9/T10）**：3 个 Task 文件互不冲突，可并行。✅

**Group 2（T2+T3/T5）**：T2 和 T3 同文件冲突，需合并或串行。❌（Issue #1）

**Group 3（T4/T6/T8）**：标题说"串行依赖"但 T6 和 T8 可并行。且 T8 依赖声明有误。⚠️（Issue #4, #11）

**Group 4（T7+T11）**：同文件合并合理。✅

**Group 5（T12）**：独立验证。✅

**Wave 编排**：Wave 1-6 依赖顺序基本正确，但 T4→T9 的依赖未体现（Issue #3）。

**Subagent 配置**：每个 Group 有 Agent（harness-executor）和 Model（glm-5.1 或 glm-5-turbo），但缺少"注入上下文"和"读取文件"的明确声明。按 SKILL.md 的检查维度，这属于"上下文充分性"问题——subagent 如何知道要读哪些文件？

### 结论

需修改后重审

### Summary

计划评审完成，第1轮，5条MUST-FIX，需修改后重审。主要问题集中在：(1) 同文件并行冲突，(2) Spec/Plan 确认点编号不一致，(3) 依赖关系图错误，(4) Phase 3 非线性控制流设计缺失。
