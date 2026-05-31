# SKILL 优化清单 — 剩余未处理项

> 更新日期：2026-05-31
> 状态：阶段性收尾，剩余项待后续处理

## 已完成

参见本次对话产出 + 另一个 agent 的处理结果，共处理 15+ 个 skill（新建/重写/删除/合并）。

## 剩余未处理 SKILL

按优先级分组：

### P1 — 待合并/精简（功能重叠）

| Skill | 现状 | 建议 |
|-------|------|------|
| `code-taste-review` | 通用品味审查，按文件分组 review | 与 `ts-taste-check` + `rust-taste-check` 合并为统一的品味审查入口，按语言自动路由 |
| `ts-taste-check` | TS/Vue 品味检查，含 ESLint 自动化规则 | 并入统一品味审查 |
| `rust-taste-check` | Rust 品味检查，含 lint 脚本 | 并入统一品味审查 |
| `manage-worktree` | worktree 管理（创建+删除） | 与 `create-worktree` + `remove-worktree` 功能重叠，评估是否合并 |
| `diagnose` | 系统化调试循环 | 与 `rethink` 有重叠（都是"跳出局部"），评估合并或明确分工 |
| `rethink` | 思维框架，跳出局部修补 | 同上 |

### P2 — 低频/零触发，待评估保留/删除

| Skill | 来源 | 触发情况 | 建议 |
|-------|------|---------|------|
| `bug-fix-recorder` | useful-dev-tools | 零触发 | 评估：功能是否可由 `meta-sk-skill-writer` 生成规则替代？或者保留为独立工具 |
| `cc-agent-design` | useful-dev-tools | 零触发 | 评估：与 `meta-sk-agent-writer` 的定位差异？前者偏设计咨询，后者偏编写 |
| `improve-codebase-architecture` | .agents/skills | 零触发 | 评估：是否可由 `meta-sk-skill-writer` 生成架构规则替代？ |
| `lightmerge-branch` | useful-dev-tools | 低频 | 评估：是否有独立价值，还是与 `merge-worktree` 合并 |
| `py-preference` | useful-dev-tools | 低频 | 评估：Python 编码偏好，可考虑并入 `meta-sk-skill-writer` 的规则输出 |
| `token-counter` | useful-dev-tools | 低频 | 评估：工具类 skill，可考虑改为 CLI 工具而非 skill |
| `to-prd` | .agents/skills | 零触发 | 评估：PRD 生成，使用频率极低 |
| `task-test-guide-workspace` | useful-dev-tools | 零触发 | 评估：历史遗留，可能已无价值 |
| `learned` | useful-dev-tools | 零触发 | 评估：Claude Code 遗留，Pi 不使用此机制 |

### P3 — 有独立价值，保留但待优化 description

| Skill | 说明 | 当前状态 |
|-------|------|---------|
| `pr-worktree` | worktree 提交+PR 流程 | 保留，description 已是 CSO 格式 |
| `remove-worktree` | worktree 清理 | 保留，需检查 description |
| `evolve` / `evolve-apply` / `evolve-report` | 进化分析系统（3 件套） | 保留，独立功能 |
| `remotion-*` (4个) | Remotion 视频工作流 | 保留，用户明确要求 |
| `grill-with-docs` | 设计压力测试 | 保留，用户明确要求 |
| `impeccable` | 前端设计 | 保留，用户明确要求 |
| `vision-analysis` | 图像分析降级 | 保留，与 model 能力配合 |
| `token-counter` | token 计数 | 保留，工具性质 |
| `web-fetch` | URL 内容获取 | 已重写为 CSO |
| `all xyz-harness-*` (16个) | harness 核心流程 | 保留，不优化 |

## 处理统计

| 类别 | 数量 |
|------|------|
| 已新建/重写 | 9 |
| 已删除/合并 | 8 |
| 已批量 YAML 修复 | 91 文件 |
| P1 待合并 | 6 |
| P2 待评估保留/删除 | 9 |
| P3 保留待优化 | ~25 |
| harness 核心（不动） | 16 |

## 下一步行动

1. **P1 合并**：将 `ts-taste-check` + `rust-taste-check` + `code-taste-review` 合并为统一的品味审查入口
2. **P1 合并**：评估 `diagnose` + `rethink` 的合并方案
3. **P2 评估**：逐个评估零触发 skill，决定删除或重写 description
4. **AST 追踪集成**：将 `code_link.py` 包装为 skill，替代已删除的 `batch-tracer` 等
5. **skill-state-tracker**：实现 skill 使用频率自动追踪，替代手动评估
