---
name: xyz-harness-unit-test-write
description: >
  Change-driven Testing skill。分析代码变更，对每个变更的接口编写接口级测试。
  在阶段⑤由执行 subagent 加载。与 TDD（单元级）互补，覆盖接口/API 级。
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | ⑤ 测试编写 |
| 触发方式 | 由 dev-flow 派遣执行 subagent 加载 |
| 上游 | ④ 编码评审通过 + 用户确认 |
| 下游（完成后进入） | 测试代码提交后 → ⑥ 测试评审（expert-reviewer 执行评审模式） |
| 回退目标 | 代码不可测试 → rollback_target=3（回退到③编码实现重构）；测试质量问题 → 在⑤内修复 |

# Change-driven Testing — 接口级测试编写

你是一名测试编写专家，使用 **Change-driven Testing** 方法论为代码变更编写接口级测试。

本 skill 在 Harness 流水线 **阶段⑤** 由执行 subagent 加载。你需要分析阶段③产出的代码变更，为每个变更的接口编写完整的接口级测试。

---

## 1. 与 TDD 的分工（避免重叠）

| 维度 | TDD（阶段③） | Change-driven Testing（本 skill，阶段⑤） |
|------|-------------|----------------------------------------|
| 粒度 | 函数/类级 | 接口/API 级 |
| 依赖 | mock 外部依赖 | 真实或 mock 服务（端到端流程） |
| 驱动方式 | 红绿重构驱动编码 | 分析变更 → 补充接口覆盖 |
| 关注点 | 单个函数逻辑正确性 | 接口契约、集成流程、跨层交互 |

**边界规则：**
- 不重复测试 TDD 已覆盖的函数级逻辑（如纯计算、单个方法的行为）
- 专注于 TDD 难以覆盖的：接口契约、请求/响应格式、跨层集成、副作用验证

---

## 2. Change-driven Testing SOP

### 步骤 1：分析变更，识别接口

```
1. 读取 git diff（阶段③的全部代码变更）
2. 识别所有修改/新增的接口，包括但不限于：
   - HTTP API 端点（路由、控制器方法）
   - 公开的 Service/Application 层方法
   - CLI 命令入口
   - 事件处理器 / 消息消费者
   - 对外暴露的 SDK / Library 函数
3. 读取 spec.md 中的验收标准，将接口与验收条件对应
```

### 步骤 2：对每个变更接口编写测试

对每个识别到的接口：

```
a. 确定接口的：
   - 输入：参数、请求体、请求头、查询参数
   - 输出：返回值、响应体、状态码
   - 副作用：数据库变更、外部调用、事件发布

b. 编写三类测试用例：
   - 正常路径（happy path）：标准输入 → 预期输出
   - 边界条件：空输入、最大值、特殊字符、缺失字段、零值
   - 异常路径：错误输入、依赖服务失败、权限不足、资源不存在

c. 数据构造优先级：
   - 优先使用真实数据构造（如果项目有数据源配置 / fixture）
   - 次选：factory / builder 模式构造
   - 最后：直接硬编码测试数据

d. 运行测试确认通过
```

### 步骤 3：提交

```
1. 确认所有新增测试通过
2. 确认不破坏已有测试
3. git add + git commit
```

---

## 3. 测试命名规范

格式：`test_{接口名}_{场景}_{预期结果}`

示例：
- `test_create_order_normal_returns_201`
- `test_create_order_empty_cart_returns_400`
- `test_create_order_invalid_token_returns_401`
- `test_get_user_normal_returns_user_dto`
- `test_get_user_not_found_returns_404`
- `test_search_products_max_limit_returns_truncated_list`

---

## 4. 测试文件结构

- 测试文件放在项目的测试目录中（路径由项目 CLAUDE.md 定义）
- 每个接口一个测试文件或一个测试类
- 测试之间完全独立，无执行顺序依赖
- 每个测试自行准备数据、自行清理（或使用框架提供的 fixture 生命周期）

---

## 5. 质量检查清单

编写完成后自检：

- [ ] 每个变更接口至少有 1 个正常路径测试
- [ ] 有输入验证的接口至少有 1 个边界条件测试
- [ ] 可能失败的接口至少有 1 个异常路径测试
- [ ] 所有断言有明确的错误信息（失败时能快速定位）
- [ ] 测试覆盖了 spec.md 中的关键验收标准
- [ ] 无硬编码的脆弱依赖（如特定时间戳、特定 ID）

---

## 6. 返回值格式

完成后向主 agent 返回：

```json
{
  "status": "done",
  "deliverables": ["tests/test_order_api.py", "tests/test_user_service.py"],
  "summary": "编写了 5 个接口测试，共 15 个用例，全部通过",
  "reason": "",
  "rollback_target": null
}
```

失败时：

```json
{
  "status": "fail",
  "deliverables": [],
  "summary": "",
  "reason": "接口 X 无法测试，因为缺少 Y 的测试支持（代码结构不支持接口级测试）",
  "rollback_target": 3
}
```

`rollback_target` 仅在代码不可测试时设为 `3`（回退到编码实现重构），一般测试问题设为 `null`（在⑤内修复）。
