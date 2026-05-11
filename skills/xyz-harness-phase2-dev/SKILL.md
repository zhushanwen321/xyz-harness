---
description: "Phase 2 开发交付 — 基于 spec+plan 的 6 阶段 TDD+编码+审查+测试+推送+复盘流程。触发条件：用户说「Phase 2」「开发交付」「6 阶段流程」「开始开发」「继续开发需求」「基于 spec 和 plan」或 /loop 中包含这些关键词。此 skill 是旧 dev-flow 的精简版，仅描述 Phase 2 流程，不包含 Phase 1 的需求沟通。"
---

# Phase 2: 开发交付流程

你正处于 Phase 2（开发交付阶段）。Phase 1（需求沟通）已完成，你继承其产出文档。

**你不会继承 Phase 1 的会话上下文**。所有你需要的信息都在 spec.md 和 plan.md 中。
如果某份文档不完整，不要猜测——停止并报告给用户，要求补充文档。

## 核心原则

1. **spec + plan 是你的唯一指令集** — 按 plan.md 的 Task 顺序逐个实现
2. **TDD 优先** — 每个 Task 先写测试再实现，确保可验证
3. **门禁脚本强制执行** — 每个阶段完成后运行 `harness-state.sh advance → gate-script.sh → harness-state.sh pass`
4. **Phase 2 产出写回 Phase 1 目录** — 复盘和指标写入 Phase 1 的 `.xyz-harness/{topicDir}/` 下

## 6 阶段流程

### 阶段 1: 编码实现

1. 调用 `loop_task_tracker create_tasks` 创建以下 6 个 task：
   ```
   1. 编码实现 (TDD + 按 plan Task 逐个完成)
   2. 编码评审 (reviewer ≤2轮)
   3. 测试编写 (Change-driven Testing)
   4. 测试评审 (reviewer ≤2轮)
   5. 推送 + CI + 部署
   6. 自动复盘 (写回 Phase 1 目录)
   ```
2. 按 plan.md 的 Task 逐个实现：
   - 每个 Task 执行 TDD：先写测试 → 测试失败确认 → 实现 → 测试通过 → git commit
   - 完成后 `loop_task_tracker complete_task 1`
3. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 1 $PROJECT_ROOT
   bash scripts/gate-script.sh 01 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 1 $PROJECT_ROOT
   ```

### 阶段 2: 编码评审

1. 运行 `bash scripts/spec-completeness.sh $SPEC_PATH $PROJECT_ROOT` 检查 spec 自包含性
2. 派遣 reviewer subagent 对 git diff 执行独立评审
3. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/code_review_v1.md`
4. 最多 2 轮评审，MUST FIX 必须修复
5. 完成后 `loop_task_tracker complete_task 2`

### 阶段 3: 测试编写

1. 分析代码变更，对每个变更接口编写接口级测试（Change-driven Testing）
2. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 3 $PROJECT_ROOT
   bash scripts/gate-script.sh 03 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 3 $PROJECT_ROOT
   ```
3. 完成后 `loop_task_tracker complete_task 3`

### 阶段 4: 测试评审

1. 派遣 reviewer subagent 评审测试覆盖度和质量
2. 评审报告写入 `.xyz-harness/{topicDir}/changes/reviews/test_review_v1.md`
3. 最多 2 轮评审
4. 完成后 `loop_task_tracker complete_task 4`

### 阶段 5: 推送 + CI + 部署

1. `git push` 推送代码
2. 等待 CI 通过，验证结果写入 `changes/evidence/verification_output.md`
3. 部署验证，结果写入 `changes/evidence/deploy_result.md`
4. 运行门禁：
   ```bash
   bash scripts/harness-state.sh advance 5 $PROJECT_ROOT
   bash scripts/harness-state.sh pass 5 $PROJECT_ROOT
   ```
5. 完成后 `loop_task_tracker complete_task 5`

### 阶段 6: 自动复盘

1. 派遣 reviewer subagent 分析整个流程，产出 `retrospective.md`
2. **写回 Phase 1 目录**（路径由 Phase 1 提供）：
   - 复制 `retrospective.md` 到 `.xyz-harness/{topicDir}/changes/retrospective.md`
   - 计算指标（token 消耗、耗时、各阶段耗时），写入 `.xyz-harness/{topicDir}/metrics.json`
   - 更新 `.xyz-harness/{topicDir}/changes/summary.md`，标记 Phase 2 交付物完成
3. 完成后 `loop_task_tracker complete_task 6`

## 门禁脚本

所有脚本位于项目 `scripts/` 目录（或 `skills/xyz-harness-dev-flow/scripts/`）：

| 脚本 | 用途 |
|------|------|
| `harness-state.sh` | 状态机：advance（验证前置）→ pass（标记通过）→ rollback（回退）|
| `gate-script.sh` | L1 门禁检查：文件完整性、格式、指定阶段的合规 |
| `pre-stage-check.sh` | 前置阶段检查（由 gate-script.sh 自动调用）|
| `spec-ref-scan.sh` | spec 引用完整性扫描 |
| `spec-completeness.sh` | spec/plan 自包含检查 |

每个阶段调用顺序：
```bash
bash scripts/harness-state.sh advance <stage> $PROJECT_ROOT  # 验证前置已通过
bash scripts/gate-script.sh <stage> $PROJECT_ROOT             # L1 门禁检查
bash scripts/harness-state.sh pass <stage> $PROJECT_ROOT      # 标记通过
```

**跳过门禁 = 流程违规。** 主 agent 和 subagent 都不允许跳过。

## 环境变量

```
PROJECT_ROOT=<项目根目录>          # 从 launch 命令获取
TOPIC_DIR=.xyz-harness/{topicDir}  # Phase 1 提供的主题目录
SPEC_PATH=$TOPIC_DIR/spec.md        # spec 文件路径
PLAN_PATH=$TOPIC_DIR/plan.md        # plan 文件路径
```
