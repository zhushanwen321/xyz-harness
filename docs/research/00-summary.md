# Harness 六维度调研汇总

> 调研日期：2026-05-21
> 数据来源：Claude Code 源码分析（v2.1.88）、Codex CLI 源码分析、Devin/SWE-Agent/Aider/Cursor 公开资料

## 调研文档索引

| 文档 | 维度 | 行数 | 核心发现 |
|------|------|------|---------|
| [01-context-management.md](./01-context-management.md) | 上下文管理 | 469 | 8 个设计模式，11 条最佳实践 |
| [02-tool-system-and-orchestration.md](./02-tool-system-and-orchestration.md) | 工具系统 + 执行编排 | 487 | 4 个工具安全层级，3 种编排模式 |
| [03-evaluation-and-constraints.md](./03-evaluation-and-constraints.md) | 评估与观测 + 约束与恢复 | 548 | 5 层评估体系，3 层恢复策略 |
| [04-state-and-memory.md](./04-state-and-memory.md) | 状态与记忆 | 473 | 状态 vs 记忆二分法，4 种记忆子系统 |

---

## 跨维度关键发现

### 发现 1：成熟系统的共同模式是"分层 + 渐进"

所有维度中反复出现的设计模式：

| 模式 | 上下文管理 | 工具系统 | 执行编排 | 状态与记忆 | 评估观测 | 约束恢复 |
|------|-----------|---------|---------|-----------|---------|---------|
| 渐进式披露 | Skill 元数据→指令体→资源 | — | — | — | — | — |
| 多层梯度 | 5 层压缩管线 | 4 级权限决策 | Phase→Stage→Task | 状态→会话记忆→长期记忆 | GL1→GL2→Retrospect | 重试→降级→熔断 |
| 按需升级 | 压缩从轻到重触发 | 权限从宽松到严格 | 执行从自主到确认 | 记忆从短期到长期 | 评估从自动到人工 | 恢复从静默到暴露 |

**启示**：xyz-harness 应在所有维度中贯彻"分层渐进"原则，避免一刀切的设计。

### 发现 2：Claude Code 和 Codex 是两个不同方向的标杆

| 维度 | Claude Code 的策略 | Codex CLI 的策略 |
|------|-------------------|-----------------|
| 上下文 | 5 层压缩 + Session Memory + AutoDream | 三级渐进式披露 + 两阶段记忆管线 |
| 工具 | 动态 prompt() + 工具推荐网络 + 4 级权限 | ToolOrchestrator + 先沙箱后提权 |
| 编排 | while(true) + AsyncGenerator + 10 种退出路径 | 简单线性 + Rust 状态机 |
| 状态 | 状态克隆（ForkedAgent）+ 怀疑式记忆 | 文件系统发现 + 双层缓存 |
| 评估 | 双层遥测 + 89 个 feature flag | 结构化日志 + 审计追踪 |
| 恢复 | Withholding + 熔断器 + 指数退避 + 模型 fallback | 进程级安全（SIGTERM→SIGKILL） |

**Claude Code 偏"重"**：复杂但完善，适合大规模产品。**Codex 偏"轻"**：简洁但可靠，适合 CLI 工具。xyz-harness 应根据自身定位选择借鉴程度。

### 发现 3：AI agent 的核心矛盾是"信任 vs 能力"

所有六个维度都在处理同一个根本矛盾：

- **上下文管理**：给 AI 看多少信息？给多了成本高且可能被利用，给少了能力不足
- **工具系统**：给 AI 多大权限？权限大了危险，权限小了完成不了任务
- **执行编排**：给 AI 多大自主性？自主性高了可能跑偏，自主性低了效率低
- **状态与记忆**：信任 AI 积累的记忆吗？Claude Code 的答案是"怀疑式记忆——行动前必须验证"
- **评估观测**：信任 AI 的自评吗？xyz-harness 的答案是"不信任——GL1 脚本 + GL2 独立评审"
- **约束恢复**：信任 AI 能自行恢复吗？成熟系统的答案是"提供降级路径而非指望 AI 自愈"

**启示**：xyz-harness 的"AI 是不可信的执行者"哲学与业界主流一致。应继续强化"不信任、但赋能"的设计方向。

---

## 按 xyz-harness 改进优先级汇总

### P0（立即需要）

