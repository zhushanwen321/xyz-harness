# E2E 测试产业界调研

> 调研时间：2026-05-16
> 调研范围：Google、IBM、CircleCI、Playwright、Cypress、Kent C. Dodds、Netflix、Sauce Labs、Applitools、Mabl、WireMock、Pact 等 30+ 权威来源
> 目的：弄清真实业界 E2E 测试流程，评估 xyz-harness 当前实现的差距和优化方向

## 文档索引

| 文档 | 内容 | 核心结论 |
|------|------|---------|
| [01-industry-overview.md](./01-industry-overview.md) | 测试策略演进、两层 E2E、CI/CD 集成 | E2E 应只占 ~10%，集成测试 ROI 最高 |
| [02-integration-testing.md](./02-integration-testing.md) | 集成测试中的 Mock 策略、CDC | 按依赖类型分层 mock，CDC 是 bridge |
| [03-ai-visual-analysis.md](./03-ai-visual-analysis.md) | AI 视觉对比、失败分析、self-healing | VLM 语义理解强但精确检测弱（~45%），AI 失败分析 ROI 最高 |
| [04-gap-analysis.md](./04-gap-analysis.md) | xyz-harness 现状 vs 业界差距 | 集成测试层缺失是最大结构性缺陷 |
| [05-optimization-feasibility.md](./05-optimization-feasibility.md) | 6 个优化点逐项落地可行性 | 4 项可直接落地，2 项不应落地 |

## 对 xyz-harness 的核心结论

**三句话总结**：

1. **业界 E2E 必须是两层**（Smoke + 回归），不能只有一层全量。对应优化：用例分级回退（P0/P1/P2）。
2. **集成测试是 ROI 最高的层**，当前从单元直接跳到 E2E 是最大缺口。对应优化：组前健康检查（替代独立阶��）。
3. **AI 在测试中最大价值是失败分析**，不是执行测试。对应优化：失败智能分析 + flaky 诊断。

**保留不动的**（已是业界最佳）：
- A11y Tree 优先的 selector 策略
- Chrome 独立实例隔离
- Gate 12 四层伪造检测
- 增量写入防止上下文溢出
