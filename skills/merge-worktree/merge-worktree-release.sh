#!/bin/bash
# 合并 PR 并发布：CI 检查 → merge --no-ff → 版本升级 → tag → push → release
# Usage: merge-worktree-release.sh <pr-number-or-branch> [--version patch|minor|major] [--skip-ci] [--skip-release]
# Example: merge-worktree-release.sh 42
#          merge-worktree-release.sh feat/new-feature --version minor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../_lib/workspace.sh"

# --- 参数解析 ---
PR_REF="${1:?Usage: merge-worktree-release.sh <pr-number-or-branch> [--version patch]}"
shift || true
VERSION_TYPE="patch"
SKIP_CI=false
SKIP_RELEASE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)     VERSION_TYPE="$2"; shift 2 ;;
        --skip-ci)     SKIP_CI=true; shift ;;
        --skip-release) SKIP_RELEASE=true; shift ;;
        *)             echo "Unknown option: $1"; exit 1 ;;
    esac
done

# --- 前置检查 ---
command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI 未安装。"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Error: gh CLI 未登录。"; exit 1; }

# --- 读取 CLAUDE.md 发布配置 ---
read_release_config() {
    local claude_md=""
    # 优先从 main worktree 读取
    for wt_name in main master; do
        if [[ -f "$WORKSPACE_ROOT/$wt_name/CLAUDE.md" ]]; then
            claude_md="$WORKSPACE_ROOT/$wt_name/CLAUDE.md"
            break
        fi
    done
    # 回退到当前目录
    [[ -z "$claude_md" ]] && claude_md="$(pwd)/CLAUDE.md"
    [[ ! -f "$claude_md" ]] && return

    # 检测 CI 触发模式
    if grep -q "release:.*published" "$claude_md" 2>/dev/null || grep -q "创建 GitHub Release.*触发.*CI" "$claude_md" 2>/dev/null; then
        echo "[发布配置] 检测到 release.yml 使用 'on: release: types: [published]'，tag push 不会触发 npm 发布，必须创建 GitHub Release"
    elif grep -q "push:.*tags" "$claude_md" 2>/dev/null; then
        echo "[发布配置] 检测到 release.yml 使用 'on: push: tags'，tag push 即可触发 CI"
    fi

    # 检测 npm 发布包名
    local pkg_name=$(grep -oP 'npm（\K[^）]+' "$claude_md" 2>/dev/null || echo "")
    [[ -n "$pkg_name" ]] && echo "[发布配置] npm 包名: $pkg_name"
}

WORKSPACE_ROOT=$(find_workspace_root "$(pwd)") || {
    echo "Error: 未找到 workspace。"; exit 1;
}
echo "Workspace: $WORKSPACE_ROOT"

# 立即切到 workspace root，避免后续操作中当前 worktree 目录可能被删除
cd "$WORKSPACE_ROOT"

# 解析 PR number（可能是数字或分支名）
if [[ "$PR_REF" =~ ^[0-9]+$ ]]; then
    PR_NUMBER="$PR_REF"
else
    # 从分支名查找 PR
    PR_NUMBER=$(gh pr list --head "$PR_REF" --json number --jq '.[0].number' 2>/dev/null) || {
        echo "Error: 找不到分支 '$PR_REF' 对应的 PR。"; exit 1;
    }
fi
echo "PR: #$PR_NUMBER"

# --- 读取发布配置 ---
read_release_config

# --- 步骤 1: 检查 CI（先验证，再 merge）---
echo ""
echo "=== 步骤 1: 检查 CI（先验证，再 merge）==="
if $SKIP_CI; then
    echo "⚠️  跳过 CI 检查 (--skip-ci)，仅限 AI 已人工确认 CI 通过时使用"
else
    # 获取 CI 状态——gh 失败直接退出，永不静默吞错误
    CI_DATA=$(gh pr view "$PR_NUMBER" --json statusCheckRollup 2>&1) || {
        echo "Error: 无法获取 CI 状态（gh CLI 失败）:"
        echo "$CI_DATA"
        exit 1
    }

    CI_CONCLUSIONS=$(echo "$CI_DATA" | jq -r '[.statusCheckRollup[] | .conclusion] | unique | join(",")')
    echo "CI 状态: ${CI_CONCLUSIONS:-（无 CI 检查项）}"

    # 场景 1：有检查项还在运行中 → 拒绝
    if echo "$CI_CONCLUSIONS" | grep -qi "pending\|queued\|in_progress\|expected"; then
        echo ""
        echo "Error: CI 尚未全部完成（有 pending/queued/in_progress 的检查项）。"
        echo "请等待 CI 全部完成后重试。"
        echo ""
        echo "仍在运行中的检查项:"
        echo "$CI_DATA" | jq -r '.statusCheckRollup[] | select(.conclusion == null or .conclusion == "" or .conclusion == "pending" or .conclusion == "queued" or .conclusion == "in_progress" or .conclusion == "expected") | "  ⏳ \(.name) (\(.status // "unknown"))"'
        exit 1
    fi

    # 场景 2：有检查项失败 → 拒绝
    if echo "$CI_CONCLUSIONS" | grep -qi "failure\|timed_out\|cancelled\|action_required\|startup_failure"; then
        echo ""
        echo "Error: CI 有失败的检查项:"
        echo "$CI_DATA" | jq -r '.statusCheckRollup[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled" or .conclusion == "action_required" or .conclusion == "startup_failure") | "  ❌ \(.name) (\(.conclusion))"'
        echo ""
        echo "请修复 CI 问题后重试，或使用 --skip-ci 跳过检查。"
        exit 1
    fi

    # 场景 3：无任何检查项
    if [[ -z "$CI_CONCLUSIONS" ]]; then
        echo "⚠️  未配置任何 CI 检查项，跳过远程 CI 验证。"
    else
        echo "✅ CI 检查全部通过。"
    fi
