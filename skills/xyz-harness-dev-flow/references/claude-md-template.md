# CLAUDE.md 模板

> 使用方式：复制到项目根目录，按提示填空。控制在 100-200 行。每条规则都标注「为什么」。
>
> 本模板覆盖 xyz-harness 全部 skill 期望从项目读取的上下文。标注了 **[必需]** 的章节如果不填，harness 对应阶段会跳过或降级。

---

# CLAUDE.md

## 项目背景 **[必需]**

<!-- 一句话说清项目是什么 -->
本项目是 [项目名称]，用于 [解决什么问题]。

### 技术栈

- 语言：[Python 3.12 / TypeScript 5.x / Rust 1.7x / Java 1.8 / ...]
- 框架：[FastAPI / Next.js / Actix-web / Spring Boot / ...]
- 关键依赖：[列出 3-5 个核心依赖及其用途]
- 数据库：[PostgreSQL / MySQL / SQLite / ...]
- 缓存：[Redis / Memcached / 无]
- 消息队列：[Kafka / RabbitMQ / 无]

### 模块结构

```
[项目根]/
├── [模块A]/       # [模块A的职责]
├── [模块B]/       # [模块B的职责]
├── [模块C]/       # [模块C的职责]
└── tests/         # 测试
```

## 架构约束 **[必需]**

> 这些是不可违反的硬规则。每条规则对应一个历史踩坑案例。
> 编码评审（阶段④）和编码实现（阶段③）都会读取此章节。

### 分层规则

<!-- 定义哪层能调哪层，哪层不能调哪层 -->

- [表现层/Controller] 只做参数校验和异常处理，不写业务逻辑
- [应用层/Service] 编排业务逻辑，不直接操作数据库
- [数据层/DAO/Repository] 只做数据存取，不包含业务判断
- 禁止跨层调用：[具体禁止规则，如 Service 不能直接写 SQL]

<!-- 反面例子（必须写）
❌ 错误示范：
```python
# Controller 里写业务逻辑
@app.post("/order")
def create_order(req):
    if req.amount > 1000:  # 业务判断不应在 Controller
        ...
```
-->

### 外部调用规范

- 所有外部 HTTP 调用必须设置超时（默认 [X] 秒）
- 所有外部调用必须有降级/fallback 方案
- 重试最多 [N] 次，使用指数退避
- 禁止无超时的阻塞调用

### 数据规范

<!-- 列出项目中关键的类型/格式约定 -->

| 字段类型 | 约定 | 原因 |
|---------|------|------|
| 金额/价格 | 用 `long`/`int`，单位为[分/厘] | 浮点精度丢失（案例：[简述]） |
| 时间 | ISO 8601 格式，UTC | [原因] |
| ID | [string/int/UUID] | [原因] |
| 枚举 | [实现方式] | [原因] |

### 禁止事项清单

> 每条必须配反面例子。

1. **禁止 [具体禁止事项]**
   - ❌ 错误：`[反面代码]`
   - ✅ 正确：`[正面代码]`

2. **禁止 [具体禁止事项]**
   - ❌ 错误：`[反面代码]`
   - ✅ 正确：`[正面代码]`

<!-- 按需添加，每条都来自真实踩坑 -->

## 编码规范 **[必需]**

### [表现层 / Controller / Handler]

- 参数校验使用 [校验方式，如 Pydantic / class-validator / ...]
- 统一异常处理：[异常处理方式]
- 返回值格式：[统一响应格式]

### [业务层 / Service]

- 事务边界在 Service 层管理
- 复杂业务逻辑拆分为私有方法，单个方法不超过 [N] 行
- [其他约定]

### [数据层 / DAO / Repository]

- [ORM/查询方式]
- [SQL 写法约定]
- [其他约定]

### 测试规范 **[必需]**

<!-- 测试编写（阶段⑤）和测试评审（阶段⑥）会读取此章节 -->

- 测试目录：[tests/ / src/__tests__/ / ...]
- 命名：`test_[被测函数]_[场景]_[预期结果]`
- Mock 策略：[什么 mock、什么不 mock]
- 每个 [接口/函数] 至少覆盖：正常路径 + 边界条件 + 异常路径
- 数据构造：[fixture 路径 / 工厂方法 / 硬编码]

