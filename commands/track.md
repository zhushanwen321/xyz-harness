---
description: "需求沟通阶段追踪（Claude Code 兼容）。7 步固定流程：讨论→Spec→扫描→Plan→E2E测试计划→评审→确认。"
allowed-tools: ["read", "edit", "write", "bash", "subagent", "loop_task_tracker"]
---

# 需求沟通阶段 — Track 模式

你正在执行固定的 7 步需求沟通流程。你的产出将交付给另一个 agent（Phase 2）执行开发。

**核心原则：所有文档必须自包含、详细。另一个 agent 不会继承你的会话上下文。你的文档就是对方的「完整指令集」——不是补充参考，而是唯一的信息源。**

## 固定步骤（按序执行，不可跳步）

使用 loop_task_tracker 管理以下步骤：

1. **需求讨论** — 与用户讨论需求，澄清目标、范围、约束。逐一提问确认。
2. **Spec 编写** — 编写 spec.md，包含：目标、架构决策、验收标准(AC)、数据流(如涉及)、受影响文件列表。**每个文件路径必须从项目根开始写完整，每个函数/接口必须写明签名和位置。你的文档是给另一个 agent 的完整指令——不要假设对方知道你在说什么。**
3. **引用扫描** — 运行 `spec-ref-scan.sh <project_root> <spec_path>` 验证引用完整性。有问题则修复 spec 后重新扫描。
4. **Plan 编写** — 编写 plan.md，包含 Task 拆分、依赖关系、涉及文件。**每个 Task 必须有足够的上文——要改什么、怎么改、为什么改。对方没有你的对话历史。**
5. **E2E 测试计划** — 基于 spec.md + plan.md 编写 e2e-test-plan.md（端到端测试计划）。先由主 agent 生成整体方案框架（测试环境、分组策略、依赖关系图），再通过 subagent 分组生成具体测试用例。每个用例包含：测试目标、启动方式、操作步骤、期望结果、衡量方式（DOM/截图/数据库/日志）。用例之间标注依赖关系。详见 skill: xyz-harness-e2e-test-plan。
6. **计划评审** — 派遣 reviewer subagent 独立评审 spec + plan + e2e-test-plan。评审报告写入 `changes/reviews/plan_review_v1.md`。MUST FIX 需修复后重审（最多 3 轮）。
7. **用户确认** — 向用户展示最终 spec、plan 和 e2e-test-plan。**确认前先自包含检查：另一个 agent 能否单凭 spec.md + plan.md + e2e-test-plan.md + 代码库完成实现？如果某个文件/函数被引用但路径不完整，补充完整后再提交确认。**确认后输出 Phase 2 启动指令。

## 产出目录

所有文档写入 `.xyz-harness/{yyyy-MM-dd}-{主题}/`，包含：
- `spec.md` — 需求设计文档
- `plan.md` — 实现计划
- `e2e-test-plan.md` — 端到端测试计划
- `changes/summary.md` — 初始化的追溯文件
- `changes/reviews/plan_review_v{N}.md` — 评审记录

## Phase 2 启动指令

Step 7 完成后，输出以下提示词模板供用户在新 session 中使用：

```
Phase 1 完成。产出物：
- spec.md: {路径}
- plan.md: {路径}
- e2e-test-plan.md: {路径}

请在新的 agent session 中执行以下提示词启动 Phase 2（开发交付）：

```
/loop --max 20 {一句话需求描述}

你正在执行 Phase 2（开发交付）。Phase 1（需求沟通）已完成。
你不会继承 Phase 1 的会话上下文，所有信息在以下文档中：

## 必读文件（按顺序阅读）
1. 项目 CLAUDE.md（项目级编码规范和架构约束）
2. {spec.md 路径}（需求设计文档）
3. {plan.md 路径}（实现计划）
4. {e2e-test-plan.md 路径}（端到端测试计划）

## 加载 Skill
- xyz-harness-phase2-dev（Phase 2 七阶段流程的完整指令）
- xyz-harness-subagent-driven-development（task 调度模式参考）
- xyz-harness-coding-skill（分层编码规范，按需加载）
- xyz-harness-unit-test-write（Change-driven Testing，阶段 3 使用）
- xyz-harness-e2e-test-plan（E2E 测试执行，阶段 4 使用）
- xyz-harness-verification-before-completion（验证，阶段 6 使用）
- xyz-harness-deploy-verify（部署验证，阶段 6 使用）

## 7 阶段流程（使用 loop_task_tracker 管理进度）
Stage 1: 编码实现 (TDD + 按 plan Task 逐个完成)
Stage 2: 编码评审 (reviewer ≤2轮)
Stage 3: 测试编写 (Change-driven Testing)
Stage 4: E2E 测试执行 (按 e2e-test-plan.md 执行端到端测试)
Stage 5: 测试评审 (reviewer ≤2轮)
Stage 6: 推送 + CI + 部署
Stage 7: 自动复盘 (写回 Phase 1 目录)

## 关键路径
- Phase 1 产出目录: {topicDir}
- Phase 2 写回目录: {topicDir}/changes/
- 门禁脚本: skills/xyz-harness-dev-flow/scripts/
- 每个阶段运行: harness-state.sh advance → gate-script.sh → harness-state.sh pass

## 启动步骤
1. loop_task_tracker create_tasks 创建 7 个阶段任务
2. 阅读 spec.md、plan.md 和 e2e-test-plan.md
3. 从 Stage 1 编码实现开始，按 plan.md 的 Task 逐个 TDD 实现
```
```

$ARGUMENTS
