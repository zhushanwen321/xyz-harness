#!/usr/bin/env python3
"""xyz-harness-engineering 安装脚本。

同时安装 skills 和 agents：
- 扫描 skills/ 下 xyz-harness- 前缀的 skill，symlink 到 ~/.pi/agent/skills/ 和 ~/.agents/skills/
- 扫描 agents/ 下 harness- 前缀的 agent，symlink 到 ~/.pi/agent/agents/ 和 ~/.agents/agents/
- 清理旧版不带前缀的同名 skill/agent
"""

import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------

SCRIPT_ROOT = Path(__file__).resolve().parent
SKILLS_DIR = SCRIPT_ROOT / "skills"
AGENTS_DIR = SCRIPT_ROOT / "agents"
PREFIX = "xyz-harness-"
AGENT_PREFIX = "harness-"
# 非 xyz-harness- 前缀但属于本项目的 skill
EXTRA_SKILLS = {"chrome-automation", "vision-analysis", "zcommit", "create-worktree", "merge-worktree"}

# 旧版 skill 清理映射：目标目录 → 需要清理的 skill 名称列表
CLEANUP_MAP: dict[str, list[str]] = {
    "~/.pi/agent/skills": ["dev-flow"],
    "~/.agents/skills": [
        "brainstorming",
        "writing-plans",
        "subagent-driven-development",
        "verification-before-completion",
        "test-driven-development",
    ],
}

# symlink 安装目标目录
INSTALL_TARGETS = [
    Path("~/.pi/agent/skills"),
    Path("~/.agents/skills"),
]

# agent symlink 安装目标目录
AGENT_INSTALL_TARGETS = [
    Path("~/.pi/agent/agents"),
    Path("~/.agents/agents"),
]

# ---------------------------------------------------------------------------
# 终端颜色
# ---------------------------------------------------------------------------

_USE_COLOR = sys.stdout.isatty()

if _USE_COLOR:

    def _c(code: int) -> str:
        return f"\033[{code}m"

    C_GREEN = _c(32)
    C_YELLOW = _c(33)
    C_RED = _c(31)
    C_CYAN = _c(36)
    C_BOLD = _c(1)
    C_RESET = _c(0)
else:
    C_GREEN = C_YELLOW = C_RED = C_CYAN = C_BOLD = C_RESET = ""


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def expand(p: Path) -> Path:
    return p.expanduser().resolve()


def ensure_dir(p: Path) -> None:
    p = expand(p)
    p.mkdir(parents=True, exist_ok=True)


def is_valid_symlink(p: Path) -> bool:
    """symlink 存在且目标可访问"""
    return p.is_symlink() and p.resolve().exists()


def symlink_target(p: Path) -> Path | None:
    if p.is_symlink():
        return os.readlink(p)
    return None


def create_symlink(link: Path, target: Path) -> None:
    """创建 symlink，已存在则先删除"""
    link = expand(link)
    target = Path(target)  # 保持相对/绝对原样
    if link.exists() or link.is_symlink():
        link.unlink()
    link.symlink_to(target)


# ---------------------------------------------------------------------------
# 主逻辑
# ---------------------------------------------------------------------------

def discover_skills() -> list[Path]:
    """返回 skills/ 下所有属于本项目的目录，按名称排序"""
    if not SKILLS_DIR.is_dir():
        print(f"{C_RED}错误: skills 目录不存在: {SKILLS_DIR}{C_RESET}")
        sys.exit(1)
    return sorted(
        p for p in SKILLS_DIR.iterdir()
        if p.is_dir() and (p.name.startswith(PREFIX) or p.name in EXTRA_SKILLS)
    )


def discover_agents() -> list[Path]:
    """返回 agents/ 下所有 AGENT_PREFIX 前缀的目录，按名称排序"""
    if not AGENTS_DIR.is_dir():
        print(f"{C_YELLOW}警告: agents 目录不存在: {AGENTS_DIR}，跳过 agent 安装{C_RESET}")
        return []
    return sorted(
        p for p in AGENTS_DIR.iterdir()
        if p.is_dir() and p.name.startswith(AGENT_PREFIX)
    )


