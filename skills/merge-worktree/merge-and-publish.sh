#!/bin/bash
# merge-and-publish.sh — 从 PR 合并到发布的端到端自动化（幂等）
#
# 一键完成：本地验证 → PR CI → merge → post-merge CI → 发布准备 → 确认清理
# 支持断点续跑：已完成的阶段自动跳过。
#
# 用法: merge-and-publish.sh <worktree-dir> [patch|minor|major]
#        merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major]
#
# 退出码：
#   0 = 全部成功（已合并、已发布、已清理）
#   1 = 失败，AI 必须修复后重新运行
#   2 = 超时，AI 应询问用户
#   3 = 等待 AI 介入（撰写 release notes / 确认 release / 确认清理）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 参数解析（支持 --resume 模式）─────────────────
RESUME_MODE=false
CONFIRM_RELEASE=false
EXTRA_ARGS=()

# 预扫描参数
for arg in "$@"; do
    if [[ "$arg" == "--confirm-release" ]]; then
        CONFIRM_RELEASE=true
    fi
done

if [[ "${1:-}" == "--resume" ]]; then
    RESUME_MODE=true
    shift
    WS_ROOT="${1:?--resume 用法: merge-and-publish.sh --resume <workspace-root> <branch-name> [patch|minor|major]}"
    shift
    BRANCH_NAME="${1:?缺少 branch-name}"
    shift || true
    VERSION_TYPE="${1:-patch}"
    WORKTREE_DIR=""
else
    WORKTREE_DIR="${1:?Usage: merge-and-publish.sh <worktree-dir> [patch|minor|major]}"
    shift || true
    VERSION_TYPE="${1:-patch}"
fi

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: 版本类型必须是 patch|minor|major${NC}"
    exit 1
fi

command -v gh >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未安装${NC}"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未登录${NC}"; exit 1; }

# ── 辅助函数 ──────────────────────────────────────

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

find_pr_for_branch() {
    local branch="$1"
    local pr_num
    pr_num=$(gh pr list --state all --search "head:$branch" --json number,state,headRefName --jq \
        ".[] | select(.headRefName == \"$branch\") | .number" 2>/dev/null | head -1)
    if [[ -n "$pr_num" ]]; then
        echo "$pr_num"
        return
    fi
    pr_num=$(gh pr list --state open --json number,headRefName --jq \
        ".[] | select(.headRefName == \"$branch\") | .number" 2>/dev/null | head -1)
    echo "${pr_num:-}"
}

