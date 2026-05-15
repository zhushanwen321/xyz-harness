#!/bin/bash
# harness-gate-hook.sh — dev-flow 门禁拦截 hook（核心逻辑）
# 在 agent 完成任务或停止时检查流程完整性。
#
# 被 Claude Code hooks.json（command 类型）或 Pi extension（tool_call 事件）调用。
#
# 调用方式：
#   harness-gate-hook.sh <project_root>
#
# 也可以从 stdin 读取 JSON（hook 输入），提取 cwd 作为 project_root。
#
# 退出码：
#   0 — 通过或不在 harness 流程中（不拦截）
#   2 — 门禁违规（stderr 反馈给 agent，要求继续工作）

set -euo pipefail

PROJECT_ROOT="${1:-}"

# 如果没传参数，尝试从 stdin JSON 读取 cwd（hook 输入格式）
if [[ -z "$PROJECT_ROOT" ]]; then
    INPUT=$(cat)
    PROJECT_ROOT=$(echo "$INPUT" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]+"' | sed 's/.*"//; s/"$//' || true)
fi

if [[ -z "$PROJECT_ROOT" ]]; then
    # 无法确定项目目录，不拦截
    exit 0
fi

# 检查是否在 harness 流程中
STATE_FILE="$PROJECT_ROOT/.xyz-harness/state.json"
if [[ ! -f "$STATE_FILE" ]]; then
    # 没有 state 文件，不在 harness 流程中
    exit 0
fi

# 检查 harness-state.sh 是否存在（可能在 scripts/ 或 scripts/hooks/ 的上级）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 尝试多个可能的位置
STATE_SCRIPT=""
for candidate in \
    "$SCRIPT_DIR/harness-state.sh" \
    "$SCRIPT_DIR/../harness-state.sh" \
    "$(dirname "$SCRIPT_DIR")/harness-state.sh"; do
    if [[ -f "$candidate" ]]; then
        STATE_SCRIPT="$candidate"
        break
    fi
done
if [[ -z "$STATE_SCRIPT" ]]; then
    exit 0
fi

# 运行 check 命令
CHECK_OUTPUT=$("$STATE_SCRIPT" check "$PROJECT_ROOT" 2>&1) && rc=$? || rc=$?

if [[ $rc -eq 2 ]]; then
    # 门禁违规 — 将输出发送到 stderr（Claude Code/Pi 会反馈给 agent）
    echo "$CHECK_OUTPUT" >&2
    echo "BLOCKED: Gate check failed. Do not proceed until the gate passes." >&2
    exit 2
fi

# 通过或不适用
exit 0
