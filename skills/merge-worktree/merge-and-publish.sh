#!/bin/bash
# merge-and-publish.sh — 从 PR 合并到发布的端到端自动化（幂等）
#
# 一键完成：本地验证 → PR CI → merge → post-merge CI → 发布 → 清理
# 支持断点续跑：已完成的阶段自动跳过。
#
# 用法: merge-and-publish.sh <worktree-dir> [patch|minor|major]
#        merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major]
# 示例: merge-and-publish.sh ~/Code/workspace/feat-xxx patch
#        merge-and-publish.sh --resume ~/Code/workspace feat-xxx patch
#
# --resume 模式：worktree 已删除后从中断阶段继续（如 post-merge CI 失败修复后）
#
# 退出码：
#   0 = 全部成功（已合并、已发布、已清理）
#   1 = 失败，AI 必须修复后重新运行
#   2 = 超时，AI 应询问用户

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# ── 参数解析（支持 --resume 模式）─────────────────
RESUME_MODE=false
if [[ "${1:-}" == "--resume" ]]; then
    RESUME_MODE=true
    shift
    WS_ROOT="${1:?--resume 用法: merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major]}"
    BRANCH_NAME="${2:?缺少 branch-name}"
    VERSION_TYPE="${3:-patch}"
    WORKTREE_DIR=""
else
    WORKTREE_DIR="${1:?Usage: merge-and-publish.sh <worktree-dir> [patch|minor|major]}"
    VERSION_TYPE="${2:-patch}"
fi

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: 版本类型必须是 patch|minor|major${NC}"
    exit 1
fi

command -v gh >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未安装${NC}"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未登录${NC}"; exit 1; }

# ── 辅助函数 ──────────────────────────────────────

# 查找 workspace root
find_workspace_root() {
    local dir="${1:-$(pwd)}"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.bare" ]] || [[ -d "$dir/.git" ]]; then
            echo "$dir"
            return
        fi
        dir="$(dirname "$dir")"
    done
    echo ""
}

# 查找 main worktree
find_main_worktree() {
    local ws_root="$1"
    for wt_name in main master; do
        if [[ -d "$ws_root/$wt_name" ]]; then
            echo "$ws_root/$wt_name"
            return
        fi
    done
    echo ""
}

# 通过已合并的 PR 查找 PR number（支持分支已删除的场景）
find_pr_for_branch() {
    local branch="$1"
    # 方法 1: 搜索已合并的 PR（分支可能已删）
    local pr_num
    pr_num=$(gh pr list --state all --search "head:$branch" --json number,state,headRefName --jq \
        ".[] | select(.headRefName == \"$branch\") | .number" 2>/dev/null | head -1)
    if [[ -n "$pr_num" ]]; then
        echo "$pr_num"
        return
    fi
    # 方法 2: 搜索 open 的 PR
    pr_num=$(gh pr list --state open --json number,headRefName --jq \
        ".[] | select(.headRefName == \"$branch\") | .number" 2>/dev/null | head -1)
    echo "${pr_num:-}"
}

# ── 初始化 ────────────────────────────────────────

if $RESUME_MODE; then
    echo "══════════════════════════════════════════════════"
    echo -e "${BOLD}端到端合并发布流程（恢复模式）${NC}"
    echo "  Workspace: $WS_ROOT"
    echo "  分支: $BRANCH_NAME"
    echo "  版本类型: $VERSION_TYPE"
    echo "══════════════════════════════════════════════════"
else
    if [[ ! -d "$WORKTREE_DIR" ]]; then
        echo -e "${RED}Error: 工作目录不存在: $WORKTREE_DIR${NC}"
        echo "如果 worktree 已删除，请用 --resume 模式："
        echo "  bash $(basename "$0") --resume <workspace-root> <branch-name> $VERSION_TYPE"
        exit 1
    fi

    cd "$WORKTREE_DIR"
    BRANCH_NAME=$(git branch --show-current)
    WS_ROOT=$(find_workspace_root "$WORKTREE_DIR")

    echo "══════════════════════════════════════════════════"
    echo -e "${BOLD}端到端合并发布流程${NC}"
    echo "  工作目录: $WORKTREE_DIR"
    echo "  分支: $BRANCH_NAME"
    echo "  版本类型: $VERSION_TYPE"
    echo "══════════════════════════════════════════════════"
fi

MAIN_WT=$(find_main_worktree "${WS_ROOT:-$WORKTREE_DIR}")

# 查找 PR（幂等：无论分支是否已删除都能找到）
PR_NUMBER=$(find_pr_for_branch "$BRANCH_NAME")
if [[ -z "$PR_NUMBER" ]]; then
    echo -e "${RED}Error: 找不到分支 '$BRANCH_NAME' 对应的 PR${NC}"
    exit 1
fi

PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title' 2>/dev/null || echo "")

# ═══════════════════════════════════════════════════
# 阶段 1: 本地验证（仅非 resume 模式）
# ═══════════════════════════════════════════════════

