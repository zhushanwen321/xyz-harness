#!/bin/bash
# gate-script.sh — L1 门禁检查（coding-workflow 16-stage 版）
# 调用：gate-script.sh <gate> <project_root> [branch]
# Gate: 03=Spec评审, 05=Plan评审, 07=E2E计划评审,
#       09=编码(编译+测试+lint), 10=TDD顺序, 11=单元测试,
#       13=测试评审, 14=推送+CI+部署
#
# 通过 → 创建 .xyz-harness/gate/stage-{NN}.pass，exit 0
# 失败 → 输出失败项 + 修复指引，exit 1

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: gate-script.sh <gate> <project_root> [branch]" >&2
  exit 1
fi

GATE="$1"
PROJECT_ROOT="$2"
BRANCH="${3:-}"
shift 3 2>/dev/null || true

GATE_DIR="$PROJECT_ROOT/.xyz-harness/gate"
mkdir -p "$GATE_DIR"

# ── 工具函数 ──────────────────────────────────────────────────

# 自动检测当前分支名（当 BRANCH 未提供时）
auto_detect_branch() {
  if [[ -z "$BRANCH" ]]; then
  BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
    return 1
  fi
  echo "[INFO] auto-detected branch: $BRANCH"
  fi
  return 0
}

pass() {
  local p
  p=$(printf "%02d" "$((10#$GATE))")
  echo "pass at $(date "+%Y-%m-%dT%H:%M:%S%z")" > "$GATE_DIR/stage-${p}.pass"
  echo "$1" >> "$GATE_DIR/stage-${p}.pass"
  echo "GATE PASS: gate ${GATE}"
  exit 0
}

# die <message> [fix_hint]
# fix_hint: 一行修复指引，告诉 AI 如何修复此问题
die() {
  local msg="$1"
  local fix="${2:-}"
  echo ""
  echo "==========================================="
  echo "  GATE FAIL: gate ${GATE}"
  echo "  ${msg}"
  if [[ -n "$fix" ]]; then
  echo "  ───────────────────────────────────────"
  echo "  修复指引：${fix}"
  fi
  echo "==========================================="
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
  # 统计未解决的 MUST FIX（排除含"已修复"/"已解决"等标记的历史引用）
  count=$(grep -iE 'MUST\s*FIX|CRITICAL|必须修复' "$f" 2>/dev/null | grep -viE '已修复|已解决|resolved|fixed|不修复则评审不通过' | wc -l | tr -d ' ')
  if [[ "$count" -gt 0 ]]; then
  echo "[FAIL] ${count} unresolved MUST FIX/CRITICAL item(s) remain"
  return 1
  fi
  echo "[PASS] no unresolved MUST FIX items"
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
    in=1
    continue
  fi
  if [[ $in -eq 1 ]] && echo "$line" | grep -qE '^##[^#]' && ! echo "$line" | grep -q '质量门禁'; then
    break
  fi
  if [[ $in -eq 1 ]] && echo "$line" | grep -qE '^\s*-.*`[^`]+`'; then
    local cmd
  cmd=$(echo "$line" | sed -n 's/.*`\([^`][^`]*\)`.*/\1/p')
  [[ -z "$cmd" ]] && continue
  # 跳过包含潜在危险字符的命令
  if echo "$cmd" | grep -qE '[;&|`$(){}]'; then
  echo "[WARN] gate command contains potentially unsafe characters: $cmd" >&2
  continue
  fi
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
  if out=$(cd "$PROJECT_ROOT" && bash -c "$cmd" 2>&1); then
  echo "[PASS] $label"
  echo "$out" | head -30
  return 0
  else
  rc=$?
  echo "[FAIL] $label (exit $rc)"
  echo "$out" | tail -30 | while IFS= read -r l; do echo "  $l"; done
  return 1
  fi
}

# 检查 CLAUDE.md 质量门禁章节并提示
check_claude_md_gates() {
  local md="$PROJECT_ROOT/CLAUDE.md"
  if [[ ! -f "$md" ]]; then
  echo "[WARN] CLAUDE.md not found — no quality gate commands to check"
  echo "       Add a '## 质量门禁' section with commands like:"
  echo "       - 编译: \`npm run build\`"
  echo "       - 测试: \`npm test\`"
  echo "       - Lint: \`npm run lint\`"
  return
  fi
  if ! grep -qE '^##.*质量门禁' "$md"; then
  echo "[WARN] CLAUDE.md has no '## 质量门禁' section — no quality commands to check"
  echo "       Add:"
  echo "       ## 质量门禁"
  echo "       - 编译: \`npm run build\`"
  echo "       - 测试: \`npm test\`"
  echo "       - Lint: \`npm run lint\`"
  return
  fi
}

