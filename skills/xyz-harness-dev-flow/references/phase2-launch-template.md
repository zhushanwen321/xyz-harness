# Phase 2 启动提示词模板

Phase 1 主 agent 在 Step 7（用户确认）通过后，必须按此模板生成 Phase 2 启动提示词。
模板中的 `{{变量}}` 由 Phase 1 主 agent 从产出物中填充。

---

## 生成规则

1. **逐项填充** — 所有 `{{必填}}` 变量必须填充，缺失则说明 Phase 1 产出不完整
2. **条件性区块** — 标注 `[条件性]` 的区块，仅在条件满足时包含
3. **禁止修改固定文本** — 非 `{{变量}}` 部分是固定指令，不允许 Phase 1 agent 修改或精简
4. **禁止遗漏任何章节** — 即使某章节看起来"理所当然"，也必须完整输出

---

## 模板正文

以下是用户需要复制到新 session 的完整提示词：

~~~
/loop --max 20 {{一句话需求描述}}

/dev-flow phase2

## 任务描述
{{2-3 句话概述需求目标和范围，从 spec.md 开头的「目标」章节提取}}

## 必读文件（按顺序阅读）
1. 项目 CLAUDE.md + docs/ 标准文档
2. {{spec.md 的绝对路径}}
3. {{plan.md 的绝对路径}}
4. {{e2e-test-plan.md 的绝对路径}}[条件性: 仅当 e2e-test-plan.md 存在时包含]

## 粗粒度进度管理
使用 loop_task_tracker 创建以下 7 个阶段任务，每完成一个阶段调用 complete_task：
1. 编码实现 (TDD + 按 plan Task 逐个完成)
2. 编码评审 (reviewer subagent, ≤2 轮)
3. 单元测试编写 (Change-driven Testing)
4. E2E 测试执行 (按 e2e-test-plan.md)[条件性: 仅当 e2e-test-plan.md 存在时包含]
5. 测试评审 (reviewer subagent, ≤2 轮)
6. 推送 + CI + 部署
7. 自动复盘 (写回 Phase 1 目录)

## 细粒度任务管理
Stage 1 编码实现内部，使用 todolist 管理 plan.md 的 Task 列表：
- todolist create_tasks: 注册 plan.md 的所有 Task
- 每个 Task 完成后: todolist complete_task(taskId, summary="关键决策和提醒")
- 发现陷阱或关键决策时: todolist update_memory(content="...")
- summary 自动写入 memory.md，供 /loop 轮次恢复上下文

## 每轮恢复
Phase 2 在 /loop 模式下执行。每轮开始时必须先读取 {{memory.md 的绝对路径}} 恢复上下文。

## 加载 Skill
- xyz-harness-phase2-dev（Phase 2 七阶段完整流程 — 必读）
- xyz-harness-subagent-driven-development（task 调度模式参考）
- xyz-harness-coding-skill（分层编码规范，按需加载）
- xyz-harness-unit-test-write（Stage 3 使用）
- xyz-harness-e2e-test-plan（Stage 4 使用）[条件性: 仅当 e2e-test-plan.md 存在时包含]
- xyz-harness-verification-before-completion（Stage 6 使用）
- xyz-harness-deploy-verify（Stage 6 使用）

## 关键路径
- 产出目录: {{.xyz-harness/{topicDir}/ 的绝对路径}}
- 写回目录: {{.xyz-harness/{topicDir}/changes/ 的绝对路径}}
- 门禁脚本: skills/xyz-harness-dev-flow/scripts/
- 每个阶段运行: harness-state.sh advance → gate-script.sh → harness-state.sh pass

## 启动前置检查
开始 7 阶段前，先执行 Phase 2 启动前置检查（见 xyz-harness-phase2-dev skill）。
验证 spec.md / plan.md 的完整性。如果必须检查项缺失，停止并报告。

## 硬约束
1. 主 agent 是调度器，禁止直接使用 edit/write 编写实现代码
2. 所有编码通过 subagent 完成
3. 跳过门禁 = 流程违规
4. Stage 1 内每个 plan Task 必须: TDD 测试 → 实现 → Spec 合规检查 → git commit
5. 如果 spec 或 plan 中某个路径/函数名/接口不完整——不要猜测，停止并报告

## L2 复杂度额外文件[条件性: 仅当存在 L2 子文档时包含]
- {{plan-backend.md 的绝对路径}}
- {{plan-frontend.md 的绝对路径}}
- {{plan-api-contract.md 的绝对路径}}
- {{api-alignment-report.md 的绝对路径}}

## 复杂度等级
{{L1 或 L2，从 plan.md 总纲中提取}}
~~~

---

## 变量填充说明

| 变量 | 来源 | 必填 |
|------|------|------|
| `{{一句话需求描述}}` | 用户原始需求描述，或 spec.md 的目标章节首句 | 是 |
| `{{2-3 句话概述}}` | spec.md「目标」章节摘要 | 是 |
| `{{spec.md 路径}}` | 产出物绝对路径 | 是 |
| `{{plan.md 路径}}` | 产出物绝对路径 | 是 |
| `{{e2e-test-plan.md 路径}}` | 产出物绝对路径 | 条件性 |
| `{{memory.md 路径}}` | `{topicDir}/changes/memory.md` | 是 |
| `{{产出目录路径}}` | `.xyz-harness/{topicDir}/` | 是 |
| `{{写回目录路径}}` | `.xyz-harness/{topicDir}/changes/` | 是 |
| `{{L2 子文档路径}}` | L2 复杂度时的子文档 | 条件性 |
| `{{复杂度等级}}` | plan.md 总纲中的评估 | 是 |
