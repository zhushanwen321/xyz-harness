# Harness 六维度诊断框架

以成熟 AI coding agent 系统（Claude Code、OpenAI Codex、Devin、SWE-Agent）为参照，逐维度诊断 xyz-harness V5 的当前状态、差距和补充方向。

---

## 维度一：上下文管理（Context Management）

> 核心问题：模型到底看到了什么？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| IL0 系统指令 | CLAUDE.md + Pi 全局配置 + skill 元数据列表 | 有，无预算控制 |
| IL1 Phase 指令 | `before_agent_start` 注入当前 Phase Skill 全文 | 有 |
| IL2 按需加载 | AI 自行 read Reference Skill | 有 |
| IL3 Gate 指令 | 独立 session 或 subagent 中加载 | 有 |
| Phase 间压缩 | `ctx.compact()` 清除对话历史 | 有 |
| Phase 内压缩 | 无 | **缺失** |
| 跨 Topic 记忆 | 无 | **缺失** |
| 上下文预算追踪 | 无 | **缺失** |

### 成熟系统做法

**Claude Code** — 五层梯度压缩管线：
- Snip（最轻，删除 tool results 中的冗余）
- Microcompact（利用 API `cache_edits` 删除旧 tool results，不破坏 prompt cache）
- SM Compact（Session Memory Compaction，免 API 调用）
- Full Compact（完整 API 调用压缩）
- Reactive Compact（触发条件：上下文 ~95%）
- 熔断器：连续 3 次 compact 失败后停止

**Codex** — 三级渐进式披露：
- 元数据始终在上下文（name + description，~百词级）
- 指令体按需加载（触发后 fs::read_to_string）
- 捆绑资源按需读取（scripts 可执行不入上下文）
- 关键：description 质量直接决定触发准确性

### 差距分析

**G1.1 — Phase 内无压缩机制**

Phase 3（Dev）可能持续数百轮对话（TDD → 编码 → 修复循环），上下文膨胀导致：
- 后期 AI 响应变慢（token 数增加）
- 关键信息被淹没（早期 spec 约束在长上下文中"隐形"）
- Subagent 派遣时需要复制大量上下文

**G1.2 — IL0 无预算管理**

CLAUDE.md 当前约 200 行，加上 Pi 全局配置和 skill 元数据列表，IL0 占用的 token 不可控。Codex 明确控制 skill description ≤ 1024 字符、name ≤ 64 字符。

**G1.3 — 无上下文预算追踪**

系统不知道当前上下文窗口使用了多少百分比。Claude Code 有 `tokenBudget.ts` 做收益递减检测（连续 3 轮 output < 500 tokens 自动停止）。

**G1.4 — 无跨 Topic 记忆**

每次 `/coding-workflow` 从零开始，之前 topic 的经验教训（如"项目 X 的测试框架是 pytest 不是 vitest"）无法携带。Claude Code 有 Session Memory 系统（9-section 模板，12K token 上限）。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P0 | Phase 内自动压缩触发 | 高 | 参考 Claude Code 的梯度响应：Phase 内上下文达 ~90% 时触发 compact |
| P1 | 上下文预算追踪 | 中 | 在 `index.ts` 中追踪当前上下文大小，暴露给 widget |
| P1 | IL0 token 预算 | 低 | 限制 CLAUDE.md 和 skill 元数据列表的总 token |
| P2 | 跨 Topic 记忆 | 高 | 在 Harness Workspace 级别存储项目特定知识（测试框架、项目结构等） |
| P2 | 收益递减检测 | 中 | 检测 AI 是否在无效循环（连续多轮 output 很短且 gate 持续 fail） |

---

## 维度二：工具系统（Tool System）

> 核心问题：模型到底能做什么？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| 工具集 | read, bash, write, edit + gate + phase-start | 有 |
| Subagent 工具集 | 硬编码 `read,bash,write,edit` | 有，不可配置 |
| 工具权限按 Phase 区分 | 无 | **缺失** |
| Bash 沙箱 | 无 | **缺失** |
| 工具使用引导 | Skill 文档中文字描述 | 弱 |
| 工具执行超时 | Subagent 有 10 分钟全局超时 | 有 |

### 成熟系统做法

**Claude Code** — 四级权限 + 工具推荐网络：
- 权限模型：allow/deny/ask/passthrough，deny 永远优先
- Bash 安全：三层决策（全局→显式→排除），复合命令逐子命令检查防逃逸
- 工具 prompt()：每个工具有动态 prompt 函数，根据权限上下文生成使用指引
- 工具推荐网络：工具间用"推荐/不推荐"关系引导 AI 选择正确工具

