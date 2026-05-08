# 项目 Wiki 目录结构模板

> Wiki 是 Agent 理解业务上下文的知识库。放在项目根目录 `wiki/` 下，不放在 `.superpowers/` 中（后者是需求交付物）。
>
> 原则：
> - Wiki 是给 Agent 和新人看的「项目百科」，不是给人看的 PPT
> - 每个 .md 文件控制在 200 行以内，超了就拆
> - Wiki 按需增长，不要一开始就建空文件——遇到 Agent 不理解的领域知识时再补

---

## 推荐目录结构

```
wiki/
├── README.md                    # Wiki 索引：列出所有文档及推荐阅读路径
│
├── architecture/                # 架构文档
│   ├── overview.md              # 系统架构总览（一张图 + 一段话）
│   ├── module-dependencies.md   # 模块依赖关系（谁调谁，谁不能调谁）
│   └── tech-decisions.md        # 关键技术决策记录（ADR 格式）
│
├── business/                    # 业务领域知识
│   ├── glossary.md              # 业务术语表（中英对照 + 定义）
│   ├── core-flows.md            # 核心业务流程（用文字或 mermaid 描述主链路）
│   ├── rules-and-constraints.md # 业务规则和约束（如：优惠叠加规则、审批流程）
│   └── edge-cases.md            # 已知的边界情况和特殊处理逻辑
│
├── data/                        # 数据模型文档
│   ├── data-models.md           # 核心数据模型（实体关系 + 字段说明）
│   ├── field-conventions.md     # 字段约定（类型、单位、格式、枚举值含义）
│   └── data-flow.md             # 数据流转路径（数据从哪来、到哪去、经过什么处理）
│
├── integration/                 # 外部依赖和集成
│   ├── external-services.md     # 外部服务清单（名称、用途、调用方式、负责人）
│   ├── api-contracts.md         # 对外 API 契约（接口文档模板或链接）
│   └── config-reference.md      # 配置项说明（配置中心的关键参数及含义）
│
└── operations/                  # 运维相关
    ├── deployment.md            # 部署流程和环境说明
    ├── monitoring.md            # 监控和告警（看什么指标、什么值要报警）
    └── troubleshooting.md       # 常见问题排查手册
```

---

## 每个文件要写什么

### README.md — Wiki 索引

```markdown
# 项目 Wiki

## 快速上手（新 Agent / 新人必读）
1. architecture/overview.md — 了解系统全貌
2. business/glossary.md — 理解业务术语
3. data/field-conventions.md — 掌握数据约定

## 按场景查阅

| 场景 | 推荐文档 |
|------|---------|
| 写新接口 | api-contracts.md + field-conventions.md |
| 改业务逻辑 | core-flows.md + rules-and-constraints.md |
| 处理数据 | data-models.md + data-flow.md |
| 排查问题 | troubleshooting.md + monitoring.md |
| 加外部依赖 | external-services.md + integration 概述 |
```

### architecture/overview.md — 系统架构总览

写什么：
- **一张架构图**（mermaid flowchart 或手绘截图）
- **一句话描述每个模块的职责**
- **模块间的调用关系**（A 调 B，B 调 C，C 不调 A）

不写什么：
- 不写实现细节（那是代码的事）
- 不写历史沿革（除非影响当前设计）

### business/glossary.md — 业务术语表

```markdown
# 业务术语表

| 术语 | 英文 | 定义 | 相关字段 | 备注 |
|------|------|------|---------|------|
| 订单 | Order | 用户提交的购买请求 | order_id, order_status | 状态机见 core-flows.md |
| SKU | Stock Keeping Unit | 最小库存单元 | sku_id, sku_price | 价格单位：分 |
| ... | ... | ... | ... | ... |
```

> **为什么重要：** Agent 经常因为不理解业务术语而写出语义错误的代码。把「每个术语在代码里对应什么字段」写清楚，能显著减少这类错误。

### business/core-flows.md — 核心业务流程

写什么：
- **主链路的步骤描述**（用户下单 → 库存扣减 → 支付 → 发货）
- **每一步对应的代码入口**（函数名 / 文件路径）
- **状态机转换**（订单状态：待支付 → 已支付 → 已发货 → 已完成）
- **关键分支条件**（什么情况下走 A 路径，什么情况下走 B 路径）

最好配 mermaid 序列图或状态图。

### business/edge-cases.md — 边界情况

```markdown
# 已知边界情况

## [场景 1：如「跨境订单价格计算」]
- 特殊处理：[需要额外计算关税、汇率转换]
- 对应代码：[文件路径:行号]
- 注意事项：[汇率取下单时快照，不是实时汇率]

## [场景 2]
...
```

> **为什么重要：** 这是 Agent 最容易犯错的地方。边界情况往往不是「写在需求里」的，而是「散落在团队经验中」的。每发现一个，就补一条。

### data/field-conventions.md — 字段约定

```markdown
# 字段约定

## 通用规则
- 所有金额字段：`long` 类型，单位为分，禁止使用 `float`/`double`
- 所有时间字段：ISO 8601 格式字符串，时区 UTC
- 所有 ID 字段：string 类型（即使当前是数字，也为未来扩展留空间）
- 布尔字段命名：`is_` / `has_` / `should_` 前缀

## 特殊字段

| 字段名 | 所在表/模型 | 类型 | 单位/格式 | 取值范围 | 备注 |
|--------|-----------|------|----------|---------|------|
| amount | Order | long | 分 | ≥ 0 | 包含优惠后的实付金额 |
| status | Order | int | 枚举 | 0-5 | 0=待支付 1=已支付 ... 见 core-flows.md |
| ... | ... | ... | ... | ... | ... |
```

### integration/external-services.md — 外部服务清单

```markdown
# 外部服务清单

| 服务名 | 用途 | 调用方式 | 超时设置 | 降级策略 | 负责团队 |
|--------|------|---------|---------|---------|---------|
| [支付服务] | 发起支付 | HTTP POST /pay | 3s | 返回「支付繁忙」 | 支付组 |
| [库存服务] | 扣减库存 | RPC checkAndDeduct | 2s | 抛异常回滚 | 供应链组 |
| ... | ... | ... | ... | ... | ... |
```

---

## Wiki 维护规则

### 什么时候更新 Wiki

| 触发事件 | 更新动作 |
|---------|---------|
| Agent 因不理解业务写错代码 | 补充 business/ 相关文档 |
| 新增外部服务依赖 | 更新 external-services.md |
| 数据模型变更 | 更新 data-models.md + field-conventions.md |
| 发现新的边界情况 | 补充 edge-cases.md |
| 架构调整 | 更新 overview.md + module-dependencies.md |

### 维护原则

1. **按需增长，不提前建空文件**——遇到 Agent 不理解的问题时再补
2. **每个文件不超过 200 行**——超了就拆分
3. **Wiki 不是设计文档**——设计文档放 `.superpowers/`，Wiki 是持久化的领域知识
4. **从 Agent 的错误中学习**——每次 Agent 因为「不知道」而犯错，就是 Wiki 需要补充的信号
5. **代码是最终真相**——Wiki 和代码冲突时以代码为准，但应该去修 Wiki
