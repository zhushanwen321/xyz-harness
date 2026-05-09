# xyz-harness-engineering 项目进度

> 最后更新：2026-05-08

---

## 里程碑

### M1：设计与规划 ✅

产出物：
- `chat_project/harness-engineering/` — 5 份设计文档（背景分析、原文分析、现状分析、方案设计、实施进展）
- 设计文档通过 brainstorming 逐条确认，所有架构决策记录在 spec.md

关键决策：
- 11 阶段流水线（原文 10 阶段 + 阶段⑪自动复盘）
- 主 agent 纯调度 + subagent 执行 + gate-checker 门禁
- 三层约束：L1 脚本强制 + L2 subagent + L3 人工确认
- loop_task_tracker 管理阶段状态
- .xyz-harness/ 运行时目录（gate 标记 + metrics + health）
- xyz-harness- 统一前缀
- TDD 单元级 + Change-driven 接口级

### M2：全部 Skill 编写 ✅

| # | Skill | 状态 | 来源 | 文件数 |
|---|-------|------|------|--------|
| 1 | xyz-harness-dev-flow | ✅ | 新建（升级） | 4（SKILL.md + gate-script.sh + 2 references） |
| 2 | xyz-harness-expert-reviewer | ✅ | 新建 | 1 |
| 3 | xyz-harness-coding-skill | ✅ | 新建 | 7（SKILL.md + 6 specs） |
| 4 | xyz-harness-unit-test-write | ✅ | 新建 | 1 |
| 5 | xyz-harness-deploy-verify | ✅ | 新建 | 1 |
| 6 | xyz-harness-brainstorming | ✅ | 提取 | 1 |
| 7 | xyz-harness-writing-plans | ✅ | 提取 | 1 |
| 8 | xyz-harness-subagent-driven-development | ✅ | 提取+适配 | 3（SKILL.md + 2 prompt 模板） |
| 9 | xyz-harness-verification-before-completion | ✅ | 提取 | 1 |
| 10 | xyz-harness-test-driven-development | ✅ | 提取 | 1 |

辅助文件：
- install.py — symlink 安装 + 旧版清理 ✅
- README.md ✅

### M3：安装与测试 ⬜

- [x] skills + agents symlink 安装验证通过
- [x] 所有技能文件完整性检查通过
- [x] 所有引用的相对路径可解析
- [ ] 在真实项目上测试 dev-flow 全流程
- [ ] 根据测试结果迭代修正

---

### 已知修复（2026-05-09）

| 修复项 | 说明 |
|--------|------|
| subagent 嵌套调用 | subagent-driven-development SKILL.md 改为主 agent 参考模式，不再由 executor 加载后内部调度 |
| dev-flow 阶段 ③ 重写 | 从「派 executor → executor 内部调度 subagent」改为「主 agent 直接按 task 迭代派遣 TDD coder → executor → reviewer」 |
| gate-checker rollback_target | 每阶段检查清单增加了明确的回退目标说明 |
| executor summary.md 更新 | executor 工作流程增加了 summary.md 更新步骤 |
| prompt 模板澄清 | implementer/tdd-coder/spec-reviewer 模板加了 header 说明使用方为主 agent |
| subagent-driven-development description | 改为中文 |
| troubleshooting 文档 | TROUBLESHOOTING.md 已创建 |
| symlink 验证 | 所有 11 skills + 4 agents symlink 在 pi 和 Claude Code 目录均有效 |

---

## 统计

| 指标 | 值 |
|------|---|
| Skill 源文件 | 21 个 |
| Skill 总行数 | ~5675 行 |
| 设计文档 | 3 个（~1711 行） |
| Troubleshooting | 1 个（~280 行） |
| Git commit | 68e4e92 |
| 分支 | xyz-harness-engineering |

---

## 设计文档索引

| 文档 | 位置 | 说明 |
|------|------|------|
| spec.md | `.superpowers/2026-05-08-harness-engineering/spec.md` | 完整架构设计、决策记录 |
| plan.md | `.superpowers/2026-05-08-harness-engineering/plan.md` | 实施计划（12 个 Task） |
| stage-execution-detail.md | `.superpowers/2026-05-08-harness-engineering/stage-execution-detail.md` | 11 阶段执行逻辑详细设计 |