**Codex** — 渐进式安全：
- ToolOrchestrator："先沙箱后提权"
- 进程加固 → 审批体系 → 沙箱隔离 → 网络策略 → 密钥保护
- 对工具实现透明（工具不知道自己在沙箱中运行）

### 差距分析

**G2.1 — 无工具权限按 Phase 区分**

每个 Phase AI 拥有相同的工具集。但实际上：
- Phase 1（Spec）AI 不需要 write/edit，只需要 read + bash（查项目结构）+ write（写 spec.md）
- Phase 5（PR）AI 不应该有 merge 权限，当前靠 Skill 文档中的文字约束（"MUST NOT merge"）

**G2.2 — 无 Bash 沙箱**

AI 可以执行任意 bash 命令。自评估复盘指出 AI "静默降级"时会跳过检查——如果工具本身能限制危险操作，就不依赖 AI 的自觉性。

**G2.3 — Subagent 工具集不可配置**

`runSingleAgent` 硬编码 `tools = "read,bash,write,edit"`。但 Review Subagent 不需要 write/edit（只读文件写评审），Retrospect Subagent 也不需要 bash（只需 read + write）。

**G2.4 — 工具使用引导弱**

当前靠 Skill 文档中的文字指引。Claude Code 的做法是把约束嵌入工具描述中，模型每次调用都能看到。如 Phase 5 的"禁止 merge"约束，应该在 bash 工具的 prompt 中动态注入，而不是靠 Skill 文档的一句话。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P1 | Subagent 工具集可配置 | 低 | `runSingleAgent` 参数化 tools |
| P1 | Phase 级工具白名单 | 中 | 每个 Phase 定义允许的工具列表 |
| P2 | 关键约束嵌入工具 prompt | 中 | Phase 5 的 bash prompt 中注入 "git merge/push --force are denied" |
| P2 | Bash 命令黑名单 | 中 | 禁止 rm -rf、git push --force、curl|sh 等 |
| P3 | Bash 沙箱 | 高 | 参考 Claude Code 的 shouldUseSandbox 三层决策 |

---

## 维度三：执行编排（Execution Orchestration）

> 核心问题：模型下一步该做什么？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| Phase 推进 | 线性 5 Phase：Spec → Plan → Dev → Test → PR | 有 |
| Phase 切换 | gate → phase-start → compact → inject next skill | 有 |
| Loop（Phase 内循环） | 隐式：gate fail → AI 自行修复 → 重新 gate | 弱 |
| Stage 追踪 | 无运行时追踪，仅在 Skill 文档中描述 | **缺失** |
| 并行执行 | 无（Phase 严格串行） | **缺失** |
| 中断/恢复 | `/coding-workflow-abort` 可中断，但无恢复 | 部分 |
| 进度反馈 | TUI Widget 显示 Phase 进度 | 有 |

### 成熟系统做法

**Claude Code** — while(true) + AsyncGenerator 循环：
- 10 种退出路径（completed/aborted/max_turns/model_error/blocking_limit 等）
- 流式工具执行：模型 streaming 期间就执行已接收的 tool_use
- Fork cache 共享：所有 fork child 产生 byte-identical API 请求前缀

**Devin** — 全自主 + 检查点：
- 自主执行，关键节点暂停等人类确认
- 可从任意检查点恢复

### 差距分析

**G3.1 — Loop 无状态机**

V5 spec 定义了 Loop 语义（gate fail → 回到循环起点 → runOnce stage 跳过），但 `index.ts` 没有实现。当前 AI 自行决定如何响应 gate fail，可能出现：
- 修复了表面问题但没有回到循环起点
- 跳过 runOnce stage 的内容（应该只在首轮执行的 brainstorming 在后续循环中被跳过）

**G3.2 — 无 Stage 级追踪**

Phase 内部的 Stage（如 Phase 3 的 TDD → 编码 → code review）没有运行时状态。如果 AI 在 code review stage 崩溃，重启后无法知道它之前已经完成了 TDD stage。

**G3.3 — 无 Phase 内并行**

Phase 3（Dev）中多个独立 task 理论上可以并行编码，但当前是串行调度。V4 spec 中有 Execution Groups 和 Wave 编排概念，V5 中弱化为"AI 自主决定 subagent 使用"。

**G3.4 — 无恢复机制**

