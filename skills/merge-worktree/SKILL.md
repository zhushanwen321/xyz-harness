---
name: merge-worktree
description: >
  完成 worktree 的完整合并流程：本地验证 → PR CI → merge → post-merge CI
  → 发布准备 → AI 撰写 Release Notes → 确认 → 清理。
  使用 git merge --no-ff 保留完整分支历史。
  支持项目级钩子（.bare/merge-hooks/）实现个性化发布流程。
  触发词："合并worktree"、"merge-worktree"、"合并PR"、"发布"、"release"、"上线"。
---

# Merge Worktree

## 一键脚本（推荐）

```bash
# 正常模式：worktree 仍在
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh <worktree-dir> [patch|minor|major]

# 恢复模式：worktree 已删除 或 AI 介入后继续
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major]

# 确认模式：AI 确认 Draft Release 后执行清理
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major] --confirm-release
```

## 执行阶段（6 阶段）

```
阶段 1: 本地验证（含 pre-merge.sh 钩子）
   ↓
阶段 2: PR CI + 合并
   ↓
阶段 3: Post-merge CI
   ↓
阶段 4: 发布准备（版本 bump + tag + push + 等 CI 构建）
   ↓
阶段 5: AI 撰写 Release Notes → 创建 Draft Release
   ↓ exit 3，等待 AI 确认
阶段 6: AI 确认 → 发布 Release → 清理 worktree → 同步
```

## 退出码

| 退出码 | 含义 | AI 行为 |
|--------|------|--------|
| 0 | 全部成功 | 无需操作 |
| 1 | 失败 | 修复后重新运行脚本 |
| 2 | 超时 | 询问用户 |
| **3** | **等待 AI 介入** | **按提示操作后重新运行** |

**AI 行为：执行一次脚本，根据输出结果操作后重新运行。退出码 3 不是错误，是脚本在等你做事。**

## 钩子机制

每个项目可以在 `.bare/merge-hooks/` 下创建可选的钩子脚本，实现项目个性化的发布流程。

```
<workspace-root>/.bare/merge-hooks/
  pre-merge.sh                 # merge 前执行（如项目特定的额外验证）
  generate-release-notes.sh    # 生成 release notes 前的预处理
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

### 钩子示例

参考 xyz-agent 项目的 `.bare/merge-hooks/generate-release-notes.sh`：
```bash
#!/usr/bin/env bash
# 过滤 commit 清单，只保留 feat/fix/perf/breaking
set -euo pipefail
COMMIT_FILE="${COMMIT_FILE:?}"
grep -E "^(feat|fix|perf|breaking)" "$COMMIT_FILE" > "${COMMIT_FILE}.tmp" || true
mv "${COMMIT_FILE}.tmp" "$COMMIT_FILE"
```

## Release Notes 撰写规范

AI 在阶段 5 收到 exit 3 后，按以下规范撰写 release notes：

### 格式模板

```markdown
## What's Changed

### Breaking Changes
- 具体描述影响和迁移方案（仅破坏性变更时出现此节）

### Features
- 按用户价值组织，不是按 commit 罗列
- 多个相关 commit 合并为一条描述
- 用用户能理解的语言

### Bug Fixes
- 只列用户可见的修复
- 过滤掉 ci:/chore:/build:/refactor: 等内部 commit

### Performance
- 性能改进（仅有时出现）

**Full Changelog**: https://github.com/<owner>/<repo>/compare/<old-tag>...v<new-version>
```

### 核心原则

1. **合并相关 commit**：一个功能可能涉及 T1/T2/T3/T4 多个 commit，合并为一条描述
2. **过滤噪音**：CI 修复、lint 修复、依赖更新等不列出
3. **用户视角**：用"新增 Slash 命令系统"而非"feat(T1): extend SlashMenu with agent commands"
4. **每条 1-2 句话**：简洁明了
5. **中文撰写**

### 撰写步骤

1. 查看 commit 清单：`cat $COMMIT_FILE`（脚本输出中会给出路径）
2. 识别功能模块，合并相关 commit
3. 过滤内部 commit
4. 按模板撰写
5. 写入文件：`$RELEASE_NOTES_FILE`（脚本输出中会给出路径）
6. 重新运行脚本继续

## AI 操作步骤

### 阶段 0: 读 CLAUDE.md（必须首先执行）

读取项目 CLAUDE.md，搜索关键词：`发布流程`、`release`、`npm publish`、`tag`、`scripts/`

**决策树：发布脚本选择**
```
CLAUDE.md 是否指定了项目发布脚本？
  ├─ 是（如 scripts/publish.sh）→ 项目脚本负责版本 bump + tag + push
  └─ 否 → merge-and-publish.sh 自行处理版本 bump + tag + push