# 钩子调用：执行 .bare/merge-hooks/ 下的项目级钩子
# 钩子脚本通过环境变量获取上下文（WS_ROOT, BRANCH_NAME, PR_NUMBER, VERSION 等）
run_hook() {
    local hook_name="$1"
    shift
    local hook_script="${WS_ROOT:-$(find_workspace_root "$(pwd)")}/.bare/custom-hooks/$hook_name"
    if [[ -x "$hook_script" ]]; then
        echo ""
        echo -e "  ${CYAN}🔧 执行项目钩子: $hook_name${NC}"
        WS_ROOT="${WS_ROOT}" BRANCH_NAME="${BRANCH_NAME:-}" \
        PR_NUMBER="${PR_NUMBER:-}" VERSION="${NEW_VERSION:-}" \
        COMMIT_FILE="${COMMIT_FILE:-}" \
        "$hook_script" "$@" || {
            echo -e "  ${RED}❌ 钩子 $hook_name 失败（退出码 $?）${NC}"
            return 1
        }
        echo -e "  ${GREEN}✅ 钩子 $hook_name 完成${NC}"
    fi
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

# ── --confirm-release 快速路径 ──────────────────────
# 当 AI 确认 Draft Release 后，直接跳到阶段 6（清理）
if $CONFIRM_RELEASE; then
    # 重新获取上下文
    PR_NUMBER=$(find_pr_for_branch "${BRANCH_NAME:-}") || true
    if [[ -n "$MAIN_WT" ]] && [[ -f "$MAIN_WT/package.json" ]]; then
        NEW_VERSION=$(node -p "require('$MAIN_WT/package.json').version")
    else
        NEW_VERSION=$(git -C "${WS_ROOT:-.}" describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "unknown")
    fi

    # source confirm_and_cleanup 函数（在文件末尾定义）
    confirm_and_cleanup
    exit $?
fi

# 查找 PR
PR_NUMBER=$(find_pr_for_branch "$BRANCH_NAME")
if [[ -z "$PR_NUMBER" ]]; then
    echo -e "${RED}Error: 找不到分支 '$BRANCH_NAME' 对应的 PR${NC}"
    exit 1
fi

PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title' 2>/dev/null || echo "")

# 断点文件：标记已完成的阶段
CHECKPOINT_DIR="$WS_ROOT/.merge-checkpoints"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true
checkpoint() { touch "$CHECKPOINT_DIR/$1"; }
is_checkpoint() { [[ -f "$CHECKPOINT_DIR/$1" ]]; }
clear_checkpoints() { rm -rf "$CHECKPOINT_DIR"; }

# Release notes 文件（AI 写入）
RELEASE_NOTES_FILE="$WS_ROOT/.release-notes.md"
# Commit 清单文件（供 AI 参考）
COMMIT_FILE="$WS_ROOT/.release-commits.txt"

# ═══════════════════════════════════════════════════
# 阶段 1: 本地验证（仅非 resume 模式）
# ═══════════════════════════════════════════════════

if ! $RESUME_MODE && [[ -d "$WORKTREE_DIR" ]]; then
    if is_checkpoint "phase1-passed"; then
        echo ""
        echo -e "${YELLOW}⏭️  跳过阶段 1（已完成）${NC}"
    else
        echo ""
        echo -e "${BOLD}═══ 阶段 1/6: 本地验证 ═══${NC}"

        # 执行项目钩子 pre-merge.sh
        run_hook "pre-merge.sh" "$WORKTREE_DIR" || true

        bash "$SCRIPT_DIR/pre-merge-check.sh" "$WORKTREE_DIR" || {
            echo ""
            echo -e "${RED}${BOLD}⛔ 本地验证失败！修复后重新运行本脚本。${NC}"
            exit 1
        }
        checkpoint "phase1-passed"
    fi
else
    echo ""
    echo -e "${YELLOW}⏭️  跳过阶段 1（恢复模式 / worktree 不存在）${NC}"
fi

# ═══════════════════════════════════════════════════
# 阶段 2: PR CI + 合并（幂等：已合并则跳过）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 2/6: PR CI + 合并 ═══${NC}"
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

    if echo "$CI_CONCLUSIONS" | grep -qi "failure\|timed_out\|cancelled"; then
        echo -e "  ${RED}❌ PR CI 有失败项:${NC}"
        echo "$CI_DATA" | jq -r '.statusCheckRollup[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled") | "    ❌ \(.name) (\(.conclusion))"' 2>/dev/null
        exit 1
    fi

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
echo -e "${BOLD}═══ 阶段 3/6: Post-merge CI 验证 ═══${NC}"

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
        exit 2
    fi
}

echo -e "  ${GREEN}✅ Post-merge CI 通过${NC}"

# ═══════════════════════════════════════════════════
# 阶段 4: 发布准备（版本 bump + tag + push + 等 CI）
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 4/6: 发布准备 ═══${NC}"

# 4a. 检查是否有项目发布脚本
PUBLISH_SH=""
for search_dir in "$MAIN_WT" "$WORKTREE_DIR"; do
    if [[ -n "$search_dir" ]] && [[ -f "$search_dir/scripts/publish.sh" ]]; then
        PUBLISH_SH="$search_dir/scripts/publish.sh"
        break
    fi
done

