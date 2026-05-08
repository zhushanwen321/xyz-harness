#!/bin/bash
# install-to-project.sh — 一键将 xyz-harness 安装到任意项目（零交互）
#
# 用法:
#   ./install-to-project.sh [项目路径]
#
# 如果省略项目路径,默认使用当前目录。

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_BOLD='\033[1m'; C_GREEN='\033[0;32m'; C_YELLOW='\033[0;33m'
    C_RED='\033[0;31m'; C_CYAN='\033[0;36m'; C_RESET='\033[0m'
else
    C_BOLD='' C_GREEN='' C_YELLOW='' C_RED='' C_CYAN='' C_RESET=''
fi

info()  { echo -e "${C_BOLD}[INFO]${C_RESET} $*"; }
ok()    { echo -e "${C_GREEN}[ OK ]${C_RESET} $*"; }
warn()  { echo -e "${C_YELLOW}[WARN]${C_RESET} $*"; }
err()   { echo -e "${C_RED}[FAIL]${C_RESET} $*"; }

# ── 参数解析 ────────────────────────────────────────────────────
PROJECT_PATH="${1:-$(pwd)}"
PROJECT_PATH="$(cd "$PROJECT_PATH" 2>/dev/null && pwd || echo "")"

if [[ -z "$PROJECT_PATH" ]]; then
    err "项目路径不存在: $1"
    exit 1
fi

# harness 仓库根目录
HARNESS_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HARNESS_ROOT/skills"
AGENTS_SRC="$HARNESS_ROOT/agents"
INSTALL_PY="$HARNESS_ROOT/install.py"

if [[ ! -d "$SKILLS_DIR" ]]; then
    err "harness skills 目录不存在: $SKILLS_DIR"
    exit 1
fi
if [[ ! -f "$INSTALL_PY" ]]; then
    err "install.py 不存在: $INSTALL_PY"
    exit 1
fi

PREFIX="xyz-harness-"

# ── 横幅 ─────────────────────────────────────────────────────────
echo ""
echo -e "${C_BOLD}${C_CYAN}╔══════════════════════════════════════════════════╗${C_RESET}"
echo -e "${C_BOLD}${C_CYAN}║${C_RESET}  ${C_BOLD}xyz-harness-engineering 一键安装${C_RESET}              ${C_BOLD}${C_CYAN}║${C_RESET}"
echo -e "${C_BOLD}${C_CYAN}╚══════════════════════════════════════════════════╝${C_RESET}"
echo ""
info "Harness 仓库: ${HARNESS_ROOT}"
info "目标项目:     ${PROJECT_PATH}"
echo ""

# ── Step 1: 全局 skill + agent 安装 ─────────────────────────────
info "Step 1/2: 全局 skill + agent 安装 ..."
echo ""

if ! python3 "$INSTALL_PY"; then
    err "install.py 执行失败"
    exit 1
fi
echo ""

# ── Step 2: 项目本地 symlink ────────────────────────────────────
info "Step 2/2: 项目本地 symlink (skills + agents) ..."

PI_SKILLS="$PROJECT_PATH/.pi/skills"
CLAUDE_SKILLS="$PROJECT_PATH/.claude/skills"
AGENTS_SKILLS_DIR="$PROJECT_PATH/.agents/skills"

PI_AGENTS="$PROJECT_PATH/.pi/agents"
CLAUDE_AGENTS="$PROJECT_PATH/.claude/agents"
AGENTS_AGENTS_DIR="$PROJECT_PATH/.agents/agents"

project_new=0
project_updated=0
project_skipped=0

