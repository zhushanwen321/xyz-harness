---
name: xyz-harness-phase-dev
description: >-
  Phase 3 (dev) of the manual xyz-harness workflow. Use when the user says
  "start Phase 3", "dev phase", "implement", "write code", or after plan is done
  to produce code changes, test results, and code review.
---

# Phase 3: Dev

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 3 (dev) |
| 执行者 | 主 agent（编排）+ subagent（编码/审查/复盘） |
| 上游 | Phase 2 (plan) — plan.md + e2e-test-plan.md |
| 下游（完成后进入） | Phase 4 (test) — 加载 phase-test skill |
| 回退目标 | 审查不通过 → 修复代码 → 重新审查 |

## Phase Loop 机制

Gate FAIL 后不是从头开始，而是回到循环起点继续：

- **Gate FAIL（must_fix > 0）**：回到 Step 4（Code Review），根据 review 反馈修复代码，重新 dispatch review subagent
- **测试失败**：回到 Step 1（TDD），修复失败的测试用例，重新走 TDD 流程
- **Self-Check 不通过**：就地修复，不需要回退

**不可回退的步骤**（仅首次执行）：Step 2 的 Codebase Scan

**Auto Mode：** coding-workflow 扩展自动管理 loop 和回退，skill 中无需处理。

### Agent/Skill 关联

**简单路径（1-4 tasks）：**

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| TDD + 编码 | 主 agent | — | test-driven-development + backend-dev / frontend-dev | 主 agent 上下文加载 |
| Code Review | subagent | general-purpose | expert-reviewer | task prompt 指定 read |
| Retrospect | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

**复杂路径（5+ tasks，跨前后端）：**

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| 调度编排 | 主 agent | — | subagent-driven-development | 主 agent 参考（不加载到上下文） |
| TDD 写测试 | subagent | general-purpose | test-driven-development | task prompt 指定 read |
| 后端编码 | subagent | general-purpose | backend-dev | task prompt 指定 read |
| 前端编码 | subagent | general-purpose | frontend-dev | task prompt 指定 read |
| Task spec 检查 | subagent | general-purpose | expert-reviewer | task prompt 指定 read |
| Code Review | subagent | general-purpose | expert-reviewer | task prompt 指定 read |
| Retrospect | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

> **注意：** 复杂路径下主 agent 不写任何实现代码，全部通过 subagent 完成（参见 subagent-driven-development 的"禁码铁律"）。简单路径下主 agent 直接编码，不加载 subagent-driven-development。

## Purpose

Implement the feature according to plan.md, following TDD methodology, then get code review.

## Prerequisites

- plan.md exists with verdict: pass
- e2e-test-plan.md and test_cases_template.json exist

## Steps

### 0. 防护预检（编码前）

在开始编码之前，先确认项目的基本防护配置是否到位。

**检查项**：
1. linter 配置是否存在（`eslint.config.*`、`pyproject.toml` 中的 `[tool.ruff]`）
2. tsconfig.json 是否开启 `strict: true`（TS 项目）
3. pre-commit hook 是否已安装（`.git/hooks/pre-commit` 存在且非空）
4. 项目根目录是否有 `.githooks/` 目录

```bash
# 检查 linter
LINT_OK=false
if ls eslint.config.* 2>/dev/null | head -1 | grep -q .; then
  LINT_OK=true; echo "✅ ESLint 已配置"
elif grep -q '\[tool.ruff\]' pyproject.toml 2>/dev/null; then
  LINT_OK=true; echo "✅ Ruff 已配置"
else
  echo "⚠ 项目未配置 linter"
fi

# 检查 pre-commit
if [ -s .git/hooks/pre-commit ] || [ -d .githooks ]; then
  echo "✅ Git hook 已安装"
else
  echo "⚠ 未安装 git hook"
fi
```

**处理逻辑**：
- 基本防护已齐备（linter + typecheck + hook）→ 继续编码
- 缺少 linter 或 typecheck → 按快速通道补齐基础配置后再编码
  - 告知用户："项目缺少 X 防护，建议先补齐再编码"
  - 参考 `xyz-harness-code-standard-protection` skill 的快速通道：Python 项目 3 步 / Vue/TS 项目 3 步
- 项目本身是文档仓库或纯工具脚本 → 跳过，不需要防护

### 1. TDD / 编码

根据 task 类型选择开发流程：

**后端 task — 严格 TDD：**
- 加载 xyz-harness-test-driven-development skill
- 每个 task 必须走完整 TDD 循环：写失败测试 → 验证失败 → 写最小实现 → 验证通过 → 重构
- 无例外，不可跳过

**前端 task — 三阶段开发：**
- 加载 xyz-harness-frontend-dev skill
- 走骨架→功能→美化三阶段，不走 TDD
- 前端组件测试在功能阶段完成后补充（非 TDD 的先写测试）

### 2. Code Implementation

根据 plan.md 的复杂度和 task 数量选择执行路径：

**路径判断：**
- **4 tasks 以下，单一类型（纯后端或纯前端）**→ 简单路径
- **5 tasks 以上，或跨前后端，或有 Execution Groups 定义**→ 复杂路径

**简单路径：** 主 agent 直接编码（不加载 subagent-driven-development）
- 后端 task: 加载 xyz-harness-test-driven-development + xyz-harness-backend-dev skill
- 前端 task: 加载 xyz-harness-frontend-dev skill（走三阶段开发，不走 TDD）
- 按 task 类型分别执行对应流程

