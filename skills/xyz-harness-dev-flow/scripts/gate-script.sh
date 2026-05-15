#!/bin/bash
# gate-script.sh — L1 门禁强制检查
# 调用方式：gate-script.sh <stage> <project_root> [branch_name] [extra_args...]
#   stage: 01|02|03|05|07|08|09
#   project_root: 项目根目录
#   branch_name: git 分支名（stage 07 必须）
#   extra_args: stage 01 传入 spec.md 和 plan.md 的路径
#              stage 02 传入 branch_base（可选，默认 main）
#
# 通过 → 创建 .xyz-harness/gate/stage-{NN}.pass
# 失败 → 输出失败项，exit 1

set -euo pipefail

# ── 颜色输出（检测终端支持） ──────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    C_RED='\033[0;31m'
    C_GREEN='\033[0;32m'
    C_YELLOW='\033[0;33m'
    C_BOLD='\033[1m'
    C_RESET='\033[0m'
else
    C_RED=''
    C_GREEN=''
    C_YELLOW=''
    C_BOLD=''
    C_RESET=''
fi

info()  { echo -e "${C_BOLD}[INFO]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[PASS]${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[FAIL]${C_RESET} $*"; }

# ── 参数解析 ──────────────────────────────────────────────────────
STAGE="$1"
PROJECT_ROOT="$2"
BRANCH_NAME="${3:-}"
shift 3 2>/dev/null || true
# 剩余参数存入数组，供各阶段按需使用
EXTRA_ARGS=("$@")

GATE_DIR="$PROJECT_ROOT/.xyz-harness/gate"
mkdir -p "$GATE_DIR"

# ── 通用工具函数 ──────────────────────────────────────────────────

pass() {
    local stage_padded
    stage_padded=$(printf "%02d" "$STAGE")
    local pass_file="$GATE_DIR/stage-${stage_padded}.pass"
    echo "pass at $(date "+%Y-%m-%dT%H:%M:%S%z")" > "$pass_file"
    echo "$1" >> "$pass_file"
    echo -e "${C_GREEN}GATE PASS: stage ${STAGE}${C_RESET}"
    exit 0
}

fail() {
    echo -e "${C_RED}GATE FAIL: stage ${STAGE} — $1${C_RESET}"
    exit 1
}

# 检查文件存在且非空
check_file_nonempty() {
    local label="$1" filepath="$2"
    if [[ ! -f "$filepath" ]]; then
        err "${label}: file not found — ${filepath}"
        return 1
    fi
    if [[ ! -s "$filepath" ]]; then
        err "${label}: file is empty — ${filepath}"
        return 1
    fi
    ok "${label}: exists and non-empty"
    return 0
}

# 检查命令退出码
check_cmd() {
    local label="$1"; shift
    info "${label}: running: $*"
    local output
    output=$("$@" 2>&1) && rc=$? || rc=$?
    if [[ $rc -ne 0 ]]; then
        err "${label}: failed (exit ${rc})"
        echo "$output" | head -50 | while IFS= read -r line; do err "  $line"; done
        return 1
    fi
    ok "${label}: passed"
    echo "$output"
    return 0
}

