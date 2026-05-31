---
name: xyz-harness-code-standard-protection
description: >-
  为项目设计并实施代码规范防护体系。基于五层防护模型（AI Hooks → Linter → Custom Rules → Git Hooks → CI/CD），根据项目技术栈推荐合适的防护层组合， 并提供可复用的实现模板。触发场景：用户想给项目添加代码防护、设置 git hooks、 添加自定义 lint 规则、配置 Claude/Pi hooks、搭建 CI 检查、评估项目防护水平， 或提到"代码防护"、"代码规范"、"githook"、"pre-commit"、"taste-lint"、 "Claude hooks"、"代码品味"。即使用户只是说"帮我加强这个项目的代码质量检查" 或"防止 AI 乱写代码"，也应考虑触发此 skill。
---

# Code Standard Protection

为项目设计并实施代码规范防护体系。基于 16 个真实仓库的防护实践提炼。

## 先判断场景

问用户一个问题就够了：**这是新项目还是已有项目要补防护？**

- **新项目** → 跳到 [快速通道](#快速通道新建项目)，按技术栈走模板
- **已有项目** → 先做 [诊断](#诊断已有项目)，再按缺口补齐

---

## 与 Harness 集成

本 skill 已嵌入 harness workflow 的以下位置：

| 集成点 | 触发方式 | 作用 |
|--------|---------|------|
| **Phase 3 (dev)** — Step 0 防护预检 | dev skill 在编码前自动检查 | 发现缺少 linter/typecheck/hook 时引导补齐 |
| **Phase 5 (pr)** — Step 0 CI 预检 | pr skill 在推送前自动检查 | 确认 CI 配置和本地 lint 状态 |
| **coding-workflow 扩展** — before_agent_start | Phase 3 启动时自动扫描 | 扫描项目 tsconfig strict/ESLint/Ruff/git hook/CI，缺失时注入 warning |
| **gate-check.py** — optional 字段 | Phase 3/5 gate 验证时 | `linter_passed` 和 `ci_configured` 可选字段验证 |

因此，在 harness workflow 中，本 skill 的内容通过两个通道生效：
1. **被动触发** — coding-workflow 扩展在 Phase 3 注入防护检查结果
2. **按需引用** — dev/PR skill 的 Step 0 指导 AI 读取本 skill 的模板

---

## 快速通道：新建项目

按技术栈选择，直接执行对应步骤。

### Python 项目

```
必做（5 分钟）：
1. pyproject.toml 添加 [tool.ruff] 配置 → 读取 references/implementation-templates.md 的 "Ruff 配置" 章节
2. pyproject.toml 添加 [tool.pyright] 或 pyrightconfig.json → 同上 "Pyright 配置" 章节
3. 运行 ruff check . 验证

推荐（15 分钟）：
4. 创建 .githooks/install-hooks.sh → 读取 references/implementation-templates.md 的 "Git Hooks 模板" 章节
5. 执行安装脚本
6. 空 commit 验证: git commit --allow-empty -m "test hook"

可选（按需）：
7. 领域特定检查脚本（DDD 分层、命名规范等）→ 读取 references/implementation-templates.md 的 "自定义规则" 章节
8. CI pipeline → 读取 references/implementation-templates.md 的 "CI 模板" 章节
9. AI hooks → 读取 references/implementation-templates.md 的 "AI Hooks 模板" 章节
```

### Vue/TS 项目

```
必做（5 分钟）：
1. eslint.config.mjs 添加 strict + taste-lint 基础规则 → 读取 references/implementation-templates.md 的 "ESLint 配置" 章节
2. tsconfig.json 确认 strict: true
3. 运行 pnpm eslint . --ext .ts,.vue 验证

推荐（15 分钟）：
4. 复制 taste-lint/ 目录到项目 → 读取 references/implementation-templates.md 的 "taste-lint 规则选择" 章节
5. 创建 .githooks/pre-commit → 同上 "Git Hooks 模板"
6. CI pipeline → 同上 "CI 模板"

可选（按需）：
7. Vue 专用检查（vue_rules_checker.py）→ 同上 "Vue 模板规范"
8. AI hooks → 同上 "AI Hooks 模板"
```

### 全栈项目（Python + Vue/TS）

同时应用上面两套，CI 分 job 并行检查前后端。

### 文档/工具仓库

只需 CLAUDE.md 约定，不需要代码防护工具。

---

## 诊断：已有项目

### Step 1: 项目扫描

```bash
# 技术栈识别
ls package.json pyproject.toml tsconfig.json Cargo.toml go.mod 2>/dev/null

# 已有防护
ls -la .githooks/ .claude/hooks/ .pi/hooks/ .github/workflows/ eslint.config.* .eslintrc.* 2>/dev/null
cat .git/hooks/pre-commit 2>/dev/null | head -20

# 已有工具
cat package.json 2>/dev/null | grep -E "eslint|prettier|vitest|vue-tsc"
cat pyproject.toml 2>/dev/null | grep -E "ruff|mypy|pyright|pytest"

# 规模
find . -name '*.py' -o -name '*.ts' -o -name '*.vue' -o -name '*.rs' | grep -v node_modules | grep -v __pycache__ | wc -l
```

### Step 2: 防护评分（13 分制）

| 维度 | 分值 | 评判标准 |
|------|------|---------|
| Lint 工具 | 0-3 | 0=无, 1=基础(ts strict/ruff), 2=完整配置+自定义规则, 3=多工具联动(ESLint+vue-tsc+Pyright) |
| Git Hook | 0-3 | 0=无, 1=pre-commit 触发 lint, 2=自定义领域检查, 3=多 hook 联动+install 脚本 |
| AI Hook | 0-3 | 0=无, 1=基础拦截, 2=领域规则检查, 3=hooks-shared 架构+跨工具兼容 |
| CI 检查 | 0-2 | 0=无, 1=lint+typecheck, 2=并行 job+Docker build |
| Dockerfile | 0-2 | 0=无/非 root, 1=多阶段构建, 2=多阶段+非 root+健康检查 |

根据评分向用户展示差距和推荐优先级。

### Step 3: 选择补齐方向

**防护层选择的依据不是"越全越好"，而是项目实际情况**：

| 因素 | 需要更多防护层的信号 |
|------|---------------------|
| 项目规模 | >200 个源文件需要 Git hook + CI |
| 团队规模 | 多人协作必须加 CI（不依赖个人自律） |
| 领域复杂度 | 金融/医疗等高可靠性领域需要自定义规则 |
| AI 编码比例 | 大量用 AI agent 时需要 AI hooks |
| 变更频率 | 高频发布需要更快的反馈循环（本地 hook > CI） |

**目标评分参考**：

| 项目类型 | 目标 | 最低配置 |
|---------|------|---------|
| 内部工具 | 3-5 | Lint + Git hook |
| 业务项目 | 6-9 | Lint + Hook + Custom + CI |
| 高可靠系统 | 10-13 | 五层全加 |

### Step 4: 渐进式补齐

**核心原则：新检查先警告，不阻塞。修完存量再升级为错误。**

```
第 1 周：添加工具，设为 warning 级别（只报不拦）
第 2 周：修复高优先级文件的违规
第 3 周：切换为 error 级别（开始拦截）
第 4 周+：逐步清理白名单中的旧文件
```

存量代码太多时用白名单机制，不要试图一次性修完：

```javascript
// taste-lint 白名单示例
const WHITELIST = new Set([
  'src/legacy/old-module.ts',  // TODO: 2026-Q3 重构
]);
```

白名单条目必须带 TODO 和预期清理时间，不能无限期豁免。

---

## 防护层详解

### 五层模型

| 层级 | 触发时机 | 工具 | 特点 |
|------|---------|------|------|
| L1 AI Hooks | AI 工具调用时 | Claude/Pi hooks | 最快反馈，只对 AI 生效 |
| L2 Linter | 保存/提交时 | Ruff/ESLint/Pyright/vue-tsc | 开箱即用，社区维护 |
| L3 Custom Rules | 提交时 | taste-lint / Python checker | 项目/领域特定 |
| L4 Git Hooks | git commit 时 | .githooks/ + install-hooks.sh | 可 `--no-verify` 绕过 |
| L5 CI/CD | PR push 时 | GitHub Actions | 不可绕过，最后防线 |

每层的具体实施模板在 `references/implementation-templates.md` 中，按需读取。

### 规则选择指南

不是所有规则都适合所有项目。按优先级选：

**P0 — 通用规则（几乎所有项目都该加）**：

| 规则 | 工具 | 为什么 |
|------|------|--------|
| 禁止 `any` | ESLint/Pyright | 类型安全的基础 |
| 无未使用变量 | Ruff/ESLint | 死代码积累 |
| Import 排序 | Ruff(I) | 代码可读性 |
| catch 块不能为空 | taste-lint/no-silent-catch | 吞掉错误是最危险的 |
| Promise.allSettled | taste-lint/prefer-allsettled | 独立请求不该互相影响 |
| `print()` 禁用 | Ruff/githook | 必须用 logger |

**P1 — Vue/TS 项目推荐**：

| 规则 | 为什么 |
|------|--------|
| 禁止原生 HTML 元素 | 必须用 UI 组件库 |
| 禁止 emoji | 用图标库（lucide-vue-next） |
| 禁止硬编码颜色 | 用 CSS 变量或 Tailwind |
| 禁止魔法间距 | `p-[17px]` 不可维护 |

**P2 — 高可靠/领域特定**：

| 规则 | 适用场景 |
|------|---------|
| DDD 分层依赖 | 后端 Clean Architecture |
| 命名映射 | 有废弃字段需要统一 |
| 字段一致性 | API↔代码↔数据库三方映射 |
| 时区/Decimal 规范 | 金融/数据处理 |
| 模板行数上限 | 大型 Vue 项目防膨胀 |

**不推荐加的规则**（ROI 太低）：
- 强制 JSDoc/docstring 覆盖率（AI 生成的大多是废话）
- 强制 100% 测试覆盖（会引导写无意义测试）
- 严格的圈复杂度限制（AI 生成的代码经常超标但不一定难读）

### 跨工具兼容

防护脚本应同时支持 Claude Code 和 Pi：
- 检查逻辑写在 `hooks-shared/checks/` 中
- Claude Code 入口：`.claude/hooks/xxx.ts`
- Pi 入口：`.pi/hooks/xxx.ts`
- 入口脚本只做输入格式适配

---

## 设计原则与反模式

### 原则

1. **层级递进**：每层独立但互补。同一规则可以多层拦截（如"禁止废弃路径"在 Ruff + githook + AI hook 三层实施），防止单一引擎遗漏。**为什么重要**：单层防护总有盲区——AI 可能不触发 hook、hook 可以 `--no-verify`、CI 在合并前才报错——只有多层拦截才能覆盖所有入口。
2. **增量检查**：pre-commit 只检查 staged 文件，不检查全量。**为什么重要**：全量检查会让提交变慢到不可忍受（>10 秒），开发者会找各种方式绕过 hook，最终防护形同虚设。
3. **自动修复优先**：Ruff/ESLint 先 `--fix`，只对修复后仍有错误的才阻止提交。**为什么重要**：手动修复琐碎格式问题是开发者体验最差的事——自动修复能消除 80% 的噪音，让开发者只关注真正需要人工判断的问题。
4. **可跳过但可审计**：`SKIP_XXX=1` 允许紧急绕过，CI 仍然兜底；但 **AI 不能跳过**（AI hooks 拦截 `--no-verify`）。**为什么重要**：完全不可跳过会导致开发者在紧急修复时破坏防护体系（如直接修改 .git/hooks/），有审计的跳过通道反而能守住底线。
5. **白名单必须有到期日**：白名单不是无限豁免，每条白名单条目必须带 `TODO` 和预期清理时间，否则旧代码永远不会被清理。**为什么重要**：没有到期日的白名单就是永久债务——它会无限膨胀，最终覆盖 90% 的代码，让防护全部失效。

### 反模式

1. **只依赖 CI** — 反馈循环太长
   ❌ 本地不跑任何检查，push 到 CI 后发现 200 处 lint 错误 → 修完再 push → 循环 3 轮才能合并
   ✅ pre-commit 检查 staged 文件 + CI 兜底校验，反馈时间从 2 分钟降到 0.3 秒

2. **无白名单机制** — 一刀切阻塞正常开发
   ❌ `ruff check . --no-ignore` 拦截全部 3000 处历史遗留问题，紧急修复无法提交通过
   ✅ 白名单跳过已验证的旧文件，仅拦截新代码违规；每个白名单条目带 TODO 和清理日期

3. **全量检查** — pre-commit 检查全量代码会拖慢提交
   ❌ `ruff check src/`（2000 个文件，跑 15 秒）
   ✅ `git diff --cached --name-only | xargs ruff check`（仅 3 个 staged 文件，跑 0.3 秒）

4. **规则不报原因** — 每个规则都应该有清晰的错误消息和修复建议
   ❌ `src/api.ts:42: error: some_rule_violation`（无法知道是什么问题、怎么修）
   ✅ `src/api.ts:42: 禁止使用 any 类型，请改用具体的类型定义`（直接知道怎么改）

5. **同一约束多处不同实现** — 维护成本高
   ❌ `.githooks/pre-commit` 写了一套空白符检查，`.claude/hooks/before_agent_start.ts` 又用不同逻辑写了一遍
   ✅ 统一在 `hooks-shared/checks/` 实现，两处入口只做参数适配和调用

## References

| 文件 | 内容 | 何时读取 |
|------|------|---------|
| `references/implementation-templates.md` | 所有层的配置模板和代码骨架（Ruff/ESLint/Git Hooks/CI/自定义规则） | 实施防护时 |
| `references/examples-and-practices.md` | 核心规则的 before/after 反例代码 + 最佳实践（增量检查/白名单/AI 防护/错误消息） | 实施防护时 |
| `references/case-study.md` | 满分仓库（stock-data-crawler）深度分析 | 需要参考复杂场景实现时 |
