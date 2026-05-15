#!/bin/bash
# gate-script.sh — L1 门禁检查（coding-workflow 16-stage 版）
# 调用：gate-script.sh <gate> <project_root> [branch] [extra...]
# Gate: 03=Spec评审, 05=Plan评审, 07=E2E计划评审,
#       09=编码(编译+测试+lint), 10=TDD顺序, 11=单元测试,
#       13=测试评审, 14=推送+CI+部署
#
# 通过 → 创建 .xyz-harness/gate/stage-{NN}.pass，exit 0
# 失败 → 输出失败项，exit 1

set -euo pipefail

GATE="$1"
PROJECT_ROOT="$2"
BRANCH="${3:-}"
shift 3 2>/dev/null || true

GATE_DIR="$PROJECT_ROOT/.xyz-harness/gate"
mkdir -p "$GATE_DIR"

# ── 工具函数 ──────────────────────────────────────────────────
pass() {
  local p
  p=$(printf "%02d" "$GATE")
  echo "pass at $(date "+%Y-%m-%dT%H:%M:%S%z")" > "$GATE_DIR/stage-${p}.pass"
  echo "$1" >> "$GATE_DIR/stage-${p}.pass"
  echo "GATE PASS: gate ${GATE}"
  exit 0
}

die() {
  echo "GATE FAIL: gate ${GATE} — $1"
  exit 1
}

check_file() {
  local label="$1" f="$2"
  if [[ ! -f "$f" ]]; then
  echo "[FAIL] ${label}: not found — ${f}"
  return 1
  fi
  if [[ ! -s "$f" ]]; then
  echo "[FAIL] ${label}: empty — ${f}"
  return 1
  fi
  echo "[PASS] ${label}: ok"
}

no_must_fix() {
  local f="$1" count
  count=$(grep -ciE 'MUST\s*FIX|必须修复|CRITICAL' "$f" 2>/dev/null || echo "0")
  if [[ "$count" -gt 0 ]]; then
  echo "[FAIL] ${count} MUST FIX/CRITICAL item(s) remain"
  return 1
  fi
  echo "[PASS] no MUST FIX items"
}

find_review() {
  local pattern="$1"
  find "$PROJECT_ROOT/.xyz-harness" -path "*/changes/reviews/${pattern}" -type f 2>/dev/null | sort -r | head -1
}

# 从 CLAUDE.md 质量门禁章节提取命令
# 返回每行 "type:command"
read_gates() {
  local md="$PROJECT_ROOT/CLAUDE.md"
  [[ -f "$md" ]] || return 0

  local in=0
  while IFS= read -r line; do
  if echo "$line" | grep -qE '^##.*质量门禁'; then
    in=1; continue
  fi
  if [[ $in -eq 1 ]] && echo "$line" | grep -qE '^##[^#]' && ! echo "$line" | grep -q '质量门禁'; then
    break
  fi
  if [[ $in -eq 1 ]] && echo "$line" | grep -qE '^\s*-.*`[^`]+`'; then
    # 提取反引号中的命令（兼容 macOS sed，避免嵌套 backtick 陷阱）
    local cmd
    cmd=$(echo "$line" | sed -n 's/.*`\([^`][^`]*\)`.*/\1/p')
    [[ -z "$cmd" ]] && continue
    # 推断类型
    local lo
    lo=$(echo "$line" | tr '[:upper:]' '[:lower:]')
    if echo "$lo" | grep -qE '编译|build|compile'; then
    echo "compile:$cmd"
    elif echo "$lo" | grep -qE '测试|test'; then
    echo "test:$cmd"
    elif echo "$lo" | grep -qE 'lint|clippy|eslint'; then
    echo "lint:$cmd"
    elif echo "$lo" | grep -qE '类型|type'; then
    echo "typecheck:$cmd"
    fi
  fi
  done < "$md"
}

