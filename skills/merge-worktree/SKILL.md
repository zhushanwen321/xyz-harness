---
name: merge-worktree
description: >-
  完成 worktree 的完整合并流程：本地验证 → PR CI → merge → post-merge CI → 发布准备 → Release Notes → 创建 Release → 清理。 使用 git merge --no-ff 保留完整分支历史。 支持项目级钩子（.bare/custom-hooks/）实现个性化发布流程。 触发词："合并worktree"、"merge-worktree"、"合并PR"、"发布"、"release"、"上线"。
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
阶段 4: 版本 bump + 同步子项目 package.json + tag + push + 等 Release CI
   ↓
阶段 5: 产物验证（wait-for-ci.sh --verify-release）+ Release Notes → 创建 Release
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
  post-bump.sh                 # 版本 bump 后、git commit 前执行（如同步子 package.json）
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

### 已知陷阱：`git pull --rebase` 改变 upstream 指向

`git pull --rebase origin main` 会将分支的 `@{upstream}` 从 `origin/$BRANCH` 改为 `origin/main`。如果重跑脚本前执行过 rebase，需修复：

```bash
git branch --set-upstream-to=origin/$BRANCH_NAME $BRANCH_NAME
```

pre-merge-check.sh 已使用 `origin/$BRANCH_NAME..HEAD` 替代 `@{upstream}..HEAD`，不受此影响。

### 幂等边界

每个阶段的幂等检测条件：

| 阶段 | 幂等检测方式 | 跳过条件 |
|------|------------|---------|
| 阶段 1 | 断点文件 | `phase1-passed` checkpoint 存在 |
| 阶段 2 | PR 状态 | PR state = MERGED |
| 阶段 3 | 无（每次重新检查 CI） | CI 已通过则快速返回 |
| 阶段 4 | 始终 bump 版本 + 同步子项目 | 每次 merge 后必须产生新版本号，自动同步 src-electron/package.json |
| 阶段 5 | Release 存在性 | Release 已存在则更新 notes |
| 阶段 6 | 无（每次执行清理） | — |

**阶段 4 无幂等跳过**：每次合并后都必须 bump 新版本号并打 tag，即使旧 tag 仍存在。幂等保障交给阶段 5（`gh release view` 检查 release 是否已创建）。

**版本同步机制**：Electron 等子项目独立 `package.json`（如 `src-electron/package.json`）的版本号必须与根 `package.json` 保持一致。bump 后脚本自动调用 `sync_sub_package_versions` 同步，确保 electron-builder 和 CI 读取到正确版本。

**产物验证**：阶段 4 的 Release CI 通过后，`wait-for-ci.sh --verify-release <tag>` 会自动检查：
1. Draft Release 的 tag 与预期一致（防止版本号不同步导致创建了错误 tag 的 release）
2. 产物数量 > 0（防止只有 source code 没有构建产物）
3. 验证失败时 exit 1 并给出排查指引

### AI bash timeout 注意

AI 调用 `merge-and-publish.sh` 时，bash 工具的 `timeout` 参数必须 >= 1200 秒（Release CI 含 docker build 可能耗时 10 分钟以上）。如果 AI 的默认 bash timeout 只有 600s，脚本会被外部 kill 而非自身超时。

`bash-timeout-override` Pi 扩展会在 `tool_call` 事件中自动 mutation bash 的 timeout 参数，无需 AI 记住。

#### 默认行为（无需配置）

扩展已内置全局规则（`~/.pi/agent/bash-timeout-rules.json`）：

```json
{
  "rules": [
    { "pattern": "merge-and-publish.sh", "timeout": 1200 },
    { "pattern": "pre-merge-check.sh", "timeout": 600 },
    { "pattern": "wait-for-ci.sh", "timeout": 1200 }
  ]
}
```

**大多数项目不需要额外配置**，全局规则已覆盖 merge-worktree 的所有脚本。

#### 项目级覆盖

如果项目有自己特有的长耗时命令（如部署脚本），在项目根目录创建 `.pi/bash-timeout.json`：

```json
{
  "rules": [
    { "pattern": "scripts/deploy.sh", "timeout": 1800 }
  ]
}
```

扩展查找顺序：项目级 `.pi/bash-timeout.json` → 全局 `~/.pi/agent/bash-timeout-rules.json`。
项目级配置**完全替代**全局配置（非合并），所以项目级配置中需要包含 merge-and-publish.sh 的规则。

## 教训记录

### 2026-05-24: src-electron/package.json 版本未同步导致产物版本错误

**事件**：手动发版时只 bump 了根 `package.json`（0.2.4 → 0.2.6），但 `src-electron/package.json` 仍是 0.2.4。CI release workflow 从 `src-electron/package.json` 读版本号，创建了 v0.2.4 的 Draft Release 而非 v0.2.6。产物文件名也全是 0.2.4。

**根因**：`src-electron` 是独立 npm project（不在根 workspaces 里），electron-builder 和 CI 的 `Read version` 步骤都从它读版本。merge-and-publish.sh 的 bump 逻辑只改了根 `package.json`。

**修复**：
1. merge-and-publish.sh 添加 `sync_sub_package_versions` 函数，bump 后自动同步 `src-electron/package.json` 版本
2. wait-for-ci.sh 添加 `--verify-release` 参数，CI 通过后验证 Draft Release 的 tag 和产物数量

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

