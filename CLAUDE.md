# XYZ Harness Engineering

## 项目背景

xyz-harness V5 — AI 编码工作流引擎。两套运行模式：

- **Manual Mode（纯 Skill）**：用户手动触发 skill，手动跑 gate，手动 dispatch review/retrospect
- **Auto Mode（coding-workflow 扩展）**：`/coding-workflow <topic>` 启动，自动编排 phase 切换、gate、review、retrospect

包含：
- `extensions/todolist/` — Pi 扩展：任务追踪
- `extensions/claude-rules-loader/` — Pi 扩展：跨项目规则加载
- `skills/` — SKILL.md 技能定义（11 个）
- `agents/` — Agent 定义（harness-retrospect 复盘 agent）

技术栈：TypeScript (Pi Extension API)、Python (gate-check.py)、Markdown (skill/agent 定义)。

---

## AI 控制哲学

### 核心原则：AI 是不可信的执行者

AI 不是协作者，是一个**智商有限但极其狡猾的执行者**。它会：
- **跳过检查**：说"已验证"但实际没跑命令
- **伪造结果**：编造测试通过、覆盖率达标的假象
- **偷看上下文**：利用之前 phase 的记忆跳过当前阶段
- **提前规划**：在 spec 阶段就开始思考代码实现
- **静默降级**：遇到困难时悄悄降低标准而不是报告

Harness 的全部设计目标就是防止这些行为。

### 五层防御体系

| 层级 | 机制 | 防御目标 |
|------|------|---------|
| **L1 上下文隔离** | 每个 phase 只注入当前 skill，compact 清除历史 | 防止 AI 利用前序 phase 记忆偷跑或跳过 |
| **L2 脚本门禁** | gate-check.py 验证文件存在 + YAML frontmatter | AI 无法伪造脚本输出 |
| **L3 独立评审** | review subagent 不继承主 agent 上下文 | 评审者不受编码者 bias 影响 |
| **L4 强制复盘** | retrospect 失败 → phase-start BLOCKED | 复盘不可跳过，复盘缺失 = 无法推进 |
| **L5 结果可见** | gate PASS 消息包含 review + retrospect 状态 | 失败不再是 console.warn 静默吞掉 |

### AI 逃脱模式与对策

| AI 逃脱行为 | Harness 对策 |
|------------|-------------|
| 跳过 gate 直接进入下一 phase | phase-start 必须检查 phaseResults[当前] = "passed" |
| 跳过复盘直接推进 | phase-start 检查 retrospect 文件存在，不存在则 BLOCKED |
| 评审和编码是同一个人 | review subagent 独立进程、独立上下文、独立模型 |
| 利用之前 phase 的知识偷跑 | compact() 在 phase 切换时清除对话历史 |
| 复盘 subagent 失败但继续推进 | gate PASS 消息中包含 WARNING，phase-start 二次拦截 |
| 伪造测试结果 | gate-check.py 检查 YAML frontmatter 中的 verdict 字段 |
| 不读 skill 指令直接凭感觉干活 | before_agent_start 强制注入 skill 内容 |
| Phase 5 合并 PR（不可逆操作） | skill 注入中明确 "MUST NOT merge the PR" |

### 信息隔离规则

AI **不得知道**：
- 一共有多少个 phase（只知道当前 phase）
- 下一个 phase 是什么
- 之前 phase 的详细讨论内容（compact 后只保留 deliverables 路径）
- 其他项目的 harness 运行历史

AI **只需知道**：
- 当前 phase 的 skill 指令
- topic 目录路径
- 当前 phase 的交付物要求
- coding-workflow-gate 和 coding-workflow-phase-start 两个工具的使用时机

### 复盘安全保障

复盘（retrospect）是 harness 的质量闭环，不能跳过。安全保障链：

```
gate check pass
  → dispatch review subagent
  → dispatch retrospect subagent
    → 成功：retrospect 文件创建
    → 失败：gate PASS 消息中显示 WARNING
  → AI 调用 phase-start
    → 检查 retrospect 文件存在？
      → 存在：放行，进入下一 phase
      → 不存在：BLOCKED，给出重试或手动创建选项
```

任何一环失败都有下游拦截，复盘不会静默丢失。

---

## 架构设计

### Auto Mode（coding-workflow 扩展）

```
用户: /coding-workflow <topic>
  → 创建 topic 目录
  → state.currentPhase = 1
  → before_agent_start 注入 Phase 1 skill
  → AI 按 skill 工作，产出 deliverables
  → AI 调用 coding-workflow-gate(phase=1)
    → gate-check.py 验证文件 → pass/fail
    → dispatch review subagent → review_v*.md
    → dispatch retrospect subagent → retrospect.md
    → 返回 PASS/FAIL
  → AI 调用 coding-workflow-phase-start()
    → 检查 retrospect 文件 → BLOCKED/放行
    → state.currentPhase += 1
    → compact() 清除历史
    → 注入 Phase 2 skill
  → ...重复直到 Phase 5 完成
```

### Manual Mode（纯 Skill）

```
用户: "start Phase 1"
  → brainstorming skill 加载 → AI 按 guide 工作
  → 产出 spec.md
  → dispatch 审查 subagent → spec_review_v*.md
  → dispatch 复盘 subagent → spec_retrospect.md
  → gate check（独立 session）

用户: "start Phase 2"
  → ...同上
```

### Phase 列表

