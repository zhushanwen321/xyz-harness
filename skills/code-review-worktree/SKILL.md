---
name: code-review-worktree
description: "Use when the user says code review, review code, review changes, check code quality, or wants a multi-dimensional review of worktree changes. Not for single-file edits or non-code changes."
---

# Code Review Worktree

对当前 worktree 的变更进行多维度并行代码审查。自动检测 harness/standalone 模式。

## 设计理念

harness 项目用 5 步专项审查，非 harness 项目用降级 4 维度审查。两种模式共享底层 review agent。

| 模式 | 触发条件 | 审查维度 |
|------|---------|---------|
| **harness** | `.xyz-harness/` 目录存在且含 spec.md + plan.md | BLR + Standards + Taste + Robustness + Integration |
| **standalone** | 无 `.xyz-harness/` 目录 | Robustness + Taste + Architecture + Data-Flow(可选) |

### 维度与 Agent 映射

| 维度 | Agent | harness | standalone |
|------|-------|---------|------------|
| BLR | `review-blr` | ✅ | — |
| Standards | `review-standards` | ✅ | — |
| Taste | `review-taste` | ✅ | ✅ |
| Robustness | `review-robustness` | ✅ | ✅ |
| Integration | `review-integration` | ✅ (依赖 BLR) | — |
| Architecture | `review-architecture` | — | ✅ |
| Data-Flow | `review-dataflow` | — | ✅ (检测到信号时) |

## 脚本

### review-context.sh — 收集审查上下文

```bash
bash ~/.pi/agent/skills/code-review-worktree/review-context.sh [--against main] [--staged] [--path <dir>]
```

| 参数 | 说明 |
|------|------|
| `--against <ref>` | 对比基准分支，默认 `main` |
| `--staged` | 只检查已暂存的变更 |
| `--path <dir>` | 限制审查范围 |

脚本自动检测 harness/standalone 模式，输出 JSON 含 `harness_mode`、`dimensions`（适用维度列表）、`effort`（工作量级别）。

## AI 操作流程

### 步骤 1: 收集上下文

```bash
bash ~/.pi/agent/skills/code-review-worktree/review-context.sh
```

从输出获取：`harness_mode`、`effort`、`dimensions`（每个含 dimension、files、output 路径）。

### 步骤 2: 报告评估结果

向用户说明模式和将启用的审查维度。

### 步骤 3: 根据 effort 决定策略

| effort | 策略 |
|--------|------|
| `simple` | 主会话直接审查所有维度，不分派 agent |
| `medium` | 按 Batch 分派 agent（并发 ≤ 3） |
| `complex` | 同 medium + 按文件分组审查 |

**harness 模式编排**：
```
Batch 1 (并行 ≤3): review-blr, review-standards, review-taste
Batch 1 续 (槽位释放): review-robustness
Batch 2 (串行, BLR 完成后): review-integration
```

**standalone 降级编排**：
```
Batch 1 (并行 ≤3): review-robustness, review-taste, review-architecture
Batch 2 (可选, 检测到数据流信号时): review-dataflow
```

### 步骤 4: 分派 Agent

每个 agent 的 task prompt 只需传必要参数：

```
agent: "review-{dimension}"
cwd: {项目根目录}
task: |
  变更文件: {files}
  获取 diff: 在 {cwd} 下执行 git diff main...HEAD -- {files}
  输出到: {output_path}
  {维度特有参数，如 spec_path、blr_result_path、signals 等}
```

维度特有参数：

| Agent | 额外参数 |
|-------|---------|
| review-blr | `spec_path: {harness_topic_dir}/spec.md` |
| review-standards | `claude_md_path: {cwd}/CLAUDE.md`（可选） |
| review-integration | `blr_result_path: {output}/business_logic_review_v1.md`（harness 模式）, `interface_chain_path`（如存在） |
| review-dataflow | `signals: {dimensions 中 data-flow 的 reason 字段}` |

### 步骤 5: simple 模式直接审查

当 `effort: "simple"` 时，主会话不使用 agent，串行执行所有适用维度。按维度顺序逐个审查，每个维度独立输出问题清单。

### 步骤 6: 汇总

从所有 agent（或自身审查结果）提取问题，按优先级汇总：

```markdown
# Code Review Report

## 概要
- 审查范围: {N} 文件, {+} insertions, {-} deletions
- 审查模式: {harness(5步) | standalone(降级)}
- 审查维度: {维度列表}

## 汇总问题清单

| # | 优先级 | 维度 | 文件:行号 | 描述 | 修复方向 |
|---|--------|------|-----------|------|---------|

## 统计
- MUST_FIX: {n} 条 | LOW: {n} 条 | INFO: {n} 条
```

MUST_FIX > 0 → 进入修复流程。全部 INFO → 询问用户。

### 步骤 7: 分组修复

用户确认后，按文件分组修复。每组不超过 5 个文件、1000 行。修复只针对清单中的问题，不做额外重构。

### 步骤 8: 验证

```bash
npx eslint --max-warnings=0 <modified-files>  # lint 验证
npm test 2>&1 | tail -20                       # 测试验证
```

## 优先级定义

**harness 模式**（与 harness 统一）：
- **MUST_FIX**：必须修复 — 数据丢失、功能失效、语义错误、时序错误
- **LOW**：建议修复 — 命名、注释、风格、预存问题
- **INFO**：观察记录

**standalone 模式**：
- **P0**：必须修复 — bug、安全漏洞、数据丢失
- **P1**：推荐修复 — 性能隐患、架构违规
- **P2**：建议关注 — 可维护性、命名

## 输出文件约定

### harness 模式

输出到 `{harness_topic_dir}/changes/reviews/`：

| 维度 | 文件名 |
|------|--------|
| BLR | `business_logic_review_v{N}.md` |
| Standards | `standards_review_v{N}.md` |
| Taste | `taste_review_v{N}.md` |
| Robustness | `robustness_review_v{N}.md` |
| Integration | `integration_review_v{N}.md` |

### standalone 模式

输出到当前目录或用户指定路径：`{dimension}_review_v{N}.md`。

## When NOT to Use

- 单文件小改动 → 主 agent 直接看，不需要多维度审查
- 非 code 变更（文档、配置） → 不适用
- 需要单维度深度审查（如只查品味）→ 直接分派对应 agent（`review-taste`）

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|---------|
| Integration 不等 BLR 就分派 | Integration 无法消费模拟数据，审查质量下降 | 严格按 Batch 顺序 |
| simple 任务分派 agent | agent 调度开销 > 审查本身 | 主会话直接执行 |
| 修改清单外的代码 | 引入新问题，违反 scope | 只修清单中的问题 |
| review-context.sh 未运行 | 缺少模式检测和维度列表 | 步骤 1 不可跳过 |
