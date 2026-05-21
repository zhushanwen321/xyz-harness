# Spec 评审 v1

## 评审记录
- 评审时间：2026-05-16 20:00
- 评审类型：Spec 独立评审
- 评审对象：spec.md
- 评审轮次：第 1 轮

### 六要素覆盖矩阵

| 要素 | 覆盖状态 | 说明 |
|------|---------|------|
| Outcomes | ✅ | 有明确的终态描述："AI 只做执行、不做法官"，E2E 测试中 AI 产生证据 JSON+截图，独立 Gate subagent 判定 PASS/FAIL。四阶段重组结构清晰 |
| Scope boundaries | ✅ | in-scope 列出了 9 项，out-of-scope 列出了 5 项，边界明确（集成测试被替代、Baseline 暂缓、Flaky 不重试等） |
| Constraints | ✅ | C1-C7 覆盖了依赖限制、编号兼容、Gate 模型、上下文隔离、确认点、Loop 上限、AI 角色限制 |
| Decisions made | ✅ | D1-D9 共 9 项决策，每项有方案描述和理由 |
| Verification | ✅ | AC1-AC13 共 13 条验收标准，每条有场景描述和验证方式 |
| 已有基础设施 | ✅ | 列出了 12 项基础设施，含文件位置和本次改动说明 |

### 自包含性问题

#### 问题 1：`WorkflowState.currentPhase` 类型不兼容

spec D8 规划 Phase 编号为 1/2/3/4，但代码库 `types.ts:12` 中 `currentPhase` 类型为 `1 | 2`。spec 未说明如何扩展此类型。Phase 2 编码 agent 需要知道是改为 `1 | 2 | 3 | 4` 还是引入新的���举。

#### 问题 2：`StageDefinition.phase` 同理不兼容

`types.ts:49` 中 `phase: 1 | 2`，spec 新增 Phase 3/4 后需扩展。

#### 问题 3：Loop 引擎新增工具的注册方式未说明

spec D5 提到 AI 调用 `harness_loop_start` prompt 和 `harness_loop_round_complete` 工具，但未说明这些工具的参数签名（`harness_loop_round_complete` 的参数是什么？需要传 round number 吗？items 吗？还是引擎自动推断？）。Phase 2 agent 无法实现一个参数未定义的工具。

#### 问题 4：`LoopConfig.evidenceFile` 中的 `{topicDir}` 替换时机未说明

spec D4.2 写 `evidenceFile: ".xyz-harness/{topicDir}/changes/evidence/e2e-evidence.json"`，但未说明 `{topicDir}` 在何时由谁替换。是在引擎初始化时读取 `WorkflowState.topicDir` 替换？还是在 prompt 变量替换阶段？这影响引擎的实现逻辑。

#### 问题 5：Phase 3 Stage A 的"回退 Phase 2 修复"机制未定义

spec D7.3 写"失败 → Phase 3 阻塞 → 回退 Phase 2 修复"，但未说明：
- 回退到 Phase 2 的哪个 Stage？（Stage 10 编码？Stage 12 单元测试？）
- 回退后如何重新进入 Phase 3？
- 这是否使用现有的 `harness_rollback` 工具？

#### 问题 6：Loop 引擎的 `itemSource: "plan_tasks"` 提取逻辑未定义

spec D4.2 写 `itemSource: "plan_tasks"`，但未说明从哪个文件提取、按什么格式解析、提取哪些字段。Phase 2 agent 需要知道是从 `plan.md` 的 YAML frontmatter 提取？还是从 Markdown 表格？还是从 `e2e-test-plan.md`？

### 发现的问题