## 日志系统

所有 merge-worktree 脚本自动输出结构化日志到 `$WS_ROOT/.logs/merge-worktree/` 目录。

### 日志文件命名

```
.logs/merge-worktree/
  2026-05-26_feat-slash-commands.log     # 一次发布流程的完整日志
```

格式：`<YYYY-MM-DD>_<branch-name-safe>.log`（分支名中的 `/` 替换为 `-`）。

### 日志格式

每行一条日志，格式：

```
[YYYY-MM-DDTHH:MM:SS] [LEVEL] [CONTEXT] message
```

| 字段 | 说明 |
|------|--------|
| `YYYY-MM-DDTHH:MM:SS` | ISO 格式本地时间戳 |
| `LEVEL` | `PHASE` / `INFO` / `WARN` / `ERROR` / `CMD` / `HOOK` / `CHECK` / `CI` |
| `CONTEXT` | 来源（阶段名、hook 名、CI 等） |
| `message` | 纯文本（已去除 ANSI 颜色码） |

### 日志覆盖范围

| 阶段 | 记录内容 |
|------|----------|
| 初始化 | branch / workspace / repo / 版本类型 / draft 模式 |
| 阶段 1 | pre-merge-check 的每项 PASS/FAIL |
| 阶段 2 | PR 状态、CI 等待结果 |
| 阶段 3 | post-merge CI 结果 |
| 阶段 4 | 版本 bump、tag push、release CI 等待 |
| 阶段 5 | Release 创建路径（CI Draft / 手动 fallback）、产物验证 |
| 阶段 6 | worktree 清理、同步结果 |
| Hook | 每个 hook 的完整输出和退出码 |
| 最终 | PR / 版本 / Release URL / 日志路径 |

### 子脚本日志协议

`merge-and-publish.sh` 通过 `MERGE_LOG_FILE` 环境变量将日志文件路径传递给子脚本。子脚本的日志函数约定：

| 子脚本 | 环境变量 | 日志 LEVEL | 函数 |
|--------|----------|-----------|------|
| `pre-merge-check.sh` | `MERGE_LOG_FILE` | `CHECK` | `_chk_log()` |
| `wait-for-ci.sh` | `MERGE_LOG_FILE` | `CI` | `_ci_log()` |

**契约**：
- `MERGE_LOG_FILE` 为空时，日志函数静默跳过（不报错）
- 子脚本独立运行（无 `MERGE_LOG_FILE`）时不写日志，不影响功能
- 时间戳使用 ISO 格式 `YYYY-MM-DDTHH:MM:SS`

### 自定义 hook 的日志规范

项目级 hook（`.bare/custom-hooks/`）不需要额外配置。`merge-and-publish.sh` 的 `run_hook` 函数会自动捕获 hook 的 stdout+stderr 写入日志文件。

如果 hook 内部需要直接写日志，可以读取 `MERGE_LOG_FILE` 环境变量：

```bash
# 在 hook 脚本中
[[ -n "${MERGE_LOG_FILE:-}" ]] && echo "[$(date +%Y-%m-%dT%H:%M:%S)] [HOOK] my message" >> "$MERGE_LOG_FILE"
```

### 日志轮转

每次发布流程完成后，自动清理旧日志，只保留最近 30 个日志文件。

```bash
# 手动清理
ls -1t .logs/merge-worktree/*.log | tail -n +31 | xargs rm -f
```

### 排查指南

**Release 无构建产物**（如 v0.2.8 事故）：

```bash
# 1. 查看日志
cat .logs/merge-worktree/2026-05-26_feat-slash-commands.log

# 2. 关键词搜索
grep -i "fallback\|手动创建\|无构建产物\|CI 未创建\|去重检查" .logs/merge-worktree/*.log

# 3. 检查 release workflow 是否触发
gh run list --workflow=release.yml --limit 5

# 4. 手动触发 release workflow
gh workflow run release.yml --repo <owner/repo>
```

**CI 等待超时**：

```bash
grep "超时\|timeout" .logs/merge-worktree/*.log
```

**Checkpoint 与日志交叉排查**：

```bash
# 查看阶段跳过原因
grep "checkpoint:" .logs/merge-worktree/*.log
```

## 教训记录（续）

### 2026-05-26: v0.2.8 Release 无构建产物

**事件**：v0.2.8 Release 创建后没有任何构建产物（dmg/exe/AppImage），只有 release notes body。

**根因**：Release 不是通过 `git push --tags` 触发 CI workflow 创建的。tag 通过 `gh release create` 隐式创建到 GitHub，GitHub 只收到了 release API 调用，没有收到 tag push event，导致 `release.yml` workflow（`on: push: tags: ['v*']`）未被触发。

**修复**：
1. merge-and-publish.sh 阶段 5 先检查已有 Release 是否已含产物（Phase 4c 的 `--verify-release` 可能已确认）
2. 若无产物，等待 CI 创建 Draft Release，每 5 秒轮询，最多 120 秒
3. 等待结束后走更新或创建逻辑
4. 手动创建前执行去重检查（`gh release view`），避免 API 延迟导致的重复 Release
5. 只有去重检查确认不存在时才 fallback 到手动创建，并输出明确警告
6. 最终验证产物数量，产物为 0 时给出手动触发 workflow 的命令提示
7. 所有决策路径写入日志文件（`.logs/merge-worktree/`），方便事后排查
