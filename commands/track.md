---
description: "需求沟通阶段追踪（Claude Code 兼容）。6 步固定流程：讨论→Spec→扫描→Plan→评审→确认。"
allowed-tools: ["read", "edit", "write", "bash", "subagent", "loop_task_tracker"]
---

# 需求沟通阶段 — Track 模式

你正在执行固定的 6 步需求沟通流程。你的产出将交付给另一个 agent（Phase 2）执行开发。

**核心原则：所有文档必须自包含、详细。另一个 agent 不会继承你的会话上下文。你的文档就是对方的「完整指令集」——不是补充参考，而是唯一的信息源。**

## 固定步骤（按序执行，不可跳步）

使用 loop_task_tracker 管理以下步骤：

1. **需求讨论** — 与用户讨论需求，澄清目标、范围、约束。逐一提问确认。
2. **Spec 编写** — 编写 spec.md，包含：目标、架构决策、验收标准(AC)、数据流(如涉及)、受影响文件列表。**每个文件路径必须从项目根开始写完整，每个函数/接口必须写明签名和位置。你的文档是给另一个 agent 的完整指令——不要假设对方知道你在说什么。**
3. **引用扫描** — 运行 `spec-ref-scan.sh <project_root> <spec_path>` 验证引用完整性。有问题则修复 spec 后重新扫描。
4. **Plan 编写** — 编写 plan.md，包含 Task 拆分、依赖关系、涉及文件。**每个 Task 必须有足够的上文——要改什么、怎么改、为什么改。对方没有你的对话历史。**
5. **计划评审** — 派遣 reviewer subagent 独立评审 spec + plan。评审报告写入 `changes/reviews/plan_review_v1.md`。MUST FIX 需修复后重审（最多 3 轮）。
6. **用户确认** — 向用户展示最终 spec 和 plan。**确认前先自包含检查：另一个 agent 能否单凭 spec.md + plan.md + 代码库完成实现？如果某个文件/函数被引用但路径不完整，补充完整后再提交确认。**确认后输出 Phase 2 启动指令。

## 产出目录

所有文档写入 `.xyz-harness/{yyyy-MM-dd}-{主题}/`，包含：
- `spec.md` — 需求设计文档
- `plan.md` — 实现计划
- `changes/summary.md` — 初始化的追溯文件
- `changes/reviews/plan_review_v{N}.md` — 评审记录

## Phase 2 启动指令

Step 6 完成后，输出：

```
Phase 1 完成。产出物：
- spec.md: {路径}
- plan.md: {路径}

启动 Phase 2（开发交付）：
1. /new 创建新 session
2. /loop --max 20 基于以下文档继续开发需求：

需求：{一句话需求描述}
Spec 路径：{spec.md 路径}
Plan 路径：{plan.md 路径}
```

$ARGUMENTS
