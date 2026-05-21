#!/bin/bash
# merge-and-publish.sh — 从 PR 合并到发布的端到端自动化（单次执行，幂等）
#
# 一键完成：本地验证 → PR CI → merge → post-merge CI → 版本 bump → tag → push
#          → 等 Release CI → Release Notes → 创建 Release → 清理 worktree
#
# 用法: merge-and-publish.sh <worktree-dir> [patch|minor|major] [--notes <file>] [--draft]
#
#   --notes <file>  使用指定文件作为 release notes（不提供则从 conventional commits 自动生成）
#   --draft         创建 Draft Release 而非直接发布
#
# 退出码：
#   0 = 全部成功
#   1 = 失败，修复后重新运行（幂等，已完成步骤自动跳过）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 参数解析 ──────────────────────────────────────
WORKTREE_DIR=""
VERSION_TYPE="patch"
NOTES_FILE=""
DRAFT_MODE=false

POSITIONAL=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --notes) NOTES_FILE="$2"; shift 2 ;;
        --draft) DRAFT_MODE=true; shift ;;
        -*)      echo -e "${RED}Error: 未知选项 $1${NC}"; exit 1 ;;
        *)       POSITIONAL+=("$1"); shift ;;
    esac
done
set -- "${POSITIONAL[@]}"

WORKTREE_DIR="${1:?Usage: merge-and-publish.sh <worktree-dir> [patch|minor|major] [--notes <file>] [--draft]}"
shift || true
VERSION_TYPE="${1:-patch}"

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: 版本类型必须是 patch|minor|major${NC}"
    exit 1
fi

if [[ -n "$NOTES_FILE" ]] && [[ ! -f "$NOTES_FILE" ]]; then
    echo -e "${RED}Error: Release notes 文件不存在: $NOTES_FILE${NC}"
    exit 1
fi

command -v gh >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未安装${NC}"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo -e "${RED}Error: gh CLI 未登录${NC}"; exit 1; }

# ── 安全检查：调用者 cwd 不能在 worktree 内 ────────
CALLER_DIR=$(pwd -P)
WORKTREE_DIR=$(cd "$WORKTREE_DIR" && pwd -P)  # 解析为绝对路径

if [[ ! -d "$WORKTREE_DIR" ]]; then
    echo -e "${RED}Error: 工作目录不存在: $WORKTREE_DIR${NC}"
    exit 1
fi

if [[ "$CALLER_DIR" == "$WORKTREE_DIR" || "$CALLER_DIR/" == "$WORKTREE_DIR/"* ]]; then
    echo -e "${RED}${BOLD}⛔ 安全阻断：当前 shell 的工作目录在待处理的 worktree 内！${NC}"
    echo -e "${RED}    当前目录: $CALLER_DIR${NC}"
    echo -e "${RED}    worktree: $WORKTREE_DIR${NC}"
    echo ""
    echo "    脚本最后会删除此 worktree，如果 cwd 在里面，删除后 shell 会卡死。"
    echo "    修复: cd <workspace-root> 后重新运行。"
    exit 1
fi

# ── 辅助函数 ──────────────────────────────────────

find_workspace_root() {
    local dir
    dir=$(cd "${1:-$(pwd)}" && pwd -P)
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
    [[ -z "$branch" ]] && return
    local pr_num
    pr_num=$(gh pr list --state all --head "$branch" --json number --jq '.[0].number' 2>/dev/null) || true
    echo "${pr_num:-}"
}

run_hook() {
    local hook_name="$1"
    shift
    local hook_script="${WS_ROOT}/.bare/custom-hooks/$hook_name"
    if [[ -x "$hook_script" ]]; then
        echo ""
        echo -e "  ${CYAN}🔧 执行项目钩子: $hook_name${NC}"
        local hook_exit=0
        WS_ROOT="${WS_ROOT}" BRANCH_NAME="${BRANCH_NAME:-}" \
        PR_NUMBER="${PR_NUMBER:-}" VERSION="${NEW_VERSION:-}" \
        COMMIT_FILE="${COMMIT_FILE:-}" \
        "$hook_script" "$@" || hook_exit=$?
        if [[ $hook_exit -ne 0 ]]; then
            echo -e "  ${RED}❌ 钩子 $hook_name 失败（退出码 $hook_exit）${NC}"
            return 1
        fi
        echo -e "  ${GREEN}✅ 钩子 $hook_name 完成${NC}"
    fi
}

