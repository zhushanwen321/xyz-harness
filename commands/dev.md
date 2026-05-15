---
description: "Phase 2 开发交付（Claude Code 兼容）。基于 spec + plan 执行 TDD + 编码 + 审查 + 测试 + E2E + 审查 + 推送 + CI。"
allowed-tools: ["read", "edit", "write", "bash", "subagent", "loop_task_tracker", "todolist"]
---

# Phase 2: 开发交付 — Loop 模式

你正在执行 Phase 2 开发交付。Phase 1（需求沟通）已完成，你继承 Phase 1 的产出文档。

**你不会继承 Phase 1 的会话上下文。所有你需要的信息都在 spec.md 和 plan.md 中。**

**如果 spec 或 plan 中某个文件路径/函数名/接口不完整，导致你无法执行——不要猜测，停止并报告给用户，要求补充 Phase 1 文档。**

## 固定阶段（按序执行）

使用 loop_task_tracker 管理以下阶段：

Stage 9. **编码实现** — 按 plan.md 的 Task 逐个实现。**先用 `todolist create_tasks` 将 plan.md 的所有 Task 注册到任务列表**，然后每个 Task：TDD（先写失败测试）→ 实现 → 确认测试通过 → `todolist complete_task`（传入 summary，自动写 memory.md）→ git commit。完成后运行 `harness-state.sh advance 9 <project_root>` 和 `gate-script.sh 09 <project_root>`。
Stage 10. **编码评审** — 派遣 reviewer subagent 对 git diff 执行独立评审。评审报告写入 `changes/reviews/code_review_v{N}.md`。MUST FIX 需修复后重审（最多 2 轮）。
Stage 11. **单元测试编写** — 分析代码变更，对每个变更接口编写接口级测试。完成后运行 `harness-state.sh advance 11 <project_root>` 和 `gate-script.sh 11 <project_root>`。
Stage 12. **E2E 测试执行** — 按 e2e-test-plan.md 执行端到端测试。按依赖关系图拓扑顺序执行测试组，每个用例记录通过/失败/跳过。失败用例的后置依赖自动跳过。生成 e2e-test-report.md。
Stage 13. **测试评审** — 派遣 reviewer subagent 评审单元测试覆盖度和 E2E 测试结果。评审报告写入 `changes/reviews/test_review_v{N}.md`。
Stage 14. **推送 + CI + 部署** — 提交推送、运行 CI 验证、部署验证。每个环节运行对应 gate 脚本。
Stage 15. **自动复盘** — 派遣 reviewer subagent 分析整个流程，产出 `changes/retrospective.md`。

## 门禁强制

每个阶段完成后：
1. 运行 `harness-state.sh advance <stage> <project_root>` — 验证前置阶段通过
2. 运行 `gate-script.sh <stage> <project_root>` — L1 门禁检查（适用于有 L1 的阶段）
3. 运行 `harness-state.sh pass <stage> <project_root>` — 标记通过

**跳过门禁 = 流程违规。**

### Stage 12 E2E 测试前置门禁

进入 Stage 12 前必须验证：
1. `e2e-test-plan.md` 文件存在于产出目录中
2. 前端和后端服务可正常启动

前置条件不满足时，停止并报告给用户。

> 注意：E2E 阶段无 L1 门禁脚本，通过 `harness-state.sh pass 12 <project_root>` 直接标记通过。

## 关键文件路径

- Spec: $ARGUMENTS 中指定的 spec 路径
- Plan: $ARGUMENTS 中指定的 plan 路径
- E2E Test Plan: 产出目录下的 `e2e-test-plan.md`
- 产出目录: spec 和 plan 所在的 `.xyz-harness/{主题}/` 目录
- Gate 脚本: `skills/xyz-harness-dev-flow/scripts/` 下

$ARGUMENTS
