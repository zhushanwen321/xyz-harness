#!/bin/bash
# install-to-project.sh — 一键将 xyz-harness 安装到任意项目
#
# 用法:
#   ./install-to-project.sh [项目路径]
#
# 如果省略项目路径,默认使用当前目录。
#
# 做的事情:
#   1. 全局安装: 运行 install.py, symlink skills 到 ~/.pi/agent/skills/ 和 ~/.agents/skills/
#   2. 项目本地安装: 在目标项目的 .pi/skills/ 和 .claude/skills/ 中创建 symlink
#   3. 检查 CLAUDE.md 是否存在,询问是否运行 xyz-harness-init
#   4. 汇总安装结果

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_BOLD='\033[1m'
    C_GREEN='\033[0;32m'
    C_YELLOW='\033[0;33m'
    C_RED='\033[0;31m'
    C_CYAN='\033[0;36m'
    C_RESET='\033[0m'
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

# harness 仓库根目录 (此脚本所在目录)
HARNESS_ROOT="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HARNESS_ROOT/skills"
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

# ── 确认 ─────────────────────────────────────────────────────────
echo -ne "${C_YELLOW}将为以下项目安装 xyz-harness:${C_RESET}\n  ${PROJECT_PATH}\n\n${C_YELLOW}继续? (Y/n) ${C_RESET}"
read -r answer
if [[ ! "$answer" =~ ^([yY]|[yY][eE][sS]|'')$ ]]; then
    info "已取消"
    exit 0
fi
echo ""

# ── Step 1: 全局安装 (运行 install.py) ─────────────────────────
info "Step 1/3: 全局 skill 安装 (install.py) ..."
echo ""

if ! python3 "$INSTALL_PY"; then
    err "install.py 执行失败"
    exit 1
fi
echo ""

# ── Step 2: 项目本地 symlink ────────────────────────────────────
info "Step 2/3: 项目本地 symlink (skills + agents) ..."

PI_SKILLS="$PROJECT_PATH/.pi/skills"
CLAUDE_SKILLS="$PROJECT_PATH/.claude/skills"
AGENTS_SKILLS_DIR="$PROJECT_PATH/.agents/skills"

# agent 目录
PI_AGENTS="$PROJECT_PATH/.pi/agents"
CLAUDE_AGENTS="$PROJECT_PATH/.claude/agents"
AGENTS_AGENTS_DIR="$PROJECT_PATH/.agents/agents"

project_new=0
project_updated=0
project_skipped=0

install_to_dir() {
    local target_dir="$1"
    local label="$2"

    mkdir -p "$target_dir"

    for skill_dir in "$SKILLS_DIR"/*/; do
        local name
        name="$(basename "$skill_dir")"
        if [[ ! "$name" =~ ^$PREFIX ]]; then
            continue
        fi

        local link="$target_dir/$name"
        local src
        src="$(cd "$skill_dir" && pwd)"

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
    ok "项目本地 symlink: ${label}"
}

install_to_dir "$PI_SKILLS" ".pi/skills/"
install_to_dir "$CLAUDE_SKILLS" ".claude/skills/"
install_to_dir "$AGENTS_SKILLS_DIR" ".agents/skills/"

# ── 安装项目本地 agents ──
AGENTS_SRC="$HARNESS_ROOT/agents"
if [[ -d "$AGENTS_SRC" ]]; then
    install_agents_to_dir() {
        local target_dir="$1"
        local label="$2"
        mkdir -p "$target_dir"
        for agent_dir in "$AGENTS_SRC"/*/; do
            local name
            name="$(basename "$agent_dir")"
            if [[ ! "$name" =~ ^harness- ]]; then
                continue
            fi
            local link="$target_dir/$name"
            local src
            src="$(cd "$agent_dir" && pwd)"
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
        ok "项目本地 agents: ${label}"
    }
    install_agents_to_dir "$PI_AGENTS" ".pi/agents/"
    install_agents_to_dir "$CLAUDE_AGENTS" ".claude/agents/"
    install_agents_to_dir "$AGENTS_AGENTS_DIR" ".agents/agents/"
fi
echo ""

# ── Step 3: CLAUDE.md 检查 ─────────────────────────────────────
info "Step 3/3: 目标项目 CLAUDE.md 检查 ..."

CLAUDE_MD="$PROJECT_PATH/CLAUDE.md"

if [[ -f "$CLAUDE_MD" ]]; then
    # 检查关键章节是否完整
    local missing=0

    echo ""
    info "CLAUDE.md 已存在,检查必需章节..."
    echo ""

    # 质量门禁 —— 最关键
    if grep -qP '##\s*质量门禁' "$CLAUDE_MD" 2>/dev/null; then
        ok "质量门禁 ✓"
    else
        warn "质量门禁 ✗ (gate 脚本将跳过所有检查)"
        missing=1
    fi

    # 项目背景
    if grep -qP '##\s*项目背景' "$CLAUDE_MD" 2>/dev/null; then
        ok "项目背景 ✓"
    else
        warn "项目背景 ✗ (AI 不理解项目上下文)"
        missing=1
    fi

    # 架构约束
    if grep -qP '##\s*架构约束' "$CLAUDE_MD" 2>/dev/null; then
        ok "架构约束 ✓"
    else
        warn "架构约束 ✗"
        missing=1
    fi

    # 编码规范
    if grep -qP '##\s*编码规范' "$CLAUDE_MD" 2>/dev/null; then
        ok "编码规范 ✓"
    else
        warn "编码规范 ✗"
        missing=1
    fi

    echo ""

    if [[ $missing -eq 1 ]]; then
        echo -ne "${C_YELLOW}CLAUDE.md 缺少部分必需章节。建议运行 xyz-harness-init 补全。${C_RESET}\n${C_YELLOW}是否现在初始化? (Y/n) ${C_RESET}"
        read -r answer
        if [[ "$answer" =~ ^([yY]|[yY][eE][sS]|'')$ ]]; then
            echo ""
            info "要运行 xyz-harness-init, 请在 pi 中打开目标项目并输入 "初始化项目" 或 "init harness""
        fi
    else
        ok "CLAUDE.md 所有必需章节完整!"
    fi
else
    warn "目标项目没有 CLAUDE.md"
    echo ""
    echo -ne "${C_YELLOW}是否将模板复制到项目? (Y/n) ${C_RESET}"
    read -r answer
    if [[ "$answer" =~ ^([yY]|[yY][eE][sS]|'')$ ]]; then
        cp "$HARNESS_ROOT/skills/xyz-harness-dev-flow/references/claude-md-template.md" "$CLAUDE_MD"
        ok "模板已复制: ${CLAUDE_MD}"
        echo ""
        info "请编辑 CLAUDE.md 填写项目信息,或在 pi 中输入 "初始化项目" 让 AI 引导填写。"
    fi
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
echo "  2. (可选) 完善 CLAUDE.md: 输入 "初始化项目" 或 "init harness""
echo "  3. 开始需求开发: 输入 "开发需求 xxx""
echo ""

# 检查项目是否已 git 初始化
if git -C "$PROJECT_PATH" rev-parse --git-dir &>/dev/null; then
    info "项目已是 git 仓库。建议将 CLAUDE.md 提交到仓库:"
    echo "    git add CLAUDE.md && git commit -m 'chore: add harness CLAUDE.md'"
else
    info "项目还不是 git 仓库。建议先 git init 并提交 CLAUDE.md。"
fi
echo ""