# ── 从 CLAUDE.md 解析质量门禁命令 ─────────────────────────────────
# 输出格式：每行一个 "type:command"
# type 为 compile / test / lint / typecheck 之一
parse_claude_md_commands() {
    local claude_md="$PROJECT_ROOT/CLAUDE.md"
    if [[ ! -f "$claude_md" ]]; then
        return 0
    fi

    # 提取"质量门禁"章节，直到下一个 ## 或文件结束
    local in_section=0
    while IFS= read -r line; do
        if [[ "$line" =~ ^##.*质量门禁 ]]; then
            in_section=1
            continue
        fi
        if [[ $in_section -eq 1 ]]; then
            # 遇到下一个 ## 级标题则退出
            if [[ "$line" =~ ^##[^#] && ! "$line" =~ 质量门禁 ]]; then
                break
            fi
            # 匹配带标签的命令行，例如：
            #   - 编译: `cargo build`
            #   - 测试: `cargo test`
            #   - lint: `cargo clippy`
            #   - 类型检查: `npx tsc --noEmit`
            if [[ "$line" =~ -(.*):(.*\`.+\`) ]]; then
                local label="${BASH_REMATCH[1]}"
                local cmd="${BASH_REMATCH[2]}"
                # 去掉反引号
                cmd="${cmd#\`}"
                cmd="${cmd%\`}"
                # 根据标签推断类型
                local ctype=""
                lower_label=$(echo "$label" | tr '[:upper:]' '[:lower:]')
                if [[ "$lower_label" =~ 编译|build|compile ]]; then
                    ctype="compile"
                elif [[ "$lower_label" =~ 测试|test ]]; then
                    ctype="test"
                elif [[ "$lower_label" =~ lint|clippy|eslint ]]; then
                    ctype="lint"
                elif [[ "$lower_label" =~ 类型|type ]]; then
                    ctype="typecheck"
                else
                    ctype="other"
                fi
                echo "${ctype}:${cmd}"
            fi
        fi
    done < "$claude_md"
}

# 解析测试输出中的测试数量
# 支持多种格式：cargo test, jest, pytest, vitest, go test
parse_test_count() {
    local output="$1"

    # Rust cargo test: "test result: ok. N passed; 0 failed; ..."
    if echo "$output" | grep -qE 'test result:.*[0-9]+ passed'; then
        local passed failed
        passed=$(echo "$output" | grep -oE '[0-9]+ passed' | sed 's/ passed//' | tail -1)
        failed=$(echo "$output" | grep -oE '[0-9]+ failed' | sed 's/ failed//' | tail -1)
        failed=${failed:-0}
        echo "total=$((passed + failed)) passed=${passed} failed=${failed}"
        return 0
    fi

    # Jest / Vitest: "Tests: N passed, M failed, Total: T"
    if echo "$output" | grep -qE 'Tests:.*Total:.*[0-9]+'; then
        local total passed failed
        total=$(echo "$output" | grep -oE 'Total:[[:space:]]*[0-9]+' | grep -oE '[0-9]+$' | tail -1)
        passed=$(echo "$output" | grep -oE '[0-9]+[[:space:]]+passed' | grep -oE '^[0-9]+' | tail -1)
        failed=$(echo "$output" | grep -oE '[0-9]+[[:space:]]+failed' | grep -oE '^[0-9]+' | tail -1)
        failed=${failed:-0}
        echo "total=${total} passed=${passed:-0} failed=${failed}"
        return 0
    fi

    # pytest: "N passed, M failed, K errors"
    if echo "$output" | grep -qE '[0-9]+ passed'; then
        local passed failed errors
        passed=$(echo "$output" | grep -oE '[0-9]+ passed' | sed 's/ passed//' | tail -1)
        failed=$(echo "$output" | grep -oE '[0-9]+ failed' | sed 's/ failed//' | tail -1)
        errors=$(echo "$output" | grep -oE '[0-9]+ error' | sed 's/ error//' | tail -1)
        failed=${failed:-0}
        errors=${errors:-0}
        local total=$((passed + failed + errors))
        echo "total=${total} passed=${passed} failed=$((failed + errors))"
        return 0
    fi

    # Go test: "ok  pkg  0.123s" or "FAIL  pkg  0.123s"
    if echo "$output" | grep -qE '(ok|FAIL)[[:space:]]+.*[0-9]+(\.[0-9]+)?s'; then
        local go_passed go_failed
        go_passed=$(echo "$output" | grep -cE '^ok[[:space:]]')
        go_failed=$(echo "$output" | grep -cE '^FAIL[[:space:]]')
        echo "total=$((go_passed + go_failed)) passed=${go_passed} failed=${go_failed}"
        return 0
    fi

    # 未能解析
    echo "total=0 passed=0 failed=0"
    return 1
}

# ── 阶段处理函数 ──────────────────────────────────────────────────

gate_stage_01() {
    # 参数：spec.md 路径 和 plan.md 路径
    local spec_path="${EXTRA_ARGS[0]:-}"
    local plan_path="${EXTRA_ARGS[1]:-}"

    if [[ -z "$spec_path" ]]; then
        fail "stage 01: spec.md path not provided (pass as 4th argument)"
    fi
    if [[ -z "$plan_path" ]]; then
        fail "stage 01: plan.md path not provided (pass as 5th argument)"
    fi

    local errors=0

    # 检查 spec.md
    check_file_nonempty "spec.md" "$spec_path" || ((errors++))

    # 检查 plan.md
    check_file_nonempty "plan.md" "$plan_path" || ((errors++))

    # 检查 plan.md 中至少有 1 个 Task 标题
    if [[ -f "$plan_path" ]]; then
        local task_count
        task_count=$(grep -cE '^###\s+Task' "$plan_path" || true)
        if [[ $task_count -lt 1 ]]; then
            err "plan.md: no Task headings found (expected at least 1 '### Task')"
            errors=$((errors + 1))
        else
            ok "plan.md: found ${task_count} Task heading(s)"
        fi
    fi

    # ── 六要素章节检查 (spec.md) ──────────────────────────────────
    if [[ -f "$spec_path" ]]; then
        local spec_errors=0

        # 检查必填章节是否存在
        # 1. Outcomes / 目标 / 目的
        if ! grep -qiE '(^##.*目标|^##.*outcomes|^##.*目的|^##.*目标与范围)' "$spec_path"; then
            err "spec.md: missing 'Outcomes/目标' section — agent needs concrete end-state description"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has Outcomes/目标 section"
        fi

        # 2. Scope / 范围
        if ! grep -qiE '(^##.*范围|^##.*scope)' "$spec_path"; then
            err "spec.md: missing 'Scope/范围' section — agent needs explicit scope boundaries"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has Scope/范围 section"
        fi
        # 2b. Out-of-scope
        if ! grep -qiE '(out.?of.?scope|不在范围内|排除|不包含)' "$spec_path"; then
            err "spec.md: missing out-of-scope content — agent expands scope without explicit exclusions"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has out-of-scope content"
        fi

        # 3. Constraints / 约束 / 限制
        if ! grep -qiE '(^##.*约束|^##.*constraint|^##.*限制|^##.*非功能性)' "$spec_path"; then
            err "spec.md: missing 'Constraints/约束' section — agent needs tech stack and performance constraints"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has Constraints section"
        fi

        # 4. Decisions made / 已做决策
        if ! grep -qiE '(^##.*已做决策|^##.*decisions|^##.*技术决策|^##.*已确定)' "$spec_path"; then
            err "spec.md: missing 'Decisions made/已做决策' section — agent will make its own choices"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has Decisions made section"
        fi

        # 5. Behavioral constraints / 行为约束 (Always/Never)
        if ! grep -qiE '(^##.*行为约束|^##.*behavioral|^##.*行为规范|always.*never|^###.*always)' "$spec_path"; then
            err "spec.md: missing '行为约束' section — agent needs Always/Ask First/Never boundaries"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has 行为约束 section"
        fi

        # 6. 已有基础设施
        if ! grep -qiE '(^##.*已有基础设施|^##.*infrastructure|^##.*可复用)' "$spec_path"; then
            err "spec.md: missing '已有基础设施' section — agent needs to know what to reuse"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has 已有基础设施 section"
        fi

        # 7. 验收标准 / Acceptance / Verification
        if ! grep -qiE '(^##.*验收标准|^##.*acceptance|^##.*verification|^##.*验证|^##.*成功标准|^##.*success)' "$spec_path"; then
            err "spec.md: missing '验收标准/Verification' section — agent cannot determine when work is done"
            spec_errors=$((spec_errors + 1))
        else
            ok "spec.md: has 验收标准/Verification"
        fi

        if [[ $spec_errors -gt 0 ]]; then
            err "spec.md: ${spec_errors} required section(s) missing (see six-element completeness check)"
            errors=$((errors + spec_errors))
        else
            ok "spec.md: all six-element sections present"
        fi

        # 检查 [AMBIGUOUS] 残留
        local ambiguous_count
        ambiguous_count=$(grep -cE '\[AMBIGUOUS\]' "$spec_path" || true)
        if [[ $ambiguous_count -gt 0 ]]; then
            err "spec.md: ${ambiguous_count} unresolved [AMBIGUOUS] marker(s) — all ambiguities must be resolved before proceeding"
            errors=$((errors + 1))
        else
            ok "spec.md: no unresolved [AMBIGUOUS] markers"
        fi
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 01 gate: spec + plan validated"
}

gate_stage_02() {
    # TDD 提交顺序检测 — 编码评审阶段的门禁
    # 验证所有实现文件都有先于它的测试提交
    local errors=0

    local branch_base="${EXTRA_ARGS[0]:-main}"
    local tdd_script=""

    # 查找 tdd-order-check.sh
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    for candidate in "$SCRIPT_DIR/tdd-order-check.sh"; do
        if [[ -f "$candidate" ]]; then
            tdd_script="$candidate"
            break
        fi
    done

    if [[ -z "$tdd_script" ]]; then
        warn "tdd-order-check.sh not found — skipping TDD order check"
        pass "stage 02 gate: TDD check skipped (script not found)"
        return
    fi

    info "Running TDD order check: ${branch_base}..HEAD"
    local tdd_output
    tdd_output=$(bash "$tdd_script" "$PROJECT_ROOT" "$branch_base" 2>&1) && rc=$? || rc=$?

    echo "$tdd_output"

    if [[ $rc -ne 0 ]]; then
        err "TDD order check failed — implementation was committed before tests"
        errors=$((errors + 1))
    else
        ok "TDD order check passed"
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 02 gate: TDD order verified"
}

gate_stage_03() {
    # 编译 + 测试 + lint 全通过
    local errors=0
    local test_output=""

    # 解析 CLAUDE.md 中的命令
    local commands
    commands=$(parse_claude_md_commands)

    if [[ -z "$commands" ]]; then
        warn "No quality gate commands found in CLAUDE.md — skipping compile/test/lint checks"
        pass "stage 03 gate: no commands configured (skipped)"
        return
    fi

    local has_test=0

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        local ctype="${entry%%:*}"
        local cmd="${entry#*:}"
        [[ -z "$cmd" ]] && continue

        info "Running ${ctype} command: ${cmd}"

        local output
        # 使用 eval 以支持带管道/重定向的复杂命令
        output=$(cd "$PROJECT_ROOT" && eval "$cmd" 2>&1) && rc=$? || rc=$?

        if [[ $rc -ne 0 ]]; then
            err "${ctype}: failed (exit ${rc})"
            echo "$output" | head -30 | while IFS= read -r line; do err "  $line"; done
            errors=$((errors + 1))
        else
            ok "${ctype}: passed"
        fi

        if [[ "$ctype" == "test" ]]; then
            has_test=1
            test_output="$output"
        fi
    done <<< "$commands"

    # 确认测试数量 > 0
    if [[ $has_test -eq 1 ]]; then
        local parsed
        parsed=$(parse_test_count "$test_output") || true
        info "Test count: ${parsed}"
        local total
        total=$(echo "$parsed" | grep -oE 'total=[0-9]+' | sed 's/total=//' || echo "0")
        if [[ "${total:-0}" -eq 0 ]]; then
            err "test command ran but 0 tests detected — tests may not be actually running"
            errors=$((errors + 1))
        else
            ok "test count: ${total} > 0"
        fi
    else
        warn "No test command found in CLAUDE.md quality gate"
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 03 gate: compile + test + lint passed"
}

gate_stage_05() {
    # 新增测试文件 + 测试通过
    local errors=0

    # 检查是否有新增的测试文件
    local test_files=""
    # 尝试多种方式检测新增的测试文件：
    # 1. git diff --cached（已 staged 的文件）
    # 2. git diff HEAD（相比上一次 commit 的变更）
    # 3. git diff --name-only HEAD~3（最近几次 commit 的变更）
    local changed_files=""

    if git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null | head -1 | grep -q .; then
        changed_files=$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null)
    fi

    if [[ -z "$changed_files" ]]; then
        # 找最近一次 commit 的变更
        changed_files=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~1 2>/dev/null || true)
    fi

    if [[ -z "$changed_files" ]]; then
        # 尝试最近 5 次 commit
        changed_files=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~5 2>/dev/null || true)
    fi

    # 从变更文件中筛选 test/spec 相关文件
    test_files=$(echo "$changed_files" | grep -iE '(test|spec|__tests__|\.test\.|\.spec\.)' || true)

    if [[ -z "$test_files" ]]; then
        err "no test/spec files found in recent changes"
        errors=$((errors + 1))
    else
        local test_count
        test_count=$(echo "$test_files" | wc -l | tr -d ' ')
        ok "found ${test_count} test/spec file(s) in recent changes"
    fi

    # 执行测试命令
    local commands
    commands=$(parse_claude_md_commands)

    local test_cmd=""
    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        local ctype="${entry%%:*}"
        local cmd="${entry#*:}"
        if [[ "$ctype" == "test" ]]; then
            test_cmd="$cmd"
            break
        fi
    done <<< "$commands"

    if [[ -n "$test_cmd" ]]; then
        local test_output
        test_output=$(cd "$PROJECT_ROOT" && eval "$test_cmd" 2>&1) && rc=$? || rc=$?

        if [[ $rc -ne 0 ]]; then
            err "tests failed (exit ${rc})"
            echo "$test_output" | head -30 | while IFS= read -r line; do err "  $line"; done
            errors=$((errors + 1))
        else
            ok "tests passed"

            # 验证测试数量 > 0
            local parsed
            parsed=$(parse_test_count "$test_output") || true
            info "Test count: ${parsed}"
            local total
            total=$(echo "$parsed" | grep -oE 'total=[0-9]+' | sed 's/total=//' || echo "0")
            if [[ "${total:-0}" -eq 0 ]]; then
                warn "test command passed but 0 tests detected"
            else
                ok "test count: ${total}"
            fi
        fi
    else
        warn "No test command found — skipping test execution check"
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 05 gate: test files + test execution passed"
}

gate_stage_07() {
    # 工作区干净 + push 成功
    local errors=0

    if [[ -z "$BRANCH_NAME" ]]; then
        fail "stage 07: branch_name is required (pass as 3rd argument)"
    fi

    # 检查工作区是否干净
    local dirty_files
    dirty_files=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null || true)

    if [[ -n "$dirty_files" ]]; then
        local dirty_count
        dirty_count=$(echo "$dirty_files" | wc -l | tr -d ' ')
        err "working directory not clean: ${dirty_count} uncommitted change(s)"
        echo "$dirty_files" | while IFS= read -r line; do err "  $line"; done
        errors=$((errors + 1))
    else
        ok "working directory clean"
    fi

    # 检查远端分支有新 commit（push 成功）
    # 先 fetch 确保远端引用最新
    git -C "$PROJECT_ROOT" fetch origin "$BRANCH_NAME" --quiet 2>/dev/null || true

    local remote_commit
    remote_commit=$(git -C "$PROJECT_ROOT" log "origin/${BRANCH_NAME}" -1 --oneline 2>/dev/null || true)

    if [[ -z "$remote_commit" ]]; then
        err "no commit found on origin/${BRANCH_NAME} — push may not have completed"
        errors=$((errors + 1))
    else
        ok "remote branch origin/${BRANCH_NAME} has commit: ${remote_commit}"

        # 额外检查：本地和远端是否同步
        local local_hash remote_hash
        local_hash=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "")
        remote_hash=$(git -C "$PROJECT_ROOT" rev-parse "origin/${BRANCH_NAME}" 2>/dev/null || echo "")
        if [[ -n "$local_hash" && -n "$remote_hash" ]]; then
            if [[ "$local_hash" == "$remote_hash" ]]; then
                ok "local HEAD matches origin/${BRANCH_NAME}"
            else
                warn "local HEAD (${local_hash:0:8}) differs from origin/${BRANCH_NAME} (${remote_hash:0:8})"
            fi
        fi
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 07 gate: clean workspace + push verified"
}

gate_stage_08() {
    # 全面 CI 验证：编译 + 测试 + lint，测试数 > 0 且 passed == total
    local errors=0
    local test_output=""

    local commands
    commands=$(parse_claude_md_commands)

    if [[ -z "$commands" ]]; then
        warn "No quality gate commands found in CLAUDE.md — skipping"
        pass "stage 08 gate: no commands configured (skipped)"
        return
    fi

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        local ctype="${entry%%:*}"
        local cmd="${entry#*:}"
        [[ -z "$cmd" ]] && continue

        info "Running ${ctype} command: ${cmd}"

        local output
        output=$(cd "$PROJECT_ROOT" && eval "$cmd" 2>&1) && rc=$? || rc=$?

        if [[ $rc -ne 0 ]]; then
            err "${ctype}: failed (exit ${rc})"
            echo "$output" | head -30 | while IFS= read -r line; do err "  $line"; done
            errors=$((errors + 1))
        else
            ok "${ctype}: passed"
        fi

        if [[ "$ctype" == "test" ]]; then
            test_output="$output"
        fi
    done <<< "$commands"

    # 严格验证测试结果：tests > 0 && passed == total
    if [[ -n "$test_output" ]]; then
        local parsed
        if parsed=$(parse_test_count "$test_output"); then
            info "Test count: ${parsed}"

            local total passed failed
            total=$(echo "$parsed" | grep -oE 'total=[0-9]+' | sed 's/total=//')
            passed=$(echo "$parsed" | grep -oE 'passed=[0-9]+' | sed 's/passed=//')
            failed=$(echo "$parsed" | grep -oE 'failed=[0-9]+' | sed 's/failed=//')

            if [[ "${total:-0}" -eq 0 ]]; then
                err "0 tests detected — tests did not actually run"
                errors=$((errors + 1))
            elif [[ "${failed:-0}" -gt 0 ]]; then
                err "${failed} test(s) failed (total=${total}, passed=${passed})"
                errors=$((errors + 1))
            else
                ok "all tests passed (${total} total, ${passed} passed, ${failed} failed)"
            fi
        else
            err "could not parse test output — cannot verify test results"
            err "first 10 lines of test output:"
            echo "$test_output" | head -10 | while IFS= read -r line; do err "  $line"; done
            errors=$((errors + 1))
        fi
    else
        err "no test command was executed"
        errors=$((errors + 1))
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 08 gate: CI verification passed (all tests passed)"
}

gate_stage_09() {
    # 部署验证：健康检查或 deploy_result.md
    local errors=0

    # 方式1：从 CLAUDE.md 解析健康检查 URL
    local health_url=""
    local claude_md="$PROJECT_ROOT/CLAUDE.md"
    if [[ -f "$claude_md" ]]; then
        # 匹配格式如 "健康检查: http://..." 或 "health check: http://..."
        health_url=$(grep -iE '(健康检查|health[[:space:]]*check)[[:space:]]*[:：][[:space:]]*https?://[^[:space:]]+' "$claude_md" | sed -E 's/.*[:：][[:space:]]*//' | head -1 || true)
    fi

    # 方式2：从环境变量获取
    if [[ -z "$health_url" ]]; then
        health_url="${HEALTH_CHECK_URL:-}"
    fi

    if [[ -n "$health_url" ]]; then
        info "Health check URL: ${health_url}"

        # 重试机制：最多 5 次，间隔递增
        local max_retries=5
        local delay=5
        local attempt=1
        local health_ok=0

        while [[ $attempt -le $max_retries ]]; do
            info "Health check attempt ${attempt}/${max_retries}..."

            local http_code
            http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 30 "$health_url" 2>/dev/null) && rc=$? || rc=$?

            if [[ $rc -eq 0 && "$http_code" == "200" ]]; then
                ok "health check returned 200"
                health_ok=1
                break
            else
                warn "health check returned HTTP ${http_code:-N/A} (curl exit ${rc})"
            fi

            if [[ $attempt -lt $max_retries ]]; then
                info "waiting ${delay}s before retry..."
                sleep "$delay"
                delay=$((delay * 2))
                # 最大等待 60s
                delay=$((delay > 60 ? 60 : delay))
            fi
            ((attempt++))
        done

        if [[ $health_ok -eq 0 ]]; then
            err "health check failed after ${max_retries} attempts"
            errors=$((errors + 1))
        fi
    else
        # 没有健康检查 URL → 检查 deploy_result.md
        info "No health check URL configured — checking deploy_result.md"

        local deploy_result=""

        # 在多个可能的位置查找
        local search_dirs=(
            "$PROJECT_ROOT/.xyz-harness"
            "$PROJECT_ROOT"
        )
        # 也搜索 .xyz-harness 的子目录
        if [[ -d "$PROJECT_ROOT/.xyz-harness" ]]; then
            while IFS= read -r d; do
                search_dirs+=("$d")
            done < <(find "$PROJECT_ROOT/.xyz-harness" -mindepth 1 -maxdepth 2 -type d 2>/dev/null)
        fi

        for d in "${search_dirs[@]}"; do
            local candidate="$d/changes/evidence/deploy_result.md"
            if [[ -f "$candidate" ]]; then
                deploy_result="$candidate"
                break
            fi
            # 也搜索不带 changes 子目录的位置
            candidate="$d/evidence/deploy_result.md"
            if [[ -f "$candidate" ]]; then
                deploy_result="$candidate"
                break
            fi
            candidate="$d/deploy_result.md"
            if [[ -f "$candidate" ]]; then
                deploy_result="$candidate"
                break
            fi
        done

        if [[ -z "$deploy_result" ]]; then
            err "deploy_result.md not found and no health check URL configured"
            err "either configure a health check URL in CLAUDE.md or set HEALTH_CHECK_URL env var"
            errors=$((errors + 1))
        elif [[ ! -s "$deploy_result" ]]; then
            err "deploy_result.md is empty: ${deploy_result}"
            errors=$((errors + 1))
        else
            # 检查包含"成功"关键词
            if grep -qiE '(成功|success|succeeded|deployed|healthy)' "$deploy_result"; then
                ok "deploy_result.md contains success indicator: ${deploy_result}"
            else
                err "deploy_result.md does not contain success keyword: ${deploy_result}"
                err "expected keywords: 成功, success, succeeded, deployed, healthy"
                errors=$((errors + 1))
            fi
        fi
    fi

    if [[ $errors -gt 0 ]]; then
        fail "${errors} check(s) failed"
    fi

    pass "stage 09 gate: deployment verified"
}

# ── 主分发逻辑 ────────────────────────────────────────────────────

info "=== L1 Gate Check: Stage ${STAGE} ==="
info "Project root: ${PROJECT_ROOT}"
info "Gate dir:     ${GATE_DIR}"

# 验证项目根目录
if [[ ! -d "$PROJECT_ROOT" ]]; then
    fail "project root does not exist: ${PROJECT_ROOT}"
fi

# 前置阶段检查（调用 pre-stage-check.sh）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/pre-stage-check.sh" ]]; then
    if ! "$SCRIPT_DIR/pre-stage-check.sh" "$STAGE" "$PROJECT_ROOT"; then
        fail "prerequisite stages not passed — cannot proceed"
    fi
fi

# 清理旧的 pass 文件（确保本次检查的 pass 文件是新鲜的）
rm -f "$GATE_DIR/stage-$(printf '%02d' "$STAGE").pass"

case "$STAGE" in
    01) gate_stage_01 ;;
    02) gate_stage_02 ;;
    03) gate_stage_03 ;;
    05) gate_stage_05 ;;
    07) gate_stage_07 ;;
    08) gate_stage_08 ;;
    09) gate_stage_09 ;;
    *)
        fail "unknown stage '${STAGE}'. expected: 01, 02, 03, 05, 07, 08, 09"
        ;;
esac
