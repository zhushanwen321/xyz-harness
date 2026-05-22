# 实施模板

本文件包含所有防护层的配置模板和代码骨架。按需读取对应章节。

## 目录

1. [Ruff 配置（Python）](#ruff-配置python)
2. [Pyright 配置（Python）](#pyright-配置python)
3. [ESLint 配置（TS/Vue）](#eslint-配置tsvue)
4. [taste-lint 规则选择](#taste-lint-规则选择)
5. [Git Hooks 模板](#git-hooks-模板)
6. [AI Hooks 模板](#ai-hooks-模板)
7. [Vue 模板规范检查](#vue-模板规范检查)
8. [CI 模板](#ci-模板)
9. [自定义规则骨架](#自定义规则骨架)

---

## Ruff 配置（Python）

Ruff 替代 flake8 + isort + black，lint + format 二合一。

### pyproject.toml

```toml
[tool.ruff]
line-length = 150
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "TID"]

[tool.ruff.lint.flake8-tidy-imports]
# 封死废弃模块路径，防止新增代码引入旧结构
banned-module-level-imports = []

[tool.ruff.lint.per-file-ignores]
# Alembic 需要导入所有模型，豁免 F401
"model/__init__.py" = ["F401"]
```

**规则集说明**：`E`(错误) `F`(pyflakes) `I`(import 排序) `N`(命名) `W`(警告) `UP`(升级语法) `TID`(tidy imports)

**line-length 150**：给 AI 生成的代码留足空间，减少无意义换行。

---

## Pyright 配置（Python）

### pyrightconfig.json

```json
{
  "typeCheckingMode": "standard",
  "pythonVersion": "3.12",
  "exclude": ["tests/", "alembic/", "scripts/"]
}
```

pre-commit 中用 `--level error` 只拦截错误，警告不阻塞提交。CI 中用默认级别（含警告）。

---

## ESLint 配置（TS/Vue）

### 基础 eslint.config.mjs

```javascript
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

### 引用 taste-lint

```javascript
import tseslint from 'typescript-eslint';
import { baseConfig } from './taste-lint/base.mjs';
import { vueConfig } from './taste-lint/vue.mjs';

export default tseslint.config(
  ...tseslint.configs.strict,
  ...baseConfig,
  ...vueConfig,  // Vue 项目才需要
);
```

---

## taste-lint 规则选择

taste-lint 是跨项目可复用的自定义 ESLint 规则框架。目录结构：

```
taste-lint/
├── base.mjs           # 通用 TS 规则
├── vue.mjs            # Vue 专用规则
└── rules/
    ├── prefer-allsettled.mjs
    ├── no-silent-catch.mjs
    └── ...
```

### 规则清单与选择

**base.mjs — 通用 TS 规则（所有 TS 项目推荐）**：

| 规则 | 效果 | 必要性 |
|------|------|--------|
| `prefer-allsettled` | 独立数据源必须用 `Promise.allSettled` | 高 — 防止级联失败 |
| `no-silent-catch` | catch 块必须有实质处理 | 高 — 吞错误最危险 |
| `no-unbounded-while-true` | while(true) 必须有退出路径 | 中 — 防死循环 |
| `no-eslint-disable` | 禁止 `// eslint-disable` | 中 — 防绕过检查 |
| `no-inline-import-type` | 禁止行内 `import("x").Type` | 低 — 代码整洁 |
| `no-unsafe-object-entries` | Object.entries 必须白名单过滤 | 中 — 类型安全 |

**vue.mjs — Vue 专用规则（Vue 项目推荐）**：

| 规则 | 效果 | 必要性 |
|------|------|--------|
| `no-native-html-elements` | 禁止原生 HTML 表单元素 | 高 — 必须用 UI 组件库 |
| `no-emoji-in-template` | 禁止 emoji | 中 — 用图标库 |
| `no-hardcoded-colors` | 禁止硬编码颜色 | 高 — 用 CSS 变量/Tailwind |
| `no-magic-spacing` | 禁止 `p-[17px]` | 中 — 用标准 scale |
| `no-multi-arg-emit` | emit 只传单个 payload 对象 | 中 — 接口清晰 |
| `prefer-v-model` | 优先用 v-model | 低 — 有 UI 组件库时 |

### 白名单机制

允许旧文件渐进迁移，不强求一次性改完：

```javascript
const WHITELIST = new Set([
  'src/legacy/old-module.ts',  // TODO: 2026-Q3 重构后移除
]);

function isWhitelisted(filename) {
  return WHITELIST.has(filename);
}
```

白名单条目必须带 TODO 和预期清理时间。

### 自定义规则模板

```javascript
// taste-lint/rules/my-custom-rule.mjs
export default {
  meta: {
    type: 'problem',
    docs: { description: '规则描述' },
    schema: [],
  },
  create(context) {
    return {
      // AST 节点匹配
      SomeNode(node) {
        if (shouldReport(node)) {
          context.report({
            node,
            message: '错误描述 + 修复建议',
          });
        }
      },
    };
  },
};
```

---

## Git Hooks 模板

推荐使用 `install-hooks.sh` 生成 hook 文件（而非 symlink），这样 hook 内容随代码版本走。

### install-hooks.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

echo "安装 git hooks 到 $HOOKS_DIR ..."

cat > "$HOOKS_DIR/pre-commit" << 'HOOK_EOF'
#!/usr/bin/env bash
set -euo pipefail

STAGED_PY=$(git diff --cached --name-only --diff-filter=ACM | grep '\.py$' || true)
STAGED_TS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|vue)$' || true)

if [ "${SKIP_ALL_CHECKS:-0}" = "1" ]; then
    echo "⚠ 跳过所有检查 (SKIP_ALL_CHECKS=1)"
    exit 0
fi

exit_code=0

# === Python ===
if [ -n "$STAGED_PY" ] && [ "${SKIP_PYTHON:-0}" != "1" ]; then
    echo "🔍 Python 检查..."

    # Ruff: 先修复再检查
    if command -v ruff &>/dev/null; then
        echo "$STAGED_PY" | xargs ruff check --fix 2>/dev/null || true
        echo "$STAGED_PY" | xargs ruff check || exit_code=2
        git add $STAGED_PY 2>/dev/null || true
    fi

    # Pyright
    if command -v pyright &>/dev/null; then
        pyright --level error $STAGED_PY || exit_code=2
    fi

    # 自定义规则（如果有）
    for f in $STAGED_PY; do
        if [ -f ".githooks/check_rules.py" ]; then
            python .githooks/check_rules.py "$(pwd)/$f" "$f" || exit_code=2
        fi
    done
fi

# === TS/Vue ===
if [ -n "$STAGED_TS" ] && [ "${SKIP_FRONTEND:-0}" != "1" ]; then
    echo "🔍 TS/Vue 检查..."

    # ESLint: 先修复再检查
    if [ -f "node_modules/.bin/eslint" ]; then
        echo "$STAGED_TS" | xargs npx eslint --fix 2>/dev/null || true
        echo "$STAGED_TS" | xargs npx eslint || exit_code=2
        git add $STAGED_TS 2>/dev/null || true
    fi

    # TypeCheck
    if [ -f "node_modules/.bin/vue-tsc" ]; then
        pnpm type-check || exit_code=2
    elif [ -f "node_modules/.bin/tsc" ]; then
        tsc --noEmit || exit_code=2
    fi
fi

if [ $exit_code -ne 0 ]; then
    echo "❌ 检查失败"
    echo "提示: SKIP_ALL_CHECKS=1 git commit 可跳过（不推荐）"
fi

exit $exit_code
HOOK_EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ pre-commit hook 已安装"
```

### 关键设计模式

1. **增量检查**：只检查 staged 文件（`git diff --cached --name-only --diff-filter=ACM`）
2. **自动修复 + 重检**：先 `--fix`，再检查，最后 `git add` 修复后的文件
3. **条件触发**：只有对应类型文件有变更时才触发对应检查
4. **跳过机制**：`SKIP_XXX=1` 环境变量，但 AI hooks 会阻止 AI 使用

### Bare Repo + Worktree 适配

很多项目使用 bare repo + worktree 结构（如 `project-workspace/` + `.bare/`），hook 安装脚本需要适配：

```bash
#!/usr/bin/env bash
# 检测 git 目录位置，兼容 bare repo 和普通 repo

# 普通 repo: $(git rev-parse --git-dir) → .git（目录）
# bare repo worktree: $(git rev-parse --git-dir) → /path/to/.bare（目录）
# worktree 内: $(git rev-parse --git-dir) → .git（文件，内容指向 .bare 的路径）

GIT_DIR=$(git rev-parse --git-dir)

# 如果 .git 是文件（worktree），读取其内容获取实际路径
if [ -f "$GIT_DIR" ]; then
  # .git 文件内容如: gitdir: /path/to/.bare
  GIT_DIR=$(cat "$GIT_DIR" | sed 's/gitdir: //')
fi

HOOKS_DIR="$GIT_DIR/hooks"
mkdir -p "$HOOKS_DIR"

echo "安装 git hooks 到 $HOOKS_DIR"
# 后续 cat > "$HOOKS_DIR/pre-commit" 与普通 repo 相同
```

**关键区别**：
- 普通 repo 的 `.git/` 是目录，hooks 直接装在 `.git/hooks/`
- Bare repo worktree 的 `.git` 是文件（非目录），内容是 `gitdir: /abs/path/to/.bare`
- 通过 `git-cwt` 创建的 worktree 会执行 `.bare/custom-hooks/setup-worktree.sh`，可在此脚本中调用上述 hook 安装逻辑
- hook 内容只存一份（在 `.bare/hooks/`），所有 worktree 共享

---

## AI Hooks 模板

### 架构：hooks-shared 模式

```
.claude/
├── hooks/                    # 入口（薄层，只做 stdin 读取 + 结果输出）
│   ├── bash-check.ts
│   ├── file-check.ts
│   └── code-rules-check.ts
└── hooks-shared/             # 检查逻辑（可跨项目复用、可测试）
    ├── types.ts
    ├── utils.ts
    └── checks/
        ├── index.ts          # 组合调度
        ├── block-bash.ts     # 危险命令
        ├── file-path-rules.ts
        └── git-skip.ts
```

入口脚本极薄，检查逻辑集中在 `hooks-shared/checks/`。

### 必备检查项

| 检查 | 触发时机 | 拦截内容 |
|------|---------|---------|
| `block-bash` | PreToolUse(Bash) | 管道阻塞、watch 模式、跳过标志 |
| `file-path-rules` | PreToolUse(Write/Edit) | 错误位置创建文件、废弃目录名 |
| `git-skip` | PreToolUse(Bash, 含 git commit) | `--no-verify`、`SKIP_*` 环境变量 |
| `code-rules` | PostToolUse(Write) | 调用项目的 Python/Node 检查脚本 |

### Claude Code 配置

`.claude/settings.local.json`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "npx tsx .claude/hooks/bash-check.ts" }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx tsx .claude/hooks/file-check.ts" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "npx tsx .claude/hooks/code-rules-check.ts" }
        ]
      }
    ]
  }
}
```

### Pi 配置

Pi 扩展通过 `index.ts` 注册 hooks，事件名使用 `beforeToolCall`/`afterToolCall`。

**目录结构**：

```
.pi/
├── hooks/                    # Claude Code 兼容入口（与 .claude/hooks/ 共享逻辑）
└── extensions/
    └── code-guard/            # Pi 扩展
        ├── index.ts           # 扩展入口，注册 beforeToolCall/afterToolCall
        └── checks/
            ├── block-bash.ts
            └── code-rules.ts
```

**index.ts 最简示例**：

```typescript
import { defineExtension } from '@anthropic-ai/pi-extension';
// 检查逻辑复用 hooks-shared/，与 Claude Code 共用同一套规则
import { checkBashCommand } from '../../hooks-shared/checks/block-bash';
import { checkCodeRules } from '../../hooks-shared/checks/code-rules';

export default defineExtension({
  name: 'code-guard',
  hooks: {
    // 等价于 Claude Code 的 PreToolUse(Bash)
    beforeToolCall: async (ctx) => {
      if (ctx.toolName === 'Bash') {
        const command = ctx.toolInput.command as string;
        const blocked = checkBashCommand(command);
        if (blocked) {
          return { block: true, reason: blocked };
        }
      }
    },
    // 等价于 Claude Code 的 PostToolUse(Write)
    afterToolCall: async (ctx) => {
      if (ctx.toolName === 'Write' || ctx.toolName === 'Edit') {
        const filePath = ctx.toolInput.path as string;
        const violations = await checkCodeRules(filePath);
        if (violations.length > 0) {
          return { message: violations.join('\n') };
        }
      }
    },
  },
});
```

**与 Claude Code 的对应关系**：

| Claude Code | Pi | 触发时机 |
|-------------|-----|----------|
| `PreToolUse` | `beforeToolCall` | 工具执行前，可 block |
| `PostToolUse` | `afterToolCall` | 工具执行后，可报告 |
| `hooks-shared/` | 共用同一目录 | 检查逻辑不重复 |

### 跨工具兼容

检查逻辑写在 `hooks-shared/`，Claude Code 和 Pi 各自入口只做输入适配：
- Claude Code：`.claude/hooks/xxx.ts`
- Pi：`.pi/hooks/xxx.ts`

---

## Vue 模板规范检查

当项目使用 Vue + UI 组件库（如 shadcn-vue）时，需要一个 Python 或 Node 检查脚本在 pre-commit 和 AI hooks 中运行。

### 检查项

| 检查 | 正则/逻辑 | 修复建议 |
|------|----------|---------|
| 原生 HTML 元素 | `<(button\|input\|select\|table...)` | 用组件库的对应组件 |
| Emoji | Unicode emoji 范围匹配 | 用 lucide-vue-next |
| 自定义 CSS | `<style scoped>` 中非标准属性 | 用 Tailwind class |
| 行数上限 | 按行分割计数 | template ≤ 400, script ≤ 300 |

### 组件映射表（示例）

```python
NATIVE_TO_COMPONENT = {
    '<button': '<Button',
    '<input': '<Input',
    '<select': '<Select',
    '<table': '<Table',
    '<dialog': '<Dialog',
}
```

告知开发者应该用什么替代，而不只说"错了"。

---

## CI 模板

### Python 项目

```yaml
name: CI
on:
  push:
    branches: [master, feat/**, fix/**]
    paths-ignore: ['**.md', 'docs/**']
  pull_request:
    paths-ignore: ['**.md', 'docs/**']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --frozen --no-dev
      - run: uv run ruff check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --frozen
      - run: uv run pyright

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --frozen
      - run: uv run pytest
```

### Vue/TS 项目

```yaml
name: CI
on:
  push:
    branches: [master, feat/**, fix/**]
    paths-ignore: ['**.md', 'docs/**']
  pull_request:
    paths-ignore: ['**.md', 'docs/**']

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm eslint . --ext .ts,.vue

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm type-check
```

### 全栈项目

前后端检查分 job 并行，最后 Docker build 依赖所有检查通过：

```yaml
jobs:
  lint-backend:
    # ... ruff
  typecheck-backend:
    # ... pyright
  lint-frontend:
    # ... eslint
  typecheck-frontend:
    # ... vue-tsc

  build:
    needs: [lint-backend, typecheck-backend, lint-frontend, typecheck-frontend]
    # ... docker build
```

### CI 设计要点

1. `paths-ignore` 排除 `.md` 和 `docs/`，减少无关触发
2. `concurrency: cancel-in-progress: true`，取消重复运行
3. 分 job 并行（lint / typecheck / test），快速反馈
4. Docker 构建依赖检查通过后才执行

---

## 自定义规则骨架

适用于领域特定规则：架构分层、命名映射、字段一致性。

### Python 检查脚本

```python
#!/usr/bin/env python3
"""项目代码规范检查脚本"""
import sys
from pathlib import Path


class Rule:
    def __init__(self, name: str, desc: str):
        self.name = name
        self.desc = desc

    def check(self, content: str, rel_path: str) -> list[str]:
        raise NotImplementedError


class DDDLayerRule(Rule):
    """DDD 分层依赖检查"""
    FORBIDDEN = {
        "domain/**/*.py": ["app.infra", "app.application", "app.services"],
    }
    WHITELIST = {"domain/core/agent/module.py"}

    def check(self, content: str, rel_path: str) -> list[str]:
        errors = []
        for pattern, forbidden in self.FORBIDDEN.items():
            from fnmatch import fnmatch
            if fnmatch(rel_path, pattern) and rel_path not in self.WHITELIST:
                for f in forbidden:
                    if f"from {f}" in content or f"import {f}" in content:
                        errors.append(f"[{self.name}] 禁止导入 {f}")
        return errors


class NamingRule(Rule):
    """废弃命名检查"""
    FORBIDDEN_NAMES = {
        "ts_code": "stock_code",
    }

    def check(self, content: str, rel_path: str) -> list[str]:
        errors = []
        for old, new in self.FORBIDDEN_NAMES.items():
            if old in content:
                errors.append(f"[{self.name}] 禁止 '{old}'，应使用 '{new}'")
        return errors


def main():
    if len(sys.argv) < 3:
        print("用法: check_rules.py <abs_path> <rel_path>")
        sys.exit(1)

    abs_path, rel_path = sys.argv[1], sys.argv[2]
    content = Path(abs_path).read_text()

    rules = [
        DDDLayerRule("DDD分层", "domain 层禁止依赖 infra/application"),
        NamingRule("命名规范", "禁止废弃命名"),
    ]

    errors = []
    for rule in rules:
        errors.extend(rule.check(content, rel_path))

    if errors:
        for e in errors:
            print(f"❌ {e}")
        sys.exit(2)  # exit 2 = 阻止提交
    sys.exit(0)


if __name__ == "__main__":
    main()
```

**退出码约定**：`0` = 通过，`1` = 脚本错误，`2` = 检查失败（阻止提交）

### 声明式 DDD 规则

更简洁的方式是用数据驱动：

```python
LAYER_RULES = [
    {
        "name": "domain 独立性",
        "desc": "domain 层禁止依赖 infra/application/services",
        "file_match": "domain/**/*.py",
        "forbidden_imports": ["app.infra", "app.application", "app.services"],
        "whitelist": [],
    },
]
```

146 行代码就实现了完整的 Clean Architecture 分层约束。添加新规则只需追加一条数据。