# 自动生成 Release Notes（从 conventional commits 分组）
generate_auto_release_notes() {
    local commit_file="$1"
    local tag="$2"
    local old_tag="$3"
    local repo_url="$4"

    local features="" fixes="" perfs="" breaking=""

    while IFS= read -r line; do
        local msg="${line#*: }"
        case "$line" in
            feat:*|feat\(*:*)
                [[ -n "$features" ]] && features+=$'\n'
                features+="  - ${msg}"
                ;;
            fix:*|fix\(*:*)
                [[ -n "$fixes" ]] && fixes+=$'\n'
                fixes+="  - ${msg}"
                ;;
            perf:*|perf\(*:*)
                [[ -n "$perfs" ]] && perfs+=$'\n'
                perfs+="  - ${msg}"
                ;;
            breaking:*|breaking\(*:*)
                [[ -n "$breaking" ]] && breaking+=$'\n'
                breaking+="  - ${msg}"
                ;;
        esac
    done < "$commit_file"

    {
        echo "## What's Changed"
        echo ""
        if [[ -n "$breaking" ]]; then
            echo "### Breaking Changes"
            echo "$breaking"
            echo ""
        fi
        if [[ -n "$features" ]]; then
            echo "### Features"
            echo "$features"
            echo ""
        fi
        if [[ -n "$fixes" ]]; then
            echo "### Bug Fixes"
            echo "$fixes"
            echo ""
        fi
        if [[ -n "$perfs" ]]; then
            echo "### Performance"
            echo "$perfs"
            echo ""
        fi
        if [[ -n "$old_tag" ]] && [[ -n "$repo_url" ]]; then
            echo "**Full Changelog**: ${repo_url}/compare/${old_tag}...${tag}"
        fi
    }
}

# ── 初始化 ────────────────────────────────────────

BRANCH_NAME=$(git -C "$WORKTREE_DIR" branch --show-current)
WS_ROOT=$(find_workspace_root "$WORKTREE_DIR")

if [[ -z "$WS_ROOT" ]]; then
    echo -e "${RED}Error: 未找到 workspace root（向上查找 .bare/ 或 .git/）${NC}"
    exit 1
fi

MAIN_WT=$(find_main_worktree "$WS_ROOT")

# 断点文件
CHECKPOINT_DIR="$WS_ROOT/.merge-checkpoints/${BRANCH_NAME//\//-}"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true
checkpoint() { touch "$CHECKPOINT_DIR/$1"; }
is_checkpoint() { [[ -f "$CHECKPOINT_DIR/$1" ]]; }
clear_checkpoints() { rm -rf "$CHECKPOINT_DIR"; }

# 临时文件
COMMIT_FILE="$WS_ROOT/.release-commits.txt"

# 查找 PR
PR_NUMBER=$(find_pr_for_branch "$BRANCH_NAME")
if [[ -z "$PR_NUMBER" ]]; then
    echo -e "${RED}Error: 找不到分支 '$BRANCH_NAME' 对应的 PR${NC}"
    exit 1
fi

PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title' 2>/dev/null || echo "")

echo "══════════════════════════════════════════════════"
echo -e "${BOLD}端到端合并发布流程${NC}"
echo "  工作目录: $WORKTREE_DIR"
echo "  分支: $BRANCH_NAME"
echo "  版本类型: $VERSION_TYPE"
echo "  PR: #$PR_NUMBER — $PR_TITLE"
echo "  Release Notes: ${NOTES_FILE:-(自动生成)}"
if $DRAFT_MODE; then echo "  模式: Draft（需手动发布）"; fi
echo "══════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════
# 阶段 1: 本地验证
# ═══════════════════════════════════════════════════

if is_checkpoint "phase1-passed"; then
    echo ""
    echo -e "${YELLOW}⏭️  跳过阶段 1（已完成）${NC}"
