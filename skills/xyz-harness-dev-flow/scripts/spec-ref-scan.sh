#!/bin/bash
# spec-ref-scan.sh — Spec 引用完整性扫描
# 在阶段①完成后运行，验证 spec 中提到的代码引用是否完整。
#
# 调用方式：
#   spec-ref-scan.sh <project_root> <spec_path>
#
# 工作原理：
#   1. 从 spec.md 中提取「受影响文件」和「引用计数」部分
#   2. 对 spec 中提到的每个标识符（函数名、字段名、import 路径）做全量 grep
#   3. 比较 spec 列出的文件 vs grep 实际找到的文件
#   4. 输出遗漏的文件列表
#
# 退出码：0=引用完整或有仅警告，1=有遗漏（MUST FIX 级别）

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    C_RED='\033[0;31m' C_GREEN='\033[0;32m' C_YELLOW='\033[0;33m' C_BOLD='\033[1m' C_RESET='\033[0m'
else
    C_RED='' C_GREEN='' C_YELLOW='' C_BOLD='' C_RESET=''
fi
info()  { echo -e "${C_BOLD}[SCAN]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[OK]${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[MISS]${C_RESET} $*"; }

PROJECT_ROOT="$1"
SPEC_PATH="$2"

if [[ ! -f "$SPEC_PATH" ]]; then
    err "spec file not found: $SPEC_PATH"
    exit 1
fi

if [[ ! -d "$PROJECT_ROOT" ]]; then
    err "project root not found: $PROJECT_ROOT"
    exit 1
fi

TOTAL_ISSUES=0

# ── 扫描 1：从 spec 中提取标识符并 grep ──────────────────────────
# 匹配模式：反引号包裹的代码标识符（如 `ctx.sessionId`、`detectClientAgentType`）
# 排除 markdown 标题、列表标记等

info "=== Spec Reference Scan ==="
info "Spec: $SPEC_PATH"
info "Root: $PROJECT_ROOT"
echo ""

# 提取 spec 中的代码标识符
# 格式：`identifier` 或 ``identifier``
# 过滤掉太短的（<=2 字符）和 markdown 结构词
IDENTIFIERS=$(grep -oP '`(\w[\w.:#\-\[\]<>]+)`' "$SPEC_PATH" \
    | sed "s/\`//g" \
    | sort -u \
    | grep -vE '^.{0,2}$' \
    | grep -vE '^(true|false|null|undefined|void|string|number|boolean|any|object|Array|Map|Set|Record|Promise|async|await|return|import|export|const|let|var|function|class|interface|type|if|else|for|while|switch|case|break|continue|try|catch|throw|new|this|super|extends|implements|default|static|readonly|private|public|protected|abstract|override|enum|namespace|module|require|from|as|in|of|keyof|typeof|instanceof|never|unknown)$' \
    || true)

if [[ -z "$IDENTIFIERS" ]]; then
    warn "no code identifiers found in spec"
    exit 0
fi

info "Found $(echo "$IDENTIFIERS" | wc -l | tr -d ' ') unique identifiers in spec"
echo ""

# 源码目录（排除 node_modules、.git、dist、build、coverage）
SCAN_DIRS=$(find "$PROJECT_ROOT" -type d \( -name node_modules -o -name .git -o -name dist -o -name build -o -name coverage -o -name .xyz-harness -o -name .superpowers \) -prune -o -type d -print 2>/dev/null | head -200)

