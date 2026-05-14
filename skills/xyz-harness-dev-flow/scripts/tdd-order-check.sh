#!/bin/bash
# tdd-order-check.sh — TDD 提交顺序检测
# 验证 git 历史中测试文件的提交是否先于对应的实现文件。
#
# TDD 的核心证据：测试文件必须比它测试的实现文件先提交（或至少同一次提交）。
# 如果实现文件的首次提交早于测试文件的首次提交，说明跳过了 TDD。
#
# 调用方式：
#   tdd-order-check.sh <project_root> [branch_base]
#     project_root: 项目根目录
#     branch_base: 对比基准分支（默认 main）
#
# 退出码：
#   0 — 通过（所有实现文件都有先于它的测试提交，或无实现文件）
#   1 — 失败（存在实现文件没有先于它的测试提交）
#
# 检测逻辑：
#   1. 找到 branch_base..HEAD 之间所有变更的实现文件（排除 test/spec/_test_/_spec_ 文件）
#   2. 对每个实现文件，找到对应的测试文件（同目录或 tests/ 目录下的同名 .test./.spec. 文件）
#   3. 比较首次提交时间：测试文件的首次提交 ≤ 实现文件的首次提交 → OK
#   4. 如果找不到对应的测试文件，标记为 MISSING
#   5. 如果测试文件晚于实现文件提交，标记为 LATE

set -euo pipefail

# ── 颜色输出 ──────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BOLD='\033[1m'
  C_RESET='\033[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BOLD='' C_RESET=''
fi
info()  { echo -e "${C_BOLD}[TDD-CHECK]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[PASS]${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[FAIL]${C_RESET} $*"; }

PROJECT_ROOT="${1:-}"
BRANCH_BASE="${2:-main}"
SKIP_PATTERNS_FILE=""

if [[ -z "$PROJECT_ROOT" ]]; then
  err "Usage: tdd-order-check.sh <project_root> [branch_base]"
  exit 1
fi

# ── 白名单加载 ──────────────────────────────────────────────────
# 白名单文件：每行一个 glob 模式，匹配的文件不需要测试
# 优先从 .xyz-harness/ 读取，也可放在项目根目录
for candidate in \
  "$PROJECT_ROOT/.xyz-harness/tdd-skip-patterns.txt" \
  "$PROJECT_ROOT/.tdd-skip-patterns.txt"; do
  if [[ -f "$candidate" ]]; then
  SKIP_PATTERNS_FILE="$candidate"
  info "Loaded skip patterns from: $candidate"
  break
  fi
done

