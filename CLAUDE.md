# XYZ Harness Engineering

## 项目背景

xyz-harness V5 — Manual Skill-Driven Workflow。不包含任何强制性的 extension 工具。
所有的开发流程由用户手动触发 skill 引导 AI 完成。

包含：
- `extensions/todolist/` — Pi 扩展：任务追踪
- `extensions/claude-rules-loader/` — Pi 扩展：跨项目规则加载
- `skills/` — SKILL.md 技能定义（11 个）
- `agents/` — Agent 定义（harness-retrospect 复盘 agent）

技术栈：TypeScript (Pi Extension API)、Markdown (skill/agent 定义)。

## 架构设计

### 哲学

- **Pure Skill**：没有强制约束（no auto-gate, no state file, no loop engine）
- **Manual Control**：用户决定何时开始 phase、何时推进、何时检查 gate
- **Separate Gate**：gate 检查在独立对话中执行，避免 bias
- **审查和复盘强制 subagent**：审查（review）和复盘（retrospect）通过 dispatch 独立 subagent 执行，保证客观性
- **编码由 AI 自主决定**：简单项目主 agent 直接编码，复杂项目可参考 subagent-driven-development dispatch subagent

### Subagent 执行模型

所有 subagent 使用 `general-purpose` agent，通过 task prompt 指定 read 对应的 skill 文件获取方法论：

```
主 agent dispatch subagent:
  agent: general-purpose
  task prompt: "read {skill_path} 获取方法论，然后 read {待处理文件}，按方法论执行，输出到 {output_path}"
```

不创建专用 agent（harness-retrospect 除外），避免维护成本。

### 工作流程

```
用户: "start Phase 1"
  → brainstorming skill 加载 → AI 按 guide 工作
  → 产出 spec.md
  → dispatch 审查 subagent → spec_review_v*.md
  → dispatch 复盘 subagent → spec_retrospect.md
  → gate check（独立 session）

用户: "start Phase 2"
  → writing-plans skill 加载 → AI 按 guide 工作
  → 产出 plan.md + e2e-test-plan.md + test_cases_template.json
  → dispatch 审查 subagent → plan_review_v*.md
  → dispatch 复盘 subagent → plan_retrospect.md
  → gate check（独立 session）

用户: "start Phase 3"
  → phase-dev skill 加载 → AI 按 guide 工作
  → 产出 源代码 + test_results.md
  → dispatch 审查 subagent → code_review_v*.md
  → dispatch 复盘 subagent → dev_retrospect.md
  → gate check（独立 session）

...Phase 4, 5 类似
```

### Phase 列表

| Phase | Skill | 产出 |
|-------|-------|------|
| 1 spec | xyz-harness-brainstorming | spec.md + spec_review + spec_retrospect |
| 2 plan | xyz-harness-writing-plans | plan.md, e2e-test-plan.md, test_cases_template.json, plan_review + plan_retrospect |
| 3 dev | xyz-harness-phase-dev | 源代码 + test_results.md + code_review + dev_retrospect |
| 4 test | xyz-harness-phase-test | test_execution.json + test_retrospect |
| 5 pr | xyz-harness-phase-pr | pr_evidence.md + ci_results.md + overall_retrospect |

## 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| Phase 1 Spec | `skills/xyz-harness-brainstorming/SKILL.md` | Phase 1 入口：需求探索 + spec 编写 + 审查 |
| Phase 2 Plan | `skills/xyz-harness-writing-plans/SKILL.md` | Phase 2 入口：plan 编写 + 审查 |
| Phase 3 Dev | `skills/xyz-harness-phase-dev/SKILL.md` | Phase 3 入口：TDD + 编码 + 审查 |
| Phase 4 Test | `skills/xyz-harness-phase-test/SKILL.md` | Phase 4 入口：测试执行 |
| Phase 5 PR  | `skills/xyz-harness-phase-pr/SKILL.md` | Phase 5 入口：推送 + PR |
| Gate Check | `skills/xyz-harness-gate/SKILL.md` | 独立 session 中加载，验证交付物 |
| Expert Reviewer | `skills/xyz-harness-expert-reviewer/SKILL.md` | 审查方法论（subagent read 获取） |
| Backend Dev | `skills/xyz-harness-backend-dev/SKILL.md` | 后端编码规范（编码时参考） |
| Frontend Dev | `skills/xyz-harness-frontend-dev/SKILL.md` | 前端编码规范（编码时参考） |
| TDD | `skills/xyz-harness-test-driven-development/SKILL.md` | TDD 方法论（编码时参考） |
| Subagent-Driven Dev | `skills/xyz-harness-subagent-driven-development/SKILL.md` | subagent 调度模式参考 |
| Retrospect Agent | `agents/harness-retrospect/agent.md` | 复盘 agent（每个 phase 完成后 dispatch） |