else
    echo ""
    echo -e "${BOLD}═══ 阶段 1/6: 本地验证 ═══${NC}"

    run_hook "pre-merge.sh" "$WORKTREE_DIR"

    bash "$SCRIPT_DIR/pre-merge-check.sh" "$WORKTREE_DIR" || {
        echo ""
        echo -e "${RED}${BOLD}⛔ 本地验证失败！修复后重新运行本脚本。${NC}"
        exit 1
    }
    checkpoint "phase1-passed"
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
# 阶段 3: Post-merge CI
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 3/6: Post-merge CI 验证 ═══${NC}"

if [[ -n "$MAIN_WT" ]]; then
    git -C "$MAIN_WT" fetch origin main 2>&1 | tail -1
    MAIN_SHA=$(git -C "$MAIN_WT" rev-parse origin/main)
else
    git -C "${WS_ROOT}" fetch origin main 2>&1 | tail -1 || true
    MAIN_SHA=$(git -C "${WS_ROOT}" rev-parse origin/main 2>/dev/null || git rev-parse origin/main)
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
        echo "  3. 重新运行本脚本（幂等，已完成步骤会跳过）"
        exit 1
    else
        echo -e "${YELLOW}${BOLD}⚠️  CI 等待超时，询问用户是否继续${NC}"
        exit 1
    fi
}

echo -e "  ${GREEN}✅ Post-merge CI 通过${NC}"