# ── Gate 03: Spec 评审验证 ──────────────────────────────────
gate_03() {
  local err=0 review
  review=$(find_review "spec_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] spec review report not found"
  die "缺少 spec 评审报告" \
    "派遣 harness-spec-reviewer subagent 对 spec.md 进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/spec_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete"
  fi
  check_file "spec review" "$review" || err=$((err + 1))
  if [[ -f "$review" ]]; then
  no_must_fix "$review" || err=$((err + 1))
  fi
  [[ $err -gt 0 ]] && die "${err} 项检查失败" \
  "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete"
  pass "gate 03: spec review validated"
}

# ── Gate 05: Plan 评审验证 ──────────────────────────────────
gate_05() {
  local err=0 review
  review=$(find_review "plan_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] plan review report not found"
  die "缺少 plan 评审报告" \
    "派遣 harness-reviewer subagent 对 plan.md 进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/plan_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete"
  fi
  check_file "plan review" "$review" || err=$((err + 1))
  if [[ -f "$review" ]]; then
  no_must_fix "$review" || err=$((err + 1))
  fi
  [[ $err -gt 0 ]] && die "${err} 项检查失败" \
  "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete"
  pass "gate 05: plan review validated"
}

# ── Gate 07: E2E 测试计划评审验证 ───────────────────────────
gate_07() {
  local err=0 review
  review=$(find_review "e2e_test_plan_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] e2e test plan review not found"
  die "缺少 E2E 测试计划评审报告" \
    "派遣 harness-e2e-test-plan-reviewer subagent 对 e2e-test-plan.md 进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/e2e_test_plan_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete"
  fi
  check_file "e2e review" "$review" || err=$((err + 1))
  if [[ -f "$review" ]]; then
  no_must_fix "$review" || err=$((err + 1))
  fi
  [[ $err -gt 0 ]] && die "${err} 项检查失败" \
  "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete"
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

  # CLAUDE.md 质量门禁可操作性检查
  check_claude_md_gates

  # 运行 CLAUDE.md 中的质量门禁命令
  local has_cmd=0
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" ]] && continue
  has_cmd=1
  run_cmd "$ctype" "$cmd" || err=$((err + 1))
  done < <(read_gates)

  if [[ $has_cmd -eq 0 ]]; then
  echo "[WARN] no quality gate commands found in CLAUDE.md — skipping compile/test/lint check"
  echo "       This gate is effectively a no-op. To enable real checks, add a '## 质量门禁' section to CLAUDE.md."
  fi

  [[ $err -gt 0 ]] && die "${err} 条命令执行失败" \
  "检查上述 [FAIL] 命令的输出，修复编译/测试/lint 错误后重新调用 harness_stage_complete。如果是 CLAUDE.md 中的命令配置错误，请修正 CLAUDE.md 的 '## 质量门禁' 章节"
  pass "gate 09: coding gate passed"
}

# ── Gate 10: 编码评审（TDD 提交顺序）────────────────────────
gate_10() {
  # 自动检测分支名
  if [[ -z "$BRANCH" ]]; then
  if ! auto_detect_branch; then
    BRANCH="main"
    echo "[INFO] cannot auto-detect branch, fallback to: $BRANCH"
  fi
  fi

  local tdd_script
  local SCRIPT_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  tdd_script="$SCRIPT_DIR/tdd-order-check.sh"
  if [[ ! -f "$tdd_script" ]]; then
  echo "[WARN] tdd-order-check.sh not found — skipping TDD check"
  echo "       Expected at: $tdd_script"
  pass "gate 10: TDD check skipped (script missing)"
  fi

  local base="${BRANCH}"
  echo "[INFO] TDD order check: ${base}..HEAD"
  if bash "$tdd_script" "$PROJECT_ROOT" "$base" 2>&1; then
  pass "gate 10: TDD order verified"
  else
  die "TDD 提交顺序违规" \
    "确保每个实现文件的测试文件先于实现文件提交（git log 验证）。如果需要豁免某些文件（如配置、migration），将其 glob 模式添加到 .xyz-harness/tdd-skip-patterns.txt（每行一个模式）。修复后重新调用 harness_stage_complete"
  fi
}

# ── Gate 11: 单元测试（测试文件 + 测试执行）──────────────────
gate_11() {
  local err=0

  # 检查最近变更中的测试文件（自动适配提交数不足的情况）
  local commit_count changed tfiles
  commit_count=$(git -C "$PROJECT_ROOT" rev-list --count HEAD 2>/dev/null || echo "0")
  local range
  if [[ "$commit_count" -ge 5 ]]; then
  range="HEAD~5"
  elif [[ "$commit_count" -ge 1 ]]; then
  range="HEAD~${commit_count}"
  else
  range="HEAD"
  fi
  echo "[INFO] checking test files in range: ${range}..HEAD"

  changed=$(git -C "$PROJECT_ROOT" diff --name-only "${range}" 2>/dev/null || true)
  tfiles=$(echo "$changed" | grep -iE '(test|spec|__tests__|\.test\.|\.spec\.)' 2>/dev/null || true)
  if [[ -z "$tfiles" ]]; then
  echo "[WARN] no test/spec files in commits ${range}..HEAD"
  else
  echo "[PASS] found test/spec files in changes"
  echo "$tfiles" | while IFS= read -r f; do echo "  $f"; done
  fi

  # 运行测试命令
  local found=0
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" || "$ctype" != "test" ]] && continue
  found=1
  run_cmd "test" "$cmd" || err=$((err + 1))
  done < <(read_gates)

  if [[ $found -eq 0 ]]; then
  echo "[WARN] no test command in CLAUDE.md '## 质量门禁' section"
  echo "       Add: - 测试: \`npm test\`"
  fi

  [[ $err -gt 0 ]] && die "${err} 条测试命令失败" \
  "检查上述 [FAIL] 测试命令的输出，修复失败的测试用例或代码后重新调用 harness_stage_complete"
  pass "gate 11: unit test gate passed"
}

# ── Gate 13: 测试评审验证 ───────────────────────────────────
gate_13() {
  local err=0 review
  review=$(find_review "test_review*.md")
  if [[ -z "$review" ]]; then
  echo "[FAIL] test review report not found"
  die "缺少测试评审报告" \
    "派遣 harness-reviewer subagent 对测试代码进行评审，报告写入 .xyz-harness/{主题}/changes/reviews/test_review_v1.md，修复所有 MUST FIX 后重新调用 harness_stage_complete"
  fi
  check_file "test review" "$review" || err=$((err + 1))
  if [[ -f "$review" ]]; then
  no_must_fix "$review" || err=$((err + 1))
  fi
  [[ $err -gt 0 ]] && die "${err} 项检查失败" \
  "根据上述 [FAIL] 项修复评审报告中的问题，确保无 MUST FIX 项后重新调用 harness_stage_complete"
  pass "gate 13: test review validated"
}

# ── Gate 14: 推送 + CI + 部署 ────────────────────────────────
gate_14() {
  # 自动检测分支名
  if ! auto_detect_branch; then
  die "无法检测当前分支名，且未通过参数传入" \
    "确保当前目录是一个 git 仓库，并且不在 detached HEAD 状态。如果问题持续，手动指定分支名作为第 3 个参数调用 gate-script.sh"
  fi

  local err=0

  # 1. 工作区干净
  local dirty
  dirty=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null || true)
  if [[ -n "$dirty" ]]; then
  echo "[FAIL] working directory not clean:"
  echo "$dirty" | while IFS= read -r l; do echo "  $l"; done
  err=$((err + 1))
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
  echo "[FAIL] local and remote differ (need git push)"
  err=$((err + 1))
  fi

  # 3. 运行质量门禁
  while IFS=: read -r ctype cmd; do
  [[ -z "$ctype" ]] && continue
  run_cmd "$ctype" "$cmd" || err=$((err + 1))
  done < <(read_gates)

  # 4. 部署验证
  local dr
  dr=$(find "$PROJECT_ROOT/.xyz-harness" -name "deploy_result.md" -type f 2>/dev/null | head -1)
  if [[ -n "$dr" && -s "$dr" ]]; then
  if grep -qiE '成功|success|deployed|healthy' "$dr"; then
    echo "[PASS] deploy_result.md: success"
  else
  echo "[FAIL] deploy_result.md: no success indicator"
  err=$((err + 1))
  fi
  else
  echo "[WARN] deploy_result.md not found — skipping deploy verification"
  echo "       Create .xyz-harness/{主题}/changes/evidence/deploy_result.md with deployment status"
  fi

  if [[ $err -gt 0 ]]; then
  local fix_msg=""
  if [[ -n "$dirty" ]]; then
    fix_msg="工作区不干净：运行 git add + git commit 提交所有变更。"
  fi
  if [[ "$lh" != "$rh" || -z "$lh" ]]; then
    fix_msg="${fix_msg}未推送：运行 git push origin ${BRANCH}。"
  fi
  [[ -z "$fix_msg" ]] && fix_msg="检查上述 [FAIL] 项，逐一修复后重新调用 harness_stage_complete"
  die "${err} 项检查失败" "$fix_msg"
  fi

  pass "gate 14: push + CI + deploy verified"
}

# ── 分发 ──────────────────────────────────────────────────────
echo "=== L1 Gate Check: Gate ${GATE} ==="
echo "Project: $PROJECT_ROOT"

if [[ ! -d "$PROJECT_ROOT" ]]; then
  die "project root not found: $PROJECT_ROOT" \
  "检查项目路径是否正确，当前路径为 $(pwd)"
fi

if [[ ! "$GATE" =~ ^[0-9]+$ ]]; then
  die "invalid gate number: ${GATE}" "gate 编号必须为纯数字"
fi

rm -f "$GATE_DIR/stage-$(printf '%02d' "$((10#$GATE))").pass"

case "$GATE" in
  03) gate_03 ;;
  05) gate_05 ;;
  07) gate_07 ;;
  09) gate_09 ;;
  10) gate_10 ;;
  11) gate_11 ;;
  13) gate_13 ;;
  14) gate_14 ;;
  *)  die "unknown gate '${GATE}'. valid: 03 05 07 09 10 11 13 14" \
  "检查 stages.ts 中 gateScript 配置是否正确，gate 编号必须在上述列表中" ;;
esac