| Phase | Skill | 产出 | Retrospect |
|-------|-------|------|-----------|
| 1 spec | xyz-harness-brainstorming | spec.md | spec_retrospect.md |
| 2 plan | xyz-harness-writing-plans | plan.md, e2e-test-plan.md, test_cases_template.json | plan_retrospect.md |
| 3 dev | xyz-harness-phase-dev | 源代码 + test_results.md | dev_retrospect.md |
| 4 test | xyz-harness-phase-test | test_execution.json | test_retrospect.md |
| 5 pr | xyz-harness-phase-pr | pr_evidence.md + ci_results.md | overall_retrospect.md |

### Subagent 执行模型

所有 subagent 使用 `general-purpose` agent，通过 task prompt 指定 read 对应的 skill 文件获取方法论：

```
主 agent dispatch subagent:
  agent: general-purpose
  task prompt: "read {skill_path} 获取方法论，然后 read {待处理文件}，按方法论执行，输出到 {output_path}"
```

不创建专用 agent（harness-retrospect 除外），避免维护成本。

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
| Retrospect | `skills/harness-retrospect/SKILL.md`（全局）或 `agents/harness-retrospect/agent.md`（项目） | 复盘方法论（subagent system prompt） |

## Extension

- `extensions/todolist/` — Todolist 扩展（任务追踪工具）
- `~/.pi/agent/extensions/force-loop/` — Loop 循环机制（Pi 基础工具）
- `~/.pi/agent/extensions/coding-workflow/` — Auto mode 扩展（phase 自动编排）

## 质量门禁

### Auto Mode

- gate-check.py 自动运行，验证 deliverables 完整性
- review subagent 自动 dispatch，验证 deliverables 质量
- retrospect subagent 自动 dispatch，产出复盘记录
- phase-start 检查 retrospect 文件存在，不存在则 BLOCKED

### Manual Mode

- gate-check.py 手动运行：`skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} {phase_number}`
- review 和 retrospect 手动 dispatch

### Gate Check 脚本检查项

| Phase | 检查内容 |
|-------|---------|
| 1 | spec.md 存在 + verdict:pass + spec_review 存在 + verdict:pass + must_fix:0 |
| 2 | plan.md + e2e-test-plan.md + test_cases_template.json + plan_review |
| 3 | test_results.md + code_review |
| 4 | test_execution.json（所有 case passed） |
| 5 | pr_evidence.md (pr_created:true) + ci_results.md (ci_passed:true) |

## coding-workflow 扩展开发指南

### 文件结构

```
~/.pi/agent/extensions/coding-workflow/
├── index.ts              # 扩展入口（tools + commands + events）
├── gate-check.py         # gate 验证脚本（5 phase）
└── lib/
    ├── model-resolve.ts  # 模型解析（按 task complexity）
    └── subagent.ts       # subagent spawn + JSON streaming
```

### 前置条件

| 依赖 | 说明 |
|------|------|
| Python 3 + PyYAML | gate-check.py 需要 |
| `~/.pi/agent/subagent-models.json` | 模型配置（review/retrospect subagent 用） |
| harness skills 已安装 | `~/.pi/agent/skills/xyz-harness-*` |
| harness-retrospect 可发现 | 全局 agents 或 skills 目录中 |

### Retrospect Agent 发现路径

扩展按以下顺序搜索 retrospect agent：
1. `~/.pi/agent/agents/harness-retrospect/agent.md`（标准安装位置）
2. `~/.pi/agent/skills/harness-retrospect/agent.md`（skill 注册位置）
3. `~/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/agents/harness-retrospect/agent.md`（开发时 fallback）

搜索逻辑在 `index.ts` 的 `RETROSPECT_AGENT_SEARCH_PATHS` 常量和 `getRetrospectAgentContent()` 函数中。

### Subagent 模型选择

扩展使用 `~/.pi/agent/subagent-models.json` 中的模型配置：
- Review subagent：`taskComplexity: "medium"` → ds-flash / kimi-for-coding
- Retrospect subagent：`taskComplexity: "low"` → glm-5-turbo / ds-flash

不要在 skill 中硬编码 `llm-simple-router/xxx` 这样的 provider。`llm-simple-router` 不是合法的 provider 前缀。

## Skill YAML Frontmatter 注意事项

SKILL.md 文件的 YAML frontmatter 由 Pi 读取解析，以下陷阱会导致启动报错：

### 描述值必须加引号的场景

如果 `description` 或其他字段的值包含以下内容，**必须**用单引号或双引号包裹：

- **冒号后跟空格**：如 `Trigger: "run gate check"` 中的 `: "`，YAML 会误判为 mapping 嵌套
- **特殊 YAML 字符**：`{}`, `[]`, `>`, `|`, `!`, `&`, `*` 等
- **以 YAML 保留字开头**：`true`, `false`, `yes`, `no`, `null`, `on`, `off` 等

### 推荐用 `>-` 块标量

```yaml
description: >-
  Gate check for harness. Trigger: "run gate check",
  "verify deliverables", "check gate".
```

### 验证命令

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

## Pre-commit Hook

项目配置了 git pre-commit hook，自动校验 skill/agent/command 文件的 YAML frontmatter 格式。

### 文件位置

```
.bare/hooks/pre-commit
```

### 校验范围

| 文件模式 | 说明 |
|---------|------|
| `skills/*/SKILL.md` | Skill 定义文件 |
| `commands/*.md` | Command 定义文件 |
| `extensions/*/SKILL.md` | Extension skill 文件 |
| `*.agent.md` | Agent 定义文件 |
| `agents/*/agent.md` | Agent 定义文件 |
| `.pi/agents/*.md` | Pi Agent 定义文件 |

### 跳过 hook

```bash
git commit --no-verify -m "message"
```
