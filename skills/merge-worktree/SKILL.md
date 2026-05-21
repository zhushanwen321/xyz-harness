---
name: merge-worktree
description: >
  完成 worktree 的完整合并流程：本地验证 → PR CI → merge → post-merge CI
  → 发布准备 → Release Notes → 创建 Release → 清理。
  使用 git merge --no-ff 保留完整分支历史。
  支持项目级钩子（.bare/custom-hooks/）实现个性化发布流程。
  触发词："合并worktree"、"merge-worktree"、"合并PR"、"发布"、"release"、"上线"。
---

# Merge Worktree

## 使用方式

```bash
# 必须在 workspace root 或 worktree 外的其他目录运行（不要在 worktree 内运行）
cd <workspace-root>

# 基本用法：自动生成 release notes，直接发布
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> [patch|minor|major]

# 指定 release notes 文件
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> patch --notes release-notes.md

# 创建 Draft Release（不自动发布，需手动 gh release edit <tag> --draft=false）
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> patch --draft
```

**一条命令，一次执行，跑完全流程。** 脚本幂等，任何步骤失败后修复重跑即可（已完成步骤自动跳过）。

## 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<worktree-dir>` | 是 | feature worktree 目录路径（绝对或相对） |
| `[patch\|minor\|major]` | 否 | 版本类型，默认 `patch` |
| `--notes <file>` | 否 | 指定 release notes 文件，不提供则从 conventional commits 自动生成 |
| `--draft` | 否 | 创建 Draft Release 而非直接发布 |

## 退出码

| 退出码 | 含义 | AI 行为 |
|--------|------|--------|
| 0 | 全部成功 | 无需操作 |
| 1 | 失败 | 修复后重新运行同一条命令 |

## 执行流程

```
阶段 1: 本地验证（pre-merge-check.sh）
   ↓
阶段 2: PR CI 检查 → 合并
   ↓
阶段 3: Post-merge CI 等待
   ↓
阶段 4: 版本 bump + tag + push + 等 Release CI
   ↓
阶段 5: Release Notes（自动生成或使用 --notes 指定文件） → 创建 Release
   ↓
阶段 6: 清理 worktree + 同步其他 worktree
```

## AI 操作步骤

### 1. 前置确认

- 确认 feature 分支的 PR 已创建
- 确认版本类型（patch / minor / major）
- **不要在 feature worktree 目录内运行脚本**（脚本最后会删除该目录）

### 2. 执行

```bash
cd <workspace-root>
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> <version-type>
```

如果需要自定义 release notes，先写好文件再传参：

```bash
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> patch --notes ./my-notes.md
```

### 3. 结果

- **exit 0**：全部完成。已合并 PR、已发布 Release、已清理 worktree。
- **exit 1**：某步骤失败。查看错误信息，修复后重新运行同一条命令。

## Release Notes 自动生成规则

不提供 `--notes` 时，脚本从 conventional commits 自动生成 release notes：

| Commit 前缀 | 归入章节 |
|-------------|---------|
| `feat:` / `feat(scope):` | Features |
| `fix:` / `fix(scope):` | Bug Fixes |
| `perf:` / `perf(scope):` | Performance |
| `breaking:` / `breaking(scope):` | Breaking Changes |
| 其他前缀（ci:, chore:, build:, refactor: 等） | 过滤掉，不列出 |

项目可通过 `.bare/custom-hooks/generate-release-notes.sh` 钩子自定义过滤逻辑。

自动生成覆盖 80% 的发布场景。需要精修时用 `--notes` 或事后 `gh release edit <tag> --notes-file <新文件>` 修改。

## 钩子机制

每个项目在 `.bare/custom-hooks/` 下创建钩子脚本，由 `git-cwt`（创建 worktree）和 `merge-and-publish.sh`（合并发布）自动调用。

```
<workspace-root>/.bare/custom-hooks/
  setup-worktree.sh            # 创建 worktree 后执行（由 git-cwt 调用）
  pre-merge.sh                 # merge 前执行（如项目特定的额外验证）
  generate-release-notes.sh    # 生成 release notes 前的预处理（过滤 commit 清单）
  post-release.sh              # release 创建后执行（如通知、部署）
```

### 钩子规范

- **可选**：不存在就跳过，不影响流程
- **可执行**：需要 `chmod +x`
- **环境变量**：所有钩子接收以下标准化环境变量

| 环境变量 | 说明 |
|---------|------|
| `WS_ROOT` | workspace 根目录 |
| `BRANCH_NAME` | 分支名 |
| `PR_NUMBER` | PR 编号 |
| `VERSION` | 新版本号（不含 v 前缀） |
| `COMMIT_FILE` | commit 清单文件路径（仅 generate-release-notes.sh） |

- **退出码**：0 = 成功继续，非 0 = 阻断流程

## 合并策略

- **合并时**：`git merge --no-ff`，**绝不 Squash**
- **同步时**：`git merge origin/main`（非 rebase），已解决的冲突不会重复弹出

## 故障恢复

脚本幂等，任何步骤失败后修复重跑即可。断点机制自动跳过已完成步骤。

如果脚本意外中断（shell 断开等），重新运行同一条命令即可继续。

## 教训记录

### 2026-05-21: exit 3 / resume 模式导致无脑 AI 反复出错

**事件**：merge-worktree 的 exit 3 模式要求 AI 记住 3 个参数、执行 3 次脚本调用、在中途 cd 到正确目录。无脑 AI 反复出错：cwd 绑定到已删除目录、参数拼错、函数未定义。

**根因**：exit 3 / resume 模式混合了两种不同的接口——自动化流水线（应一次跑到底）和人机对话协调（中途停下来等 AI）。状态在多次调用间传递（WS_ROOT、BRANCH、VERSION_TYPE），任何一环出错就崩。

**修复**：彻底去掉 exit 3 / resume 模式。改为单次调用：
1. 所有 AI 决策在脚本启动前完成（版本类型、release notes 文件）
2. Release notes 不提供则从 conventional commits 自动生成
3. 产物检查用脚本验证，不需要 AI 人肉确认
4. 脚本启动时检查 cwd 不在 worktree 内，否则直接拒绝

### 2026-05-18: Release Notes 质量（已通过自动生成 + --notes 参数解决）

**事件**：CI 自动从 git log 拼凑 release notes，导致所有 commit 无差别罗列。

**修复**：自动生成按 conventional commit 前缀分组过滤；需要精修时用 `--notes` 参数。

### 2026-05-06: 阶段 4A 强制要求 main worktree 导致 worktree 冲突

**根因**：skill 阶段 4A 写死要求 `cd <main-worktree>`，未区分两种发布脚本类型。

**修复**：区分 GitHub Actions 触发型（就地运行）和本地型（切 main worktree）

### 2025-05-05: 本地验证不完整 + Post-merge CI 未检查

**修复**：pre-merge-check.sh（自动装依赖 + 5 步强制）+ wait-for-ci.sh（post-merge CI 等待）
