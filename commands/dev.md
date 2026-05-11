---
description: "Phase 2 开发交付（Claude Code 兼容）。基于 spec + plan 执行 TDD + 编码 + 审查 + 测试 + 审查 + 推送 + CI。"
allowed-tools: ["read", "edit", "write", "bash", "subagent", "loop_task_tracker"]
---

# Phase 2: 开发交付 — Loop 模式

你正在执行 Phase 2 开发交付。Phase 1（需求沟通）已完成，你继承 Phase 1 的产出文档。

**你不会继承 Phase 1 的会话上下文。所有你需要的信息都在 spec.md 和 plan.md 中。**

**如果 spec 或 plan 中某个文件路径/函数名/接口不完整，导致你无法执行——不要猜测，停止并报告给用户，要求补充 Phase 1 文档。**

## 固定阶段（按序执行）

使用 loop_task_tracker 管理以下阶段：

1. **编码实现** — 按 plan.md 的 Task 逐个实现。每个 Task：TDD（先写失败测试）→ 实现 → 确认测试通过 → git commit。完成后运行 `harness-state.sh advance 1 <project_root>` 和 `gate-script.sh 01 <project_root>`。
2. **编码评审** — 派遣 reviewer subagent 对 git diff 执行独立评审。评审报告写入 `changes/reviews/code_review_v{N}.md`。MUST FIX 需修复后重审（最多 2 轮）。
3. **测试编写** — 分析代码变更，对每个变更接口编写接口级测试。正常运行 `harness-state.sh advance 3` 和 `gate-script.sh 03`。
4. **测试评审** — 派遣 reviewer subagent 评审测试覆盖度和质量。评审报告写入 `changes/reviews/test_review_v{N}.md`。
5. **推送 + CI + 部署** — 提交推送、运行 CI 验证、部署验证。每个环节运行对应 gate 脚本。
6. **自动复盘** — 派遣 reviewer subagent 分析整个流程，产出 `changes/retrospective.md`。

## 门禁强制

每个阶段完成后：
1. 运行 `harness-state.sh advance <stage> <project_root>` — 验证前置阶段通过
2. 运行 `gate-script.sh <stage> <project_root>` — L1 门禁检查（适用于有 L1 的阶段）
3. 运行 `harness-state.sh pass <stage> <project_root>` — 标记通过

**跳过门禁 = 流程违规。**

## 关键文件路径

- Spec: $ARGUMENTS 中指定的 spec 路径
- Plan: $ARGUMENTS 中指定的 plan 路径
- 产出目录: spec 和 plan 所在的 `.xyz-harness/{主题}/` 目录
- Gate 脚本: `skills/xyz-harness-dev-flow/scripts/` 下

$ARGUMENTS
