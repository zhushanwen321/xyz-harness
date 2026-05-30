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

# ── 日志系统 ──────────────────────────────────────
LOG_FILE=""
LOG_DIR=""

# Strip ANSI escape codes for log file
_strip_ansi() { sed "s/$(printf '\033')\\[[0-9;]*m//g"; }



# Direct log functions (write to log file only, not stdout — use for metadata/decisions)
_valid_log_level() { case "$1" in INFO|WARN|ERROR|PHASE|CMD|HOOK|CHECK|CI) return 0 ;; *) return 1 ;; esac; }
log()       { [[ -n "$LOG_FILE" ]] && _valid_log_level "$1" && echo "[$(date +%Y-%m-%dT%H:%M:%S)] [$1] $2" >> "$LOG_FILE"; }
log_info()  { log "INFO" "$*"; }
log_warn()  { log "WARN" "$*"; }
log_error() { log "ERROR" "$*"; }
log_phase() { log "PHASE" "$*"; }
log_cmd()   { log "CMD" "$*"; }

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
    local repo_flag="${GH_REPO:+--repo $GH_REPO}"
    pr_num=$(gh pr list $repo_flag --state all --head "$branch" --json number --jq '.[0].number' 2>/dev/null) || true
    echo "${pr_num:-}"
}

# 同步子项目 package.json 版本号到与根一致
# 典型场景：Electron 项目的 src-electron/package.json 是独立 npm project，
# electron-builder 和 CI 从它读版本号，必须与根 package.json 保持同步
sync_sub_package_versions() {
    local base_dir="$1"
    local version="$2"

    local sub_projects=("src-electron")
    for sub in "${sub_projects[@]}"; do
        local sub_pkg="$base_dir/$sub/package.json"
        if [[ -f "$sub_pkg" ]]; then
            local sub_ver
            sub_ver=$(node -p "require('$sub_pkg').version")
            if [[ "$sub_ver" != "$version" ]]; then
                npm version --prefix "$base_dir/$sub" "$version" --no-git-tag-version 2>&1
                echo "  同步 $sub/package.json: $sub_ver → $version"
            fi
        fi
    done
}