# 对每个标识符做 grep 扫描
while IFS= read -r identifier; do
    [[ -z "$identifier" ]] && continue

    # 只扫描看起来像是代码引用的标识符（包含 . 或是驼峰命名或含 _）
    # 跳过纯自然语言词
    if [[ ! "$identifier" =~ [._] ]] && [[ ! "$identifier" =~ [A-Z] ]] && [[ ${#identifier} -lt 4 ]]; then
        continue
    fi

    # 检查 spec 中是否提到了这个标识符的文件列表
    # 尝试从 spec 中找到该标识符附近的文件列表
    SPEC_FILES=$(grep -B2 -A20 "$identifier" "$SPEC_PATH" \
        | grep -oP '[\w/]+\.(ts|tsx|js|jsx|vue|py|rs|go|java|sql)' \
        | sort -u \
        || true)

    # 在代码库中 grep 这个标识符
    ACTUAL_FILES=$(grep -rl "$identifier" \
        --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
        --include='*.vue' --include='*.py' --include='*.rs' --include='*.go' \
        --include='*.java' --include='*.sql' \
        "$PROJECT_ROOT" 2>/dev/null \
        | grep -v node_modules \
        | grep -v '\.git/' \
        | grep -v '/dist/' \
        | grep -v '/build/' \
        | grep -v '/coverage/' \
        | grep -v '/.xyz-harness/' \
        | grep -v '/.superpowers/' \
        | sed "s|^$PROJECT_ROOT/||" \
        | sort -u \
        || true)

    # 比较差异
    if [[ -z "$ACTUAL_FILES" ]]; then
        # spec 中提到了但代码中找不到——可能是新功能（正常）
        continue
    fi

    # 找出 spec 中没提到但实际存在的文件
    if [[ -n "$SPEC_FILES" ]]; then
        MISSING=$(comm -23 <(echo "$ACTUAL_FILES") <(echo "$SPEC_FILES") || true)
        if [[ -n "$MISSING" ]]; then
            MISSING_COUNT=$(echo "$MISSING" | wc -l | tr -d ' ')
            if [[ $MISSING_COUNT -le 10 ]]; then
                # 只报告看起来是实际引用的文件（grep 有上下文匹配的噪音）
                # 过滤：文件内容确实包含该标识符（而非子串匹配）
                CONFIRMED_MISSING=""
                while IFS= read -r mf; do
                    [[ -z "$mf" ]] && continue
                    # 精确匹配检查：标识符是否作为完整单词出现
                    if grep -qwE "$(echo "$identifier" | sed 's/\./\\./g')" "$PROJECT_ROOT/$mf" 2>/dev/null; then
                        CONFIRMED_MISSING="$CONFIRMED_MISSING
$mf"
                    fi
                done <<< "$MISSING"

                if [[ -n "$CONFIRMED_MISSING" ]]; then
                    CONFIRMED_COUNT=$(echo "$CONFIRMED_MISSING" | grep -c . || true)
                    if [[ $CONFIRMED_COUNT -gt 0 ]]; then
                        err "$identifier: $CONFIRMED_COUNT file(s) not listed in spec:"
                        echo "$CONFIRMED_MISSING" | while IFS= read -r f; do
                            [[ -z "$f" ]] && continue
                            err "  - $f"
                        done
                        TOTAL_ISSUES=$((TOTAL_ISSUES + CONFIRMED_COUNT))
                    fi
                fi
            fi
        fi
    fi
done <<< "$IDENTIFIERS"

# ── 扫描 2：检查 spec 中提到的文件是否存在 ─────────────────────────

info ""
info "Checking spec-mentioned files exist..."

# 提取 spec 中提到的所有文件路径
SPEC_ALL_FILES=$(grep -oP '(?:src|lib|app|test|tests|router|frontend|core|scripts)/[\w/\-\.]+\.(ts|tsx|js|jsx|vue|py|rs|go|java|sql|json|yaml|yml)' "$SPEC_PATH" | sort -u || true)

while IFS= read -r sf; do
    [[ -z "$sf" ]] && continue
    if [[ ! -f "$PROJECT_ROOT/$sf" ]]; then
        warn "spec mentions file that does not exist: $sf"
    fi
done <<< "$SPEC_ALL_FILES"

# ── 扫描 3：检查移除类操作的残留 ──────────────────────────────────
# 如果 spec 说了"移除 xxx"，检查是否还有残留

info ""
info "Checking removal completeness..."

# 从 spec 中提取移除指令
# 匹配：移除、删除、delete、remove 后面的标识符
REMOVALS=$(grep -iP '(移除|删除|remove|delete)\s+(?:了|掉|的)?\s*`?(\w[\w.:#]+)`?' "$SPEC_PATH" \
    | grep -oP '(?<=移除|删除|remove|delete)\s+(?:了|掉|的)?\s*`?\K\w[\w.:#]+' \
    | sort -u \
    || true)

while IFS= read -r removed; do
    [[ -z "$removed" ]] && continue
    REMAINING=$(grep -rl "$removed" \
        --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
        --include='*.vue' \
        "$PROJECT_ROOT/src" "$PROJECT_ROOT/router/src" "$PROJECT_ROOT/frontend/src" 2>/dev/null \
        | grep -v node_modules \
        | grep -v '\.d\.ts' \
        | sed "s|^$PROJECT_ROOT/||" \
        | sort -u \
        || true)
    if [[ -n "$REMAINING" ]]; then
        REMAINING_COUNT=$(echo "$REMAINING" | wc -l | tr -d ' ')
        err "'$removed' marked for removal but still referenced in $REMAINING_COUNT file(s):"
        echo "$REMAINING" | while IFS= read -r f; do
            err "  - $f"
        done
        TOTAL_ISSUES=$((TOTAL_ISSUES + REMAINING_COUNT))
    fi
done <<< "$REMOVALS"

# ── 结果 ──────────────────────────────────────────────────────────
echo ""
if [[ $TOTAL_ISSUES -gt 0 ]]; then
    err "=== $TOTAL_ISSUES issue(s) found ==="
    err "Fix these before proceeding to plan review (stage 2)"
    exit 1
else
    ok "=== All references verified ==="
    exit 0
fi
