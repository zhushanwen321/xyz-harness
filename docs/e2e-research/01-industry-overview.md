# 业界 E2E 测试实践总览

## 一、测试策略演进：Pyramid → Trophy → Honeycomb

### 1.1 经典测试金字塔（Mike Cohn）

核心假设：越往上越慢越贵，所以上面应该放得越少。

### 1.2 测试奖杯（Kent C. Dodds, 2018）

关键洞察：现代测试工具（Playwright、Cypress）的 auto-waiting、并行执行能力，让集成测试成为 ROI 最高的层。

- E2E: 最少，只覆盖关键路径
- 集成: 最多，最佳 ROI
- 单元: 中等，写起来最便宜
- 静态: 贯穿始终 (TypeScript + ESLint)

"The more your tests resemble the way your software is used, the more confidence they can give you." — Kent C. Dodds

### 1.3 行业共识

| 来源 | 推荐 E2E 占比 | 核心观点 |
|------|:------------:|---------|
| Google Testing Blog | ~10% | "Just Say No to More End-to-End Tests" |
| Shift Asia | ~10% | 70% unit + 20% integration + 10% E2E |
| CircleCI | 少量 | E2E 只在 staging、关键 milestone 运行 |
| Ranorex | 按风险 | 支付、登录等关键路径必须 E2E |

结论：E2E 测试应该是整个测试策略中最小的一个子集。

## 二、两层 E2E 策略（所有权威来源一致）

| 维度 | Smoke E2E（PR 级） | 完整回归 E2E（预发布级） |
|------|------------------|----------------------|
| 运行时机 | 每个 PR/commit | 每日/每周/预发布前 |
| 规模 | 5-10 个最关键路径 | 50-200+ 用例 |
| 耗时 | 3-5 分钟 | 30 分钟 - 数小时 |
| 验证范围 | 核心功能是否可访问 | 完整业务流程 |
| 失败处理 | 阻塞合并 | 评估后决定是否阻塞发布 |

## 三、CI/CD 管道中的分层执行

三层执行模式：
1. Commit/PR 级：静态分析 + Lint → 单元测试 → API/集成测试 → 快速 Smoke E2E → Merge
2. Main Branch 级：完整 E2E 回归套件 → 性能测试 → Staging 部署 → 预发布验证
3. Production 级：合成监控 (Synthetic) + RUM 持续验证

三层环境策略：
- Dev → 单元 + 集成 + Smoke E2E
- Staging → 完整回归 + 性能 + 安全
- Production → 合成监控 + 金丝雀发布 + RUM

## 四、Selector 策略（全行业共识）

优先级：
1. data-testid / data-cy 属性 — 最稳定，与样式解耦
2. Accessibility Tree (role + name) — 语义稳定
3. 元素文本内容 — 文案变更即失效
4. 禁止使用 CSS class、Tailwind 工具类 — 样式重构即全挂

## 五、测试隔离铁律

- 每个测试独立，不依赖其他测试的副作用
- 每个测试用独立数据，不共享数据库记录
- 清理是必须的，否则后续测试被污染
- 新鲜浏览器上下文，干净的 cookie/localStorage

## 六、可靠性管理

| 问题 | 业界做法 |
|------|---------|
| 网络抖动 | 内置 auto-waiting，不用 sleep |
| 元素未渲染 | 显式等待，不用固定超时 |
| 环境差异 | Docker 容器化 |
| 第三方不稳定 | Mock 外部服务 |
| Flaky 测试 | 标记隔离 + 修复后回主套件 |

## 七、真实人类 QA 的 E2E 工作流

Phase 1: 需求分析 → Phase 2: 测试计划 → Phase 3: 用例设计 → Phase 4: 环境准备 → Phase 5: 测试执行（自动化介入）→ Phase 6: Bug Lifecycle → Phase 7: 报告 & 发布决策

人类不可替代的 3 个关键介入点：
1. Bug Triage — 判断是真 bug 还是 flaky/环境问题
2. 探索性测试 — 自动化只能验证预期行为
3. 发布决策 — 结合商业影响判断

## 八、Netflix 的启示：Chaos Engineering

Netflix 的 E2E 策略不只是"验证功能正常"，还包括"验证功能异常时的系统韧性"：
- Chaos Monkey：随机关闭服务器和微服务
- 模拟网络延迟：测试自适应码率
- 跨区域流量分布验证

核心思想：如果你知道系统如何失败，就能在真实场景中防止失败。