run_hook() {
    local hook_name="$1"
    shift
    local hook_script="${WS_ROOT}/.bare/custom-hooks/$hook_name"
    if [[ -x "$hook_script" ]]; then
        echo ""
        echo -e "  ${CYAN}🔧 执行项目钩子: $hook_name${NC}"
        log_phase "执行钩子: $hook_name"
        # Capture hook output to temp file for both display and logging
        local hook_tmp="${CHECKPOINT_DIR:-/tmp}/hook-${hook_name}.tmp"
        local hook_exit=0
        WS_ROOT="${WS_ROOT}" BRANCH_NAME="${BRANCH_NAME:-}" \
        PR_NUMBER="${PR_NUMBER:-}" VERSION="${NEW_VERSION:-}" \
        COMMIT_FILE="${COMMIT_FILE:-}" \
        "$hook_script" "$@" > "$hook_tmp" 2>&1 || hook_exit=$?
        # 确保 tmp 文件最终被清理
        cat "$hook_tmp" 2>/dev/null || true
        if [[ $hook_exit -ne 0 ]]; then
            [[ -n "$LOG_FILE" ]] && { echo "--- Hook: $hook_name (FAILED exit=$hook_exit) ---" >> "$LOG_FILE"; cat "$hook_tmp" >> "$LOG_FILE" 2>/dev/null; echo "---" >> "$LOG_FILE"; }
            rm -f "$hook_tmp"
            echo -e "  ${RED}❌ 钩子 $hook_name 失败（退出码 $hook_exit）${NC}"
            log_error "钩子 $hook_name 失败（退出码 $hook_exit）"
            return 1
        fi
        [[ -n "$LOG_FILE" ]] && { echo "--- Hook: $hook_name (OK) ---" >> "$LOG_FILE"; cat "$hook_tmp" >> "$LOG_FILE" 2>/dev/null; echo "---" >> "$LOG_FILE"; }
        rm -f "$hook_tmp"
        echo -e "  ${GREEN}✅ 钩子 $hook_name 完成${NC}"
        log_info "钩子 $hook_name 完成"
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
if [[ -z "$MAIN_WT" ]]; then
    echo -e "${RED}Error: workspace 中没有 main worktree（需要 $WS_ROOT/main 或 $WS_ROOT/master 目录）${NC}"
    echo "  bare repo workspace 模式要求必须有 main worktree 用于 bump/tag/push。"
    echo "  创建: cd $WS_ROOT && git-cwt main"
    exit 1
fi

# 自动检测 GitHub repo（workspace root 不是 git repo，gh 无法自动发现）
if [[ -z "${GH_REPO:-}" ]]; then
  # 从 worktree 的 remote URL 提取 owner/repo
  _remote_url=$(git -C "$WORKTREE_DIR" remote get-url github 2>/dev/null \
    || git -C "$WORKTREE_DIR" remote get-url origin 2>/dev/null || true)
  if [[ -n "$_remote_url" ]]; then
    # 支持 git@github.com:owner/repo.git 和 https://github.com/owner/repo.git
    GH_REPO=$(echo "$_remote_url" | sed -E 's#.*github.com[:/]([^/]+/[^/]+)(\.git)?$#\1#')
    GH_REPO="${GH_REPO%.git}"
    export GH_REPO
    echo "  检测到 repo: $GH_REPO"
  fi
fi

# ── 日志初始化 ───────────────────────────────────
LOG_DIR="$WS_ROOT/.logs/merge-worktree"
mkdir -p "$LOG_DIR"
BRANCH_SAFE="${BRANCH_NAME//\//-}"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d)_${BRANCH_SAFE}.log"
{
    echo "=========================================="
    echo "Merge Worktree Log"
    echo "Started: $(date -Iseconds)"
    echo "=========================================="
    echo "Branch: $BRANCH_NAME"
    echo "Workspace: $WS_ROOT"
    echo "Main worktree: $MAIN_WT"
    echo "GH_REPO: ${GH_REPO:-}"
    echo "Version type: $VERSION_TYPE"
    echo "Notes file: ${NOTES_FILE:-(auto)}"
    echo "Draft mode: $DRAFT_MODE"
    echo "=========================================="
    echo ""
} > "$LOG_FILE"
export MERGE_LOG_FILE="$LOG_FILE"
log_info "日志初始化完成: $LOG_FILE"
# 验证日志文件可写
if ! echo "test" >> "$LOG_FILE" 2>/dev/null; then
    echo -e "${RED}Error: 无法写入日志文件 $LOG_FILE${NC}"
    LOG_FILE=""
fi

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

GH_FLAG="${GH_REPO:+--repo $GH_REPO}"

# 在 bare-repo workspace 模式下，origin 指向本地 bare repo，
# GitHub 是另一个 remote（通常叫 github）。自动检测。
GH_REMOTE="origin"
if [[ -n "$GH_REPO" ]] && git -C "$WORKTREE_DIR" remote get-url github &>/dev/null; then
    GH_REMOTE="github"
fi