fi

# --- 步骤 2: Merge --no-ff PR ---
echo ""
echo "=== 步骤 2: Merge --no-ff PR #$PR_NUMBER ==="

# 获取 PR 信息用于生成 release notes
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title')
PR_BODY=$(gh pr view "$PR_NUMBER" --json body --jq '.body' 2>/dev/null || echo "")
PR_BRANCH=$(gh pr view "$PR_NUMBER" --json headRefName --jq '.headRefName')

echo "标题: $PR_TITLE"
echo "分支: $PR_BRANCH"

gh pr merge "$PR_NUMBER" --no-ff --delete-branch 2>&1
echo "PR 已合并（保留完整分支历史）。"

# --- 步骤 3: 更新 main ---
echo ""
echo "=== 步骤 3: 更新 main 分支 ==="

# 查找 main worktree
MAIN_WT=""
for wt_name in main master; do
    if [[ -d "$WORKSPACE_ROOT/$wt_name" ]]; then
        MAIN_WT="$WORKSPACE_ROOT/$wt_name"
        break
    fi
done

if [[ -n "$MAIN_WT" ]]; then
    echo "使用 main worktree: $MAIN_WT"
    cd "$MAIN_WT"
    git pull origin main 2>&1 | tail -1
else
    echo "无 main worktree，直接更新 bare repo 引用"
    cd "$WORKSPACE_ROOT"
    git -C .bare fetch origin main 2>&1 | tail -1
    git -C .bare branch -f main origin/main
    # 创建临时目录进行后续操作
    cd "$WORKSPACE_ROOT"
    # 后续需要在 main 分支上操作，clone 到临时目录
    TMP_DIR=$(mktemp -d)
    git -C .bare worktree add "$TMP_DIR" main
    cd "$TMP_DIR"
    MAIN_WT="$TMP_DIR"
fi

# --- 步骤 4: 升级版本号 ---
echo ""
echo "=== 步骤 4: 版本升级 ==="
NEW_VERSION=""

if [[ -f "package.json" ]]; then
    # 幂等检查：最新 commit 是否已包含版本号升级
    LATEST_COMMIT_MSG=$(git log -1 --oneline)
    if echo "$LATEST_COMMIT_MSG" | grep -qi "bump version"; then
        CURRENT_VERSION=$(node -p "require('./package.json').version")
        echo "跳过版本升级（最新 commit 已包含版本升级）: v$CURRENT_VERSION"
        NEW_VERSION="$CURRENT_VERSION"
    else
        CURRENT_VERSION=$(node -p "require('./package.json').version")
        npm version "$VERSION_TYPE" --no-git-tag-version 2>&1
        NEW_VERSION=$(node -p "require('./package.json').version")
        echo "版本升级: $CURRENT_VERSION -> $NEW_VERSION"
    fi
else
    echo "非 npm 项目，跳过版本升级。"
    # 非 npm 项目，从 tag 推断版本号
    LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
    echo "最新 tag: $LATEST_TAG"
fi

# --- 步骤 5: 提交 + tag + push ---
echo ""
echo "=== 步骤 5: 提交版本变更、打 tag、推送 ==="

if [[ -n "$NEW_VERSION" ]] && [[ -f "package.json" ]]; then
    git add package.json package-lock.json 2>/dev/null || true
    git commit -m "chore: bump version to $NEW_VERSION" 2>/dev/null || echo "无变更需提交"
fi

if [[ -n "$NEW_VERSION" ]]; then
    TAG="v$NEW_VERSION"
    git tag "$TAG" 2>/dev/null || echo "Tag $TAG 已存在"
    echo "Tag: $TAG"
fi

git push origin main --tags 2>&1 | tail -1

# --- 步骤 6: 创建 Release ---
echo ""
echo "=== 步骤 6: 创建 GitHub Release ==="

if $SKIP_RELEASE; then
    echo "跳过 Release (--skip-release)"
else
    if [[ -n "$NEW_VERSION" ]]; then
        TAG="v$NEW_VERSION"
        # 从 PR title 和 body 生成 release notes
        RELEASE_NOTES="$PR_TITLE"
        [[ -n "$PR_BODY" ]] && RELEASE_NOTES="$RELEASE_NOTES

$PR_BODY"

        RELEASE_URL=$(gh release create "$TAG" \
            --title "$TAG" \
            --notes "$RELEASE_NOTES" \
            --target main 2>&1 | tail -1) || {
            echo "Warning: Release 创建失败（可能 tag 已有 release）。"
            RELEASE_URL=""
        }

        echo "Release: $RELEASE_URL"
    else
        echo "无版本号，跳过 Release。"
    fi
fi

# --- 清理临时 worktree ---
if [[ -n "$TMP_DIR" ]] && [[ -d "$TMP_DIR" ]]; then
    cd "$WORKSPACE_ROOT"
    git -C .bare worktree remove "$TMP_DIR" 2>/dev/null || rm -rf "$TMP_DIR"
fi

# --- 输出报告 ---
echo ""
echo "============================================"
echo "Release 完成!"
echo "  PR: #$PR_NUMBER"
if [[ -n "$NEW_VERSION" ]]; then
    echo "  版本: v$NEW_VERSION"
    echo "  Tag: v$NEW_VERSION"
fi
if [[ -n "$RELEASE_URL" ]]; then
    echo "  Release: $RELEASE_URL"
fi
echo "============================================"
echo ""
echo "下一步: 运行 merge-worktree.sh $PR_BRANCH 清理 worktree 并同步其他分支"
