#!/bin/bash
# 合并 worktree：同步其他 worktree 到 main → 最后删除已合并的 worktree
# Usage: merge-worktree.sh <branch-name>
# Example: merge-worktree.sh feat/new-feature
#
# 重要：删除 worktree 放在最后，因为 AI 会话可能在该 worktree 目录中运行。
#       先 cd 到 workspace root，完成所有同步操作，最后才删除目录。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../_lib/workspace.sh"

BRANCH_NAME="${1:?Usage: merge-worktree.sh <branch-name>}"
DIR_NAME="${BRANCH_NAME//\//-}"

WORKSPACE_ROOT=$(find_workspace_root "$(pwd)") || {
    echo "Error: 未找到 workspace。"
    exit 1
}
echo "Workspace: $WORKSPACE_ROOT"

# 立即切到 workspace root，避免当前目录后续被删除
cd "$WORKSPACE_ROOT"

# 步骤 1: 同步其他 worktree（先做，因为不涉及删除当前目录）
echo ""
echo "=== 步骤 1: 同步其他 worktree 到 origin/main ==="
SYNCED=0
CONFLICTS=0
CONFLICT_WTS=""

for _wt_entry in */; do
    _wt_name="${_wt_entry%/}"
    [[ "$_wt_name" == ".bare" ]] && continue
    [[ "$_wt_name" == "$DIR_NAME" ]] && continue
    [[ "$_wt_name" == "node_modules" ]] && continue

    _branch=""
    _branch=$(cd "$WORKSPACE_ROOT/$_wt_name" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null) || _branch=""

    # 跳过 main/master 和空分支
    [[ "$_branch" == "main" || "$_branch" == "master" ]] && continue
    [[ -z "$_branch" ]] && continue

    echo "同步 $_wt_name ($_branch)..."

    cd "$WORKSPACE_ROOT/$_wt_name"
    git fetch origin main 2>&1 | tail -1

    if git merge --no-ff origin/main; then
        echo "  OK: $_wt_name 已同步到最新 main"
        SYNCED=$((SYNCED + 1))
    else
        echo "  CONFLICT: $_wt_name merge 冲突:"
        git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/    - /'
        CONFLICTS=$((CONFLICTS + 1))
        CONFLICT_WTS="${CONFLICT_WTS:+$CONFLICT_WTS }$_wt_name"
        # 不 abort — 保留冲突状态让 AI/用户来处理
    fi
    cd "$WORKSPACE_ROOT"
done

# 步骤 2: 删除已合并的 worktree（最后执行，因为可能删除 AI 会话的当前目录）
echo ""
echo "=== 步骤 2: 清理 worktree $BRANCH_NAME ==="
# remove_worktree 内部会先 cd 到 workspace_root 再删除
remove_worktree "$WORKSPACE_ROOT" "$BRANCH_NAME" true

# 输出报告
echo ""
echo "============================================"
echo "Merge cleanup 完成!"
echo "  已删除: $BRANCH_NAME"
echo "  已同步: $SYNCED 个 worktree"
if [[ $CONFLICTS -gt 0 ]]; then
    echo "  冲突: $CONFLICTS 个 worktree（需处理）:"
    for wt in $CONFLICT_WTS; do
        echo "    - $wt"
    done
    echo ""
    echo "  冲突处理: 在冲突 worktree 中执行 git diff --name-only --diff-filter=U 查看冲突文件"
    echo "  处理完成后: git add . && git commit"
    echo "  放弃同步: git merge --abort"
else
    echo "  冲突: 0"
fi
echo "============================================"
