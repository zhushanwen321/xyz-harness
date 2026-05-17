# XYZ Harness Engineering

## 项目背景

xyz-harness V5 — Manual Skill-Driven Workflow。不包含任何强制性的 extension 工具或 agent。
所有的开发流程由用户手动触发 skill 引导 AI 完成。

包含：
- `extensions/todolist/` — Pi 扩展：任务追踪
- `extensions/claude-rules-loader/` — Pi 扩展：跨项目规则加载
- `skills/` — SKILL.md 技能定义（14 个：8 个通用方法论 + 6 个 phase skill）

技术栈：TypeScript (Pi Extension API)、Markdown (skill 定义)。

## 架构设计

### 哲学

- **Pure Skill**：没有强制约束（no auto-gate, no state file, no loop engine）
- **Manual Control**：用户决定何时开始 phase、何时推进、何时检查 gate
- **Separate Gate**：gate 检查在独立对话中执行，避免 bias
- **No Subagent Dispatch**：AI 自主决定是否使用 subagent，不强制

### 工作流程

```
用户: "开始 Phase 1 spec"
  → Phase 1 skill 加载 → AI 按 guide 工作
  → 产出 spec.md + spec_review

用户: "检查 gate"（在另一个对话中）
  → Gate skill 加载 → AI 逐项验证交付物
  → 报告 PASS/FAIL

用户: "开始 Phase 2 plan"
  → Phase 2 skill 加载 → AI 按 guide 工作
  → 产出 plan.md + e2e-test-plan.md + test_cases_template.json + plan_review

用户: "检查 gate"（另一个对话）
  → Gate skill 验证 Phase 2 交付物

...重复到 Phase 5
```

### Phase 列表

| Phase | Skill | 产出 |
|-------|-------|------|
| 1 spec | xyz-harness-phase-spec | spec.md + spec_review |
| 2 plan | xyz-harness-phase-plan | plan.md, e2e-test-plan.md, test_cases_template.json, plan_review |
| 3 dev | xyz-harness-phase-dev | 源代码 + test_results.md + code_review |
| 4 test | xyz-harness-phase-test | test_execution.json |
| 5 pr | xyz-harness-phase-pr | pr_evidence.md + ci_results.md |

## 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| Phase 1 Spec | `skills/xyz-harness-phase-spec/SKILL.md` | 用户启动 Phase 1 时加载 |
| Phase 2 Plan | `skills/xyz-harness-phase-plan/SKILL.md` | 用户启动 Phase 2 时加载 |
| Phase 3 Dev | `skills/xyz-harness-phase-dev/SKILL.md` | 用户启动 Phase 3 时加载 |
| Phase 4 Test | `skills/xyz-harness-phase-test/SKILL.md` | 用户启动 Phase 4 时加载 |
| Phase 5 PR  | `skills/xyz-harness-phase-pr/SKILL.md` | 用户启动 Phase 5 时加载 |
| Gate Check | `skills/xyz-harness-gate/SKILL.md` | 用户单独对话中加载 |
| Backend Dev | `skills/xyz-harness-backend-dev/SKILL.md` | AI 编码时参考 |
| Frontend Dev | `skills/xyz-harness-frontend-dev/SKILL.md` | AI 编码时参考 |
| TDD | `skills/xyz-harness-test-driven-development/SKILL.md` | AI TDD 时参考 |
| Brainstorming | `skills/xyz-harness-brainstorming/SKILL.md` | Phase 1 brainstorm 时参考 |
| Plan Writing | `skills/xyz-harness-writing-plans/SKILL.md` | Phase 2 写 plan 时参考 |
| Expert Reviewer | `skills/xyz-harness-expert-reviewer/SKILL.md` | 评审方法论 |
| Verification | `skills/xyz-harness-verification-before-completion/SKILL.md` | 提交通用质量检查 |
| Subagent-Driven Dev | `skills/xyz-harness-subagent-driven-development/SKILL.md` | subagent 调度模式参考 |

## Extension

- `extensions/todolist/` — Todolist 扩展（任务追踪工具）
- `~/.pi/agent/extensions/force-loop/` — Loop 循环机制（Pi 基础工具）

无其他 harness extension。

## 质量门禁

- 无自动门禁。所有 gate 检查通过 `xyz-harness-gate` skill 在独立 Pi 会话中手动执行。

## Skill YAML Frontmatter 注意事项

SKILL.md 文件的 YAML frontmatter 由 Pi 读取解析，以下陷阱会导致启动报错：

### 描述值必须加引号的场景

如果 `description` 或其他字段的值包含以下内容，**必须**用单引号或双引号包裹：

- **冒号后跟空格**：如 `Trigger: "run gate check"` 中的 `: "`，YAML 会误判为 mapping 嵌套
- **特殊 YAML 字符**：`{}`, `[]`, `>`, `|`, `!`, `&`, `*` 等
- **以 YAML 保留字开头**：`true`, `false`, `yes`, `no`, `null`, `on`, `off` 等

### 引号使用规则

| 值中是否含双引号 | 推荐包裹方式 | 示例 |
|---|---|---|
| 含双引号 | 外层单引号 | `description: 'Trigger: "check"'` |
| 不含双引号 | 外层双引号 | `description: "file exists, YAML parses"` |
| 含单引号 | 外层双引号，内层 escape | `description: "It\'s working"` |
| 都不含 | 可不加，但含冒号时仍需加 | — |

### 验证命令

修改 SKILL.md 的 frontmatter 后，用以下命令验证 YAML 解析：

```bash
head -4 <path>/SKILL.md | python3 -c "
import sys, yaml
lines = sys.stdin.read()
parts = lines.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    print('OK:', data)
else:
    print('No valid YAML frontmatter found')
"
```

### 历史修复

- 2026-05-17: `xyz-harness-gate/SKILL.md` description 未加引号，内嵌 `Trigger: "run gate check"` 中的 `: ` 被 YAML 误判为 mapping 键值分隔符，导致 Pi 启动报错。用外层单引号包裹修复。
