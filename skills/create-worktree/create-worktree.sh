#!/bin/bash
# 在 bare repo + worktree 结构中创建新 worktree
# Usage: create-worktree.sh <branch-name> [base-branch]
# Example: create-worktree.sh feat/new-feature master
set -euo pipefail

BRANCH_NAME="${1:?Usage: create-worktree.sh <branch-name> [base-branch]}"
BASE_BRANCH="${2:-main}"
# 分支名转目录名: feature/xxx -> feature-xxx
DIR_NAME="${BRANCH_NAME//\//-}"

# 从当前目录向上查找 workspace 根（包含 .bare/ 的目录）
find_workspace_root() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.bare" ]]; then
            echo "$dir"
            return 0
        fi
        dir="$(cd "$dir/.." && pwd)"
    done
    return 1
}

WORKSPACE_ROOT=$(find_workspace_root "$(pwd)") || {
    echo "Error: 未找到 workspace。当前目录及其父目录中没有 .bare/。"
    exit 1
}
echo "Workspace: $WORKSPACE_ROOT"
cd "$WORKSPACE_ROOT"

git -C .bare rev-parse --is-bare-repository >/dev/null 2>&1 || {
    echo "Error: .bare/ 不是一个有效的 bare git 仓库。"
    exit 1
}

[[ -d "$DIR_NAME" ]] && {
    echo "Error: 目录 '$DIR_NAME' 已存在。"
    exit 1
}

echo "Fetching from remote..."
# 找到真正的远端（非 origin 的 remote，通常叫 github/upstream）
REAL_REMOTE=$(git -C .bare remote | grep -v '^origin$' | head -1 || echo 'origin')
git -C .bare fetch "$REAL_REMOTE" --prune
# 同步 origin refs：让 origin/* 指向真正的远端 refs，
# 这样基于 origin/main 创建的 worktree 能拿到最新代码
if [[ "$REAL_REMOTE" != 'origin' ]]; then
    echo "Syncing origin refs from $REAL_REMOTE..."
    while IFS= read -r ref; do
        [[ -z "$ref" ]] && continue
        # ref 格式: github/main -> short_name: main
        short_name="${ref#$REAL_REMOTE/}"
        target_sha=$(git --git-dir="$WORKSPACE_ROOT/.bare" rev-parse "$ref")
        git -C .bare update-ref "refs/remotes/origin/$short_name" "$target_sha"
        echo "  origin/$short_name -> ${target_sha:0:8}"
    done < <(git -C .bare for-each-ref --format="%(refname:short)" "refs/remotes/$REAL_REMOTE/" | sed "s|^$REAL_REMOTE/||")
    # 同步本地 main 分支
    local_main_sha=$(git --git-dir="$WORKSPACE_ROOT/.bare" rev-parse "refs/remotes/$REAL_REMOTE/main" 2>/dev/null || true)
    if [[ -n "$local_main_sha" ]]; then
        echo "$local_main_sha" > "$WORKSPACE_ROOT/.bare/refs/heads/main"
        echo "  local main -> ${local_main_sha:0:8}"
    fi
fi

if git -C .bare rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "分支 '$BRANCH_NAME' 已存在，直接检出..."
    git -C .bare worktree add "$WORKSPACE_ROOT/$DIR_NAME" "$BRANCH_NAME"
else
    # 优先用 bare repo 本地分支（worktree 工作流中最新的），回退到远程跟踪引用
    BASE_REF="$BASE_BRANCH"
    if ! git -C .bare rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
        BASE_REF="origin/$BASE_BRANCH"
    fi
    echo "创建分支 '$BRANCH_NAME' (基于 $BASE_REF)..."
    git -C .bare worktree add "$WORKSPACE_ROOT/$DIR_NAME" -b "$BRANCH_NAME" "$BASE_REF"
fi

WORKTREE_PATH="$WORKSPACE_ROOT/$DIR_NAME"

# 如果后续步骤失败，清理已创建的 worktree
trap 'echo "安装失败，清理 worktree..."; cd "$WORKSPACE_ROOT"; git -C .bare worktree remove "$WORKTREE_PATH" 2>/dev/null' ERR

# 从主分支 worktree 复制 .claude 本地配置
# 自动检测主分支目录名（main 或 master）
PRIMARY_DIR=""
for candidate in main master; do
    if [[ -d "$WORKSPACE_ROOT/$candidate" ]]; then
        PRIMARY_DIR="$candidate"
        break
    fi
done

if [[ -n "$PRIMARY_DIR" ]] && [[ -f "$WORKSPACE_ROOT/$PRIMARY_DIR/.claude/settings.local.json" ]] && [[ -d "$WORKTREE_PATH/.claude" ]]; then
    cp "$WORKSPACE_ROOT/$PRIMARY_DIR/.claude/settings.local.json" "$WORKTREE_PATH/.claude/"
    echo "已复制 .claude/settings.local.json (from $PRIMARY_DIR)"
fi

cd "$WORKTREE_PATH"

# 检测项目级 setup hook（优先使用，跳过通用依赖安装）
PROJECT_SETUP="$WORKSPACE_ROOT/.bare/custom-hooks/setup-worktree.sh"
if [ -x "$PROJECT_SETUP" ]; then
    echo "执行项目 setup hook: $PROJECT_SETUP"
    bash "$PROJECT_SETUP" "$WORKTREE_PATH"
else
    # 通用依赖安装（无项目级 hook 时）
    [[ -f "backend/pyproject.toml" ]] && { echo "安装后端依赖..."; (cd backend && uv sync 2>&1 | tail -1) || echo "  Warning: 后端依赖安装失败，请手动安装"; }
    [[ -f "frontend/package.json" ]] && { echo "安装前端依赖..."; (cd frontend && pnpm install 2>&1 | tail -1) || echo "  Warning: 前端依赖安装失败，请手动安装"; }
fi

# 安装 git hooks（worktree 兼容：从主分支 worktree 复制已安装的 hooks）
install_hooks() {
    local primary_hooks_dir
    for candidate in main master; do
        if [[ -d "$WORKSPACE_ROOT/$candidate" ]]; then
            primary_hooks_dir=$(cd "$WORKSPACE_ROOT/$candidate" && git rev-parse --git-dir 2>/dev/null)/hooks
            break
        fi
    done
    [[ -z "$primary_hooks_dir" ]] && return

    local worktree_hooks
    worktree_hooks=$(git rev-parse --git-dir 2>/dev/null)/hooks

    if [[ -f "$primary_hooks_dir/pre-commit" ]]; then
        mkdir -p "$worktree_hooks"
        cp "$primary_hooks_dir/pre-commit" "$worktree_hooks/"
        chmod +x "$worktree_hooks/pre-commit"
        echo "已安装 git hooks (from primary worktree)"
    fi
}
install_hooks

trap - ERR

echo ""
echo "============================================"
echo "Worktree 创建完成!"
echo "  分支: $BRANCH_NAME"
echo "  路径: $WORKTREE_PATH"
echo "============================================"
