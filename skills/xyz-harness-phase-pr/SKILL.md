---
name: xyz-harness-phase-pr
description: >-
  Phase 5 (pr) of the manual xyz-harness workflow. Use when the user says "start Phase 5", "pr phase", "create PR", "push code", "release", or after testing is done to submit and merge code.
---

# Phase 5: PR

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | Phase 5 (pr) |
| 执行者 | 主 agent（推送/PR/合并）+ subagent（复盘） |
| 上游 | Phase 4 (test) — test_execution.json |
| 下游（完成后进入） | 无（最终 phase） |
| 回退目标 | CI 失败 → 修复 → 重新推送 |

## Phase Loop 机制

Gate FAIL 后回到循环起点继续：

- **CI 失败**：回到 Step 1（Push Code），修复 CI 报错，重新 push，等待 CI 通过后更新 ci_results.md
- **Gate FAIL（pr_evidence 或 ci_results 格式问题）**：就地修复 YAML/evidence，不需要重新推送
- **Self-Check 不通过**：就地修复，不需要回退

**注意：** Merge 是不可逆操作，必须在 gate check 确认通过后才执行。如果 gate 失败，绝对不能 merge。

**Auto Mode：** coding-workflow 扩展自动管理 loop 和回退，skill 中无需处理。

### Agent/Skill 关联

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| Push + PR + CI | 主 agent | — | 无（直接操作） | bash + gh CLI |
| Gate Check + Merge | 主 agent | — | 无（直接操作） | gate 验证后 merge |
| Retrospect (整体) | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

## Purpose

Push code changes, verify CI, create a Pull Request, pass gate check, then complete the merge.

## Prerequisites

- test_results.md exists with verdict: pass, all_passing: true
- Code review passed (code_review_v1.md exists with verdict: pass, must_fix: 0)

## Steps

### 0. CI/防护预检（提交前）

在推送代码之前，先确认项目的 CI 配置是否到位，避免 PR 因 CI 失败被拒绝。

**检查项**：
1. CI 配置文件是否存在：`.github/workflows/` 下是否有 workflow 文件
2. 项目根目录是否有 linter 配置
3. 代码是否已通过本地 lint 检查

```bash
# 检查 CI 配置
if ls .github/workflows/*.yml 2>/dev/null | head -1 | grep -q .; then
  echo "✅ CI 已配置"
else
  echo "⚠ 项目未配置 CI pipeline，PR 可能因缺少自动化检查被拒绝"
fi

# 检查防护配置
if [ -f package.json ]; then
  # TS/Node 项目
  if grep -q '"lint"' package.json 2>/dev/null; then
    echo "✅ Lint script 已配置"
    npm run lint --silent 2>/dev/null || echo "⚠ Lint 存在错误"
  fi
elif grep -q '\[tool.ruff\]' pyproject.toml 2>/dev/null; then
  echo "✅ Ruff 已配置"
  ruff check . --diff 2>/dev/null || echo "⚠ Ruff 存在错误"
fi
```

**处理逻辑**：
- CI 已配置且本地 lint 通过 → 继续推送
- CI 已配置但本地 lint 失败 → 修复 lint 错误后再推送（CI 会拦截不通过的代码）
- CI 未配置 → 在 `pr_evidence.md` 中额外记录 `ci_configured: false` 和风险说明
  - 参考 `xyz-harness-code-standard-protection` skill 的 CI 模板章节补齐配置
  - 读取 `references/implementation-templates.md` 的 "CI 模板" 章节

### 1. Push Code

```bash
git add -A
git commit -m "feat: {description}"
git push
```

Replace `{description}` with a concise summary of the feature or fix being committed.

### 2. Create PR

- Create a Pull Request on GitHub via `gh pr create` or through the GitHub web UI
- Write a meaningful PR description that references the spec and plan
- Create `.xyz-harness/{topic}/changes/evidence/pr_evidence.md`:

**pr_evidence.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `pr_created` | boolean | 是 | `true` | **布尔值**。PR 是否已创建。gate 严格检查必须是 `true` | `pr_created: true` | 写成了 `pr_created: "true"`（字符串）；写成了 `pr_created: yes`（虽能解析但不是规范写法） |
| `pr_url` | string | 否 | URL | PR 的 GitHub 链接 | `pr_url: https://github.com/user/repo/pull/123` | — |
| `pr_title` | string | 否 | 任意 | PR 标题 | `pr_title: "feat: system setting"` | — |
| `branch` | string | 否 | 任意 | 分支名称 | `branch: feat-system-setting` | — |

**完整示例：**
```markdown
---
pr_created: true
pr_url: https://github.com/user/repo/pull/123
pr_title: "feat: system setting"
branch: feat-system-setting
---

# PR Evidence

PR created and ready for CI.
```