if ! $RESUME_MODE && [[ -d "$WORKTREE_DIR" ]]; then
    echo ""
    echo -e "${BOLD}═══ 阶段 1/5: 本地验证 ═══${NC}"
    bash "$SCRIPT_DIR/pre-merge-check.sh" "$WORKTREE_DIR" || {
        echo ""
        echo -e "${RED}${BOLD}⛔ 本地验证失败！修复后重新运行本脚本。${NC}"
        exit 1
    }
else
    echo ""
    echo -e "${YELLOW}⏭️  跳过阶段 1（恢复模式 / worktree 不存在）${NC}"
fi

# ═══════════════════════════════════════════════════
# 阶段 2: PR CI + 合并（幂等：已合并则跳过）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 2/5: PR CI + 合并 ═══${NC}"
echo "  PR: #$PR_NUMBER — $PR_TITLE"
echo "  状态: $PR_STATE"

if [[ "$PR_STATE" == "MERGED" ]]; then
    echo -e "  ${GREEN}⏭️  PR 已合并，跳过${NC}"
elif [[ "$PR_STATE" == "OPEN" ]]; then
    # 检查 PR CI
    echo "  检查 PR CI 状态..."
    CI_DATA=$(gh pr view "$PR_NUMBER" --json statusCheckRollup 2>&1) || {
        echo -e "${YELLOW}Warning: 无法获取 CI 状态，继续合并${NC}"
        CI_DATA='{"statusCheckRollup":[]}'
    }

    CI_CONCLUSIONS=$(echo "$CI_DATA" | jq -r '[.statusCheckRollup[] | .conclusion] | unique | join(",")' 2>/dev/null || echo "")

    # PR CI 失败 → 报错
    if echo "$CI_CONCLUSIONS" | grep -qi "failure\|timed_out\|cancelled"; then
        echo -e "  ${RED}❌ PR CI 有失败项:${NC}"
        echo "$CI_DATA" | jq -r '.statusCheckRollup[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled") | "    ❌ \(.name) (\(.conclusion))"' 2>/dev/null
        exit 1
    fi

    # PR CI 进行中 → 等待
    if echo "$CI_CONCLUSIONS" | grep -qi "pending\|queued\|in_progress"; then
        echo "  ⏳ PR CI 仍在运行，等待最多 10 分钟..."
        ELAPSED=0
        while [[ $ELAPSED -lt 600 ]]; do
            sleep 30
            ELAPSED=$((ELAPSED + 30))
            CI_DATA=$(gh pr view "$PR_NUMBER" --json statusCheckRollup 2>&1)
            CI_CONCLUSIONS=$(echo "$CI_DATA" | jq -r '[.statusCheckRollup[] | .conclusion] | unique | join(",")' 2>/dev/null || echo "")
            if ! echo "$CI_CONCLUSIONS" | grep -qi "pending\|queued\|in_progress"; then
                break
            fi
            echo "  ⏳ 等待中... (${ELAPSED}s/600s)"
        done
        if echo "$CI_CONCLUSIONS" | grep -qi "failure\|timed_out\|cancelled"; then
            echo -e "  ${RED}❌ PR CI 失败${NC}"
            exit 1
        fi
    fi

    echo -e "  ${GREEN}✅ PR CI 通过，开始合并${NC}"
    gh pr merge "$PR_NUMBER" --merge --delete-branch 2>&1 || {
        # 可能已被合并（并发场景），检查状态
        PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
        if [[ "$PR_STATE" == "MERGED" ]]; then
            echo -e "  ${GREEN}PR 已合并（可能被其他进程合并）${NC}"
        else
            echo -e "${RED}Error: PR 合并失败${NC}"
            exit 1
        fi
    }
    echo -e "  ${GREEN}✅ PR #$PR_NUMBER 已合并${NC}"
else
    echo -e "${RED}Error: PR 状态为 $PR_STATE，无法处理${NC}"
    exit 1
fi

# ═══════════════════════════════════════════════════
# 阶段 3: Post-merge CI（幂等：已通过则秒返）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 3/5: Post-merge CI 验证 ═══${NC}"

if [[ -n "$MAIN_WT" ]]; then
    cd "$MAIN_WT"
    git fetch origin main 2>&1 | tail -1
    MAIN_SHA=$(git rev-parse origin/main)
else
    git -C "${WS_ROOT:-.}" fetch origin main 2>&1 | tail -1 || true
    MAIN_SHA=$(git -C "${WS_ROOT:-.}" rev-parse origin/main 2>/dev/null || git rev-parse origin/main)
fi

echo "  main SHA: $MAIN_SHA"

bash "$SCRIPT_DIR/wait-for-ci.sh" "$MAIN_SHA" || {
    WAIT_EXIT=$?
    if [[ $WAIT_EXIT -eq 1 ]]; then
        echo ""
        echo -e "${RED}${BOLD}⛔ Post-merge CI 失败！${NC}"
        echo ""
        echo "修复步骤："
        echo "  1. 在 main worktree 中查看日志并修复: gh run view <run-id> --log-failed"
        echo "  2. git push origin main"
        echo "  3. 重新运行本脚本（--resume 模式）:"
        echo "     bash $(basename "$0") --resume ${WS_ROOT:-.} $BRANCH_NAME $VERSION_TYPE"
        exit 1
    else
        echo -e "${YELLOW}${BOLD}⚠️  CI 等待超时${NC}"
        echo "可以重新运行本脚本，或手动确认 CI 通过后继续。"
        exit 2
    fi
}