```

### 阶段 1-3: 验证 + 合并 + CI

```bash
cd <feature-worktree>
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh .
```

脚本自动完成：本地验证 → PR CI 等待 → 合并 → Post-merge CI 等待。
任何一步失败都会 exit 1，**必须修复后重新运行**。

### 阶段 4-5: 发布准备 + AI 撰写 Release Notes

脚本继续执行：版本 bump → tag → push → 等待 Release CI 构建。

然后在阶段 5 脚本会 **exit 3**，输出类似：
```
📝 等待 AI 撰写 Release Notes
  1. 查看 commit 清单: cat /path/.release-commits.txt
  2. 按 Release Notes 规范撰写内容
  3. 写入文件: /path/.release-notes.md
```

**AI 此时需要**：
1. 读取 commit 清单
2. 按"Release Notes 撰写规范"撰写内容
3. 写入指定文件
4. 重新运行脚本（`--resume` 模式）

脚本会自动创建 Draft Release。

### 阶段 5 确认: 检查 Draft Release

脚本再次 **exit 3**，输出 Draft Release URL。

**AI 此时需要**：
1. 检查版本号、release notes 内容、三平台产物
2. 如需修改：`gh release edit <tag> --notes-file <新文件>`
3. 确认无误后运行：
```bash
bash ~/.pi/agent/skills/merge-worktree/merge-and-publish.sh \
  --resume <workspace-root> <branch-name> <version-type> --confirm-release
```

### 阶段 6: 确认 + 清理

`--confirm-release` 触发：
1. 发布 Draft Release（转为正式）
2. 删除 feature worktree
3. 同步其他 worktree 到 main

## 脚本清单

| 脚本 | 用途 | 退出码 0 以外 |
|------|------|-------------|
| `merge-and-publish.sh` | 端到端 6 阶段自动化 | 1=失败, 2=超时, **3=等待 AI** |
| `pre-merge-check.sh` | 5 步强制验证 | 1 = 有失败 |
| `wait-for-ci.sh` | 等待 GitHub Actions CI | 1 = CI 失败, 2 = 超时 |
| `merge-worktree-release.sh` | PR 合并 + 版本升级 + release | 各步骤报错退出 |
| `merge-worktree.sh` | 清理 worktree + 同步 | 冲突保留供 AI 处理 |

## 合并策略

- **合并时**：`git merge --no-ff`，**绝不 Squash**
- **同步时**：`git merge origin/main`（非 rebase），已解决的冲突不会重复弹出

## 教训记录

### 2026-05-18: Release Notes 质量问题

**事件**：CI 自动从 git log 拼凑 release notes，导致所有 commit 无差别罗列（含 ci fix、chore、refactor 等），用户无法快速了解变更价值。

**根因**：纯自动化无法判断哪些 commit 对用户有意义，无法合并相关 commit 为连贯描述。

**修复**：改为 AI 介入模式——脚本生成 commit 清单后暂停（exit 3），AI 按 release notes 规范撰写后继续。同时引入 `.bare/merge-hooks/` 钩子机制支持项目个性化。

### 2026-05-06: 阶段 4A 强制要求 main worktree 导致 worktree 冲突

**事件**：AI 在 feature worktree 完成验证+合并后，按 skill 指引尝试 `git checkout main` 失败（main 在另一个 worktree），导致操作混乱。

**根因**：skill 阶段 4A 写死要求 `cd <main-worktree>`，未区分两种发布脚本类型。

**修复**：区分 GitHub Actions 触发型（就地运行）和本地型（切 main worktree）

### 2025-05-05: 本地验证不完整 + Post-merge CI 未检查

**事件**：AI 因 worktree 缺 node_modules 跳过 vue-tsc 和 lint；合并后不等 post-merge CI 直接 publish。

**修复**：pre-merge-check.sh（自动装依赖 + 5 步强制）+ wait-for-ci.sh（post-merge CI 等待）
