# Spec: Phase 2/3/4 拆分 + E2E 证据-判定分离

## 目标

将当前 Phase 2 拆分为 3 个独立 Phase，彻底解决 E2E 测试被 AI 系统性跳过的问题。

核心手段：**AI 只做执行、不做法官**。E2E 测试中 AI 的角色是产生证据（JSON + 截图），独立的 Gate subagent 负责判定通过/失败。

## 范围

### 在范围内

| 项 | 说明 |
|----|------|
| Phase 2 重组 | 将当前 Stage 9-12 改为新 Phase 2：编码 + 评审 + 单元测试 |
| Phase 3 新增 | 独立 E2E 测试 Phase：集成健康检查 + E2E 执行 Loop + 独立 Gate 判定 |
| Phase 4 重组 | 将当前 Stage 14-16 改为新 Phase 4：推送/CI/部署 + 复盘 |
| JSON 证据文件 | Phase 3 的 E2E 执行记录格式和存储路径 |
| Phase 3 Gate | 独立 subagent，读 JSON + 截图判断通过/失败 |
| Loop 执行引擎 | `index.ts` 支持 `type: "loop"` 的 phase，非固定 stage 序列 |
| 集成健康检查 | Phase 3 入口的前置 stage：API + DB 连通性验证 |
| Stage 编号重排 | 16 个 Stage 重新编号分配 |
| 确认点调整 | 最终 3 个确认点：Stage 2 / Stage 8 / Phase 3 出口 |

### 不在范围内

- 独立集成测试 Stage（已被集成健康检查替代，见调研文档）
- Baseline 版本管理（暂缓，见调研文档）
- Flaky 自动重试（仅诊断，不重试，见调研文档）
- VLM 降级策略（已有 Layer 2 > Layer 3 规则，本次不增强）
- chrome-automation skill 本身的功能变更

## 约束

| 约束 | 说明 |
|------|------|
| C1 不新增外部依赖 | JSON 解析用 `JSON.parse`，不引入 js-yaml 之外的新包 |
| C2 Stage 编号兼容性 | 原 16 个 Stage 中有不变逻辑的，尽量保持编号语义连续 |
| C3 Gate 模型一致性 | Phase 3 Gate 仍遵循 L1（机械）+ L2（LLM 验证）两层模型 |
| C4 上下文隔离 | Phase 2 结束后 AI context 重置，Phase 3 从零开始 |
| C5 人工确认点 | Stage 2（Spec 编写前）、Stage 8（Phase 1 终审）、Phase 3 出口（E2E 结果确认）、Stage 14（Phase 4 复盘确认）共 4 个 |
| C6 Loop 最大轮数 | 默认 5 轮，可配置 |
| C7 AI 不做判定 | Phase 3 Loop 中 AI 不输出 PASS/FAIL，只输出 EXECUTED/ERROR |

## 行为约束

### Always（必须做）

1. Phase 3 每一轮必须追加 JSON round 记录，不可覆盖覆盖旧轮
2. Verification Round 必须全量重跑所有 case，不可只跑未完成的
3. Phase 3 Gate 五项 L1 检查必须全部 PASS 才能输出 Gate PASS
4. Phase 2 结束后必须重置 AI context，不可带上下文进入 Phase 3
5. 集成健康检查失败必须阻塞 Phase 3，不可跳过进入 Loop

### Never（禁止做）

1. 禁止 AI 在 JSON 中写入 status=PASS 或 status=FAIL
2. 禁止 Gate 使用正则匹配评审文档判断 E2E 结果
3. 禁止 Phase 3 Loop 跳过 case（case 即使之前 EXECUTED 过，Verification Round 也必须重跑）
4. 禁止在 Phase 3 中直接编辑业务代码（修复只能通过 subagent）
5. 禁止 Loop 无限循环（必须受 max_rounds 限制）

### Ask First（先问用户）

1. Loop 达到 max_rounds 仍未全部通过时，在 Gate FAIL 后询问用户是否扩容
2. Phase 3 出口确认时，展示 JSON 摘要（非全文），用户确认后再进入 Phase 4