echo -e "  ${GREEN}✅ Post-merge CI 通过${NC}"

# ═══════════════════════════════════════════════════
# 阶段 4: 发布（幂等：已发布则跳过）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 4/5: 发布 ═══${NC}"

# 检查项目是否有 scripts/publish.sh
PUBLISH_SH=""
for search_dir in "$MAIN_WT" "$WORKTREE_DIR"; do
    if [[ -n "$search_dir" ]] && [[ -f "$search_dir/scripts/publish.sh" ]]; then
        PUBLISH_SH="$search_dir/scripts/publish.sh"
        break
    fi
done

if [[ -z "$PUBLISH_SH" ]]; then
    echo -e "${YELLOW}⚠️  未检测到 scripts/publish.sh，跳过自动发布${NC}"
    echo "  如需发布，请手动执行相应的发布命令。"
else
    # 检查是否已有比当前 main 更新的 npm 版本（幂等检测）
    CURRENT_VERSION=$(node -p "require('$MAIN_WT/package.json').version" 2>/dev/null || echo "unknown")
    NPM_VERSION=$(npm info llm-simple-router version 2>/dev/null || echo "0.0.0")

    # 简单比较：如果 npm 版本 >= 本地版本，说明已发布
    if [[ "$NPM_VERSION" != "0.0.0" ]] && [[ "$CURRENT_VERSION" != "unknown" ]]; then
        # 用 sort -V 比较，如果 npm >= local 则已发布
        NEWER=$(echo -e "$NPM_VERSION\n$CURRENT_VERSION" | sort -V | tail -1)
        if [[ "$NPM_VERSION" == "$NEWER" ]] || [[ "$NPM_VERSION" == "$CURRENT_VERSION" ]]; then
            echo -e "  ${GREEN}⏭️  跳过发布：npm 已有 v$NPM_VERSION（本地 v$CURRENT_VERSION）${NC}"
            echo -e "  ${GREEN}✅ 发布已完成${NC}"
            SKIP_PUBLISH=true
        fi
    fi

    if [[ "${SKIP_PUBLISH:-false}" != "true" ]]; then
        if grep -q 'gh workflow run' "$PUBLISH_SH"; then
            echo "  检测到 GitHub Actions 发布脚本，运行中..."
            cd "$(dirname "$PUBLISH_SH")/.."
            bash "$PUBLISH_SH" "$VERSION_TYPE" || {
                echo -e "${RED}Error: 发布失败${NC}"
                echo "修复后重新运行（--resume 模式）:"
                echo "  bash $(basename "$0") --resume ${WS_ROOT:-.} $BRANCH_NAME $VERSION_TYPE"
                exit 1
            }
        else
            if [[ -z "$MAIN_WT" ]]; then
                echo -e "${RED}Error: 本地发布脚本需要在 main worktree 运行，未找到 main worktree${NC}"
                exit 1
            fi
            echo "  检测到本地发布脚本，在 main worktree 运行中..."
            cd "$MAIN_WT"
            bash "$PUBLISH_SH" "$VERSION_TYPE" || {
                echo -e "${RED}Error: 发布失败${NC}"
                exit 1
            }
        fi
        echo -e "  ${GREEN}✅ 发布完成${NC}"
    fi
fi

# ═══════════════════════════════════════════════════
# 阶段 5: 清理（幂等：已删除则跳过）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 5/5: 清理 Worktree ═══${NC}"

if [[ -n "$WORKTREE_DIR" ]] && [[ -d "$WORKTREE_DIR" ]]; then
    cd "${WS_ROOT:-.}"
    if [[ -f "$SCRIPT_DIR/../remove-worktree/remove-worktree.sh" ]]; then
        bash "$SCRIPT_DIR/../remove-worktree/remove-worktree.sh" "$BRANCH_NAME" --force --skip-sync 2>&1 || {
            echo -e "${YELLOW}Warning: worktree 清理失败，可手动处理${NC}"
        }
    else
        echo -e "${YELLOW}⚠️  未找到 remove-worktree 脚本，跳过自动清理${NC}"
        echo "  可手动删除: cd ${WS_ROOT:-.} && git worktree remove $WORKTREE_DIR"
    fi
else
    echo -e "  ${GREEN}⏭️  跳过清理（worktree 不存在或已在恢复模式）${NC}"
fi

# ── 最终报告 ──────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo -e "${GREEN}${BOLD}✅ 端到端流程全部完成！${NC}"
echo "  PR: #$PR_NUMBER"
echo "  版本类型: $VERSION_TYPE"
echo "  分支: $BRANCH_NAME"
echo "══════════════════════════════════════════════════"
