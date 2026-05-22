# 案例研究：stock-data-crawler（13/13 满分）

防护最全面的仓库，可作为全栈项目防护的参考模板。

## 防护体系总览

四层纵深防护：

```
Layer 4: CI Pipeline (4 个并行 job + Docker build)
Layer 3: Git Pre-commit (9 项顺序检查)
Layer 2: Claude Code Hooks (4 个 hook + 6 个 check 模块)
Layer 1: Editor/Linter (Ruff + Pyright + ESLint + vue-tsc)
```

## 防护代码规模

| 组成部分 | 代码量 |
|---------|--------|
| githook 脚本（6 个） | 3,889 行 |
| Claude hooks（4 个）+ hooks-shared（6 个模块） | 1,217 行 |
| **总计** | **~5,106 行** |

这个规模适合金融数据采集这种高可靠性领域。大多数项目不需要这么多。

## 防护覆盖矩阵

| 防护对象 | Claude Hook | Git Hook | CI |
|---------|:-----------:|:--------:|:--:|
| 文件路径规范 | ✅ | - | - |
| `__init__.py` 规范 | ✅ | ✅ | - |
| 代码规范（12 项） | ✅ | ✅ | - |
| 隐式导入 | - | ✅ | - |
| 字段一致性 | - | ✅ | - |
| 数据库 schema 自动生成 | - | ✅ | - |
| Ruff lint | - | ✅ | ✅ |
| Pyright 类型 | - | ✅ | ✅ |
| ESLint | - | ✅ | ✅ |
| vue-tsc 类型 | - | ✅ | ✅ |
| 管道阻塞 / watch 模式 / 跳过检查 | ✅ | - | - |
| MD 文件长度 | ✅ | - | - |

## 关键设计决策

### 1. 同一规则多层拦截

"禁止废弃模块路径" 在三层实施：
- Ruff `banned-module-level-imports`（lint 层）
- `check_implicit_imports.py`（githook 层，还提供智能建议）
- `file-path-rules.ts`（Claude hook 层）

任何单一引擎遗漏都不会漏过。

### 2. 白名单驱动的严格规则

每个严格规则都有精确豁免：

| 规则 | 白名单示例 |
|------|-----------|
| `<style scoped>` 禁止 | 需要动画的组件 |
| 原生 HTML 禁止 | `<form>`（shadcn 未提供） |
| `__init__.py` 禁止代码 | `model/__init__.py`（Alembic 需要） |
| DDD 分层 | Repository 实现、Model 枚举 |

### 3. ORM 驱动的 Schema 管理

`generate_database_schema.py`（1,181 行）：
- 从 SQLAlchemy 模型自动生成 SQL DDL
- 拓扑排序处理外键依赖（Kahn 算法）
- 按表名前缀自动分组
- 生成增量迁移 SQL
- 模型文件变更时自动触发

核心思路：ORM 模型是"单一事实来源"，SQL 由模型推导，不需要手动维护。

### 4. 字段一致性三链路

`check_field_consistency.py`（379 行）验证：

```
API 返回字段（正则解析 tushare_client.py）
    ↕ 一致性检查
代码处理字段（解析 financial_*.py）
    ↕ 一致性检查
数据库列（SQLAlchemy inspect）
```

金融数据采集中，API 新增字段但忘记加到代码和数据库是常见 bug。这个检查建立了一致性链路。

### 5. AI 专用拦截

`git-skip.ts` 检测 AI 尝试使用 `--no-verify` 或 `SKIP_*` 环境变量。开发者手动 commit 可以跳过检查，但 AI 不能。

`block-bash.ts` 检测 13 种危险管道模式（如 `pytest | grep | head`），防止 AI 使用管道截断长期运行命令导致会话阻塞。

## Git Pre-commit 9 项检查

`install-hooks.sh` 生成完整 pre-commit 脚本，顺序执行：

| # | 检查 | 触发条件 |
|---|------|---------|
| 1 | 数据库 schema 生成 | `infra/db/model/` 变更 |
| 2 | 字段一致性 | `tushare_client.py` / `model/financial/` 变更 |
| 3 | 常量文件规范 | 所有 `.py` 变更 |
| 4 | 前端 ESLint（增量） | `frontend/` 变更 |
| 5 | 前端 vue-tsc | `frontend/` 变更 |
| 6 | 后端 Ruff（增量） | `backend/` 变更 |
| 7 | 后端 Pyright | `backend/` 变更 |
| 8 | 自定义代码规范（12 项） | `backend/app/` 变更 |
| 9 | 隐式导入检查 | `backend/app/` 变更 |

### code_rules_checker.py 的 12 项检查

| # | 检查 | 说明 |
|---|------|------|
| 1 | JSON 序列化 | 禁止 `json.dumps`，用 `json_utils.to_json()` |
| 2 | 时区 | 禁止 `datetime.now(UTC)`，用 `now_shanghai()` |
| 3 | Decimal | 禁止裸 `Decimal()`，用 `to_decimal()` |
| 4 | print | 禁止 `print()`，用 structlog |
| 5 | SQLAlchemy 错误 | 必须用 `clean_sqlalchemy_error()` |
| 6 | async gather | 禁止裸 `asyncio.gather()`，用 `fetch_parallel()` |
| 7 | 日期字段类型 | 交易日期用 `Date`，时间戳用 `DateTime(timezone=True)` |
| 8 | Naive datetime | 禁止无时区 datetime |
| 9 | 命名规范 | `ts_code`→`stock_code` 等 |
| 10 | DDD 分层 | domain 禁止依赖 infra/application |
| 11 | `__init__.py` | 禁止 import/def/class/变量赋值 |
| 12 | Vue 规范 | CSS 变量/emoji/自定义CSS/原生元素 |

## hooks-shared 架构

```
hooks/
├── bash-check.ts       # 入口：stdin → 调用 checks/ → stdout
├── file-check.ts       # 入口
├── code-rules-check.ts # 入口
└── compress-md-hook.ts # 入口

hooks-shared/
├── types.ts            # CheckContext, CheckResult, FilePathRule
├── utils.ts            # 通用工具
└── checks/
    ├── index.ts        # 按顺序串联所有检查
    ├── block-bash.ts   # 13 种危险管道模式
    ├── code-rules.ts   # 调用 Python githook
    ├── file-path-rules.ts  # 12 条路径规则
    ├── git-skip.ts     # 拦截 --no-verify 和 SKIP_*
    ├── init-modification.ts  # __init__.py 内容解析
    └── watch-mode.ts   # vitest/jest/pytest-watch 检测
```

设计亮点：
- 入口极薄（只做 stdin/stdout 适配）
- 检查逻辑集中、可独立测试
- 组合调度：任一检查失败即拦截
- 跨工具：Claude Code 和 OpenCode 共用 checks/

## 从这个案例学到什么

1. **复杂项目值得投入 5000 行防护代码**，但大多数项目只需要 500 行
2. **hooks-shared 模式是可复用的**，检查逻辑可以跨项目复制
3. **AI 专用拦截很重要**：AI agent 会偷懒跳过检查，开发者不会
4. **白名单不是漏洞，是工程策略**：严格规则 + 精确豁免 > 一刀切
5. **ORM 驱动的 schema 管理和字段一致性检查是领域特有的**，通用项目不需要