`/coding-workflow-abort` 杀死所有 subagent 并重置状态，但中间产物（已写的代码、已通过的测试）不会被清理。恢复后 AI 需要从 Phase 起点重新开始，浪费已完成的工作。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P0 | Loop 状态机 | 高 | 在 `index.ts` 中实现 V5 spec 的 Loop 语义 |
| P1 | Stage 级状态追踪 | 高 | `WorkflowState` 增加 `currentStage`，gate 检查 stage 完成度 |
| P1 | Phase 级检查点 | 中 | 记录每个 stage 完成时的 git commit，恢复时回退到最近检查点 |
| P2 | Task 并行调度 | 中 | Phase 3 中允许 AI 并行 dispatch 多个 Task Subagent |
| P3 | 流式 Subagent 结果 | 高 | Review Subagent 完成时实时更新 Widget，而非等待全部完成 |

---

## 维度四：状态与记忆（State & Memory）

> 核心问题：系统如何跨步骤保持连续性？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| 运行时状态 | `WorkflowState`（isActive, currentPhase, topicDir, topicName, phaseResults） | 有 |
| 状态持久化 | `pi.appendEntry("coding-workflow", ...)` 写入 session entries | 有 |
| 状态恢复 | `session_start` 事件中 `reconstructState()` 从 entries 重建 | 有 |
| 跨 Topic 记忆 | 无 | **缺失** |
| 跨 Session 持久化 | 无（状态在 Pi session entries 中） | **缺失** |
| 指标收集 | 无 | **缺失** |
| Deliverable 版本 | Review 文件有版本号（`_v{N}`），其他无 | 部分 |

### 成熟系统做法

**Claude Code** — Session Memory + AutoDream：
- Session Memory：后台持续运行的提取系统，9-section 模板（项目结构、技术栈、编码规范、已知问题等），12K token 上限
- AutoDream：REPL 空闲时做记忆整合（24h 门控，Forked agent 零额外 token）
- 怀疑式记忆：记忆视为"不可靠提示"，行动前必须验证；只在成功写入后更新

**Codex** — 文件系统发现：
- 无显式记忆系统，但通过 BFS 扫描文件系统隐式"记住"项目结构
- Skill 元数据缓存：双层缓存（cache_by_cwd + cache_by_config）

### 差距分析

**G4.1 — 无跨 Topic 学习**

自评估复盘中提到"Harness 把有用的 3-4 个环节包裹在 16 个 stage 的流水线中"。但如果系统能记忆"这个项目的 harness 运行通常 Phase 3 耗时最长"、"上次 topic 的 gate 常见失败原因是 YAML 类型错误"，就能主动预警。

**G4.2 — 状态仅在内存中**

Pi session 崩溃时，`WorkflowState` 丢失。虽然 `reconstructState()` 尝试从 entries 重建，但 entries 本身也可能不完整。

**G4.3 — 无指标收集**

每次 harness 运行产生大量有价值的数据（Phase 耗时、gate 重试次数、token 消耗、review 发现的问题数），但没有收集和聚合。自评估复盘是手写的，不是系统化的。

**G4.4 — Deliverable 无变更历史**

spec.md、plan.md 等文件被覆盖修改，无法追溯变更历程。Review 文件有版本号（好的设计），但主 deliverable 没有。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P1 | 运行指标收集 | 中 | 每次 gate 记录：时间戳、phase、attempt 数、pass/fail、token 消耗 |
| P1 | 状态文件持久化 | 低 | `WorkflowState` 同时写入 `{topicDir}/state.json`，崩溃后可恢复 |
| P2 | 跨 Topic 经验库 | 高 | Harness Workspace 级别的 `memory.md`，记录项目特定知识 |
| P2 | Deliverable git 版本化 | 低 | 每次 gate pass 时 git commit deliverables |
| P3 | 自动化复盘指标 | 中 | 从 gate 日志自动生成 retrospective 的数据部分 |

---

## 维度五：评估与观测（Evaluation & Observability）

> 核心问题：系统怎么知道自己做的对不对？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| GL1 脚本检查 | gate-check.py（文件存在 + YAML 字段） | 有 |
| GL2 AI 评审 | Review Subagent（expert-reviewer skill） | 有 |
| Retrospect | Retrospect Subagent（harness-retrospect agent） | 有 |
| AI 反伪造 | GL1 检查 YAML verdict 字段，AI 无法伪造脚本输出 | 有 |
| 结构化日志 | 无（仅 console.warn） | **缺失** |
| 可观测性 UI | TUI Widget 显示 Phase 进度 | 弱 |
| 质量趋势 | 无 | **缺失** |
| 评审质量评估 | 无 | **缺失** |

