# Execution Groups 增强 — 实施计划

## 目标

在 plan.md 和 e2e-test-plan.md 中引入 Execution Groups（执行分组）机制：
1. Task 区分前端/后端类型，按功能关联度分组（每组 ≤ 10 文件）
2. 每组绑定 subagent 配置（agent、model、上下文、读写文件清单）
3. 组间评估依赖关系，编排串行/并行执行波次（Wave）
4. E2E 测试计划同样分组，每组绑定 subagent 配置
5. 文档自包含——光看 plan.md 就知道完整执行细节

## 需要修改的文件（按影响范围分组）

### A 组：核心 Skill 文件（改执行逻辑和输出格式）

| # | 文件 | 改什么 | 影响范围 |
|---|------|--------|---------|
| A1 | `skills/xyz-harness-writing-plans/SKILL.md` | **核心改造**：新增"Execution Groups"章节的编写指引；Task 结构增加 type(frontend/backend)字段；新增分组模板；废弃 L2 子文档模式（plan-backend.md/plan-frontend.md），统一用 Execution Groups；新增 Wave 编排指引 | Phase 1 Step 4 的 plan 编写 |
| A2 | `skills/xyz-harness-e2e-test-plan/SKILL.md` | **核心改造**：测试分组增加 Subagent 配置表；新增"执行调度"Wave 概念；subagent 任务模板更新（增加 agent/model 配置）；文档结构模板更新 | Phase 1 Step 6 的 E2E test plan 编写 |
| A3 | `skills/xyz-harness-phase2-dev/SKILL.md` | Stage 1 Step 3 从"逐个 task 派遣"改为"按 Execution Groups 按波次派遣"；更新 subtask 展开逻辑（组内 task 共享 subagent 调度）；更新上下文管理指引 | Phase 2 Stage 1 编码实现 |
| A4 | `skills/xyz-harness-subagent-driven-development/SKILL.md` | 上下文管理更新：主 agent 按 group（而非按 task）提取上下文；新增按 Wave 派遣的模式说明；Model Selection 章节更新（组级别 vs task 级别选择） | Phase 2 Stage 1 的调度参考 |

### B 组：调度编排 Skill（引用 plan 的格式）

| # | 文件 | 改什么 | 影响范围 |
|---|------|--------|---------|
| B1 | `skills/xyz-harness-dev-flow/SKILL.md` | Step 4（Plan 编写）中的 L1/L2 判断逻辑更新：L2 不再生成子文档，改为在 plan.md 内部分组；Step 6（E2E test plan）中的 subagent 分组策略更新；Subagent 配置表更新 | Phase 1 主流程编排 |
| B2 | `commands/track.md` | Stage 4（Plan 编写）描述更新：不再提及 L2 子文档，改为"编写 Execution Groups"；Stage 6（E2E test plan）描述更新 | /track 命令的 Phase 1 流程 |

### C 组：评审 Agent/Skill（评审维度增加）

| # | 文件 | 改什么 | 影响范围 |
|---|------|--------|---------|
| C1 | `skills/xyz-harness-expert-reviewer/SKILL.md` | 计划评审模式新增：Execution Groups 分组合理性检查（组大小、文件数、关联度）；Wave 编排正确性检查；Subagent 配置完整性检查 | Phase 1 Step 5 Plan 评审 |
| C2 | `agents/harness-reviewer/agent.md` | 计划评审维度新增：Execution Groups 检查（同 C1） | 同 C1 |
| C3 | `agents/harness-e2e-test-plan-reviewer/agent.md` | 评审维度新增：E2E 测试分组合理性；Wave 编排是否避免数据冲突；Subagent 配置完整性 | Phase 1 Step 7 E2E Plan 评审 |

### D 组：安装脚本（确保新文件正确 symlink）

| # | 文件 | 改什么 | 影响范围 |
|---|------|--------|---------|
| D1 | `install.py` | 无需修改（已正确扫描 harness- 前缀目录和 xyz-harness- 前缀 skill） | — |

### E 组：Symlink 缺失修复（不改动文件内容，只补链接）

| # | 位置 | 缺什么 |
|---|------|--------|
| E1 | `~/.pi/agent/agents/harness-e2e-tester.md` | 缺 .md symlink → agent.md |
| E2 | `~/.pi/agent/agents/harness-frontend-developer.md` | 缺 .md symlink → agent.md |
| E3 | `~/.agents/agents/` 下 7 个 agent | 缺 directory symlink：harness-api-alignment、harness-backend-plan-reviewer、harness-backend-planner、harness-e2e-test-plan-reviewer、harness-frontend-plan-reviewer、harness-frontend-planner、harness-spec-reviewer |
| E4 | `~/.agents/agents/` 下 10 个 agent | 缺 .md symlink → 对应 agent.md |

### F 组：可能废弃的文件（需要决定是否删除）

| # | 文件 | 原因 |
|---|------|--------|
| F1 | `agents/harness-backend-planner/agent.md` | 如果废弃 L2 子文档模式，后端 planner agent 不再需要 |
| F2 | `agents/harness-backend-planner/backend-plan-template.md` | 同上 |
| F3 | `agents/harness-backend-planner/api-contract-template.md` | 同上 |
| F4 | `agents/harness-frontend-planner/agent.md` | 如果废弃 L2 子文档模式，前端 planner agent 不再需要 |
| F5 | `agents/harness-frontend-planner/frontend-plan-template.md` | 同上 |
| F6 | `agents/harness-api-alignment/agent.md` | API 对齐 agent 不再需要 |
| F7 | `agents/harness-backend-plan-reviewer/agent.md` | 后端设计评审 agent 不再需要 |
| F8 | `agents/harness-frontend-plan-reviewer/agent.md` | 前端设计评审 agent 不再需要 |

---

## 设计决策（需要确认）

### D1：L2 子文档模式 ✅ 已确认：保留

Execution Groups 在 plan.md 内部负责"执行编排"（分组、subagent 配置、Wave 编排）。
当设计复杂度高、plan.md 会过长时，仍使用 L2 子文档模式（plan-backend.md + plan-frontend.md + plan-api-contract.md）。
Groups 引用子文档章节获取设计细节。

### D2：废弃的 agent ✅ 已确认：全部保留

F1-F8 全部保留。后端/前端 planner、API alignment、plan reviewer 继续在 L2 模式下使用。

### D3：E2E 测试组并行 ✅ 已确认：串行执行

E2E 测试组严格串行执行，不并行。原因：共享 Chrome 实例和数据库状态，并行不安全。

---

## 执行顺序

### Phase 1：Symlink 修复（无风险，优先执行）

1. 修复 E1-E4 的 symlink 缺失
2. 运行 install.py 验证

### Phase 2：确认设计决策

3. 与用户确认 D1（L2 模式）、D2（废弃 agent）、D3（E2E 并行安全）
4. 根据决策调整文件清单

### Phase 3：核心 Skill 改造

5. A1: xyz-harness-writing-plans — 新增 Execution Groups 编写指引
6. A2: xyz-harness-e2e-test-plan — 新增分组和 Wave 编排
7. A3: xyz-harness-phase2-dev — Stage 1 派遣逻辑改为按 Group 按波次
8. A4: xyz-harness-subagent-driven-development — 上下文管理更新

### Phase 4：编排和评审更新

9. B1: xyz-harness-dev-flow — Step 4/6 更新
10. B2: commands/track.md — Stage 4/6 更新
11. C1+C2: expert-reviewer + harness-reviewer — 评审维度增加
12. C3: harness-e2e-test-plan-reviewer — 评审维度增加

### Phase 5：验证

13. 运行 install.py 验证所有 symlink 正确
