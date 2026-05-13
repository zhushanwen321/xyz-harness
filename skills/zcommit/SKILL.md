---
name: zcommit
description: 执行 git commit 操作，智能分析变更并创建规范的提交信息。触发词："zcommit"、"提交"、"commit"、"提交代码"。
user-invocable: true
argument-hint: "[--style=simple|full] [--type=feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert] [path/to/file or directory]"
model: sonnet
---

# ZCommit - Git 提交助手

智能分析代码变更，生成符合规范的提交信息并执行提交。

## 触发条件

用户说以下任一短语时触发：
- "/zcommit"
- "提交代码"
- "commit"
- "提交"

## 参数说明

| 参数 | 说明 |
|------|------|
| `--style=simple\|full` | 提交信息样式：simple（默认）或 full（详细） |
| `--type=<type>` | 强制指定提交类型：feat/fix/docs/style/refactor/perf/test/chore/ci/build/revert |
| `[path]` | 指定要提交的文件或目录路径，不指定则提交所有变更 |

## 执行步骤

### 步骤 1: 分析变更范围

```bash
# 如果用户指定了路径，只分析该路径
# 如果没有指定，分析所有未暂存的变更
git status --short
```

### 步骤 2: 暂存变更

```bash
# 指定路径时
git add <path>

# 未指定路径时，暂存所有变更
git add -A
```

### 步骤 3: 评估变更量并决定提交策略

统计变更文件数量：
- **少于 10 个文件**：直接提交，生成一个提交信息
- **10 个或更多文件**：智能分组后分批提交

### 步骤 4: 生成提交信息

根据变更内容自动检测提交类型：

| 变更类型 | 提交类型 |
|---------|---------|
| 新功能代码 | `feat` |
| Bug 修复 | `fix` |
| 文档变更 | `docs` |
| 配置文件 | `chore` |
| 测试代码 | `test` |
| 代码重构 | `refactor` |
| 性能优化 | `perf` |
| 样式格式化 | `style` |
| CI/CD 配置 | `ci` |
| 构建系统 | `build` |
| 回滚提交 | `revert` |

**提交信息格式：**

```
<type>: <简短描述>

# full 样式时添加
<body: 详细说明做了什么以及为什么>

<footer: 相关 Issue、Breaking Changes 等>
```

### 步骤 5: 执行提交

```bash
git commit -m "<生成的提交信息>"
```

### 步骤 6: 处理提交失败

**重要：本项目禁止跳过任何检查**

如果提交失败（Git Hook 检查未通过）：

1. 读取错误信息，理解具体问题
2. 修复代码问题
3. 重新暂存修改的文件
4. 重新执行提交
5. 重复直到检查通过

**绝对禁止的操作：**
- ❌ 使用 `--no-verify` 选项
- ❌ 设置任何 `SKIP_*` 环境变量
- ❌ 建议用户跳过检查
- ❌ 询问用户是否跳过检查

## 智能分组提交（变更量大时）

当变更文件 >= 10 个时，按以下规则分组：

### 1. 按类型分组
- 文档变更（docs）- README、注释
- 配置文件（chore）- 配置文件、脚本
- 测试文件（test）- 测试代码
- 功能代码（feat/fix/refactor）- 业务逻辑

### 2. 按模块分组
- 前端变更（frontend/）
- 后端变更（backend/）
- 文档变更（docs/）
- 根目录配置

### 3. 按依赖关系
- 基础配置优先
- 依赖它的功能代码后提交

每组生成独立的提交信息。

## 示例工作流

### 简单提交（变更少）

```
用户: /zcommit

分析变更...
发现 3 个文件变更，直接提交

✓ 暂存: app/api/auth.py, app/services/auth.py, tests/test_auth.py
✓ 提交: feat: 实现用户登录功能

✅ 完成！
```

### 分组提交（变更多）

```
用户: /zcommit

分析变更...
发现 15 个文件变更，按模块分组提交

[1/3] 提交后端配置
✓ 暂存: pyproject.toml, .env.example
✓ 提交: chore: 更新依赖版本

[2/3] 提交后端功能
✓ 暂存: app/api/auth.py, app/services/auth.py
✓ 提交: feat: 实现用户登录接口

[3/3] 提交前端页面
✓ 暂存: frontend/src/views/Login.vue
✓ 提交: feat: 添加登录页面

✅ 完成！共 3 个提交
```

### 处理检查失败

```
用户: /zcommit

分析变更...
发现 2 个文件变更，直接提交

✓ 暂存: app/models/user.py
✗ 提交失败: 代码规范检查未通过

检查报告：
- models/user.py:45: 遗失 docstring
- models/user.py:52: 类型标注不完整

正在修复...
✓ 修复完成，重新提交

✓ 提交: fix: 添加用户模型类型标注

✅ 完成！
```

## 注意事项

1. **禁止跳过检查**：本项目强制执行所有 Git Hook 检查
2. **自动修复**：遇到检查失败时，优先自动修复问题
3. **提交信息规范**：使用现在时态、祈使语气，首行不超过 72 字符
4. **智能分组**：大变更自动分组，避免单个提交包含过多不相关内容
