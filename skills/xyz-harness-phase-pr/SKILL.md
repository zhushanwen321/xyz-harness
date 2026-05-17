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
- Create `.xyz-harness/{topic}/changes/evidence/pr_evidence.md` with:

```markdown
---
pr_created: true
pr_url: {url}
pr_title: {title}
branch: {branch-name}
---

# PR Evidence

PR created and ready for CI.
```

### 3. Wait for CI

- Monitor CI pipeline status (GitHub Actions, CircleCI, etc.)
- Create `.xyz-harness/{topic}/changes/evidence/ci_results.md` with:

```markdown
---
ci_passed: true
ci_url: {ci-run-url}
commit_sha: {sha}
---

# CI Results

All CI checks passed.
```

### 4. Merge

- Merge the PR (squash or merge commit depending on project policy)
- Delete the remote branch if no longer needed
- Verify merge appears in target branch

### 5. Self-Check

- [ ] Code pushed to remote
- [ ] PR created with description
- [ ] CI passed
- [ ] pr_evidence.md exists with pr_created: true
- [ ] ci_results.md exists with ci_passed: true
- [ ] PR merged

### 6. Tell user

When done: "Phase 5 complete. Feature merged. Workflow finished."