## 已做决策

### D1：Phase 2/3/4 拆分方案

```
当前:
  Phase 1 (Stage 1-8): 需求沟通
  Phase 2 (Stage 9-16): 开发交付（混合编码+测试+部署）

改后:
  Phase 1 (Stage 1-8): 需求沟通（不变）
  Phase 2 (Stage 9-12): 编码交付（TDD → 编码 → 评审 → 单元测试）
  Phase 3 (独立 Phase): E2E 测试（健康检查 → Loop → Gate → 人工确认）
  Phase 4 (Stage 13-14): 收尾（推送/CI/部署 → 复盘）
```

理由：调研文档指出 E2E 只应占 ~10% 测试精力，但当前设计给了它和所有其他 stage 等同的地位（1/16）。独立为 Phase 的好处是上下文隔离 + 可选跳过 + 循环语义。

### D2：证据-判定分离（方案 B）

```
AI 角色：执行 CDP → 产生 JSON(EXECUTED/ERROR) + 截图
Gate 角色：读 JSON → 验证截图存在 → 独立输出 PASS/FAIL
```

理由：消除 AI "同时当运动员和裁判"的利益冲突。AI 不需要知道"我通过了"，只需要知道"我产出了证据"。Gate 不接触 AI 的 reasoning，只读证据。

### D3：JSON status 语义

```
EXECUTED — CDP 命令完成，截图已写入磁盘
ERROR — CDP 命令无法完成（浏览器崩溃、连接断开、元素找不到）
```

AI 不写 PASS/FAIL。被判定为 PASS 还是 FAIL 是 Gate 的职责。

### D4：通用 Loop 抽象

Loop 是一个**可配置的目标驱动迭代原语**，不绑定 E2E。任何"有 N 个目标需要逐轮完成 + 证据累积 + Gate 独立判定"的场景都可以用它。

#### D4.1 状态机

```
initializing → in_round → round_review ─┐
    ↑                                  │
    └── (有未完成项) ←─────────────────┘
    
    └── (全部完成) → verification_round → gate_check ─┐
              ↑                              │
              └── (Gate FAIL, 未达上限) ←───┘
              
              └── (Gate PASS) → user_confirm → done
              └── (Gate FAIL, 已达上限) → failed
              └── (Gate PASS, 无需确认) → done
```

#### D4.2 配置结构（`LoopConfig`）

| 字段 | 类型 | 说明 | E2E 示例值 |
|------|------|------|-----------|
| `name` | string | Loop 名称 | `"E2E 测试"` |
| `itemSource` | string | 目标来源（暂仅 `"plan_tasks"`） | `"plan_tasks"` |
| `itemIdField` | string | 目标唯一标识字段 | `"case_id"` |
| `allowedStatuses` | string[] | AI 允许写入的 status 值 | `["EXECUTED", "ERROR"]` |
| `completedStatus` | string | 表示"已完成"的 status 值 | `"EXECUTED"` |
| `maxRounds` | number | 最大轮数 | `5` |
| `batchSize` | number | 每轮最多处理目标数 | `5` |
| `requireVerificationRound` | boolean | 是否需要全量复验轮 | `true` |
| `evidenceFile` | string | JSON 证据文件相对路径 | `".xyz-harness/{topicDir}/changes/evidence/e2e-evidence.json"` |
| `roundPrompt` | string | 每轮 AI 执行 prompt（支持变量模板） | 见 D7 |
| `gateScript` | string | Gate 脚本标识 | `"phase3"` |
| `gateChecks` | GateCheck[] | Gate 检查项列表 | 见 D6.E2E |
| `confirmationRequired` | boolean | Gate 通过后是否需要人工确认 | `true` |

#### D4.3 Prompt 变量模板

Loop 引擎在向 AI 发送 prompt 前替换以下变量：

