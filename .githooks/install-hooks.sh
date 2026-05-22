#!/usr/bin/env bash
# .githooks/install-hooks.sh — 安装 git hooks，兼容 bare repo + worktree
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# 检测 git 目录（兼容 bare repo worktree）
GIT_DIR=$(git rev-parse --git-dir)
if [ -f "$GIT_DIR" ]; then
  GIT_DIR=$(cat "$GIT_DIR" | sed 's/gitdir: //')
fi
HOOKS_DIR="$GIT_DIR/hooks"
mkdir -p "$HOOKS_DIR"

echo "安装 git hooks 到 $HOOKS_DIR ..."

cat > "$HOOKS_DIR/pre-commit" << 'HOOK_EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Pre-commit — 代码规范检查..."

if [ "${SKIP_ALL_CHECKS:-0}" = "1" ]; then
  echo "⚠ 跳过所有检查 (SKIP_ALL_CHECKS=1)"
  exit 0
fi

exit_code=0

# === ESLint ===
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|mjs)$' || true)
if [ -n "$STAGED" ] && [ "${SKIP_ESLINT:-0}" != "1" ]; then
  echo "  ESLint (增量)..."

  # 先修复再检查
  echo "$STAGED" | xargs npx eslint --fix 2>/dev/null || true
  echo "$STAGED" | xargs npx eslint || {
    echo "❌ ESLint 失败，请修复后重新提交"
    echo "  提示: SKIP_ESLINT=1 git commit 可跳过检查（不推荐）"
    exit_code=2
  }

  # 暂存 eslint --fix 后的文件
  echo "$STAGED" | xargs git add 2>/dev/null || true
fi

# === TypeScript ===
if [ -n "$STAGED" ] && [ "${SKIP_TYPECHECK:-0}" != "1" ]; then
  echo "  TypeScript (tsc --noEmit)..."
  npx tsc --noEmit || {
    echo "❌ TypeScript 类型检查失败"
    exit_code=2
  }
fi

if [ $exit_code -eq 0 ]; then
  echo "✅ Pre-commit 检查通过"
fi
exit $exit_code
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ pre-commit hook 已安装"

echo ""
echo "hooks 安装完成。执行 'git commit' 时自动触发检查。"
echo "跳过: SKIP_ESLINT=1 git commit (只跳过 ESLint)"
echo "      SKIP_ALL_CHECKS=1 git commit (全部跳过)"