## 质量门禁 **[必需]**

> 所有条件必须可程序化验证。不能出现「看起来没问题」这种判断。
> gate-script.sh 会解析此章节中的命令行，格式必须为 `- 标签: \`命令\``。

<!-- gate-script.sh 按标签名自动归类：含"编译/build"→compile，含"测试/test"→test，含"lint/clippy/eslint"→lint -->

### 编译/类型检查

- 编译: `[具体命令，如 tsc --noEmit / mypy src/ / cargo check]`

### 测试

- 测试: `[具体命令，如 pytest tests/ -v / npm test / cargo test]`

### Lint

- lint: `[具体命令，如 ruff check . / eslint . / cargo clippy]`

### 构建（如有）

- 构建: `[具体命令，如 npm run build / cargo build --release]`

## 部署 **[可选]**

> 部署验证（阶段⑨）会读取此章节。如果不配置，阶段⑨会跳过或要求手动确认。

- 部署命令: `[具体命令，如 deploy.sh staging / kubectl apply -f k8s/ / make deploy]`
- 目标环境: [staging / production / 开发环境]
- 部署超时: [10 分钟]（默认 10 分钟）
- 健康检查: `[URL，如 http://localhost:8080/health]`
- 验证接口: `[1-2 个核心接口 URL，如 http://localhost:8080/api/v1/ping]`
- 日志检查: [是/否]（设为"是"时，部署后检查无 ERROR 级别日志）

## 开发流程

本项目使用 xyz-harness-dev-flow skill 进行需求开发。标准流程：

```
① 需求分析 → ② 需求评审 → ③ 编码实现 → ④ 编码评审 → ⑤ 测试编写
→ ⑥ 测试评审 → ⑦ 代码推送 → ⑧ CI 验证 → ⑨ 部署验证 → ⑩ 用户确认
→ ⑪ 自动复盘
```

### 人工确认点（5 个）

1. 需求设计确认（阶段①后）
2. 计划评审确认（阶段②后）
3. 编码评审确认（阶段④后）
4. 部署目标确认（阶段⑧后）
5. 最终交付确认（阶段⑩）

### 文档产出目录

```
.xyz-harness/
└── {yyyy-MM-dd}-{主题}/
    ├── spec.md          # 需求设计文档
    ├── plan.md          # 实现计划
    └── changes/         # 变更追溯（由 dev-flow 自动维护）
        ├── summary.md
        ├── reviews/
        ├── evidence/
        └── retrospective.md
```

## 高频变更区

> 标注项目中频繁变更的文件/模块，提醒 Agent 额外关注。

| 文件/模块 | 变更频率 | 注意事项 |
|----------|---------|---------|
| [文件路径] | [高频/中频] | [修改时要注意什么] |
| [文件路径] | [高频/中频] | [修改时要注意什么] |

## 已知陷阱

> 每次 Agent 犯错后在这里补一条（阶段⑪复盘会建议更新）。按时间倒序排列。

### [yyyy-MM-dd] [问题描述]
- **现象：** [Agent 做错了什么]
- **根因：** [为什么会出错]
- **规则：** [新增/修改了什么规则来防止]

## Harness Agent 覆盖 **[可选]**

> 项目可以覆盖 harness 默认的 agent 配置。
> 语法：
> ```
> ## Harness Agent 覆盖
> - agent: <agent名>
>   模型: <模型>
>   规则: <覆盖规则>
> ```

<!-- 示例：
## Harness Agent 覆盖

- agent: harness-executor
  模型: llm-simple-router/glm-5.1
  规则: 所有 export 的函数必须加 JSDoc 注释

- agent: harness-tdd-coder
  模型: llm-simple-router/glm-5-turbo
  规则: 测试文件放在 src/__tests__/ 下，使用 vitest

- agent: harness-gate-checker
  模型: llm-simple-router/glm-5.1
  规则: 增加安全性检查：扫描代码中的 secret key 硬编码
-->
