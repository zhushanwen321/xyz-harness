---
name: xyz-harness-phase-pr
description: >-
  Phase 5 (pr) of the manual xyz-harness workflow. Use when the user says
  "start Phase 5", "pr phase", "create PR", "push code", "release", or after
  testing is done to submit and merge code.
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

### Agent/Skill 关联

| 步骤 | 执行者 | Agent | Skill | 方式 |
|------|--------|-------|-------|------|
| Push + PR + CI + Merge | 主 agent | — | 无（直接操作） | bash + gh CLI |
| Retrospect (整体) | subagent | general-purpose | harness-retrospect | task prompt 指定 read |

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

### 4a. Retrospect (复盘)

**触发时机：** 当用户告知 gate check 通过后，立即执行整体复盘（Phase 5 是最后一个 phase，复盘覆盖全部 5 个 phase）。

1. Dispatch subagent：
   - **Agent**: general-purpose
   - **Model**: llm-simple-router/glm-5-turbo
   - **Task prompt**:
     ```
     你是复盘分析师。按以下步骤执行整体复盘（覆盖全部 5 个 phase）：

     1. read `agents/harness-retrospect/agent.md` 获取复盘方法论
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

When done: "Phase 5 complete. Feature merged. Please run gate check in a separate session. When gate passes, come back and I'll run the overall retrospective covering all 5 phases. Then we're done!"
