# Harness V5: Loop-Based Phase Architecture

## 背景与动机

V4 的 16-stage 线性流水线存在三个核心问题：

1. **流程膨胀**：16 个 stage 逐级推进，80% 时间花在流程摩擦上，编码只占 18%
2. **上下文膨胀**：长对话积累大量上下文，subagent 调度慢、token 消耗高
3. **Subagent 强制使用**：skill 中硬编码的 subagent dispatch 导致不可靠的并行执行和大量修复时间

V5 的核心设计思路：**Phase = 独立循环 + 边界压缩**。每个 Phase 内部是一个 self-contained loop（重复执行直到门禁通过），Phase 之间通过 tree branch summary 压缩上下文。Subagent 使用由 AI 自主决定。

### 约定

- `{topicDir}` = `.xyz-harness/{YYYY-MM-DD-主题}/`，由 harness 在 Phase 1 初始化时创建
- `changes/` = `{topicDir}/changes/`，所有评审、证据、复盘文件的根目录

---

## 架构概览

### 5 个 Phase

```
Phase 1 (spec)   brainstorming¹ → 写spec → review → [gate] ↻ → 复盘 → compress
Phase 2 (plan)   写plan → review → [gate] ↻ → 复盘 → compress
Phase 3 (dev)    TDD → 编码 → code review → [gate] ↻ → 复盘 → compress
Phase 4 (test)   执行测试 → 修复 → [gate] ↻ → 复盘 → compress
Phase 5 (pr)     推送+CI+PR → [gate] ↻ → 整体复盘
```

¹ = `runOnce`，仅首轮执行

### Loop 机制

每个 Phase 包含若干 stage，最后一个 stage 完成后触发门禁检查：

- **Gate PASS** → 退出循环 → 复盘 → 压缩上下文 → 进入下一 Phase
- **Gate FAIL** → 回到第一个可循环 stage 重新执行

循环回到哪个 stage 由 Phase 定义硬编码（始终回到第一个可循环 stage）。标记为 `runOnce` 的 stage 仅在首轮执行，后续循环自动跳过。循环计数由 `state-manager.ts` 跟踪（Phase 初始化时 `loopCount = 0`，每次回到循环起点时 `loopCount++`，`runOnce` stage 在 `loopCount > 0` 时跳过）。

无限循环保护：不设硬性上限。如果 AI 连续 3 轮 gate 失败且 MUST FIX 相同，应主动向用户求助而非继续循环。

### 上下文压缩

Phase 之间使用 Pi 的 tree branch summary 机制：

1. Phase 开始时记录当前 entry ID（`phaseStartEntryId`）
2. Phase 内工作形成一个对话分支
3. Phase 结束时，`/harness-phase-transition` slash command 调用 `ctx.navigateTree()`，回到 phaseStartEntryId 并触发 branch summary
4. 下一 Phase 从 summary 节点开始，上下文精简但保留关键决策

---

## Phase 定义

### Phase 1: Spec

| Stage | 名称 | 属性 | 说明 |
|-------|------|------|------|
| 1 | brainstorming | `runOnce` | 与用户讨论需求、澄清问题、提出方案 |
| 2 | 写 spec | 可循环 | 产出 spec.md |
| 3 | review spec | 可循环 | 评审 spec（AI 调用 subagent 评审，可选） |

循环起点：Stage 2（写 spec）

### Phase 2: Plan

| Stage | 名称 | 属性 | 说明 |
|-------|------|------|------|
| 1 | 写 plan | 可循环 | 产出 plan.md + e2e-test-plan.md + test_cases_template.json |
| 2 | review plan | 可循环 | 评审 plan（AI 调用 subagent 评审，可选） |

复杂度评估在"写 plan"阶段执行。L2 复杂度时额外产出 plan-backend.md、plan-frontend.md、plan-api-contract.md。

循环起点：Stage 1（写 plan）

### Phase 3: Dev

| Stage | 名称 | 属性 | 说明 |
|-------|------|------|------|
| 1 | TDD | 可循环 | 先写单元测试（红），后续循环可增量补测试 |
| 2 | 编码 | 可循环 | 实现代码使测试通过 |
| 3 | code review | 可循环 | 评审代码（AI 调用 subagent 评审，可选） |

