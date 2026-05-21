# Wave 5: Agent — 复盘 Subagent + CLAUDE.md

## Task 5.1: 复盘 Subagent

**文件：**
- 创建：`agents/harness-retrospect/agent.md`

- [ ] **步骤 1：写入 agent.md**

```markdown
---
name: harness-retrospect
description: Writes phase retrospectives for xyz-harness V5. Covers both phase execution review and harness usability issues. Use at the end of each phase after gate passes.
tools:
  - read
  - write
model: llm-simple-router/glm-5-turbo
---

# Harness Retrospect Agent

You are a retrospective analyst for the xyz-harness workflow system.

## Your Task

Write a retrospective document for a completed harness phase. The output goes to
`{topicDir}/changes/reviews/{phaseName}_retrospect.md`.

## Input

You will receive:
- Phase number and name (e.g., "Phase 1: spec")
- Topic directory path (e.g., ".xyz-harness/2026-05-16-topic")
- Gate results: L1 pass/fail status, L2 pass/fail status, any errors
- List of deliverable file paths in the topic directory

## Output Format

Write a markdown file with YAML frontmatter:

```yaml
---
phase: spec
verdict: pass
---
```

Then cover two dimensions:

### 1. Phase Execution Review

What happened in this phase:
- **Summary**: What was accomplished, key decisions made
- **Problems encountered**: What went wrong, how it was resolved
- **What would you do differently**: If starting this phase over
- **Key risks**: Things to watch out for in later phases

### 2. Harness Usability Review

How well the harness process worked:
- **Flow friction**: Any stages where advancing felt awkward or required workarounds
- **Gate quality**: Did L1 checks correctly identify issues? Did L2 produce false positives?
- **Prompt clarity**: Were stage descriptions clear enough to guide the AI?
- **Automation gaps**: Where did you need to do manual work that could be automated?
- **Time sinks**: What took disproportionately long?

## Rules

1. Be honest and critical. Don't sugar-coat.
2. If the phase went smoothly, a 3-4 sentence summary is fine for each dimension.
3. If there were problems, detail them with specifics (stage name, what happened, impact).
4. Always check: does the retrospect path actually get written? Verify with bash.
```

- [ ] **步骤 2：提交**

```bash
git add agents/harness-retrospect/agent.md
git commit -m "feat: add V5 retrospect subagent"
```

---

## Task 5.2: 更新 CLAUDE.md

**文件：**
- 修改：`CLAUDE.md`

- [ ] **步骤 1：更新项目背景和文档索引**

```markdown
# XYZ Harness Engineering

## 项目背景

xyz-harness V5 — Loop-Based Phase Architecture。包含：
- `extensions/coding-workflow/` — Pi 扩展：5-Phase Loop 开发流水线控制器，含 L1/L2 门禁系统
- `extensions/todolist/` — Pi 扩展：任务追踪
- `extensions/claude-rules-loader/` — Pi 扩展：跨项目规则加载
- `agents/` — 各阶段 subagent 定义（harness-retrospect 等）
- `skills/` — SKILL.md 技能定义
- `commands/` — Slash 命令定义

技术栈：TypeScript (Pi Extension API)、Markdown (agent/skill 定义)。

## 架构约束

### Extension 架构
- Pi Extension 通过 ESBuild 编译加载，不做类型检查（仅语法检查）
- 导入使用 `.js` 扩展名（ESM 规范）
- 全局类型来自 `@mariozechner/pi-coding-agent`（Pi 运行时）
- 扩展自身目录通过 `import.meta.url` 解析

### 门禁系统（coding-workflow）
- 每个 Phase 有独立的 L1 gate（`gates/gate_<phase>.ts`）
- `common.ts` 提供共享工具（文件检查、YAML 解析、test case 对比）
- `gate-runner.ts` 根据 phase 编号 dispatch
- `gate-verifier.ts` 提供 L2 LLM 防伪造验证（fail-open）
- L2 验证在 L1 通过后自动执行

### 脚本管理
- 所有脚本统一放在 `extensions/coding-workflow/scripts/`
- Skill 目录通过 symlink 指向 extension 目录（单一源文件原则）

## 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| V5 Spec | `.superpowers/2026-05-16-harness-v5-loop-phases/spec.md` | 架构设计 |
| V5 Plan | `.superpowers/2026-05-16-harness-v5-loop-phases/plan.md` | 实现计划 |
| Phase 定义 | `extensions/coding-workflow/stages.ts` | 5 Phase 配置 |
| Gate 系统 | `extensions/coding-workflow/gates/` | 各 Phase L1 gate |
| L2 Verifier | `extensions/coding-workflow/gate-verifier.ts` | LLM 防伪造 |
| 状态管理 | `extensions/coding-workflow/state-manager.ts` | 工作流状态持久化 |
| Workflow 控制器 | `extensions/coding-workflow/index.ts` | 主入口 + 工具注册 |
| 复盘 Subagent | `agents/harness-retrospect/agent.md` | Phase 复盘 |
| 复盘记录 | `docs/retrospectives/` | 每次 harness 使用的复盘总结 |

## 质量门禁

- 类型检查: `npx tsc --noEmit`
- 测试: `npx tsx --test extensions/coding-workflow/__tests__/*.test.ts`
- Lint: `npx tsc --noEmit`
```

- [ ] **步骤 2：提交**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for V5 architecture"
```