| # | 优先级 | 维度 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|------|---------|
| 1 | MUST FIX | 自包含性 | D5 步骤 3 | `harness_loop_round_complete` 工具的参数签名未定义。AI 调用时需要传什么参数？返回值是什么？ | 在 D5 或 D4 中增加工具参数签名定义（类似现有 `StageCompleteParams`、`RegisterTasksParams` 的定义方式） |
| 2 | MUST FIX | 自包含性 | D4.2 + D5 | `itemSource: "plan_tasks"` 的提取逻辑未定义。从哪个文件、按什么格式提取目标列表？ | 增加 `itemSource` 的解析规则说明：文件路径、解析格式、提取字段映射 |
| 3 | MUST FIX | 自包含性 | D8 | `currentPhase` 当前类型为 `1 \| 2`（types.ts:12），spec 新增 Phase 3/4 但未说明如何扩展此类型 | 在"数据结构"或 D8 中明确 `currentPhase` 类型改为 `1 \| 2 \| 3 \| 4` 或引入 string enum |
| 4 | MUST FIX | 自包含性 | D7.3 | Phase 3 Stage A 健康检查失败后的"回退 Phase 2 修复"机制不完整：回退到哪个 Stage？如何重新进入？ | 明确回退目标 Stage 编号和重新进入 Phase 3 的触发条件 |
| 5 | MUST FIX | 自包含性 | D4.2 | `{topicDir}` 在 `evidenceFile` 路径中的替换时机和执行者未说明 | 明确：引擎初始化时从 `WorkflowState.topicDir` 读取并替换 |
| 6 | MUST FIX | 数据流 | 全文 | 缺少完整的数据流图。Loop 引擎涉及多层状态交互（WorkflowState → LoopConfig → JSON evidence → Gate），但没有数据流时序图 | 增加数据流章节，包含：(1) Loop 各阶段的状态读写时序 (2) JSON evidence 的追加写入规则 (3) Gate 读取 JSON 的时机 |
| 7 | MUST FIX | 六要素 | §验证 | AC1 说"Phase 2 完成后自动进入 Phase 3，无人工确认"，但 C5 和 D9 的确认点表格中未列出 Phase 2→Phase 3 的过渡。且 D9 确认点仅列了 Stage 2/8/Phase 3 出口/Stage 14 四个，而 AC12 也对应这四个。但 AC1 说"无人工确认"是针对 Phase 2→3 的过渡——需确认是否有矛盾 | 澄清 Phase 2→3 过渡是否有确认点，与 AC1/AC12/D9 对齐 |
| 8 | MUST FIX | 类型签名 | D4.5 | `GateCheck` 接口定义为 `{ name: string; type: "L1" \| "L2" }`，但 L2 检查 `anti_fabrication` 的执行方式未说明。现有 L2 验证在 `gate-verifier.ts` 中是直接调用 LLM API，但 spec D4.5 的 L2 检查是"读 JSON + 证据文件判断真实性"。这是复用现有 `verifyGateL2` 还是新写？ | 说明 L2 检查的实现方式：复用 gate-verifier.ts 的框架，还是新的 subagent |
| 9 | MUST FIX | 自包含性 | D6 | Phase 3 的 stage 编号使用字母（A、Loop、Gate），但 `StageDefinition.number` 是 `number` 类型（types.ts:50），且 `StageState.number` 也是 `number`。Phase 2 agent 无法将 "A" 放入 number 字段 | 为 Phase 3 的子 stage 分配具体数字编号，或说明 Phase 3 不使用现有 StageDefinition/StageState 体系 |
| 10 | MUST FIX | 必填章节 | §已有基础设施 | spec 已有基础设施章节列了文件位置，但未列明"可复用 API 表"（函数签名 + 用途）和"技术债务"。例如 `StateManager` 的 `advanceTo` 方法签名、`GateRunner.run` 的签名——Phase 2 agent 需要知道这些来扩展 | 在已有基础设施章节增加：(1) 关键函数签名表 (2) 已知技术债务列表 |
| 11 | MUST FIX | 必填章节 | §数据结构 | "数据结构"章节只是一句"通用格式见 D4.4"的引用，没有独立的数据流图。对于涉及 JSON 文件读写、状态机推进的需求，缺少数据流时序要求 | 增加数据流时序图：初始化 → 轮次执行 → Verification Round → Gate 检查，标注每步的读写操作 |
| 12 | MUST FIX | 自包含性 | D4.4 | JSON evidence 的 `state.completedItems` 定义为"有 ≥1 completedStatus 记录的 item 数"，但引擎何时计算这个值未说明。是每次写入 JSON 后重新统计？还是 AI 写入？ | 明确 `state.completedItems` 由引擎在每轮结束时重新计算 |
| 13 | MUST FIX | 自包含性 | D5 步骤 2 | `harness_loop_start` prompt 的发送机制未说明。是通过 `pi.sendMessage` 注入？还是注册为新工具？还是作为 `before_agent_start` 事件的 system prompt 注入？ | 明确 Loop prompt 的注入方式和触发时机 |
| 14 | LOW | 自包含性 | D7.2 | roundPrompt 模板中有 `{batchSize}` 变量，但 D4.3 的变量模板列表中未列出 `{batchSize}` | 在 D4.3 变量表中增加 `{batchSize}` |
| 15 | LOW | 验收标准 | AC4 | "断掉 CDP 连接，观察 subagent 是否触发"——CDP 连接断开不等价于 status=ERROR。CDP 断开可能是 Chrome 崩溃，但 spec 需要区分"元素找不到"和"浏览器崩溃"。AC 的触发条件可以更精确 | 细化 AC4 的触发条件，明确 status=ERROR 的场景覆盖范围 |
| 16 | LOW | 验收标准 | AC13 | "旧格式 Phase 2 状态文件可正确迁移"——但未定义"正确迁移"的标准。是自动检测并升级版本号？还是报错让用户手动处理？ | 明确迁移策略：自动升级 / 报错提示 / 兼容读取 |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

### 结论

需修改后重审

### Summary

Spec 评审完成，第 1 轮，13 条 MUST FIX，需重审。

主要问题集中在三个方面：
1. **自包含性不足**：Loop 引擎的工具签名、itemSource 解析逻辑、prompt 注入方式、Phase 3 stage 编号方案等关键实现细节缺失，Phase 2 agent 无法凭 spec 完成实现。
2. **类型兼容性**：现有 `currentPhase: 1 | 2` 和 `StageDefinition.phase: 1 | 2` 类型需扩展，但 spec 未明确说明扩展方式；Phase 3 使用字母编号与 number 类型冲突。
3. **数据流缺失**：Loop 引擎涉及多层状态交互，缺少完整的数据流时序图和读写规则。