### 成熟系统做法

**Claude Code** — 双层遥测管道：
- 1P 全量遥测 + Datadog 白名单
- 89 个编译期 feature flag + 60+ 运行时 feature flag（GrowthBook）
- VCR 记录（API 请求/响应回放）
- 采样策略 + killswitch

**Codex** — 日志与审计：
- 结构化日志输出
- 文件变更审计追踪

### 差距分析

**G5.1 — 无结构化日志**

Harness 运行过程中发生了什么，只能通过 Subagent 的 stderr 和 console.warn 推断。无法回答：
- Phase 3 的 gate fail 了 3 次，每次失败原因是什么？
- Review Subagent 发现了多少个问题，分布在哪里？
- Retrospect Subagent 的执行耗时和 token 消耗是多少？

**G5.2 — 评审质量无法衡量**

自评估复盘中指出"AI 审 AI 没有信息增量"。但这个判断是主观的——没有客观数据支持。如果能追踪"Review 发现的问题中，有多少是真实问题、有多少是误报"，就能量化评审的价值。

**G5.3 — 无质量趋势**

无法回答"Harness 运行 10 次 topic 后，整体质量是提升了还是下降了？"因为每次运行的质量数据没有被系统化记录。

**G5.4 — GL1 检查覆盖度未知**

gate-check.py 检查了文件存在性和 YAML 字段，但无法保证 AI 写的 spec.md 内容质量。GL2 试图弥补，但 GL2 的评审质量本身无法保证。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P0 | 结构化 gate 日志 | 低 | gate 每次执行写入 `{topicDir}/gate-log.jsonl`，记录时间、phase、attempt、结果 |
| P1 | Subagent 执行报告 | 低 | Review/Retrospect Subagent 完成后写入执行摘要（耗时、token、发现数） |
| P1 | 运行摘要报告 | 中 | Harness 完成后自动生成 `{topicDir}/run-summary.md`，聚合所有指标 |
| P2 | 评审质量抽样 | 中 | 用户可标记 Review 中的误报，积累数据评估 Review Subagent 质量 |
| P3 | 质量趋势仪表盘 | 高 | 聚合多次 Harness 运行的指标，可视化质量趋势 |

---

## 维度六：约束与恢复（Constraints & Recovery）

> 核心问题：出错了怎么办，怎么避免跑偏？

### 当前状态

| 机制 | 实现方式 | 状态 |
|------|---------|------|
| 五层防御体系 | L1 上下文隔离 + L2 脚本门禁 + L3 独立评审 + L4 强制复盘 + L5 结果可见 | 有 |
| 逃脱模式目录 | CLAUDE.md 中列举了 8 种 AI 逃脱行为及对策 | 有 |
| 不可逆操作保护 | Phase 5 "MUST NOT merge" 文字约束 | 弱 |
| 信息隔离 | Compact + AI 不知道全局 phase 数量 | 有 |
| 错误分类 | 无（所有错误统一处理） | **缺失** |
| 重试预算 | 无（AI 可无限重试 gate） | **缺失** |
| 熔断器 | 无 | **缺失** |
| 渐进降级 | 无 | **缺失** |

### 成熟系统做法

**Claude Code** — 多层错误恢复：
- withRetry：指数退避（最多 10 次）+ 模型 fallback（→ Sonnet）
- Withholding 机制：可恢复错误不暴露给用户，AI 自行重试
- 熔断器：连续 3 次 compact 失败后停止
- 收益递减检测：连续 3 轮 output < 500 tokens 自动停止
- 渐进式降级：每种故障准备从低到高代价的恢复策略

**Codex** — 进程级安全：
- Unix 独立进程组防止信号传播
- SIGTERM → 2 秒 → SIGKILL 渐进清理
- 沙箱隔离

### 差距分析

**G6.1 — 无重试预算**

AI 可以无限重试 gate。自评估复盘中提到"评审轮次限制与实际需求不匹配"——AI 评审一次只能发现部分问题，下一轮才暴露新问题。但没有机制告诉 AI "你已经试了 5 次了，应该向用户求助"。

**G6.2 — 无错误分类**

所有 gate fail 统一处理（返回失败信息 + 让 AI 修复）。但实际上：
- 文件缺失：确定性错误，AI 一定能修复
- YAML 字段错误：半确定性，AI 可能反复犯同类错误
- 内容质量问题：不确定，AI 可能无法自行修复