# 通用 symlink 安装函数
make_symlinks() {
    local src_dir="$1"
    local target_dir="$2"
    local prefix="$3"
    local label="$4"

    mkdir -p "$target_dir"

    for src_item in "$src_dir"/*/; do
        local name
        name="$(basename "$src_item")"
        if [[ ! "$name" =~ ^$prefix ]]; then
            continue
        fi

        local link="$target_dir/$name"
        local src
        src="$(cd "$src_item" && pwd)"

        if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "$src" ]]; then
            ((project_skipped++))
            continue
        fi

        if [[ -L "$link" ]] || [[ -e "$link" ]]; then
            rm -rf "$link"
            ((project_updated++))
        else
            ((project_new++))
        fi

        ln -s "$src" "$link"
    done
    ok "  ${label}"
}

make_symlinks "$SKILLS_DIR" "$PI_SKILLS" "$PREFIX" ".pi/skills/"
make_symlinks "$SKILLS_DIR" "$CLAUDE_SKILLS" "$PREFIX" ".claude/skills/"
make_symlinks "$SKILLS_DIR" "$AGENTS_SKILLS_DIR" "$PREFIX" ".agents/skills/"

if [[ -d "$AGENTS_SRC" ]]; then
    make_symlinks "$AGENTS_SRC" "$PI_AGENTS" "harness-" ".pi/agents/"
    make_symlinks "$AGENTS_SRC" "$CLAUDE_AGENTS" "harness-" ".claude/agents/"
    make_symlinks "$AGENTS_SRC" "$AGENTS_AGENTS_DIR" "harness-" ".agents/agents/"
fi
echo ""

# ── Step 3: CLAUDE.md 状态报告 ─────────────────────────────────
info "目标项目 CLAUDE.md 状态:"
echo ""

CLAUDE_MD="$PROJECT_PATH/CLAUDE.md"
missing_count=0

if [[ -f "$CLAUDE_MD" ]]; then
    # 质量门禁
    if grep -qP '##\s*质量门禁' "$CLAUDE_MD" 2>/dev/null; then
        ok "质量门禁 ✓"
    else
        warn "质量门禁 ✗ (gate 脚本将跳过所有检查)"
        ((missing_count++))
    fi
    # 项目背景
    if grep -qP '##\s*项目背景' "$CLAUDE_MD" 2>/dev/null; then
        ok "项目背景 ✓"
    else
        warn "项目背景 ✗"
        ((missing_count++))
    fi
    # 架构约束
    if grep -qP '##\s*架构约束' "$CLAUDE_MD" 2>/dev/null; then
        ok "架构约束 ✓"
    else
        warn "架构约束 ✗"
        ((missing_count++))
    fi
    # 编码规范
    if grep -qP '##\s*编码规范' "$CLAUDE_MD" 2>/dev/null; then
        ok "编码规范 ✓"
    else
        warn "编码规范 ✗"
        ((missing_count++))
    fi

    if [[ $missing_count -eq 0 ]]; then
        ok "CLAUDE.md 所有必需章节完整!"
    fi
else
    warn "目标项目没有 CLAUDE.md"
    cp "$HARNESS_ROOT/skills/xyz-harness-dev-flow/references/claude-md-template.md" "$CLAUDE_MD"
    ok "模板已复制: ${CLAUDE_MD}"
fi

# ── 汇总 ─────────────────────────────────────────────────────────
echo ""
echo -e "${C_BOLD}${C_GREEN}╔══════════════════════════════════════════════════╗${C_RESET}"
echo -e "${C_BOLD}${C_GREEN}║${C_RESET}  ${C_BOLD}安装完成!${C_RESET}                                  ${C_BOLD}${C_GREEN}║${C_RESET}"
echo -e "${C_BOLD}${C_GREEN}╚══════════════════════════════════════════════════╝${C_RESET}"
echo ""
info "项目本地 symlink: 新增 ${project_new}, 更新 ${project_updated}, 跳过 ${project_skipped}"
echo ""

echo "下一步:"
echo "  1. 在 pi 中打开目标项目: cd ${PROJECT_PATH}"
if [[ $missing_count -gt 0 ]] || [[ ! -f "$CLAUDE_MD" ]]; then
    echo "  2. 初始化项目 CLAUDE.md: 输入 "初始化项目" 或 "init harness""
else
    echo "  2. CLAUDE.md 已就绪"
fi
echo "  3. 开始需求开发: 输入 "开发需求 xxx""
echo ""