AI 自主判断 TDD 是增量还是全量。如果本轮不需要修改测试，TDD stage 可秒过。

循环起点：Stage 1（TDD）

### Phase 4: Test

| Stage | 名称 | 属性 | 说明 |
|-------|------|------|------|
| 1 | 执行测试 | 可循环 | 基于 test_cases_template.json 执行集成/功能测试 |
| 2 | 修复问题 | 可循环 | 修复失败的测试 |

测试类型为集成/功能测试（验证模块间协作、API 契约），非 UI 级 E2E。AI 每轮自主决定执行哪些 case，在 test_execution.json 中记录结果。最后一轮必须全部执行且全部通过。

循环起点：Stage 1（执行测试）

### Phase 5: PR

| Stage | 名称 | 属性 | 说明 |
|-------|------|------|------|
| 1 | 推送+CI+PR | 可循环 | git push、等待 CI、创建 PR |

循环起点：Stage 1（推送+CI+PR）

---

## 门禁系统

每个 Phase 的最后一个 stage 完成后触发门禁。门禁分 L1（机械）和 L2（AI Subagent）。

### Phase 1 (spec) Gate

**交付物：**

| 文件 | 路径 |
|------|------|
| spec.md | `{topicDir}/spec.md` |
| spec_review | `{topicDir}/changes/reviews/spec_review_v{N}.md` |

**L1 检查：**
1. spec.md 存在
2. spec.md YAML frontmatter 中 `verdict` 字段非空
3. 最新 spec_review 存在
4. 最新 spec_review YAML 中 `must_fix` 为 `[]`（或 `verdict: pass`）

**L2 检查：**
- spec 所有章节完整（背景、需求、约束、AC）
- AC 可测试、无内部矛盾
- 评审指出的 MUST FIX 已修复

### Phase 2 (plan) Gate

**交付物：**

| 文件 | 路径 | 条件 |
|------|------|------|
| plan.md | `{topicDir}/plan.md` | 必选 |
| e2e-test-plan.md | `{topicDir}/e2e-test-plan.md` | 必选 |
| test_cases_template.json | `{topicDir}/test_cases_template.json` | 必选 |
| plan-backend.md | `{topicDir}/plan-backend.md` | L2 复杂度 |
| plan-frontend.md | `{topicDir}/plan-frontend.md` | L2 复杂度 |
| plan-api-contract.md | `{topicDir}/plan-api-contract.md` | L2 复杂度 |
| plan_review | `{topicDir}/changes/reviews/plan_review_v{N}.md` | 必选 |

**L1 检查：**
1. plan.md 存在，YAML `verdict` 非空
2. e2e-test-plan.md 存在，YAML `verdict` 非空
3. test_cases_template.json 存在
4. L2 复杂度时，3 个子文档均存在
5. 最新 plan_review YAML `must_fix` 为空

**L2 检查：**
- plan.md task 覆盖 spec.md 全部 AC
- e2e-test-plan.md 覆盖 spec.md 全部 AC
- 依赖关系正确、无孤儿 task

### Phase 3 (dev) Gate

**交付物：**

| 文件 | 路径 |
|------|------|
| test_results.md | `{topicDir}/changes/evidence/test_results.md` |
| code_review | `{topicDir}/changes/reviews/code_review_v{N}.md` |

**L1 检查：**
1. test_results.md 存在，YAML `all_passing: true`
2. code_review 存在，YAML `must_fix` 为空

**L2 检查：**
- 测试结果非伪造（交叉比对测试文件和 test_results.md）
- code review 问题确已修复
- 无代码回归

### Phase 4 (test) Gate

**交付物：**

| 文件 | 路径 |
|------|------|
| test_execution.json | `{topicDir}/changes/evidence/test_execution.json` |

**L1 检查：**
1. test_execution.json 的 case ID 集合 === test_cases_template.json 的 case ID 集合
2. 每个 case 的 `executions` 数组至少有 1 条记录
3. 每个 case 最后一条 `executed=true` 的记录中 `passed === true`
4. 所有 `passed=true` 的记录中 `execute_steps` 非空

**L2 检查：**
- execute_steps 命令/请求真实可复现
- error 信息合理（非伪造）
- 时间戳递增