# 检查文件是否匹配白名单
is_skip_pattern() {
  local file="$1"
  if [[ -z "$SKIP_PATTERNS_FILE" ]]; then
  return 1
  fi
  while IFS= read -r pattern; do
  [[ -z "$pattern" || "$pattern" =~ ^# ]] && continue
  # glob 匹配
  if [[ "$file" == $pattern ]]; then
    return 0
  fi
  # 路径后缀匹配
  if [[ "$file" == */$pattern ]]; then
    return 0
    fi
  done < "$SKIP_PATTERNS_FILE"
  return 1
}

if [[ ! -d "$PROJECT_ROOT/.git" ]] && [[ ! -f "$PROJECT_ROOT/.git" ]]; then
  # 可能是 worktree，检查 .git 文件
  err "Not a git repository: $PROJECT_ROOT"
  exit 1
fi

cd "$PROJECT_ROOT"

# ── 获取变更范围 ──────────────────────────────────────────────────
# 检查 branch_base 是否存在
if ! git rev-parse --verify "$BRANCH_BASE" &>/dev/null; then
  # 如果基准分支不存在，尝试 origin/main, origin/master, HEAD~10
  for candidate in "origin/main" "origin/master" "HEAD~10"; do
    if git rev-parse --verify "$candidate" &>/dev/null; then
      BRANCH_BASE="$candidate"
      break
    fi
  done
  if ! git rev-parse --verify "$BRANCH_BASE" &>/dev/null; then
    warn "Cannot determine base branch for comparison, using HEAD~5"
    BRANCH_BASE="HEAD~5"
  fi
fi

info "Checking TDD order: $BRANCH_BASE..HEAD"

# ── 找变更的实现文件 ──────────────────────────────────────────────
# 排除测试文件、配置文件、文档文件
CHANGED_IMPL_FILES=$(git diff --name-only --diff-filter=ACMR "$BRANCH_BASE"..HEAD 2>/dev/null | grep -vE '(\.test\.|\.spec\.|__tests__|_test\.|_spec\.|\.d\.ts$|\.md$|\.json$|\.ya?ml$|\.toml$|\.lock$|\.css$|\.scss$|Makefile|Dockerfile|\.sh$|\.env|\.git)' || true)

if [[ -z "$CHANGED_IMPL_FILES" ]]; then
  ok "No implementation files changed — TDD check trivially passes"
  exit 0
fi

# ── 测试文件发现函数 ──────────────────────────────────────────────
# 给定一个实现文件路径，尝试找到对应的测试文件
find_test_files() {
  local impl="$1"
  local base="${impl%.*}"       # 去掉扩展名
  local dir="$(dirname "$impl")"
  local filename="$(basename "$impl")"
  local name="${filename%.*}"   # 去掉扩展名

  # 常见的测试文件命名模式
  local candidates=(
    "${dir}/${name}.test.*"
    "${dir}/${name}.spec.*"
    "${dir}/__tests__/${name}.*"
    "${dir}/test_${name}.*"
    "tests/${dir}/${name}.*"
    "test/${dir}/${name}.*"
    "tests/${name}.*"
    "test/${name}.*"
    "tests/${name}.test.*"
    "tests/${name}.spec.*"
  )

  for pattern in "${candidates[@]}"; do
    # 用 git ls-files 检查文件是否存在（包括已提交的）
    local found
    found=$(git ls-files "$pattern" 2>/dev/null || true)
    if [[ -n "$found" ]]; then
      echo "$found"
      return 0
    fi
  done

  # 也检查同目录下是否有 tests/ 子目录的模式
  local project_tests=(
    "tests/unit/${dir}/${name}.*"
    "tests/integration/${dir}/${name}.*"
    "src/${name}.test.*"
  )
  for pattern in "${project_tests[@]}"; do
    local found
    found=$(git ls-files "$pattern" 2>/dev/null || true)
    if [[ -n "$found" ]]; then
      echo "$found"
      return 0
    fi
  done

  return 1
}

# ── 获取文件首次提交时间（epoch） ──────────────────────────────
first_commit_epoch() {
  local file="$1"
  # 用 git log 找到该文件首次出现的 commit 的时间戳
  git log --diff-filter=AC --format="%ct" -- "$file" 2>/dev/null | tail -1
}

# ── 主检测循环 ─────────────────────────────────────────────────────
TOTAL=0
PASS=0
FAIL=0
MISSING=0
WARNINGS=0

while IFS= read -r impl_file; do
  [[ -z "$impl_file" ]] && continue
  TOTAL=$((TOTAL + 1))

  # 检查白名单
  if is_skip_pattern "$impl_file"; then
  info "SKIP: $impl_file — matched skip pattern"
  PASS=$((PASS + 1))
  continue
  fi

  # 查找对应的测试文件
  if ! test_files=$(find_test_files "$impl_file"); then
  err "MISSING: $impl_file — no corresponding test file found"
  MISSING=$((MISSING + 1))
  continue
  fi

  # 取第一个找到的测试文件
  test_file=$(echo "$test_files" | head -1)

  # 比较首次提交时间
  impl_epoch=$(first_commit_epoch "$impl_file" || echo "9999999999999")
  test_epoch=$(first_commit_epoch "$test_file" || echo "0")

  if [[ "$test_epoch" -eq 0 ]]; then
    err "MISSING: test file $test_file exists but has no commit history"
    MISSING=$((MISSING + 1))
    continue
  fi

  if [[ "$impl_epoch" -le "$test_epoch" ]]; then
    # 实现文件的首次提交早于或等于测试文件 → TDD 违规
    impl_date=$(date -r "$impl_epoch" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
    test_date=$(date -r "$test_epoch" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
    err "LATE: $impl_file (first: $impl_date) committed before test $test_file (first: $test_date)"
    FAIL=$((FAIL + 1))
  else
    ok "OK: $impl_file — test $test_file committed first"
    PASS=$((PASS + 1))
  fi

done <<< "$CHANGED_IMPL_FILES"

# ── 结果汇总 ──────────────────────────────────────────────────────
echo ""
info "=== TDD Order Check Summary ==="
info "Base: $BRANCH_BASE..HEAD"
info "Implementation files: $TOTAL"
info "  PASS (test first):    $PASS"
info "  FAIL (impl first):    $FAIL"
info "  MISSING (no test):    $MISSING"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  err "TDD VIOLATION: $FAIL file(s) had implementation committed before tests."
  err "This indicates TDD was not followed — tests should be written FIRST."
  exit 1
fi

if [[ $MISSING -gt 0 ]]; then
  echo ""
  err "MISSING: $MISSING implementation file(s) have no corresponding test files."
  err "If a file legitimately needs no test, add it to .xyz-harness/tdd-skip-patterns.txt"
  err "Format: one glob pattern per line (e.g. '*.json', 'migrations/*', 'config/*')"
  # MISSING 现在导致失败（除非通过白名单跳过）
  exit 1
fi

if [[ $FAIL -eq 0 ]]; then
  echo ""
  ok "TDD order check PASSED: all implementation files have tests committed first."
  exit 0
fi