不同类型的错误应该有不同的恢复策略。

**G6.3 — 无熔断器**

如果 Review Subagent 连续失败（模型 API 故障），系统会一直重试。没有"连续 3 次失败后暂停并通知用户"的机制。

**G6.4 — 不可逆操作保护弱**

Phase 5 的"禁止 merge"仅靠 Skill 文档中的文字约束。Claude Code 的做法是把约束嵌入工具的 prompt 中——模型每次调用 bash 工具都能看到"git merge is denied"。文字约束 vs 工具级约束，可靠性差一个数量级。

### 补充方向

| 优先级 | 方向 | 复杂度 | 说明 |
|--------|------|--------|------|
| P0 | Gate 重试预算 | 低 | 每个 Phase 最多 N 次 gate 尝试（默认 5），超过后强制暂停 |
| P0 | 熔断器 | 中 | System Subagent 连续 3 次失败后暂停，通知用户 |
| P1 | 错误分类 | 中 | gate fail 结果分为"可自动修复"/"需用户介入"两类 |
| P1 | 不可逆操作工具级保护 | 中 | Phase 5 的 bash prompt 中注入 git merge/push 禁令 |
| P2 | 渐进降级策略 | 高 | 定义每种故障的降级路径（subagent 失败 → 重试 → 换模型 → 通知用户） |
| P2 | Withholding 机制 | 高 | 可恢复错误（YAML 类型错误）AI 静默修复，不可恢复错误暴露给用户 |

---

## 总结：差距优先级矩阵

| 优先级 | 差距 ID | 维度 | 方向 | 复杂度 |
|--------|---------|------|------|--------|
| **P0** | G1.1 | 上下文 | Phase 内自动压缩触发 | 高 |
| **P0** | G3.1 | 编排 | Loop 状态机 | 高 |
| **P0** | G5.1 | 观测 | 结构化 gate 日志 | 低 |
| **P0** | G6.1 | 约束 | Gate 重试预算 | 低 |
| **P0** | G6.2 | 约束 | 熔断器 | 中 |
| **P1** | G1.2 | 上下文 | 上下文预算追踪 | 中 |
| **P1** | G2.1 | 工具 | Subagent 工具集可配置 | 低 |
| **P1** | G2.2 | 工具 | Phase 级工具白名单 | 中 |
| **P1** | G3.2 | 编排 | Stage 级状态追踪 | 高 |
| **P1** | G3.3 | 编排 | Phase 级检查点 | 中 |
| **P1** | G4.1 | 状态 | 运行指标收集 | 中 |
| **P1** | G4.2 | 状态 | 状态文件持久化 | 低 |
| **P1** | G5.2 | 观测 | Subagent 执行报告 | 低 |
| **P1** | G6.3 | 约束 | 错误分类 | 中 |
| **P1** | G6.4 | 约束 | 不可逆操作工具级保护 | 中 |
| **P2** | G1.3 | 上下文 | 跨 Topic 记忆 | 高 |
| **P2** | G2.3 | 工具 | 关键约束嵌入工具 prompt | 中 |
| **P2** | G3.4 | 编排 | Task 并行调度 | 中 |
| **P2** | G4.3 | 状态 | 跨 Topic 经验库 | 高 |
| **P2** | G4.4 | 状态 | Deliverable git 版本化 | 低 |
| **P2** | G5.3 | 观测 | 运行摘要报告 | 中 |
| **P2** | G5.4 | 观测 | 评审质量抽样 | 中 |
| **P2** | G6.5 | 约束 | 渐进降级策略 | 高 |
| **P3** | G2.4 | 工具 | Bash 沙箱 | 高 |
| **P3** | G3.5 | 编排 | 流式 Subagent 结果 | 高 |
| **P3** | G4.5 | 状态 | 自动化复盘指标 | 中 |
| **P3** | G5.5 | 观测 | 质量趋势仪表盘 | 高 |

### 按"投入产出比"排序的 Top 5 快赢项

这 5 项复杂度低但价值高，建议优先实施：

1. **G5.1 结构化 gate 日志**（低复杂度）— 每次运行可追溯
2. **G6.1 Gate 重试预算**（低复杂度）— 防止无限循环
3. **G4.2 状态文件持久化**（低复杂度）— 防止崩溃丢失状态
4. **G2.1 Subagent 工具集可配置**（低复杂度）— 一个参数化改动
5. **G5.2 Subagent 执行报告**（低复杂度）— 复用现有 usage 统计