PR_STATE=$(gh pr view "$PR_NUMBER" $GH_FLAG --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
PR_TITLE=$(gh pr view "$PR_NUMBER" $GH_FLAG --json title --jq '.title' 2>/dev/null || echo "")

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
    log_info "跳过阶段 1（checkpoint: phase1-passed 存在）"
else
    echo ""
    echo -e "${BOLD}═══ 阶段 1/6: 本地验证 ═══${NC}"
    log_phase "阶段 1: 本地验证"

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
log_phase "阶段 2: PR CI + 合并"
echo "  PR: #$PR_NUMBER — $PR_TITLE"
echo "  状态: $PR_STATE"

if [[ "$PR_STATE" == "MERGED" ]]; then
    echo -e "  ${GREEN}⏭️  PR 已合并，跳过${NC}"
elif [[ "$PR_STATE" == "OPEN" ]]; then
    echo "  检查 PR CI 状态..."
    CI_DATA=$(gh pr view "$PR_NUMBER" $GH_FLAG --json statusCheckRollup 2>&1) || {
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
            CI_DATA=$(gh pr view "$PR_NUMBER" $GH_FLAG --json statusCheckRollup 2>&1)
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
    gh pr merge "$PR_NUMBER" $GH_FLAG --merge --delete-branch 2>&1 || {
        PR_STATE=$(gh pr view "$PR_NUMBER" $GH_FLAG --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
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
log_phase "阶段 3: Post-merge CI"

git -C "$MAIN_WT" fetch "$GH_REMOTE" main 2>&1 | tail -1
MAIN_SHA=$(git -C "$MAIN_WT" rev-parse "$GH_REMOTE/main")

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
log_phase "阶段 4: 发布准备"

# 4a. 检查是否有项目发布脚本
PUBLISH_SH=""
for search_dir in "$MAIN_WT" "$WORKTREE_DIR"; do
    if [[ -n "$search_dir" ]] && [[ -f "$search_dir/scripts/publish.sh" ]]; then
        PUBLISH_SH="$search_dir/scripts/publish.sh"
        break
    fi
done

# 辅助函数：读取项目版本号
# 优先使用 read-version.sh hook（项目可自定义版本来源），否则从根 package.json 读取
read_project_version() {
    local dir="${1:-$MAIN_WT}"
    local hook_path="$WS_ROOT/.bare/custom-hooks/read-version.sh"
    if [[ -f "$hook_path" ]]; then
        bash "$hook_path" "$dir" 2>/dev/null && return
    fi
    node -p "require('$dir/package.json').version" 2>/dev/null || echo ""
}

if [[ -n "$PUBLISH_SH" ]]; then
    # 幂等检查：当前版本 release 已存在则跳过（防止超时重跑触发空版本）
    _CUR_VER=$(read_project_version "$MAIN_WT")
    if [[ -n "$_CUR_VER" ]] && gh release view "v$_CUR_VER" $GH_FLAG --json tagName >/dev/null 2>&1; then
        echo -e "  ${GREEN}⏭️  Release v$_CUR_VER 已存在，跳过发布脚本${NC}"
        NEW_VERSION="$_CUR_VER"
    else
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
            (
                cd "$MAIN_WT"
                bash "$PUBLISH_SH" "$VERSION_TYPE"
            ) || {
                echo -e "${RED}Error: 发布脚本失败${NC}"
                exit 1
            }
        fi
        # CI 发布脚本在远程 bump 版本，需 pull 最新代码后读取版本号
        # 优先使用 read-version.sh hook（项目可自定义版本来源）
        if [[ -d "$MAIN_WT" ]]; then
            git -C "$MAIN_WT" fetch "$GH_REMOTE" main 2>&1 | tail -1
            git -C "$MAIN_WT" merge --ff-only "$GH_REMOTE/main" 2>&1 | tail -1 || true
        fi
        NEW_VERSION=$(read_project_version "$MAIN_WT")
        if [[ -z "$NEW_VERSION" ]]; then
            # fallback: 从最新 release tag 获取版本号
            NEW_VERSION=$(gh release list --limit 1 $GH_FLAG --json tagName -q '.[0].tagName' 2>/dev/null | sed 's/^v//' || echo "")
            echo -e "  ${YELLOW}⚠️  本地版本读取为空，从 release tag 获取: $NEW_VERSION${NC}"
        fi
    fi
else
    # 4b. 没有项目发布脚本 → 自行 bump 版本 + tag + push
    TAG=""

    # 在 main worktree 中执行 bump/tag/push
    OP_DIR="$MAIN_WT"

    if [[ -n "$OP_DIR" ]] && [[ -f "$OP_DIR/package.json" ]]; then
        CURRENT_VERSION=$(read_project_version "$OP_DIR")

        # 始终执行 bump：合并了新代码后需要新版本号，
        # 旧 tag 存在不代表不需要新版本，而是当前版本已发布过需要 bump
        (
            cd "$OP_DIR"
            git fetch "$GH_REMOTE" main 2>&1 | tail -1
            git merge --ff-only FETCH_HEAD 2>&1 | tail -1 || { echo "  ${RED}Error: 无法 fast-forward main${NC}"; exit 1; }
        )
        # 在主进程中执行 bump，以便 NEW_VERSION 传入 hook
        npm version --prefix "$OP_DIR" "$VERSION_TYPE" --no-git-tag-version 2>&1
        NEW_VERSION=$(node -p "require('$OP_DIR/package.json').version")
        TAG="v$NEW_VERSION"
        echo "  版本: $CURRENT_VERSION → $NEW_VERSION"
        log_info "版本 bump: $CURRENT_VERSION → $NEW_VERSION, tag=$TAG"

        # 自动同步子项目 package.json 版本（如 src-electron/package.json）
        # electron-builder 和 CI 从 src-electron/package.json 读版本号，必须和根保持一致
        sync_sub_package_versions "$OP_DIR" "$NEW_VERSION"

        # 项目级 hook：bump 后、commit 前执行（可同步子 package.json 等）
        run_hook "post-bump.sh" "$OP_DIR" || {
            echo -e "  ${RED}Error: post-bump 钩子失败${NC}"
            exit 1
        }

        (
            cd "$OP_DIR"
            git add package.json package-lock.json 2>/dev/null || true
            # add 任何 hook 可能修改的文件（子 package.json 等）
            git add -A -- '*.json' 2>/dev/null || true
            git commit -m "chore: bump version to $NEW_VERSION" 2>/dev/null || echo "  无变更需提交"
            git tag "$TAG" 2>/dev/null || echo "  Tag 已存在"
            git push "$GH_REMOTE" HEAD:refs/heads/main --tags 2>&1 | tail -1
        )
        TAG="v$NEW_VERSION"
        log_info "Tag $TAG 已推送到 $GH_REMOTE"
        echo -e "  ${GREEN}✅ 版本 bump + tag + push 完成${NC}"
    else
        # 非 npm 项目：手动 tag
        NEW_VERSION="${VERSION_TYPE}-$(date +%Y%m%d%H%M%S)"
        TAG="v$NEW_VERSION"
        echo "  非 npm 项目，创建 tag: $TAG"
        if [[ -n "$OP_DIR" ]]; then
            git -C "$OP_DIR" tag "$TAG" 2>/dev/null || true
            git -C "$OP_DIR" push "$GH_REMOTE" --tags 2>&1 | tail -1
        fi
    fi

    # 4c. 等待 release CI 构建完成
    if [[ -n "$TAG" ]]; then
        echo ""
        echo "  ⏳ 等待 release CI 构建产物..."
        TAG_SHA=$(git -C "${OP_DIR}" rev-parse "$TAG" 2>/dev/null || echo "")

        if [[ -n "$TAG_SHA" ]]; then
            bash "$SCRIPT_DIR/wait-for-ci.sh" "$TAG_SHA" --timeout 900 --workflow "Release" --verify-release "$TAG" $GH_FLAG 2>&1 || {
                WAIT_EXIT=$?
                if [[ $WAIT_EXIT -eq 1 ]]; then
                    echo -e "  ${RED}❌ Release CI 构建失败！查看日志: gh run view --log-failed${NC}"
                    exit 1
                fi
                echo -e "  ${YELLOW}⚠️  未检测到 Release CI（可能 workflow 名称不匹配），继续${NC}"
            }
        fi
        echo -e "  ${GREEN}✅ Release CI 完成${NC}"
        log_info "Release CI 完成 (tag=$TAG)"
    fi
fi

echo "  版本: v${NEW_VERSION}"
log_info "阶段 4 完成: v${NEW_VERSION}"

# ═══════════════════════════════════════════════════
# 阶段 5: Release Notes + 创建 Release
# ═══════════════════════════════════════════════════

echo ""
echo -e "${BOLD}═══ 阶段 5/6: Release ═══${NC}"
TAG="v${NEW_VERSION}"
log_phase "阶段 5: Release (tag=$TAG)"

log_info "准备 Release: tag=$TAG"
REPO_URL=$(gh repo view $GH_FLAG --json url --jq '.url' 2>/dev/null || echo "")

# 5a. 生成 commit 清单
LAST_TAG=$(git -C "$MAIN_WT" describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
log_info "上一个 tag: ${LAST_TAG:-none}"

if [[ -n "$LAST_TAG" ]]; then
    LOG_RANGE="$LAST_TAG..HEAD"
else
    LOG_RANGE="HEAD~30..HEAD"
fi

cd "$MAIN_WT"
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

# 5c. Release 创建策略：优先等 CI 创建 Draft Release（含构建产物），fallback 到手动创建
RELEASE_CREATED_BY_CI=false

# 检查 CI 是否已创建 Draft Release（Phase 4c 的 --verify-release 应已确认）
EXISTING_RELEASE=$(gh release view "$TAG" $GH_FLAG --json isDraft,id,body,assets --jq '.' 2>/dev/null || echo "")

if [[ -n "$EXISTING_RELEASE" ]]; then
    ASSET_COUNT=$(echo "$EXISTING_RELEASE" | jq -r '.assets | length')
    log_info "发现已有 Release (assets=$ASSET_COUNT, draft=$(echo "$EXISTING_RELEASE" | jq -r '.isDraft'))"

    if [[ "$ASSET_COUNT" -gt 0 ]]; then
        RELEASE_CREATED_BY_CI=true
        echo -e "  ${GREEN}CI 已创建 Draft Release（含 $ASSET_COUNT 个产物）${NC}"
    fi
fi

# 如果 CI 还没创建 Release（产物为 0 或不存在），等待最多 120 秒
if ! $RELEASE_CREATED_BY_CI; then
    log_info "等待 CI 创建 Draft Release (最多 120s)..."
    echo "  ⏳ 等待 Release CI 创建 Draft Release..."
    WAIT_ELAPSED=0
    while [[ $WAIT_ELAPSED -lt 120 ]]; do
        sleep 5
        WAIT_ELAPSED=$((WAIT_ELAPSED + 5))
        EXISTING_RELEASE=$(gh release view "$TAG" $GH_FLAG --json isDraft,id,body,assets --jq '.' 2>/dev/null || echo "")
        if [[ -n "$EXISTING_RELEASE" ]]; then
            ASSET_COUNT=$(echo "$EXISTING_RELEASE" | jq -r '.assets | length')
            if [[ "$ASSET_COUNT" -gt 0 ]]; then
                RELEASE_CREATED_BY_CI=true
                echo -e "  ${GREEN}✅ CI 已创建 Draft Release（含 $ASSET_COUNT 个产物，等待 ${WAIT_ELAPSED}s）${NC}"
                log_info "CI 创建 Draft Release 成功 (assets=$ASSET_COUNT, wait=${WAIT_ELAPSED}s)"
                break
            fi
        fi
        echo "  ⏳ 等待中... (${WAIT_ELAPSED}s/120s)"
    done
fi

# 更新或创建 Release
if [[ -n "$EXISTING_RELEASE" ]]; then
    EXISTING_BODY=$(echo "$EXISTING_RELEASE" | jq -r '.body // ""' 2>/dev/null || echo "")
    if [[ -z "$EXISTING_BODY" ]] || [[ ${#EXISTING_BODY} -lt 20 ]]; then
        echo "  ⚠️  Release $TAG 已存在但 notes 为空，回填中..."
    else
        echo "  更新已有 Release: $TAG"
    fi
    log_info "更新 Release notes"
    gh release edit "$TAG" $GH_FLAG --notes-file "$FINAL_NOTES_FILE" 2>&1 || true
    RELEASE_URL="${REPO_URL}/releases/tag/$TAG"

    # 如果已有 release 是 Draft 且不是 --draft 模式，发布它
    IS_DRAFT=$(echo "$EXISTING_RELEASE" | jq -r '.isDraft')
    if [[ "$IS_DRAFT" == "true" ]] && ! $DRAFT_MODE; then
        echo "  发布 Draft Release..."
        log_info "发布 Draft Release (draft=false)"
        gh release edit "$TAG" $GH_FLAG --draft=false 2>&1 || true
    fi
else
    # Fallback: CI 没有创建 Release，手动创建（将不含构建产物）
    if ! $RELEASE_CREATED_BY_CI; then
        echo -e "  ${YELLOW}⚠️  CI 未在预期时间内创建 Draft Release，手动创建（将无构建产物）${NC}"
        echo -e "  ${YELLOW}如需构建产物，请手动触发: gh workflow run release.yml --repo $GH_REPO${NC}"
        log_warn "CI 未创建 Draft Release，fallback 到手动创建（无构建产物）"
    fi

    # 去重检查：CI 可能在等待循环中创建了但 API 延迟返回空
    EXISTING_RELEASE=$(gh release view "$TAG" $GH_FLAG --json isDraft,id,body,assets --jq '.' 2>/dev/null || echo "")
    if [[ -n "$EXISTING_RELEASE" ]]; then
        echo -e "  ${GREEN}⚠️  Release 已存在（可能由 CI 在上一轮创建），更新 release notes${NC}"
        log_info "Release 已存在，更新 notes"
        gh release edit "$TAG" $GH_FLAG --notes-file "$FINAL_NOTES_FILE" 2>&1 || true
        IS_DRAFT=$(echo "$EXISTING_RELEASE" | jq -r '.isDraft')
        if [[ "$IS_DRAFT" == "true" ]] && ! $DRAFT_MODE; then
            echo "  发布 Draft Release..."
            gh release edit "$TAG" $GH_FLAG --draft=false 2>&1 || true
        fi
        RELEASE_URL="${REPO_URL}/releases/tag/$TAG"
    else
        echo "  创建 Release: $TAG"
        log_info "手动创建 Release: $TAG"
        if $DRAFT_MODE; then
            RELEASE_URL=$(gh release create "$TAG" $GH_FLAG \
                --title "v$NEW_VERSION" \
                --notes-file "$FINAL_NOTES_FILE" \
                --draft \
                --target main 2>&1 | tail -1) || {
                echo -e "  ${RED}❌ Release 创建失败${NC}"
                log_error "Release 创建失败"
                exit 1
            }
            echo -e "  ${GREEN}✅ Draft Release 已创建${NC}"
        else
            RELEASE_URL=$(gh release create "$TAG" $GH_FLAG \
                --title "v$NEW_VERSION" \
                --notes-file "$FINAL_NOTES_FILE" \
                --target main 2>&1 | tail -1) || {
                echo -e "  ${RED}❌ Release 创建失败${NC}"
                log_error "Release 创建失败"
                exit 1
            }
            echo -e "  ${GREEN}✅ Release 已发布${NC}"
        fi
    fi
fi

# 最终产物验证
FINAL_ASSETS=$(gh release view "$TAG" $GH_FLAG --json assets --jq '.assets | length' 2>/dev/null || echo "0")
log_info "最终产物数量: $FINAL_ASSETS"
if [[ "$FINAL_ASSETS" -eq 0 ]] && ! $DRAFT_MODE; then
    echo -e "  ${YELLOW}⚠️  Release 无构建产物（dmg/exe/AppImage）${NC}"
    echo -e "  ${YELLOW}手动触发构建: gh workflow run release.yml --repo $GH_REPO${NC}"
    log_warn "Release 无构建产物"
fi

echo "  URL: $RELEASE_URL"
log_info "Release URL: $RELEASE_URL"

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
        git fetch "$GH_REMOTE" main 2>&1 | tail -1
        git merge --no-ff "$GH_REMOTE/main" 2>&1 | tail -1 || {
            echo -e "    ${YELLOW}冲突: $_wt_name${NC}"
        }
    )
done

# ── 最终报告 ──────────────────────────────────────

# 清理临时文件和断点
rm -f "$WS_ROOT/.release-notes-auto.md" "$COMMIT_FILE"
clear_checkpoints

# 日志轮转：保留最近 30 个日志文件
if [[ -d "$LOG_DIR" ]]; then
    ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
fi

# 写入日志最终摘要
log_info "==========================================="
log_info "流程完成"
log_info "  PR: #$PR_NUMBER"
log_info "  版本: v$NEW_VERSION"
log_info "  Release: $RELEASE_URL"
log_info "  日志文件: $LOG_FILE"
log_info "==========================================="

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
    echo "    gh release edit $TAG $GH_FLAG --draft=false"
fi
echo "══════════════════════════════════════════════════"