### Phase 5 (pr) Gate

**交付物：**

| 文件 | 路径 |
|------|------|
| pr_evidence.md | `{topicDir}/changes/evidence/pr_evidence.md` |
| ci_results.md | `{topicDir}/changes/evidence/ci_results.md` |

**L1 检查：**
1. pr_evidence.md YAML `pr_created: true`
2. ci_results.md YAML `ci_passed: true`

**L2 检查：**
- CI 结果可验证（URL 可访问）
- PR 包含该分支所有提交
- 无未推送的本地变更

---

## 复盘

### 时序

复盘在 **Phase loop 退出后、上下文压缩前** 执行。由 AI dispatch 专用复盘 subagent 完成。

### 复盘 Subagent

Agent 定义文件：`agents/harness-retrospect/agent.md`

**输入：**
- 当前 Phase 名称和路径信息
- Phase 内所有交付物路径
- Gate L1 + L2 的检查结果

**输出：** `{topicDir}/changes/reviews/{phase}_retrospect.md`

**复盘覆盖两个维度：**

| 维度 | 内容 |
|------|------|
| Phase 执行 | 做了什么、关键决策及原因、遇到的问题及解决方案、重来一次如何改进 |
| Harness 体验 | 流程卡点、门禁质量（L1/L2 误报/漏报）、提示词清晰度、可用性问题 |

有问题时详细写，顺利时简短即可。

### 复盘文件路径

| Phase | 路径 |
|-------|------|
| spec | `{topicDir}/changes/reviews/spec_retrospect.md` |
| plan | `{topicDir}/changes/reviews/plan_retrospect.md` |
| dev | `{topicDir}/changes/reviews/dev_retrospect.md` |
| test | `{topicDir}/changes/reviews/test_retrospect.md` |
| pr | `{topicDir}/changes/reviews/overall_retrospect.md` |

---

## Phase 退出流程

每个 Phase 退出需要两次 `harness_stage_complete` 调用：

| 调用 | Gate + 复盘状态 | 行为 |
|------|----------------|------|
| 第 1 次 | Gate PASS，复盘文件不存在 | 返回复盘 prompt，AI dispatch 复盘 subagent |
| 第 2 次 | Gate PASS，复盘文件已存在 | 触发 `/harness-phase-transition` → 压缩上下文 → 进入下一 Phase |

Phase 5 (pr) 退出流程：
- Gate PASS → 整体复盘（AI dispatch 复盘 subagent）→ workflow 完成
- 不执行压缩（已是最后阶段）

---

## Plan 复杂度分级

在 Phase 2 写 plan 阶段，AI 对需求进行复杂度评估（沿用已有设计）：

**评估维度（5 个，任一命中 L2 则整体 L2）：**

| 维度 | L2 触发条件 |
|------|-----------|
| 领域 | 跨多个业务域 |
| 存储 | 新增/修改数据模型 |
| 数据流 | 跨模块数据传递 |
| API | 新增/修改对外接口 |
| 非功能性 | 性能、安全、权限变更 |

| 级别 | Plan 交付物 |
|------|-----------|
| L1 | plan.md（单文件） |
| L2 | plan.md（总纲+任务列表）+ plan-backend.md + plan-frontend.md + plan-api-contract.md |

Gate 预期交付物随复杂度级别变化。

---

## Test Phase JSON 模板

### 模板结构（Plan Phase 产出）

`test_cases_template.json`：

```json
{
  "metadata": {
    "plan_ref": ".xyz-harness/{topic}/plan.md",
    "total_cases": 0
  },
  "cases": [
    {
      "id": "TC-1",
      "name": "用例名称",
      "category": "integration | functional | contract | regression",
      "priority": "P0 | P1 | P2",
      "steps": ["步骤1", "步骤2"],
      "expected": "预期结果描述",
      "executions": []
    }
  ]
}
```

### 执行记录（Test Phase 每轮追加）

Test Phase 复制模板为 `test_execution.json`，每轮 loop 向每个 case 的 `executions` 数组追加：

```json
{
  "executions": [
    {
      "round": 1,
      "timestamp": "2026-05-16T10:30:00Z",
      "executed": true,
      "passed": false,
      "error": "失败原因（passed=false 时必填）",
      "execute_steps": "实际执行过程描述（executed=true 时必填）"
    }
  ]
}
```

