# 集成测试深入分析：Mock 策略与 CDC

## 一、核心问题

集成测试的本质是验证组件之间能否正确协作。而 Mock 的本质是把"真实协作"替换为"模拟协作"。这带来一个根本矛盾：

"如果你 mock 了依赖，你测试的是'假设依赖正确时的逻辑'，而不是'依赖是否真的能协作'。"

## 二、业界共识：Spectrum（光谱），不是 Binary

不再是非黑即白的选择。按依赖类型做分级决策：

### 依赖类型分类矩阵

| 依赖类型 | 策略 | 原因 |
|---------|------|------|
| 你自己的数据库 | 用真实实例（Testcontainers） | 你在测试数据库交互的正确性 |
| 你自己的另一个微服务 | 优先真实实例；无法隔离时用 CDC (Pact) | 需要验证 API 契约 |
| 第三方 API（支付、邮件） | Mock + 定期 CDC 验证 | 不可控、不可靠 |
| 时间/随机数 | Mock | 控制输入以保证确定性 |
| 遗留系统 | Mock | 环境不可用或启动极慢 |

### 四类依赖分析（来自 Microsoft Engineering Playbook + Tweag + SparrowApp）

- In-process 稳定（pure fn）→ 不 mock
- In-process 不稳定（random）→ mock
- Out-of-process 可管理（你的 DB/队列）→ 用真实实例
- Out-of-process 不可管理（第三方 API）→ mock + CDC

## 三、Contract Testing（CDC）：Mock 与真实的桥梁

这是从调研中发现的最关键实践。CDC 解决了"Mock 与真实不一致"的问题。

### 传统方式（有问题）

Consumer 测试 → Mock Provider → 测试通过 → 部署后 → 真实 Provider 的 API 变了 → 生产环境炸了

### CDC 方式（推荐）

1. Consumer 写测试，使用 Mock Provider
2. Mock 过程中的请求-响应对被记录为 contract.json
3. Contract 发布到 Pact Broker
4. Provider 构建时拉取 Contract 验证
5. can-i-deploy 工具检查兼容性后才允许部署

谁在用：Microsoft, Spotify, ThoughtWorks, Uber

### 适用场景

- 微服务架构（多服务通过 API 交互）→ 应引入 CDC 测试
- 单体应用 → 用 Testcontainers 管理真实依赖即可

## 四、实战建议：分层集成测试

```
Layer 0: 单元测试（全部 mock）           — 函数/模块内部逻辑
Layer 1: API 集成测试（真实 DB + mock 第三方） — 验证接口 + DB 交互正确
Layer 2: CDC 测试（Pact）                — 验证服务间 API 契约
Layer 3: E2E 测试（全部真实）             — 验证完整用户旅程
```

每一层的关注点：
- Layer 1："我的 API + 数据库是否能正确读写数据？"
- Layer 2："我的服务与下游服务的 API 契约是否一致？"
- Layer 3："用户完成一个目标的所有步骤是否都能走通？"

## 五、Hybrid Approach（当前最佳实践）

WireMock 等工具的推荐做法：

1. Service cluster testing: 紧耦合的服务放在一起测试，模拟域外的一切
2. 紧密相关的服务（如购物车 + 库存 + 订单）用真实实例
3. 外部依赖（支付网关、物流商）用 mock
4. 用 WireMock 录制真实交互 → 回放作为 mock（保证 mock 与真实一致）

## 六、关键原则总结

1. "Mock 了依赖的集成测试，不是真正的集成测试" — 真正的集成问题（schema 变更、连接池耗尽、事务锁冲突）只能在真实依赖中暴露
2. Mock 的核心风险是 false positive — test passes with mock, breaks in production
3. CDC 是当前解决 mock-真实不一致的最佳方案
4. Testcontainers 是集成测试的标配 — Docker 容器化管理数据库、消息队列等依赖