### 3. Wait for CI

- Monitor CI pipeline status (GitHub Actions, CircleCI, etc.)
- Create `.xyz-harness/{topic}/changes/evidence/ci_results.md`:

**ci_results.md YAML 字段说明：**

| 字段 | 类型 | 必填 | 允许值 | 说明 | 示例 | 常见错误 |
|------|------|------|--------|------|------|---------|
| `ci_passed` | boolean | 是 | `true` | **布尔值**。CI 是否通过。gate 严格检查必须是 `true` | `ci_passed: true` | 写成了 `ci_passed: \"true\"`（字符串） |
| `ci_url` | string | 否 | URL | CI 运行的链接 | `ci_url: https://github.com/user/repo/actions/runs/123` | — |
| `commit_sha` | string | 否 | Git SHA | 通过 CI 的 commit SHA | `commit_sha: abc123...` | — |

**完整示例：**
```markdown
---
ci_passed: true
ci_url: https://github.com/user/repo/actions/runs/123
commit_sha: abc123def456
---

# CI Results

All CI checks passed.

## Checks
- backend tests: 52 passed ✅
- frontend build: passed ✅
- ruff lint: passed ✅
```

### 4. 阶段完成提交

**阶段完成时，必须提交并推送所有代码和文档到远程仓库。**

```bash
git add -A
git commit -m "ci: PR and CI evidence for {topic}"
git push
```

确保 `.xyz-harness/` 目录下的所有产出文件都被 git 跟踪。

### 5. Self-Check

**铁律：禁止在未实际运行验证命令的情况下声称完成。**

- [ ] Code pushed to remote
- [ ] PR created with description
- [ ] CI passed（实际查看 CI 状态，不是假设）
- [ ] pr_evidence.md exists with pr_created: true (布尔值)
- [ ] ci_results.md exists with ci_passed: true (布尔值)
- [ ] 运行 gate check 脚本确认：
  ```bash
  python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 5
  ```
- [ ] 读取输出，确认所有检查项 PASS

### 5. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| PR evidence | `{topic}/changes/evidence/pr_evidence.md` |
| CI results | `{topic}/changes/evidence/ci_results.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 5 gate for topic `{topic}`"

### 6. Merge

**前置条件：gate check 已通过。** 如果 gate 尚未通过，禁止 merge。

- Merge the PR using `git merge --no-ff`（merge commit），**禁止 squash 和 rebase**
- Delete the remote branch if no longer needed
- Verify merge appears in target branch

### 7. Retrospect (复盘)

**触发时机：** 当 merge 完成后，立即执行整体复盘（Phase 5 是最后一个 phase，复盘覆盖全部 5 个 phase）。

**Auto Mode：** coding-workflow 扩展自动 dispatch retrospect subagent。
**Manual Mode：** 手动 dispatch 以下 subagent：

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Task prompt**:
     ```
     你是复盘分析师。按以下步骤执行整体复盘（覆盖全部 5 个 phase）：

     1. read {retrospect_agent_path} 获取复盘方法论
     2. read 之前 4 个 phase 的复盘记录（如果存在）：
        - `{topic_dir}/changes/reviews/spec_retrospect.md`（Phase 1）
        - `{topic_dir}/changes/reviews/plan_retrospect.md`（Phase 2）
        - `{topic_dir}/changes/reviews/dev_retrospect.md`（Phase 3）
        - `{topic_dir}/changes/reviews/test_retrospect.md`（Phase 4）
     3. read Phase 5 交付物：
        - `{topic_dir}/changes/evidence/pr_evidence.md`
        - `{topic_dir}/changes/evidence/ci_results.md`
     4. 回顾全部 5 个 phase，按方法论覆盖两个维度（整体 Phase 执行 + Harness 体验），将结果写入：
        `{topic_dir}/changes/reviews/overall_retrospect.md`
     5. YAML frontmatter: `phase: pr`, `verdict: pass`
     ```

### 8. Tell user

When done: "Phase 5 complete. Feature merged. All retrospectives done."

## Self-Check Checklist

### 前置检查
- [ ] Phase 3 (Dev) 的 code_review 文件是否存在且 verdict==pass？
- [ ] Phase 4 (Test) 的测试执行记录是否存在且全部 passed？
- [ ] 所有 review 的 MUST_FIX 是否已修复？

### Lint 检查
- [ ] lint 检查是否在 Dev Phase 已完成？（不应在 PR Phase 首次发现 lint 问题）
- [ ] 如 PR Phase 发现新 lint 问题：回到 Dev Phase 修复

### PR 安全
- [ ] PR 描述是否引用了 spec 和 plan？
- [ ] 是否只 merge 代码，不执行其他不可逆操作？