if [[ -n "$PUBLISH_SH" ]]; then
    # 使用项目自己的发布脚本
    if grep -q 'gh workflow run' "$PUBLISH_SH"; then
        echo "  检测到 GitHub Actions 发布脚本"
        cd "$(dirname "$PUBLISH_SH")/.."
        bash "$PUBLISH_SH" "$VERSION_TYPE" || {
            echo -e "${RED}Error: 发布脚本失败${NC}"
            exit 1
        }
    else
        if [[ -z "$MAIN_WT" ]]; then
            echo -e "${RED}Error: 本地发布脚本需要在 main worktree 运行${NC}"
            exit 1
        fi
        cd "$MAIN_WT"
        bash "$PUBLISH_SH" "$VERSION_TYPE" || {
            echo -e "${RED}Error: 发布脚本失败${NC}"
            exit 1
        }
    fi
    # 发布脚本自行处理版本 bump 和 tag，读取版本号
    if [[ -n "$MAIN_WT" ]] && [[ -f "$MAIN_WT/package.json" ]]; then
        NEW_VERSION=$(node -p "require('$MAIN_WT/package.json').version")
    else
        NEW_VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "unknown")
    fi
else
    # 4b. 没有项目发布脚本 → 自行 bump 版本 + tag + push

    # 幂等：检查 tag 是否已存在
    TAG=""

    # 确定在哪个目录操作版本号
    OP_DIR="$MAIN_WT"
    [[ -z "$OP_DIR" ]] && OP_DIR="$WORKTREE_DIR"

    if [[ -n "$OP_DIR" ]] && [[ -f "$OP_DIR/package.json" ]]; then
        CURRENT_VERSION=$(node -p "require('$OP_DIR/package.json').version")

        # 检查是否已 bump
        EXISTING_TAG="v$CURRENT_VERSION"
        if git -C "$OP_DIR" rev-parse "$EXISTING_TAG" >/dev/null 2>&1; then
            echo -e "  ${GREEN}⏭️  Tag $EXISTING_TAG 已存在，跳过版本 bump${NC}"
            NEW_VERSION="$CURRENT_VERSION"
            TAG="$EXISTING_TAG"
        else
            cd "$OP_DIR"
            npm version "$VERSION_TYPE" --no-git-tag-version 2>&1
            NEW_VERSION=$(node -p "require('./package.json').version")
            TAG="v$NEW_VERSION"

            echo "  版本: $CURRENT_VERSION → $NEW_VERSION"

            git add package.json package-lock.json 2>/dev/null || true
            git commit -m "chore: bump version to $NEW_VERSION" 2>/dev/null || echo "  无变更需提交"
            git tag "$TAG" 2>/dev/null || echo "  Tag 已存在"
            git push origin main --tags 2>&1 | tail -1
            echo -e "  ${GREEN}✅ 版本 bump + tag + push 完成${NC}"
        fi
    else
        # 非 npm 项目：手动 tag
        NEW_VERSION="${VERSION_TYPE}-$(date +%Y%m%d%H%M%S)"
        TAG="v$NEW_VERSION"
        echo "  非 npm 项目，创建 tag: $TAG"
        if [[ -n "$OP_DIR" ]]; then
            cd "$OP_DIR"
            git tag "$TAG" 2>/dev/null || true
            git push origin --tags 2>&1 | tail -1
        fi
    fi

    # 4c. 等待 release CI 构建完成
    if [[ -n "$TAG" ]]; then
        echo ""
        echo "  ⏳ 等待 release CI 构建产物..."
        TAG_SHA=$(git -C "$OP_DIR" rev-parse "$TAG" 2>/dev/null || echo "")

        # 尝试等待 release workflow
        if [[ -n "$TAG_SHA" ]]; then
            bash "$SCRIPT_DIR/wait-for-ci.sh" "$TAG_SHA" --timeout 900 --workflow "Release" 2>&1 || {
                WAIT_EXIT=$?
                if [[ $WAIT_EXIT -eq 1 ]]; then
                    echo -e "  ${RED}❌ Release CI 构建失败！查看日志: gh run view --log-failed${NC}"
                    exit 1
                fi
                # 超时不阻断，可能没有 Release workflow 或名字不匹配
                echo -e "  ${YELLOW}⚠️  未检测到 Release CI（可能 workflow 名称不匹配），继续${NC}"
            }
        fi
        echo -e "  ${GREEN}✅ Release CI 完成${NC}"
    fi
