#!/bin/bash
# pre-stage-check.sh — 阶段前置条件检查
# 在 gate-script.sh 运行前调用，验证前置阶段的 pass 文件存在。
# 被 gate-script.sh 在每个阶段开始时自动调用。
#
# 调用方式：
#   pre-stage-check.sh <stage> <project_root>
#
# 退出码：0=前置条件满足，1=前置条件不满足

set -euo pipefail

STAGE="$1"
PROJECT_ROOT="$2"
GATE_DIR="$PROJECT_ROOT/.xyz-harness/gate"

# ── 颜色 ──────────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    C_RED='\033[0;31m' C_GREEN='\033[0;32m' C_YELLOW='\033[0;33m' C_BOLD='\033[1m' C_RESET='\033[0m'
else
    C_RED='' C_GREEN='' C_YELLOW='' C_BOLD='' C_RESET=''
fi
info()  { echo -e "${C_BOLD}[PRE-CHECK]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[OK]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[BLOCKED]${C_RESET} $*"; }

# ── 阶段依赖定义（兼容 bash 3.x） ────────────────────────────────
get_requires() {
    case "$1" in
        1)  echo "" ;;
        2)  echo "1" ;;
        3)  echo "2" ;;
        4)  echo "3" ;;
        5)  echo "4" ;;
        6)  echo "5" ;;
        7)  echo "6" ;;
        8)  echo "7" ;;
        9)  echo "8" ;;
        10) echo "9" ;;
        11) echo "10" ;;
        *)  echo "" ;;
    esac
}

# ── 检查逻辑 ──────────────────────────────────────────────────────

prereqs=$(get_requires "$STAGE")

if [[ -z "$prereqs" ]]; then
    ok "stage $(printf '%02d' "$STAGE"): no prerequisites"
    exit 0
fi

info "stage $(printf '%02d' "$STAGE"): checking prerequisites: $prereqs"

errors=0
for pre in $prereqs; do
    pass_file="$GATE_DIR/stage-$(printf '%02d' "$pre").pass"
    if [[ ! -f "$pass_file" ]]; then
        err "prerequisite stage $(printf '%02d' "$pre") not passed (missing $pass_file)"
        ((errors++))
    else
        # 验证格式
        first_line=$(head -1 "$pass_file" 2>/dev/null || true)
        if [[ "$first_line" != pass\ at* ]]; then
            err "prerequisite stage $(printf '%02d' "$pre") pass file has invalid format: $pass_file"
            ((errors++))
        else
            ok "prerequisite stage $(printf '%02d' "$pre"): passed ($first_line)"
        fi
    fi
done

if [[ $errors -gt 0 ]]; then
    err "cannot proceed to stage $(printf '%02d' "$STAGE") — $errors prerequisite(s) not met"
    err "complete the prerequisite stage(s) first, or use harness-state.sh rollback to correct state"
    exit 1
fi

ok "stage $(printf '%02d' "$STAGE"): all prerequisites met"
exit 0