**复杂路径：** 参考 xyz-harness-subagent-driven-development skill
- 主 agent 只做调度，**不写任何实现代码**（禁码铁律）
- 按 Execution Groups dispatch general-purpose subagent
- 每个 subagent 的 task prompt 中指定 read 对应的编码规范 skill
- 后端 subagent: read xyz-harness-test-driven-development + xyz-harness-backend-dev
- 前端 subagent: read xyz-harness-frontend-dev（前端不走 TDD，走三阶段开发）
- 每个 task 完成后 dispatch spec 检查 subagent

### 3. Run All Tests

- Backend: run test command
- Frontend: run build command
- Verify all existing tests still pass

### 4. Code Review (独立审查)

Dispatch 独立审查 subagent：

1. 获取代码变更：
   ```bash
   git diff {base_commit}..HEAD
   ```

2. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: 由 coding-workflow 扩展按 taskComplexity 自动选择（review: medium）
   - **Task prompt**:
     ```
     你是独立审查专家。按以下步骤执行编码评审：

     1. read `skills/xyz-harness-expert-reviewer/SKILL.md`，找到「模式二：编码评审」章节
     2. read `CLAUDE.md`（获取项目架构约束和编码规范）
     3. read 以下文件：
        - `{spec_path}` (spec.md)
        - `{plan_path}` (plan.md)
     4. 以下是需要审查的 git diff：
        {diff_content}
     5. 按方法论逐项审查（spec 合规、代码质量、架构合规、安全性能），将结果写入：
        `{topic_dir}/changes/reviews/code_review_v1.md`
     6. YAML frontmatter 必须包含:
        - `verdict`: "pass" 或 "fail"
        - `must_fix`: 数字（open MUST_FIX 问题数量）
     ```

3. 审查轮次：
   - must_fix == 0 → 通过
   - must_fix > 0 → 修复代码后重新 dispatch（产出 code_review_v2.md），最多 2 轮
   - 2 轮后仍有 must_fix > 0 → 停止，由用户决定

#### code_review 输出格式

| 字段 | 类型 | 必填 | 允许值 | 说明 |
|------|------|------|--------|------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志 |
| `must_fix` | number | 是 | `0` | 必须修复的问题数量 |

### 4a. Retrospect (复盘)

**触发时机：**
- **Auto Mode：** coding-workflow 扩展在 gate PASS 后自动 dispatch retrospect subagent
- **Manual Mode：** 当用户告知 gate check 通过后，手动 dispatch retrospect subagent

然后进入 Phase 4。

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: 由 coding-workflow 扩展按 taskComplexity 自动选择（retrospect: low）
   - **Task prompt**:
     ```
     你是复盘分析师。按以下步骤执行：

     1. 回顾 system prompt 中已包含的复盘方法论
     2. read 以下交付物文件：
        - `{topic_dir}/changes/evidence/test_results.md`
        - `{topic_dir}/changes/reviews/code_review_v*.md`
     3. 按方法论覆盖两个维度（Phase 执行 + Harness 体验），将结果写入：
        `{topic_dir}/changes/reviews/dev_retrospect.md`
     4. YAML frontmatter: `phase: dev`, `verdict: pass`
     ```

### 5. Document Test Results

Create `.xyz-harness/{topic}/changes/evidence/test_results.md`:

**test_results.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `verdict` | string | 是 | `"pass"` | 测试通过标志 | `verdict: pass` | 写成了 `verdict: fail` |
| `all_passing` | boolean | 是 | `true` | **布尔值**，表示全部测试通过。gate 严格检查此值必须是 `true`（布尔类型），不接受字符串 | `all_passing: true` | 写成了 `all_passing: "true"`（字符串，gate 会报错）；写成了 `all_passing: True`（Python 风格语法，YAML 能解析但不符合规范） |

**完整示例：**
```
---
verdict: pass
all_passing: true
---

# Test Results — {topic}

## Backend Tests
```
cd backend && uv run pytest -v
...output...
52 passed in 3.42s
```

**All 52 backend tests passed.**

## Frontend Build
```
cd frontend && pnpm run build
...output...
Build successful.
```

**Frontend build passed.**
```

### 6. Self-Check

**铁律：禁止在未实际运行验证命令的情况下声称完成。**

- [ ] All implementation tasks from plan.md completed
- [ ] 测试命令实际执行并确认 0 failures（不是"应该通过"）
- [ ] test_results.md exists with all_passing: true（布尔值，不是字符串）
- [ ] Code review exists with verdict: pass, must_fix: 0
- [ ] 运行 gate check 脚本确认：
  ```bash
  python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 3
  ```
- [ ] 读取输出，确认所有检查项 PASS
- [ ] No unintended modifications

### 7. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| Test results | `{topic}/changes/evidence/test_results.md` |
| Code review | `{topic}/changes/reviews/code_review_v*.md` |
| Retrospect | `{topic}/changes/reviews/dev_retrospect.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 3 gate for topic `{topic}`"

### 8. Tell user

When done: "Phase 3 complete. Code implemented and reviewed. Please run gate check in a separate session. When gate passes, come back and I'll run the retrospective. Then say 'start Phase 4' to continue."