fi

# ═══════════════════════════════════════════════════
# 阶段 5: AI 撰写 Release Notes + 创建 Release
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 5/6: Release Notes + Draft Release ═══${NC}"

# 5a. 生成 commit 清单供 AI 参考
if [[ ! -f "$RELEASE_NOTES_FILE" ]]; then
    # 获取上一个 tag
    LAST_TAG=""
    if [[ -n "$MAIN_WT" ]]; then
        LAST_TAG=$(cd "$MAIN_WT" && git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
    fi

    if [[ -n "$LAST_TAG" ]]; then
        LOG_RANGE="$LAST_TAG..HEAD"
    else
        LOG_RANGE="HEAD~30..HEAD"
    fi

    # 生成 commit 清单
    cd "${MAIN_WT:-$OP_DIR}"
    git log "$LOG_RANGE" --pretty=format:"%s" --no-merges > "$COMMIT_FILE" 2>/dev/null || echo "(无 commit)" > "$COMMIT_FILE"

    # 执行 generate-release-notes.sh 钩子（可预处理 commit 清单）
    run_hook "generate-release-notes.sh" || true

    echo ""
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}${BOLD}📝 等待 AI 撰写 Release Notes${NC}"
    echo ""
    echo "  1. 查看 commit 清单: cat $COMMIT_FILE"
    echo "  2. 按 Release Notes 规范撰写内容"
    echo "  3. 写入文件: $RELEASE_NOTES_FILE"
    echo ""
    echo "  版本: v${NEW_VERSION}"
    echo "  PR: #$PR_NUMBER — $PR_TITLE"
    [[ -n "$LAST_TAG" ]] && echo "  上一个 tag: $LAST_TAG"
    echo ""
    echo "  Release Notes 格式规范:"
    echo "    ## What's Changed"
    echo "    ### Breaking Changes（如有）"
    echo "    ### Features（多个相关 commit 合并为一条）"
    echo "    ### Bug Fixes（只列用户可见的修复）"
    echo "    ### Performance（如有）"
    echo "    **Full Changelog**: url"
    echo ""
    echo "  写完后重新运行本脚本（--resume 模式）："
    echo "    bash $(basename "$0") --resume ${WS_ROOT:-.} $BRANCH_NAME $VERSION_TYPE"
    echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    exit 3
fi

# 5b. Release notes 已就绪，创建 Draft Release
echo "  Release notes 已就绪: $RELEASE_NOTES_FILE"

TAG="v${NEW_VERSION}"
REPO_URL=$(gh repo view --json url --jq '.url' 2>/dev/null || echo "")

RELEASE_NOTES_BODY=$(cat "$RELEASE_NOTES_FILE")

# 用 release notes 创建或更新 Draft Release
RELEASE_URL=""
# 检查是否已有 draft release
EXISTING_RELEASE=$(gh release view "$TAG" --json isDraft,id --jq '.' 2>/dev/null || echo "")

if [[ -n "$EXISTING_RELEASE" ]]; then
    # 更新已有 release 的 body
    RELEASE_ID=$(echo "$EXISTING_RELEASE" | jq -r '.id')
    echo "  更新已有 Draft Release: $TAG"
    gh release edit "$TAG" --notes "$RELEASE_NOTES_BODY" 2>&1 || true
    RELEASE_URL="$REPO_URL/releases/tag/$TAG"
