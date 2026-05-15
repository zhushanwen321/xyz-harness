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
# 去除前导零，避免八进制解析问题（09 → 9）
STAGE=$((10#$STAGE))
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

# ── 阶段定义 ────────────────────────────────────────────────────
ALL_STAGES=(1 2 3 4 5 6 7 8 9 10 11 12 13 14 15)

# 返回指定阶段的所有前置阶段（1 到 stage-1，不允许跳步）
get_requires() {
  local stage="$1"
  local result=""
  for s in "${ALL_STAGES[@]}"; do
    if [[ "$s" -lt "$stage" ]]; then
      result="${result}${s} "
    fi
  done
  echo "$result"
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