| 来源 | 建议 | 成熟系统做法 | xyz-harness 差距 |
|------|------|-------------|-----------------|
| 01-上下文 | Phase 内自动压缩触发 | Claude Code 5 层梯度压缩，~95% 时触发 | Phase 3 可能数百轮无压缩 |
| 02-编排 | Loop 状态机 | Devin 检查点 + SWE-Agent 显式状态机 | 当前完全交给 AI 自行 loop |
| 03-评估 | 结构化 gate 日志 | Codex 审计追踪 + Claude Code 遥测 | 只有 console.warn |
| 03-约束 | Gate 重试预算 | Claude Code 收益递减检测（3 轮 < 500 tokens 停止） | AI 可无限重试 |
| 03-约束 | 熔断器 | Claude Code 连续 3 次 compact 失败停止 | Subagent 连续失败无上限 |

### P1（近期改进）

| 来源 | 建议 | 成熟系统做法 | xyz-harness 差距 |
|------|------|-------------|-----------------|
| 01-上下文 | Token 预算追踪 | Claude Code tokenBudget.ts | 不知道上下文用了多少 |
| 01-上下文 | IL0 预算管理 | Codex skill description ≤ 1024 字符 | CLAUDE.md + skill 列表 token 不可控 |
| 02-工具 | Subagent 工具集可配置 | Claude Code 按 skill 配置 allowed-tools | 硬编码 read,bash,write,edit |
| 02-工具 | Phase 级工具白名单 | Claude Code 工具推荐网络 | 每个 Phase 工具集相同 |
| 02-编排 | Stage 级状态追踪 | Devin 检查点机制 | 只有 currentPhase |
| 04-状态 | 运行指标收集 | Claude Code 遥测管道 | 无 Phase 耗时/gate 重试数据 |
| 04-状态 | 状态文件持久化 | Codex 文件系统级持久化 | 仅在 Pi session entries |
| 03-评估 | Subagent 执行报告 | Claude Code usage 统计 | 已有 formatUsageStats 但未持久化 |
| 03-约束 | 错误分类 | Claude Code Withholding（可恢复/不可恢复分类） | 所有 fail 统一处理 |
| 03-约束 | 不可逆操作工具级保护 | Claude Code bash 安全检查 | 靠 Skill 文字约束 |

### P2（中期规划）

| 来源 | 建议 | 成熟系统做法 | xyz-harness 差距 |
|------|------|-------------|-----------------|
| 01-上下文 | 跨 Topic 记忆 | Claude Code Session Memory + AutoDream | 每次 workflow 从零开始 |
| 02-工具 | Bash 命令黑名单 | Claude Code bashSecurity.ts（23 种检查） | 无 |
| 02-编排 | Task 并行调度 | Claude Code Coordinator（研究→并行，实现→串行） | 串行 |
| 04-状态 | 跨 Topic 经验库 | Codex 两阶段记忆管线 | 无 |
| 04-状态 | Deliverable 版本化 | Git commit at gate pass | 无 |
| 03-评估 | 评审质量抽样 | SWE-bench 量化评估 | "AI 审 AI 无信息增量"无数据支撑 |
| 03-约束 | 渐进降级策略 | Claude Code withRetry + 模型 fallback | 单一 fail→重试 |

---

## 调研中发现的值得深入学习的设计

| 设计 | 系统 | 文档位置 | 一句话说明 |
|------|------|---------|-----------|
| 怀疑式记忆 | Claude Code | 04-state-and-memory.md | 记忆视为不可靠提示，行动前必须验证 |
| Withholding 机制 | Claude Code | 03-evaluation-and-constraints.md | 可恢复错误不暴露给用户 |
| Cache-Safe 参数选择 | Claude Code | 01-context-management.md | Fork 参数保持 cache key 不变 |
| 先沙箱后提权 | Codex | 02-tool-system-and-orchestration.md | 工具默认在沙箱中运行，需要时才提权 |
| 两阶段记忆提取 | Codex | 04-state-and-memory.md | mini 模型提取 + codex 模型整合 |
| 收益递减检测 | Claude Code | 03-evaluation-and-constraints.md | 连续 3 轮 output < 500 tokens 自动停止 |
| 渐进式披露 | Codex | 01-context-management.md | 元数据→指令体→捆绑资源，按需加载 |
| 独立进程组 | Codex | 03-evaluation-and-constraints.md | SIGTERM→2 秒→SIGKILL 渐进清理 |
