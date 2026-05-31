---
name: xyz-harness-phase-dev
description: >-
  Phase 3 (dev) of the manual xyz-harness workflow. Use when the user says "start Phase 3", "dev phase", "implement", "write code", or after plan is done to produce code changes, test results, and code review.
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

- **Gate FAIL（must_fix > 0）**：回到 Step 4（Five-Step Specialized Review），根据 review 反馈修复代码，重新 dispatch review subagent
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

## 阶段完成要求

**每个阶段完成时，必须提交并推送所有代码和文档到远程仓库。** 包括：
- 源代码变更
- `.xyz-harness/` 目录下的所有产出（spec、plan、review、retrospect 等）
- `docs/` 目录下的设计文档
- 测试文件和测试结果

```bash
git add -A
git commit -m "feat: {description}"
git push
```

确保 `git status --short` 无未跟踪文件（特别是 `.xyz-harness/` 和 `docs/`）后再提交。

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

#### 接口签名传递规则

当 plan.md 包含 Interface Contracts 章节时，主 agent 在构造 TDD coder / executor subagent task prompt 时，必须传入当前 Task 涉及的方法签名。

**L2 plan（有 interface_chain.json）：**
- 从 interface_chain.json 中提取当前 Task 涉及的 methods（按 class 名或 spec_refs 过滤）
- 将 (name, params, returns, edge_cases) 整理为结构化文本，注入 task prompt

**L1 plan（无 interface_chain.json）：**
- read plan.md 的 Interface Contracts 章节
- 解析当前 Task 涉及的模块对应的 markdown 签名表格
- 提取方法名、参数、返回值

**最低传递标准（L1/L2 统一）：** task prompt 至少包含方法名、参数类型列表、返回类型、spec_refs（关联的 spec AC 编号）。edge_cases 为可选附加信息。

**偏差记录：** 实现中如偏离接口契约，必须在 commit message 中记录 `interface_deviation` 标记及原因。

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

### 4. Five-Step Specialized Review (五步专项审查)

将传统单步 code_review 替换为 5 步专项审查，分两批执行：

#### Batch 1: 4 个并行审查

同时 dispatch 4 个独立审查 subagent：

1. **Business Logic Review (BLR)** — 业务逻辑审查
   - Agent: general-purpose
   - Skill: xyz-harness-business-logic-reviewer (dev 模式)
   - 输入: use-cases.md + git diff + 源代码
   - 输出: `{topic_dir}/changes/reviews/business_logic_review_v1.md`
   - 产出模拟业务数据和执行路径（供 integration review 消费）

2. **Standards Review** — 规范审查
   - Agent: general-purpose
   - Skill: xyz-harness-standards-reviewer
   - 输入: git diff + CLAUDE.md
   - 输出: `{topic_dir}/changes/reviews/standards_review_v1.md`
   - Phase A: 自动 lint/typecheck（如项目有配置）
   - Phase B: AI 对比 CLAUDE.md 编码规范

3. **Taste Review** — 代码品味审查
   - TypeScript 项目: dispatch ts-taste-check subagent
   - Rust 项目: dispatch rust-taste-check subagent
   - Python 项目: read `~/Code/coding_config/.codetaste/essence.md` 获取通用品味原则，在 task prompt 中注入
   - 纯文档/脚本项目: 跳过 taste review，在 standards_review 中注明
   - 输出: `{topic_dir}/changes/reviews/ts_taste_review_v1.md` 或 `rust_taste_review_v1.md` 或 `taste_review_v1.md`（Python 项目）

4. **Robustness Review** — 健壮性审查
   - Agent: general-purpose
   - Skill: xyz-harness-robustness-reviewer
   - 输入: git diff
   - 输出: `{topic_dir}/changes/reviews/robustness_review_v1.md`
   - 六维度: 错误处理、异常、日志、fail-fast、测试友好、调试友好

#### Batch 2: 1 个串行审查（依赖 BLR 产出）

5. **Integration Review** — 集成审查
   - Agent: general-purpose
   - Skill: xyz-harness-integration-reviewer
   - 输入: business_logic_review_v1.md（模拟数据和执行路径）+ 代码文件
   - 输出: `{topic_dir}/changes/reviews/integration_review_v1.md`
   - **必须等待 BLR 完成后再 dispatch**

#### 执行编排

```
Batch 1 (4 parallel):
  ┌─ BLR ──────────────┐
  ├─ Standards Review ──┤
  ├─ Taste Review ──────┤──→ Batch 2 (1 sequential):
  └─ Robustness Review ─┘     Integration Review (depends on BLR output)
```