else
    # 创建新 Draft Release
    echo "  创建 Draft Release: $TAG"
    RELEASE_URL=$(gh release create "$TAG" \
        --title "v$NEW_VERSION" \
        --notes "$RELEASE_NOTES_BODY" \
        --draft \
        --target main 2>&1 | tail -1) || {
        echo -e "  ${RED}❌ Release 创建失败${NC}"
        exit 1
    }
fi

echo -e "  ${GREEN}✅ Draft Release 已创建${NC}"
echo "  URL: $RELEASE_URL"

# 执行 post-release.sh 钩子
run_hook "post-release.sh" "$RELEASE_URL" || true

# 清理临时文件
rm -f "$RELEASE_NOTES_FILE" "$COMMIT_FILE"
clear_checkpoints

echo ""
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}${BOLD}🔍 请确认 Draft Release${NC}"
echo ""
echo "  请检查："
echo "    1. 版本号: v${NEW_VERSION}"
echo "    2. Release notes 内容"
echo "    3. 三平台产物是否已上传"
echo ""
echo "  确认后运行："
echo "    bash $(basename "$0") --resume ${WS_ROOT:-.} $BRANCH_NAME $VERSION_TYPE --confirm-release"
echo ""
echo "  如需修改 release notes："
echo "    1. gh release edit $TAG --notes-file <新文件>"
echo "    2. 再运行 --confirm-release"
echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

exit 3

# ═══════════════════════════════════════════════════
# 阶段 6: 确认 + 清理（仅 --confirm-release 触发）
# ═══════════════════════════════════════════════════

# 以下代码只在 --confirm-release 参数时执行
# （由上面的 exit 3 正常退出，--confirm-release 时跳过 exit）

confirm_and_cleanup() {
    echo ""
    echo -e "${BOLD}═══ 阶段 6/6: 确认 + 清理 ═══${NC}"

    # 发布 Draft Release（转为正式）
    TAG="v${NEW_VERSION}"
    echo "  发布 Draft Release: $TAG"
    gh release edit "$TAG" --draft=false 2>&1 || {
        echo -e "  ${YELLOW}Warning: 发布 Draft Release 失败，请手动发布${NC}"
    }
    echo -e "  ${GREEN}✅ Release 已正式发布${NC}"

    # 清理 worktree
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

        # 同步其他 worktree
        echo ""
        echo "  同步其他 worktree..."
        for _wt_entry in "${WS_ROOT:-.}"/*/; do
            _wt_name="${_wt_entry%/}"
            [[ "$_wt_name" == *"main" ]] && continue
            [[ "$_wt_name" == *"master" ]] && continue
            [[ "$_wt_name" == *".bare" ]] && continue
            [[ "$_wt_name" == *"node_modules" ]] && continue
            [[ -d "$_wt_name" ]] || continue

            _branch=$(cd "$_wt_name" && git rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
            [[ -z "$_branch" ]] && continue

            echo "    同步 $_wt_name ($_branch)..."
            cd "$_wt_name"
            git fetch origin main 2>&1 | tail -1
            git merge --no-ff origin/main 2>&1 | tail -1 || {
                echo -e "    ${YELLOW}冲突: $_wt_name${NC}"
            }
            cd "${WS_ROOT:-.}"
        done
    else
        echo -e "  ${GREEN}⏭️  跳过清理（worktree 不存在）${NC}"
    fi

    # ── 最终报告 ──────────────────────────────────────
    echo ""
    echo "══════════════════════════════════════════════════"
    echo -e "${GREEN}${BOLD}✅ 端到端流程全部完成！${NC}"
    echo "  PR: #$PR_NUMBER"
    echo "  版本: v$NEW_VERSION"
    echo "  分支: $BRANCH_NAME"
    echo "══════════════════════════════════════════════════"
}

# confirm_and_cleanup 函数由上方 --confirm-release 快速路径调用
# 函数定义保留在此处供 source