def install_one_skill(skill_dir: Path, target_base: Path) -> str:
    """安装单个 skill symlink，返回状态: 'new' / 'updated' / 'skipped'"""
    name = skill_dir.name
    link_path = expand(target_base) / name
    resolved_src = skill_dir.resolve()

    # 源目录不存在（理论上不会发生，但防御性检查）
    if not resolved_src.is_dir():
        print(f"  {C_RED}错误: 源目录不存在: {resolved_src}{C_RESET}")
        sys.exit(1)

    ensure_dir(target_base)

    # 正确指向同一源 → 跳过
    if is_valid_symlink(link_path) and link_path.resolve() == resolved_src:
        return "skipped"

    # 指向不同源，或不是 symlink，或 symlink 已损坏 → (重新)创建
    prev = symlink_target(link_path)
    create_symlink(link_path, skill_dir)
    return "updated" if prev is not None else "new"


def cleanup_old_skills() -> tuple[int, int]:
    """清理旧版 skill，返回 (已删除数, 不存在数)"""
    removed = 0
    not_found = 0

    for base_str, names in CLEANUP_MAP.items():
        base = expand(Path(base_str))
        for name in names:
            link_path = base / name
            if link_path.is_symlink():
                link_path.unlink()
                print(f"  {C_YELLOW}已清理旧版: {link_path}{C_RESET}")
                removed += 1
            elif link_path.exists():
                # 存在但不是 symlink — 不自动删除真实目录，提示用户
                print(f"  {C_RED}警告: {link_path} 是真实目录，未自动删除{C_RESET}")
                not_found += 1
            else:
                not_found += 1

    return removed, not_found


def main() -> None:
    skills = discover_skills()
    agents = discover_agents()

    if not skills and not agents:
        print(f"{C_YELLOW}未找到 {PREFIX}* skill 目录和 {AGENT_PREFIX}* agent 目录{C_RESET}")
        sys.exit(0)

    total_new = 0
    total_updated = 0
    total_skipped = 0

    # ---- 安装 skills ----
    if skills:
        print(f"{C_BOLD}=== 安装 xyz-harness skills ==={C_RESET}\n")

        for skill_dir in skills:
            name = skill_dir.name
            print(f"{C_CYAN}{name}{C_RESET}")
            for target_base in INSTALL_TARGETS:
                status = install_one_skill(skill_dir, target_base)
                label = target_base.expanduser()
                if status == "new":
                    total_new += 1
                    print(f"  {C_GREEN}+ 新增 → {label}{C_RESET}")
                elif status == "updated":
                    total_updated += 1
                    print(f"  {C_YELLOW}↻ 更新 → {label}{C_RESET}")
                else:
                    total_skipped += 1
                    print(f"  = 跳过 → {label}")

    # ---- 安装 agents ----
    if agents:
        print(f"\n{C_BOLD}=== 安装 harness agents ==={C_RESET}\n")

        for agent_dir in agents:
            name = agent_dir.name
            print(f"{C_CYAN}{name}{C_RESET}")
            for target_base in AGENT_INSTALL_TARGETS:
                status = install_one_skill(agent_dir, target_base)
                label = target_base.expanduser()
                if status == "new":
                    total_new += 1
                    print(f"  {C_GREEN}+ 新增 → {label}{C_RESET}")
                elif status == "updated":
                    total_updated += 1
                    print(f"  {C_YELLOW}↻ 更新 → {label}{C_RESET}")
                else:
                    total_skipped += 1
                    print(f"  = 跳过 → {label}")

    # ---- 清理旧版 ----
    print(f"\n{C_BOLD}=== 清理旧版 skill ==={C_RESET}\n")
    cleaned, not_found = cleanup_old_skills()

    # ---- 汇总 ----
    print(f"\n{C_BOLD}=== 汇总 ==={C_RESET}")
    print(f"  新增: {C_GREEN}{total_new}{C_RESET}  "
          f"更新: {C_YELLOW}{total_updated}{C_RESET}  "
          f"跳过: {total_skipped}  "
          f"清理旧版: {C_YELLOW}{cleaned}{C_RESET}")

    if total_new + total_updated + cleaned > 0:
        print(f"\n{C_GREEN}完成!{C_RESET}")
    else:
        print(f"\n所有 skill 均已是最新。")


if __name__ == "__main__":
    main()
