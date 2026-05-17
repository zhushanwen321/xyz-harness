---
name: xyz-harness-phase-pr
description: Phase 5 (pr) of the manual xyz-harness workflow. Use when the user says "start Phase 5", "pr phase", "create PR", "push code", "release", or after testing is done to submit and merge code.
---

# Phase 5: PR

## Purpose

Push code changes, verify CI, create a Pull Request, and complete the merge.

## Prerequisites

- test_results.md exists with verdict: pass, all_passing: true
- Code review passed (code_review_v1.md exists with verdict: pass, must_fix: 0)

## Steps

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

### 4. Merge

- Merge the PR (squash or merge commit depending on project policy)
- Delete the remote branch if no longer needed
- Verify merge appears in target branch

### 5. Self-Check

- [ ] Code pushed to remote
- [ ] PR created with description
- [ ] CI passed
- [ ] pr_evidence.md exists with pr_created: true (布尔值)
- [ ] ci_results.md exists with ci_passed: true (布尔值)
- [ ] YAML 中 pr_created 和 ci_passed 是 `true` 不是 `"true"`
- [ ] PR merged

### 6. Gate Handoff

When opening a separate gate check conversation, submit these files:

| File | Path |
|------|------|
| PR evidence | `{topic}/changes/evidence/pr_evidence.md` |
| CI results | `{topic}/changes/evidence/ci_results.md` |

Open a new Pi session, load the xyz-harness-gate skill, and tell it:
> "Check Phase 5 gate for topic `{topic}`"

### 7. Tell user

When done: "Phase 5 complete. Feature merged. Workflow finished. File list for gate check above."