| 变量 | 说明 |
|------|------|
| `{phaseName}` | Loop 名称（`config.name`） |
| `{currentRound}` | 当前轮次 |
| `{maxRounds}` | 最大轮数 |
| `{remainingRounds}` | 剩余轮数 |
| `{totalItems}` | 总目标数 |
| `{incompleteItems}` | 未完成目标 JSON 列表（`[{item_id, plan_ref, ...}]`） |
| `{evidenceFilePath}` | 证据文件绝对路径 |
| `{completedStatus}` | 完成状态值 |
| `{allowedStatuses}` | 允许状态值列表 |

#### D4.4 通用证据 JSON 格式

```jsonc
{
  "loop": "{name 的 slug}",           // 如 "e2e-testing"
  "state": {
  "totalItems": 8,
  "completedItems": 5,               // 有 ≥1 completedStatus 记录的 item 数
  "currentRound": 2,
  "maxRounds": 5,
  "phase": "in_round",               // in_round | verification | done | failed
  "verificationRoundCompleted": false
  },
  "rounds": [
  {
    "round": 1,
    "startedAt": "2026-05-16T14:01:00Z",
    "items": [
    {
      "item_id": "task-1",          // 匹配 config.itemIdField
      "status": "EXECUTED",         // 必须属于 config.allowedStatuses
      "evidence": { ... }           // Loop 专用证据字段，引擎不解释
    }
    ]
  }
  ],
  "verification_round": {
  "completed": false,
  "startedAt": null,
  "items": []
  }
}
```

`evidence` 字段是 Loop 专用的扩展区，引擎不解析其内容，只透传给 Gate。不同 Loop 可以定义不同的 evidence 结构（见 D7.E2E）。

#### D4.5 Gate 检查项（`GateCheck`）

```typescript
interface GateCheck {
  name: string;          // 检查项名称，映射到预定义检查函数
  type: "L1" | "L2";    // L1=机械检查 / L2=LLM 子 agent 检查
}
```

预定义 L1 检查函数（`gates/common.ts`）：

| 检查名 | 通过条件 |
|--------|---------|
| `item_coverage` | JSON 中 item_id 集合 ⊇ 来源（plan.md）中声明的所有目标 |
| `executed_per_item` | 每个 item_id 至少 1 条 status={completedStatus} 记录 |
| `verification_round_completed` | JSON.verification_round.completed === true |
| `verification_all_executed` | Verification Round 中所有 item status={completedStatus} |
| `evidence_files_exist` | evidence 中声明的文件（截图、日志等）存在于磁盘且 size > 阈值 |

L2 检查由 LLM 子 agent 执行，读 JSON + 证据文件判断真实性。

### D5：Loop 执行流程（引擎侧）

1. **初始化**：读取 LoopConfig → 创建空 JSON → 从 itemSource 提取目标列表
2. **进入轮次**：AI 收到 `harness_loop_start` prompt（变量已替换）
3. **AI 执行**：AI 按 prompt 指示操作，完成后调用 `harness_loop_round_complete`
4. **引擎审查**：读取 JSON → 更新 LoopState → 判断：
   - 有未完成项 + 未达上限 → 步骤 2（下一轮）
   - 全部完成 → 步骤 5（Verification Round）
   - 已达上限 → 步骤 6（Gate，预期 FAIL）
5. **Verification Round**：AI 全量重跑所有 item → 完成后进入步骤 6
6. **Gate 执行**：按 `gateChecks` 依次运行 L1 检查 → L2 检查 → 输出 PASS/FAIL
   - PASS + confirmationRequired → 人工确认 → done
   - PASS + 无需确认 → done
   - FAIL + 未达上限 → 步骤 2
   - FAIL + 已达上限 → failed

### D6：E2E Loop 具体配置

通用 Loop 抽象 + E2E 专用配置如下：

```typescript
{
  type: "loop",
  phase: 3,
  config: {
  name: "E2E 测试",
  itemSource: "plan_tasks",
  itemIdField: "case_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/{topicDir}/changes/evidence/e2e-evidence.json",
  roundPrompt: "e2e-loop-round",    // 模板标识，见 D7
  gateScript: "phase3",
  gateChecks: [
    { name: "item_coverage", type: "L1" },
    { name: "executed_per_item", type: "L1" },
    { name: "evidence_files_exist", type: "L1" },
    { name: "verification_round_completed", type: "L1" },
    { name: "verification_all_executed", type: "L1" },
    { name: "anti_fabrication", type: "L2" }
  ],
  confirmationRequired: true
  }
}
```