### 字段填写规则

| 字段 | 规则 |
|------|------|
| `executed` | AI 决定本轮是否执行。true=执行，false=跳过 |
| `passed` | 仅 executed=true 时有效 |
| `error` | passed=false 时必填，填写实际错误信息 |
| `execute_steps` | executed=true 时必填，包含具体命令/请求/验证方式。executed=false 可为空 |

### L2 防伪造检查要点

- execute_steps 中的命令和参数是否在项目中实际存在
- error 信息是否与 execute_steps 矛盾
- 时间戳是否单调递增

---

## L2 Fail-Open 定义

L2 检查（AI Subagent 判定）遇到以下情况不阻塞：
- HTTP 请求超时（> 30s）
- HTTP 返回 4xx/5xx
- 响应无法解析为有效 JSON 或缺少 `verdict` 字段

仅当 L2 返回 `verdict: fail` 且响应格式正确时，Phase gate 判定为 FAIL。

## Subagent 策略

- **不强制使用 subagent**：coding-workflow 和 harness skill 中不再包含 subagent dispatch 指令
- **AI 自主决定**：AI 根据当前任务复杂度自行判断是否 dispatch subagent
- **唯一例外**：Phase 退出时的复盘 subagent（`harness-retrospect`），由 Phase 退出流程显式要求

---

## 待清理项

以下 V4 产物全部删除（源代码保留在 git 历史中，工作目录中移除）：

| 文件/目录 | 原因 |
|----------|------|
| `loop-engine.ts` | 被 Phase loop 机制替代 |
| `gates/gate_phase3.ts` | 被各 Phase gate 替代 |
| `loop-prompts/` | 不再使用 |
| `__tests__/fixtures/e2e-evidence-*.json` | E2E 证据模板废弃 |
| `e2e-evidence-template.json` | 被 test_cases_template.json 替代 |
| `agents/harness-e2e-tester/` | E2E 测试阶段删除 |
| `skills/xyz-harness-e2e-test-plan/` | E2E 执行删除，仅保留 plan |

---

## 验收标准

### AC1：Phase 循环正常
- 每个 Phase 的 stage 按序执行
- 最后一个 stage 完成后检查门禁
- Gate FAIL 时回到循环起点
- Gate PASS 时退出循环

### AC2：runOnce stage 正确
- brainstorming 仅在首轮执行
- 后续循环自动跳过

### AC3：门禁 L1 检查
- 每种 Phase 的 L1 检查正确识别缺失/不合格文件
- 不合格时拒绝通过

### AC4：门禁 L2 检查
- L1 通过后触发 L2
- L2 网络错误时不阻塞（fail-open）
- L2 判定 FAIL 时正确阻止 Phase 退出

### AC5：Phase 退出流程
- Gate PASS → 复盘 prompt → AI dispatch subagent → 复盘文件生成 → 压缩 → 下一 Phase
- Phase 5 不执行压缩

### AC6：上下文压缩
- Phase 间通过 tree branch summary 压缩上下文
- 下一 Phase 从 summary 开始，上下文精简

### AC7：Test Phase JSON 机制
- test_cases_template.json 在 Plan Phase 生成
- test_execution.json 在 Test Phase 每轮更新
- L1 检查 case 一致性和全部通过状态
- L2 检查 execute_steps 真实性

### AC8：Plan 复杂度分级
- L1 复杂度时检查单文件 plan.md
- L2 复杂度时额外检查 3 个子文档

### AC9：复盘 Subagent
- 复盘 subagent 正确写入 retrospect.md
- 覆盖 Phase 执行和 Harness 体验两个维度

### AC10：不强制 Subagent
- coding-workflow 和 skill 中无 subagent dispatch 指令
- 复盘 subagent 除外

### AC11：V4 产物清理
- 清单中的文件和目录全部从工作目录移除
- 源代码在 git 历史中可追溯

### AC12：旧状态识别
- 检测到 V4 格式的 workflow-state.json 时，提示用户该 session 使用旧版 harness
- 提供重置选项（清理旧状态，从 Phase 1 重新开始）
- 不静默迁移（避免数据不一致）
