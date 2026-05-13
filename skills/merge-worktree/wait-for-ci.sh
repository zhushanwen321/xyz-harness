#!/bin/bash
# wait-for-ci.sh — 等待 GitHub Actions CI 完成
#
# 用法: wait-for-ci.sh <commit-sha> [--timeout 600] [--workflow <name>]
#
# 场景 1: gh pr merge 后，push 到 main 触发 ci.yml
# 场景 2: 推送修复后等待 CI 重新运行
#
# AI 行为约束：
#   - 此脚本不可跳过
#   - CI 失败时必须在 main 上修复后重新运行
#   - 不能因为"CI 不是你触发的"就跳过

set -euo pipefail

REF="${1:?Usage: wait-for-ci.sh <commit-sha> [--timeout 600] [--workflow <name>]}"
shift || true

TIMEOUT=600   # 默认 10 分钟
WORKFLOW=""   # 可选过滤特定 workflow

while [[ $# -gt 0 ]]; do
    case "$1" in
        --timeout)  TIMEOUT="$2"; shift 2 ;;
        --workflow) WORKFLOW="$2"; shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI 未安装"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Error: gh CLI 未登录"; exit 1; }

echo -e "${BOLD}等待 CI 完成...${NC}"
echo "  Commit: $REF"
if [[ -n "$WORKFLOW" ]]; then
    echo "  Workflow: $WORKFLOW"
fi
echo "  超时: ${TIMEOUT}s"
echo ""

ELAPSED=0
POLL_INTERVAL=15
FIRST_POLL=true

while true; do
    # 获取该 commit 上的 workflow runs
    if [[ -n "$WORKFLOW" ]]; then
        RUNS_JSON=$(gh run list --commit "$REF" --workflow "$WORKFLOW" --json databaseId,status,conclusion,name,workflowName 2>/dev/null || echo "[]")
    else
        RUNS_JSON=$(gh run list --commit "$REF" --json databaseId,status,conclusion,name,workflowName 2>/dev/null || echo "[]")
    fi

    # 等待 CI 触发
    if [[ "$RUNS_JSON" == "[]" ]] || [[ "$RUNS_JSON" == "" ]]; then
        if [[ $ELAPSED -lt 30 ]]; then
            echo "  ⏳ CI 尚未触发，等待中... (${ELAPSED}s/${TIMEOUT}s)"
            sleep "$POLL_INTERVAL"
            ELAPSED=$((ELAPSED + POLL_INTERVAL))
            continue
        else
            echo -e "  ${YELLOW}⚠️  30秒后仍未检测到 CI workflow。${NC}"
            echo -e "  ${YELLOW}可能该 commit 没有触发 CI（如 ci.yml 只在 PR 时运行）。${NC}"
            echo -e "  ${YELLOW}跳过 CI 等待，继续后续流程。${NC}"
            exit 0
        fi
    fi

    # 首次检测到 runs 时显示
    if $FIRST_POLL; then
        TOTAL=$(echo "$RUNS_JSON" | jq 'length')
        echo "  📋 检测到 $TOTAL 个 workflow run(s)"
        FIRST_POLL=false
    fi

    # 统计运行状态
    TOTAL=$(echo "$RUNS_JSON" | jq 'length')
    COMPLETED=$(echo "$RUNS_JSON" | jq '[.[] | select(.status == "completed")] | length')
    PENDING=$((TOTAL - COMPLETED))
    FAILURES=$(echo "$RUNS_JSON" | jq -r '[.[] | select(.status == "completed" and .conclusion != "success" and .conclusion != "skipped")] | length')
    SUCCESSES=$(echo "$RUNS_JSON" | jq -r '[.[] | select(.status == "completed" and (.conclusion == "success" or .conclusion == "skipped"))] | length')

    echo "  📊 Runs: $TOTAL total, $SUCCESSES passed, $FAILURES failed, $PENDING pending (${ELAPSED}s/${TIMEOUT}s)"

    # 全部完成
    if [[ $PENDING -eq 0 ]]; then
        if [[ $FAILURES -gt 0 ]]; then
            echo ""
            echo -e "${RED}${BOLD}⛔ CI 有失败的检查项！${NC}"
            echo ""
            echo "失败的 workflow runs:"
            echo "$RUNS_JSON" | jq -r '.[] | select(.status == "completed" and .conclusion != "success" and .conclusion != "skipped") | "  ❌ \(.workflowName // .name): \(.conclusion)"'

            FAILED_RUN_IDS=$(echo "$RUNS_JSON" | jq -r '.[] | select(.status == "completed" and .conclusion != "success" and .conclusion != "skipped") | .databaseId')
            echo ""
            echo "查看失败日志:"
            for run_id in $FAILED_RUN_IDS; do
                echo "  gh run view $run_id --log-failed"
            done

            echo ""
            echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${RED}${BOLD}AI 行为约束（不可违反）:${NC}"
            echo "  1. 必须查看失败日志并修复问题"
            echo "  2. 修复后推送到 main，重新运行本脚本"
            echo "  3. 不得跳过 CI 失败继续 publish"
            echo "  4. 如果无法在 main 上直接修复，需要 revert 合并"
            echo -e "${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            exit 1
        else
            echo ""
            echo -e "${GREEN}${BOLD}✅ CI 全部通过！${NC} ($SUCCESSES/$TOTAL)"
            exit 0
        fi
    fi

    # 超时
    if [[ $ELAPSED -ge $TIMEOUT ]]; then
        echo ""
        echo -e "${YELLOW}${BOLD}⚠️  CI 等待超时（${TIMEOUT}s）${NC}"
        echo "  仍有 $PENDING 个 workflow 在运行中"
        echo ""
        echo "  建议:"
        echo "    1. 手动检查: gh run list --commit $REF"
        echo "    2. 增加超时: wait-for-ci.sh $REF --timeout 1200"
        echo "    3. 确认通过后继续后续流程"
        exit 2  # exit 2 = timeout, AI 应询问用户
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