### D7：E2E 专用定制

#### D7.1 E2E evidence 字段

```jsonc
"evidence": {
  "cdp_commands": ["navigate /login", "wait #form", "screenshot"],
  "screenshots": [".xyz-harness/{topicDir}/evidence/screenshots/r1-t1-login.png"],
  "error": null,                     // status=ERROR 时的错误信息
  "fix_commit": null                 // 修复 subagent 的 git commit hash
}
```

`evidence_files_exist` 检查会读取 `evidence.screenshots[]`，验证每个文件存在且 size > 1KB。

#### D7.2 E2E roundPrompt 模板

```
You are in Phase 3 E2E Testing Loop, Round {currentRound}/{maxRounds}.

GOAL: Execute E2E test cases using CDP. Write {completedStatus} (test executed, 
evidence captured) or ERROR (test could not run). NEVER write PASS or FAIL.

Incomplete test cases (need first execution this round):
{incompleteItems}

For each incomplete case:
1. Read test case from e2e-test-plan.md
2. Execute CDP commands via chrome-automation skill
3. Record results in {evidenceFilePath} with EXECUTED/ERROR + evidence.cdp_commands + evidence.screenshots[]
4. If ERROR → spawn harness-fixer subagent to fix, record evidence.fix_commit

Constraints:
- Batch limit: {batchSize} cases per round max
- Do NOT judge pass/fail — only record executed/error
- Screenshots must be real files written to disk
- Call harness_loop_round_complete when done
```

#### D7.3 集成健康检查（Phase 3 Stage A）

在 E2E Loop 之前运行，检查后端 API 和数据库是否可达：
```
curl backend/health → 200 OK
数据库连接测试（项目特定）
```
失败 → Phase 3 阻塞 → 回退 Phase 2 修复。通过 → 进入 Loop。
30 秒内完成，零额外依赖。

理由：调研文档 gap #2"集成测试层缺失"。不新增 Stage，改为 Phase 3 入口的前置检查。

### D8：Stage 编号重新分配

```
Phase 1 (Stage 1-8): 不变
Phase 2 (Stage 9-12):
  9   TDD 测试编写（原 Stage 9）
  10  编码实现（原 Stage 10）
  11  编码评审（原 Stage 11）
  12  单元测试（原 Stage 12）

Phase 3 (独立 Phase):
  A   集成健康检查（新增）
  Loop  E2E 测试执行（原 Stage 13 扩展）
  Gate  E2E 证据审查（新增 Gate）

Phase 4 (Stage 13-14):
  13  推送+CI+部署（原 Stage 15）
  14  自动复盘（原 Stage 16）
```

原 Stage 14（测试评审）移除——E2E 评审并入 Phase 3 Gate，单元测试评审并入 Stage 12 内部。

### D9：确认点（最终）

| 位置 | 确认原因 |
|------|---------|
| Stage 2（Spec 编写前） | 需求讨论完成，确认后开始写 Spec |
| Stage 8（Phase 1 终审） | Plan 全部就绪，确认后进入开发 |
| Phase 3 出口 | E2E JSON + Gate 结果审核，确认后进入 Phase 4 |
| Stage 14（Phase 4 终审） | 复盘报告审核 |

## 已有基础设施