# ═══════════════════════════════════════════════════
# 阶段 4: 发布准备（版本 bump + tag + push + 等 Release CI）
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
    if grep -q 'gh workflow run' "$PUBLISH_SH"; then
        echo "  检测到 GitHub Actions 发布脚本"
        (
            cd "$(dirname "$PUBLISH_SH")/.."
            bash "$PUBLISH_SH" "$VERSION_TYPE"
        ) || {
            echo -e "${RED}Error: 发布脚本失败${NC}"
            exit 1
        }
    else
        if [[ -z "$MAIN_WT" ]]; then
            echo -e "${RED}Error: 本地发布脚本需要在 main worktree 运行${NC}"
            exit 1
        fi
        (
            cd "$MAIN_WT"
            bash "$PUBLISH_SH" "$VERSION_TYPE"
        ) || {
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
    TAG=""

    OP_DIR="$MAIN_WT"
    [[ -z "$OP_DIR" ]] && OP_DIR="$WORKTREE_DIR"

    if [[ -n "$OP_DIR" ]] && [[ -f "$OP_DIR/package.json" ]]; then
        CURRENT_VERSION=$(node -p "require('$OP_DIR/package.json').version")

        EXISTING_TAG="v$CURRENT_VERSION"
        if git -C "$OP_DIR" rev-parse "$EXISTING_TAG" >/dev/null 2>&1; then
            echo -e "  ${GREEN}⏭️  Tag $EXISTING_TAG 已存在，跳过版本 bump${NC}"
            NEW_VERSION="$CURRENT_VERSION"
            TAG="$EXISTING_TAG"
        else
            (
                cd "$OP_DIR"
                git pull origin main 2>&1 | tail -1
                npm version "$VERSION_TYPE" --no-git-tag-version 2>&1
                NEW_VERSION=$(node -p "require('./package.json').version")
                TAG="v$NEW_VERSION"

                echo "  版本: $CURRENT_VERSION → $NEW_VERSION"

                git add package.json package-lock.json 2>/dev/null || true
                git commit -m "chore: bump version to $NEW_VERSION" 2>/dev/null || echo "  无变更需提交"
                git tag "$TAG" 2>/dev/null || echo "  Tag 已存在"
                git push origin main --tags 2>&1 | tail -1
            )
            # 从 OP_DIR 重新读取版本号（子 shell 中的变量不传回）
            NEW_VERSION=$(node -p "require('$OP_DIR/package.json').version")
            TAG="v$NEW_VERSION"
            echo -e "  ${GREEN}✅ 版本 bump + tag + push 完成${NC}"
        fi
    else
        # 非 npm 项目：手动 tag
        NEW_VERSION="${VERSION_TYPE}-$(date +%Y%m%d%H%M%S)"
        TAG="v$NEW_VERSION"
        echo "  非 npm 项目，创建 tag: $TAG"
        if [[ -n "$OP_DIR" ]]; then
            git -C "$OP_DIR" tag "$TAG" 2>/dev/null || true
            git -C "$OP_DIR" push origin --tags 2>&1 | tail -1
        fi
    fi

    # 4c. 等待 release CI 构建完成
    if [[ -n "$TAG" ]]; then
        echo ""
        echo "  ⏳ 等待 release CI 构建产物..."
        TAG_SHA=$(git -C "${OP_DIR}" rev-parse "$TAG" 2>/dev/null || echo "")

        if [[ -n "$TAG_SHA" ]]; then
            bash "$SCRIPT_DIR/wait-for-ci.sh" "$TAG_SHA" --timeout 900 --workflow "Release" 2>&1 || {
                WAIT_EXIT=$?
                if [[ $WAIT_EXIT -eq 1 ]]; then
                    echo -e "  ${RED}❌ Release CI 构建失败！查看日志: gh run view --log-failed${NC}"
                    exit 1
                fi
                echo -e "  ${YELLOW}⚠️  未检测到 Release CI（可能 workflow 名称不匹配），继续${NC}"
            }
        fi
        echo -e "  ${GREEN}✅ Release CI 完成${NC}"
    fi
fi

echo "  版本: v${NEW_VERSION}"

# ═══════════════════════════════════════════════════
# 阶段 5: Release Notes + 创建 Release
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 5/6: Release ═══${NC}"

TAG="v${NEW_VERSION}"
REPO_URL=$(gh repo view --json url --jq '.url' 2>/dev/null || echo "")

# 5a. 生成 commit 清单
LAST_TAG=""
if [[ -n "$MAIN_WT" ]]; then
    LAST_TAG=$(git -C "$MAIN_WT" describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
fi

if [[ -n "$LAST_TAG" ]]; then
    LOG_RANGE="$LAST_TAG..HEAD"
else
    LOG_RANGE="HEAD~30..HEAD"
fi

cd "${MAIN_WT:-$OP_DIR}"
git log "$LOG_RANGE" --pretty=format:"%s" --no-merges > "$COMMIT_FILE" 2>/dev/null || echo "(无 commit)" > "$COMMIT_FILE"

# 执行 generate-release-notes.sh 钩子（可预处理 commit 清单）
run_hook "generate-release-notes.sh" || true

# 5b. 确定 release notes 内容
if [[ -n "$NOTES_FILE" ]]; then
    echo "  使用指定的 release notes: $NOTES_FILE"
    FINAL_NOTES_FILE="$NOTES_FILE"
else
    echo "  从 conventional commits 自动生成 release notes..."
    FINAL_NOTES_FILE="$WS_ROOT/.release-notes-auto.md"
    generate_auto_release_notes "$COMMIT_FILE" "$TAG" "$LAST_TAG" "$REPO_URL" > "$FINAL_NOTES_FILE"

    LINES=$(wc -l < "$FINAL_NOTES_FILE" | tr -d ' ')
    if [[ "$LINES" -le 2 ]]; then
        echo -e "  ${YELLOW}⚠️  自动生成的 release notes 为空（无 feat/fix/perf/breaking commit）${NC}"
        echo "  使用默认模板"
        {
            echo "## What's Changed"
            echo ""
            echo "- $PR_TITLE"
            if [[ -n "$LAST_TAG" ]] && [[ -n "$REPO_URL" ]]; then
                echo ""
                echo "**Full Changelog**: ${REPO_URL}/compare/${LAST_TAG}...${TAG}"
            fi
        } > "$FINAL_NOTES_FILE"
    fi
fi

# 5c. 创建或更新 Release
EXISTING_RELEASE=$(gh release view "$TAG" --json isDraft,id --jq '.' 2>/dev/null || echo "")

if [[ -n "$EXISTING_RELEASE" ]]; then
    echo "  更新已有 Release: $TAG"
    gh release edit "$TAG" --notes-file "$FINAL_NOTES_FILE" 2>&1 || true
    RELEASE_URL="${REPO_URL}/releases/tag/$TAG"

    # 如果已有 release 是 Draft 且不是 --draft 模式，发布它
    IS_DRAFT=$(echo "$EXISTING_RELEASE" | jq -r '.isDraft')
    if [[ "$IS_DRAFT" == "true" ]] && ! $DRAFT_MODE; then
        echo "  发布 Draft Release..."
        gh release edit "$TAG" --draft=false 2>&1 || true
    fi
else
    echo "  创建 Release: $TAG"
    if $DRAFT_MODE; then
        RELEASE_URL=$(gh release create "$TAG" \
            --title "v$NEW_VERSION" \
            --notes-file "$FINAL_NOTES_FILE" \
            --draft \
            --target main 2>&1 | tail -1) || {
            echo -e "  ${RED}❌ Release 创建失败${NC}"
            exit 1
        }
        echo -e "  ${GREEN}✅ Draft Release 已创建${NC}"
    else
        RELEASE_URL=$(gh release create "$TAG" \
            --title "v$NEW_VERSION" \
            --notes-file "$FINAL_NOTES_FILE" \
            --target main 2>&1 | tail -1) || {
            echo -e "  ${RED}❌ Release 创建失败${NC}"
            exit 1
        }
        echo -e "  ${GREEN}✅ Release 已发布${NC}"
    fi
fi

echo "  URL: $RELEASE_URL"

# 执行 post-release.sh 钩子
run_hook "post-release.sh" "$RELEASE_URL" || true

# ═══════════════════════════════════════════════════
# 阶段 6: 清理 worktree + 同步
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 6/6: 清理 ═══${NC}"

cd "$WS_ROOT"

# 删除 feature worktree
if [[ -f "$SCRIPT_DIR/../remove-worktree/remove-worktree.sh" ]]; then
    bash "$SCRIPT_DIR/../remove-worktree/remove-worktree.sh" "$BRANCH_NAME" --force --skip-sync 2>&1 || {
        echo -e "${YELLOW}Warning: worktree 清理失败，可手动处理${NC}"
    }
else
    echo -e "${YELLOW}⚠️  未找到 remove-worktree 脚本${NC}"
    echo "  手动删除: git -C ${WS_ROOT}/.bare worktree remove ${WORKTREE_DIR}"
fi

# 同步其他 worktree
echo ""
echo "  同步其他 worktree..."
for _wt_entry in "$WS_ROOT"/*/; do
    _wt_name="${_wt_entry%/}"
    [[ "$_wt_name" == *"/main" ]] && continue
    [[ "$_wt_name" == *"/master" ]] && continue
    _wt_base=$(basename "$_wt_name")
    [[ "$_wt_base" == ".bare" ]] && continue
    [[ "$_wt_base" == "node_modules" ]] && continue
    [[ -d "$_wt_name" ]] || continue

    _branch=$(git -C "$_wt_name" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
    [[ -z "$_branch" ]] && continue
    [[ "$_branch" == "main" || "$_branch" == "master" ]] && continue

    echo "    同步 $_wt_name ($_branch)..."
    (
        cd "$_wt_name"
        git fetch origin main 2>&1 | tail -1
        git merge --no-ff origin/main 2>&1 | tail -1 || {
            echo -e "    ${YELLOW}冲突: $_wt_name${NC}"
        }
    )
done

# ── 最终报告 ──────────────────────────────────────

# 清理临时文件和断点
rm -f "$WS_ROOT/.release-notes-auto.md" "$COMMIT_FILE"
clear_checkpoints

echo ""
echo "══════════════════════════════════════════════════"
echo -e "${GREEN}${BOLD}✅ 端到端流程全部完成！${NC}"
echo "  PR: #$PR_NUMBER"
echo "  版本: v$NEW_VERSION"
echo "  Release: $RELEASE_URL"
echo "  分支: $BRANCH_NAME (已清理)"
if $DRAFT_MODE; then
    echo ""
    echo "  Draft Release 需要手动发布:"
    echo "    gh release edit $TAG --draft=false"
fi
echo "══════════════════════════════════════════════════"