## Extension

- `extensions/todolist/` — Todolist 扩展（任务追踪工具）
- `~/.pi/agent/extensions/force-loop/` — Loop 循环机制（Pi 基础工具）

无其他 harness extension。

## 质量门禁

- 无自动门禁。所有 gate 检查通过 `xyz-harness-gate` skill 在独立 Pi 会话中手动执行。
- Gate check 脚本：`skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} {phase_number}`

## Skill YAML Frontmatter 注意事项

SKILL.md 文件的 YAML frontmatter 由 Pi 读取解析，以下陷阱会导致启动报错：

### 描述值必须加引号的场景

如果 `description` 或其他字段的值包含以下内容，**必须**用单引号或双引号包裹：

- **冒号后跟空格**：如 `Trigger: "run gate check"` 中的 `: "`，YAML 会误判为 mapping 嵌套
- **特殊 YAML 字符**：`{}`, `[]`, `>`, `|`, `!`, `&`, `*` 等
- **以 YAML 保留字开头**：`true`, `false`, `yes`, `no`, `null`, `on`, `off` 等

### 引号和块标量使用规则

| 值特征 | 推荐方式 | 示例 |
|--------|---------|------|
| 含双引号 | `>-` 块标量（推荐）或外层单引号 | 见下方 |
| 不含双引号 | 外层双引号 | `description: "file exists, YAML parses"` |
| 含单引号 | 外层双引号，内层 escape | `description: "It\'s working"` |
| 都不含 | 可不加，但含冒号时仍需加 | — |

**推荐用 `>-` 块标量**（folded block scalar with strip）：
- description 等长文本写在多行，每行缩进 2 空格
- 自动折叠为一行，`-` 去掉末尾换行
- 不需要处理引号转义
- 示例：
```yaml
description: >-
  Gate check for harness. Trigger: "run gate check",
  "verify deliverables", "check gate".
```
会被解析为：`Gate check for harness. Trigger: "run gate check", "verify deliverables", "check gate".`

### 验证命令

修改 SKILL.md 的 frontmatter 后，用以下命令验证 YAML 解析（读取完整文件，不限于 `head -4`，因为 block scalar 可能跨多行）：

```bash
python3 -c "
import yaml
with open('{path}') as f:
    content = f.read()
first = content.find('---')
second = content.find('---', first + 3)
if first >= 0 and second > first:
    data = yaml.safe_load(content[first+3:second])
    if data:
        print('OK:', list(data.keys()))
    else:
        print('Parse error: empty')
else:
    print('No valid YAML frontmatter')
"
```

### 历史修复

- 2026-05-17: `xyz-harness-gate/SKILL.md` description 含 `Trigger: "run gate check"`，冒号后的空格被 YAML 误判为 mapping 键值分隔符。修复方式：改用 `>-` block scalar 折叠格式，不需要处理引号转义。

## Pre-commit Hook

项目配置了 git pre-commit hook，自动校验 skill/agent/command 文件的 YAML frontmatter 格式。

### 文件位置

```
.bare/hooks/pre-commit
```

由于使用 bare repo + worktree 结构，hook 路径通过 bare repo 的 `core.hooksPath` 配置生效（已在 `.bare/config` 中设置）：

```bash
# .bare/config
[core]
	hooksPath = /Users/zhushanwen/Code/xyz-harness-engineering-workspace/.bare/hooks
```

hook 会自动对所有 worktree 生效。

### 校验范围

| 文件模式 | 说明 |
|---------|------|
| `skills/*/SKILL.md` | Skill 定义文件 |
| `commands/*.md` | Command 定义文件 |
| `extensions/*/SKILL.md` | Extension skill 文件 |
| `*.agent.md` | Agent 定义文件 |
| `agents/*/agent.md` | Agent 定义文件 |
| `.pi/agents/*.md` | Pi Agent 定义文件 |

### 校验内容

1. **YAML 解析**：确保 frontmatter 能被 `yaml.safe_load()` 正确解析
2. **冒号陷阱检测**：检测 unquoted description 中是否包含 `: `（冒号+空格），防止 YAML 误判为嵌套 mapping

### 跳过 hook

```bash
git commit --no-verify -m "message"
# 或
SKIP=pre-commit git commit -m "message"
```