| 基础设施 | 位置 | 本次改动 |
|---------|------|---------|
| Stage 定义 | `extensions/coding-workflow/stages.ts` | 拆分 Phase + 新增 type:"loop" + LoopConfig |
| 阶段类型 | `extensions/coding-workflow/types.ts` | 新增 LoopPhaseDefinition, LoopConfig, GateCheck |
| 工作流状态 | `extensions/coding-workflow/state-manager.ts` | 支持 loop 状态机 |
| 主入口 | `extensions/coding-workflow/index.ts` | 新增 loop 执行引擎 + loop 命令 |
| Loop 引擎 | 新增 `extensions/coding-workflow/loop-engine.ts` | 通用 Loop 状态机（独立模块） |
| Prompt 模板 | 新增 `extensions/coding-workflow/loop-prompts/` | 各 Loop 的 round prompt 模板 |
| Gate 验证 | `extensions/coding-workflow/gates/common.ts` | 新增 L1 预定义检查函数 |
| Phase 3 Gate | 新增 `extensions/coding-workflow/gates/gate_phase3.ts` | E2E Gate（组合 L1 检查 + L2 调用） |
| E2E 测试者 | `~/.pi/agent/agents/harness-e2e-tester/` | 适配 EXECUTED/ERROR 语义 |
| chrome-automation | `~/.pi/agent/skills/chrome-automation/` | 不变 |
| YAML 评审格式 | `skills/xyz-harness-expert-reviewer/SKILL.md` | 不变 |

## 数据结构

通用格式见 [D4.4 通用��据 JSON 格式](#d44-通用证据-json-格式)。E2E 专用 evidence 字段见 [D7.1 E2E evidence 字段](#d71-e2e-evidence-字段)。此处不重复。

### 受影响的文件（估算）

| 文件 | 改动类型 | 估算行数 |
|------|---------|---------|
| `stages.ts` | 拆分 Phase + 新增 LoopConfig 类型 | ~80 行 |
| `types.ts` | 新增 LoopPhaseDefinition, LoopConfig, GateCheck | ~60 行 |
| 新增 `loop-engine.ts` | 通用 Loop 状态机 | ~180 行 |
| `index.ts` | 新增 loop 命令（start/complete/exit） | ~120 行 |
| `state-manager.ts` | 支持 loop state 读写 | ~50 行 |
| 新增 `loop-prompts/e2e-loop-round.md` | E2E round prompt 模板 | ~30 行 |
| `gates/common.ts` | 新增 L1 预定义检查函数（5 个） | ~100 行 |
| 新增 `gates/gate_phase3.ts` | Phase 3 Gate（组合检查 + L2 调用） | ~50 行 |
| `harness-e2e-tester/agent.md` | 适配 EXECUTED/ERROR + JSON 写入 | ~30 行 |

## 验收标准

| AC | 场景 | 验证方式 |
|----|------|---------|
| AC1 | Phase 2 完成后自动进入 Phase 3，无人工确认 | 检查 state 推进 |
| AC2 | Phase 3 Stage A 集成健康检查失败时阻塞 Loop | curl 失败后端，观察 Phase 3 状态 |
| AC3 | E2E Loop 正确写入 JSON evidence | 跑一个 case，检查 JSON 结构 |
| AC4 | case status=ERROR 时 spawn subagent 修复 | 断掉 CDP 连接，观察 subagent 是否触发 |
| AC5 | 所有 case 有 ≥1 EXECUTED 后自动进入 Verification Round | 标记所有 case 完成，观察状态推进 |
| AC6 | Verification Round 完成后 AI 声明 Loop 结束 | 观察 JSON.verification_round.completed=true |
| AC7 | Phase 3 Gate 五项 L1 检查全部正确判定 | 构造各种 JSON 状态，逐一验证 Gate 输出 |
| AC8 | Phase 3 Gate PASS 后弹出人工确认 | Gate 输出 PASS，检查是否触发确认 |
| AC9 | Phase 3 Gate FAIL 后回退 Loop 重新执行 | Gate 输出 FAIL，检查是否回到 Loop |
| AC10 | Loop 达到 max_rounds 上限后 Gate 判定 FAIL | 设 max_rounds=1，跑两轮，检查结果 |
| AC11 | Phase 4 正常收尾（推送+CI+复盘） | 串行验证推送→CI→复盘全流程 |
| AC12 | 确认点仅 Stage 2/8/Phase 3 出口/Stage 14 | 审计 requiresConfirmation 字段 |
| AC13 | 向后兼容：旧格式 Phase 2 状态文件可正确迁移 | 用旧 state JSON 启动新版本 |