# 运行命令并检查退出码
run_cmd() {
  local label="$1" cmd="$2"
  echo "[INFO] $label: $cmd"
  local out rc=0
  # 不使用 eval，避免反引号注入
  if out=$(cd "$PROJECT_ROOT" && bash -c "$cmd" 2>&1); then
  echo "[PASS] $label"
  echo "$out"
  return 0
  else
  rc=$?
  echo "[FAIL] $label (exit $rc)"
  echo "$out" | head -20 | while IFS= read -r l; do echo "  $l"; done
  return 1
  fi
}

# ── Gate 03: Spec 评审验证 ──────────────────────────────────
gate_03() {
  local err=0 review
  review=$(find_review "spec_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] spec review report not found"
  die "spec review not found"
  fi
  check_file "spec review" "$review" || ((err++))
  [[ -f "$review" ]] && no_must_fix "$review" || ((err++))
  [[ $err -gt 0 ]] && die "${err} check(s) failed"
  pass "gate 03: spec review validated"
}

# ── Gate 05: Plan 评审验证 ──────────────────────────────────
gate_05() {
  local err=0 review
  review=$(find_review "plan_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] plan review report not found"
  die "plan review not found"
  fi
  check_file "plan review" "$review" || ((err++))
  [[ -f "$review" ]] && no_must_fix "$review" || ((err++))
  [[ $err -gt 0 ]] && die "${err} check(s) failed"
  pass "gate 05: plan review validated"
}

# ── Gate 07: E2E 测试计划评审验证 ───────────────────────────
gate_07() {
  local err=0 review
  review=$(find_review "e2e_test_plan_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] e2e test plan review not found"
  die "e2e review not found"
  fi
  check_file "e2e review" "$review" || ((err++))
  [[ -f "$review" ]] && no_must_fix "$review" || ((err++))
  [[ $err -gt 0 ]] && die "${err} check(s) failed"
  pass "gate 07: e2e test plan review validated"
}

# ── Gate 09: 编码实现（编译 + 测试 + lint）──────────────────
gate_09() {
  local err=0

  # 检查 spec.md / plan.md
  local spec plan
  spec=$(find "$PROJECT_ROOT/.xyz-harness" -name "spec.md" -type f 2>/dev/null | head -1)
  plan=$(find "$PROJECT_ROOT/.xyz-harness" -name "plan.md" -type f 2>/dev/null | head -1)
  [[ -n "$spec" ]] && check_file "spec.md" "$spec" || echo "[WARN] spec.md not found"
  [[ -n "$plan" ]] && check_file "plan.md" "$plan" || echo "[WARN] plan.md not found"

  # plan Task 数
  if [[ -n "$plan" && -f "$plan" ]]; then
  local tc
  tc=$(grep -cE '^###\s+Task' "$plan" 2>/dev/null || echo "0")
  echo "[INFO] plan.md tasks: ${tc}"
  fi

  # 运行 CLAUDE.md 中的质量门禁命令
  local has_cmd=0
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" ]] && continue
  has_cmd=1
  run_cmd "$ctype" "$cmd" || ((err++))
  done < <(read_gates)

  if [[ $has_cmd -eq 0 ]]; then
  echo "[WARN] no quality gate commands in CLAUDE.md"
  fi

  [[ $err -gt 0 ]] && die "${err} command(s) failed"
  pass "gate 09: coding gate passed"
}

# ── Gate 10: 编码评审（TDD 提交顺序）────────────────────────
gate_10() {
  local tdd_script
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  tdd_script="$SCRIPT_DIR/tdd-order-check.sh"
  if [[ ! -f "$tdd_script" ]]; then
  echo "[WARN] tdd-order-check.sh not found — skipping TDD check"
  pass "gate 10: TDD check skipped (script missing)"
  fi

  local base="${BRANCH:-main}"
  echo "[INFO] TDD order check: ${base}..HEAD"
  if bash "$tdd_script" "$PROJECT_ROOT" "$base" 2>&1; then
  pass "gate 10: TDD order verified"
  else
  die "TDD order violation"
  fi
}

# ── Gate 11: 单元测试（测试文件 + 测试执行）──────────────────
gate_11() {
  local err=0

  # 检查最近变更中的测试文件
  local changed tfiles
  changed=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~5 2>/dev/null || true)
  tfiles=$(echo "$changed" | grep -iE '(test|spec|__tests__|\.test\.|\.spec\.)' 2>/dev/null || true)
  if [[ -z "$tfiles" ]]; then
  echo "[WARN] no test/spec files in recent commits"
  else
  echo "[PASS] found test/spec files in changes"
  fi

  # 运行测试命令
  local found=0
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" || "$ctype" != "test" ]] && continue
  found=1
  run_cmd "test" "$cmd" || ((err++))
  done < <(read_gates)

  if [[ $found -eq 0 ]]; then
  echo "[WARN] no test command in CLAUDE.md"
  fi

  [[ $err -gt 0 ]] && die "${err} test(s) failed"
  pass "gate 11: unit test gate passed"
}

# ── Gate 13: 测试评审验证 ───────────────────────────────────
gate_13() {
  local err=0 review
  review=$(find_review "test_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] test review report not found"
  die "test review not found"
  fi
  check_file "test review" "$review" || ((err++))
  [[ -f "$review" ]] && no_must_fix "$review" || ((err++))
  [[ $err -gt 0 ]] && die "${err} check(s) failed"
  pass "gate 13: test review validated"
}

# ── Gate 14: 推送 + CI + 部署 ────────────────────────────────
gate_14() {
  local err=0
  [[ -z "$BRANCH" ]] && die "branch name required (3rd arg)"

  # 1. 工作区干净
  local dirty
  dirty=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null || true)
  if [[ -n "$dirty" ]]; then
  echo "[FAIL] working directory not clean"
  echo "$dirty" | while IFS= read -r l; do echo "  $l"; done
  ((err++))
  else
  echo "[PASS] working directory clean"
  fi

  # 2. 远程已推送
  git -C "$PROJECT_ROOT" fetch origin "$BRANCH" --quiet 2>/dev/null || true
  local lh rh
  lh=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "")
  rh=$(git -C "$PROJECT_ROOT" rev-parse "origin/${BRANCH}" 2>/dev/null || echo "")
  if [[ "$lh" == "$rh" && -n "$lh" ]]; then
  echo "[PASS] local HEAD matches origin/${BRANCH}"
  else
  echo "[FAIL] local and remote differ"
  ((err++))
  fi

  # 3. 运行质量门禁
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" ]] && continue
  run_cmd "$ctype" "$cmd" || ((err++))
  done < <(read_gates)

  # 4. 部署验证
  local dr
  dr=$(find "$PROJECT_ROOT/.xyz-harness" -name "deploy_result.md" -type f 2>/dev/null | head -1)
  if [[ -n "$dr" && -s "$dr" ]]; then
  if grep -qiE '成功|success|deployed|healthy' "$dr"; then
    echo "[PASS] deploy_result.md: success"
  else
    echo "[FAIL] deploy_result.md: no success indicator"
    ((err++))
  fi
  else
  echo "[WARN] deploy_result.md not found"
  fi

  [[ $err -gt 0 ]] && die "${err} check(s) failed"
  pass "gate 14: push + CI + deploy verified"
}

# ── 分发 ──────────────────────────────────────────────────────
echo "=== L1 Gate Check: Gate ${GATE} ==="
echo "Project: $PROJECT_ROOT"

if [[ ! -d "$PROJECT_ROOT" ]]; then
  die "project root not found: $PROJECT_ROOT"
fi

rm -f "$GATE_DIR/stage-$(printf '%02d' "$GATE").pass"

case "$GATE" in
  03) gate_03 ;;
  05) gate_05 ;;
  07) gate_07 ;;
  09) gate_09 ;;
  10) gate_10 ;;
  11) gate_11 ;;
  13) gate_13 ;;
  14) gate_14 ;;
  *)  die "unknown gate '${GATE}'. valid: 03 05 07 09 10 11 13 14" ;;
esac