#### 审查轮次

每个审查独立迭代：
- must_fix == 0 → 通过
- must_fix > 0 → 修复代码后重新 dispatch 该步审查（产出 v2），最多 2 轮
- 所有 5 步审查必须全部通过（verdict: pass, must_fix: 0）

#### 无 lint 项目处理

项目无 lint/typecheck 配置时：
- Standards Review 跳过 Phase A，仅执行 Phase B（AI 规范对比）
- review 产出不包含 `linter_passed` / `typecheck_passed` 字段
- 报告中标注 "项目未配置 lint/typecheck，跳过自动检查"

#### Python 项目 Taste Review Fallback

Python 项目无专用 taste-check skill 时：
- read `~/Code/coding_config/.codetaste/essence.md` 获取通用品味原则
- 如果文件不存在: 跳过 taste review，在 standards_review 中注明 "Python 项目，无专用 taste skill，已跳过"
- 如果文件存在: 将内容注入 taste review subagent 的 task prompt 作为参考，产出 `taste_review_v1.md`

#### 各步 review 输出格式

每个 review 文件的 YAML frontmatter:

| 字段 | 类型 | 必填 | 允许值 | 说明 |
|------|------|------|--------|------|
| `verdict` | string | 是 | `"pass"` | 评审通过标志 |
| `must_fix` | number | 是 | `0` | 必须修复的问题数量 |
| `review_metrics` | object | 否 | — | 价值追踪数据 |

review_metrics 子字段（可选）:

| 字段 | 类型 | 说明 |
|------|------|------|
| `files_reviewed` | number | 审查的文件数量 |
| `issues_found` | number | 发现的问题总数 |
| `must_fix_count` | number | MUST FIX 数量 |
| `low_count` | number | LOW 数量 |
| `info_count` | number | INFO 数量 |
| `duration_estimate` | string | 预估耗时（分钟） |

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
        - `{topic_dir}/changes/reviews/business_logic_review_v*.md`
        - `{topic_dir}/changes/reviews/integration_review_v*.md`
        - `{topic_dir}/changes/reviews/standards_review_v*.md`
        - `{topic_dir}/changes/reviews/*taste_review_v*.md`
        - `{topic_dir}/changes/reviews/robustness_review_v*.md`
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
- [ ] All 5 specialized reviews exist with verdict: pass, must_fix: 0 (business_logic, integration, standards, taste, robustness)
- [ ] 运行 gate check 脚本确认：
  ```bash
  python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 3
  ```
- [ ] 读取输出，确认所有检查项 PASS
- [ ] No unintended modifications

### 6b. 阶段完成提交

**阶段完成时，必须提交并推送所有代码和文档到远程仓库。**

```bash
git add -A
git commit -m "feat: implementation for {topic}"
git push
```

确保 `.xyz-harness/`、`docs/` 和源代码目录下的所有变更都被 git 跟踪。

### 7. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| Business logic review | `{topic}/changes/reviews/business_logic_review_v*.md` |
| Integration review | `{topic}/changes/reviews/integration_review_v*.md` |
| Standards review | `{topic}/changes/reviews/standards_review_v*.md` |
| Taste review | `{topic}/changes/reviews/*taste_review_v*.md` |
| Robustness review | `{topic}/changes/reviews/robustness_review_v*.md` |
| Test results | `{topic}/changes/evidence/test_results.md` |
| Retrospect | `{topic}/changes/reviews/dev_retrospect.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 3 gate for topic `{topic}`"

### 8. Tell user

When done: "Phase 3 complete. Code implemented and reviewed. Please run gate check in a separate session. When gate passes, come back and I'll run the retrospective. Then say 'start Phase 4' to continue."

## Self-Check Checklist

### MUST FIX 修复后
- [ ] 修复 MUST FIX 时，是否检查了同路径/同文件中其他相关调用点？
- [ ] 修复是否可能引入回归？（特别是缩进修复、条件分支修改）
- [ ] 缩进修复应使用 whitespace-fixer skill，不手动编辑

### 迁移类工作
- [ ] 迁移前是否列出了所有被迁移的调用点/引用？
- [ ] 每个调用点是否逐个标注了覆盖状态？
- [ ] 是否存在"改了 A 忘了 B"的对称性遗漏？

### Task 验收标准
- [ ] 每个 subagent task prompt 是否包含量化验收标准？
  - 输出文件路径
  - 约束条件（如"函数不超过 N 行"）
  - 成功指标（如"测试通过"）
