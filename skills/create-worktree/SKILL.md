---
name: create-worktree
description: >
  在 bare repo + worktree 结构中创建隔离的工作目录。自动检测 workspace、同步配置、
  安装依赖和 git hooks。当用户说"创建 worktree"、"新 worktree"、"create worktree"、
  "新建分支"、"开个新分支"时使用此 skill。即使用户只是说"我要做一个新功能"或
  "帮我开个分支做 xxx"，也应考虑触发此 skill。
---

# Create Worktree

在 bare repo + worktree 结构中创建新分支的隔离工作目录。

## 脚本

```
create-worktree.sh <branch-name> [base-branch]
```

### 参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| `branch-name` | $1 | 是 | 分支名，如 `feat/new-feature`。`/` 自动转为 `-` 作为目录名 |
| `base-branch` | $2 | 否 | 基础分支。省略时自动检测远程 HEAD 分支（通常为 main） |

### 用法示例

```bash
# 创建新功能分支（基于 main）
bash ~/.claude/skills/create-worktree/create-worktree.sh feat/new-feature

# 基于指定分支创建
bash ~/.claude/skills/create-worktree/create-worktree.sh fix/bug develop

# 检出已有分支
bash ~/.claude/skills/create-worktree/create-worktree.sh 024-ai-data-api
```

### 脚本行为

1. 从当前目录向上查找 workspace 根（包含 `.bare/` 的目录）
2. `git fetch origin --prune` 获取最新远程引用
3. 如果分支已存在（本地或远程），直接检出；否则从 `base-branch` 创建新分支
4. 从 main/master worktree 复制 `.claude/settings.local.json`
5. 自动检测并安装依赖：
   - `frontend/package.json` 存在 → `pnpm install`（回退 `npm install`）
   - 根目录 `package.json` 且无 `frontend/` → `npm install`
   - `backend/pyproject.toml` → `uv sync`
6. 从 main/master worktree 复制已安装的 git hooks

### 输出

成功时输出：
```
Workspace: /path/to/project-workspace
基础分支: main
Fetching from remote...
创建分支 'feat/new-feature' (基于 origin/main)...
已复制 .claude/settings.local.json (from main)
已安装 git hooks

============================================
Worktree 创建完成!
  分支: feat/new-feature
  路径: /path/to/project-workspace/feat-new-feature
============================================
```

### 错误场景

| 退出码 | 输出 | 原因 |
|--------|------|------|
| 1 | `Error: 未找到 workspace` | 当前目录不在 workspace 内，需要 cd 到 workspace 子目录 |
| 1 | `Error: .bare/ 不是一个有效的 bare git 仓库` | workspace 结构损坏 |
| 1 | `Error: 目录 'xxx' 已存在` | 同名 worktree 已存在 |

### AI 操作步骤

1. 向用户获取分支名（必填）和基础分支（可选）
2. 运行 `bash ~/.claude/skills/create-worktree/create-worktree.sh <branch-name> [base-branch]`
3. 确认输出包含 `"Worktree 创建完成!"`
4. 告诉用户新 worktree 的路径
