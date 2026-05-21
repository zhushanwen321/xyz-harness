# AI Coding Agent 状态与记忆（State & Memory）调研

> 调研时间：2026-05-21
> 调研范围：Claude Code、Codex CLI、Devin、SWE-Agent、Aider、MemGPT/Letta、LangGraph 等
> 信息来源：源码分析文档、官方工程博客、学术论文、行业报告

---

## 1. 核心问题定义

### 1.1 为什么状态和记忆是核心难题

LLM 本质上是无状态的——每次推理只看到当前上下文窗口中的 token。但软件开发是**长期的、累积的、协作的**活动。这种根本矛盾产生了三个正交的子问题：

| 子问题 | 描述 | 失败后果 |
|--------|------|---------|
| **会话内失忆** | 单次对话中，上下文窗口有限，历史被压缩或丢弃 | Agent 忘记正在构建什么，重复工作 |
| **跨会话失忆** | 新会话启动时，对之前所有工作一无所知 | 用户被迫重复提供相同上下文 |
| **记忆腐败** | 旧记忆与新事实矛盾，相对日期失效，过时信息误导 | 记忆从资产变成负债 |

### 1.2 "状态" vs "记忆"

本文将"状态"和"记忆"作为两个相关但不同的概念：

- **状态（State）**：Agent 在某个时刻的完整运行时快照——当前执行到哪一步、哪些工具结果未处理、权限状态、中间变量等。关注的是**可恢复性**和**一致性**。
- **记忆（Memory）**：Agent 跨时间积累的知识——用户偏好、项目决策、已验证的工作模式等。关注的是**持久化**和**可检索性**。

两者有交集：会话记忆既是状态的一部分，也是记忆的一种形式。但设计时需要区分，因为状态需要精确恢复（checkpoint），记忆需要智能提取和清理（consolidation）。

### 1.3 五个关键约束

任何状态与记忆系统都在以下约束下运行：

1. **上下文窗口有限**：即使 200K token，长对话也会耗尽，需要压缩
2. **注意力衰减**：上下文越长，模型准确提取信息的能力越差（context rot）
3. **Token 成本**：每次推理都要为上下文中的所有 token 付费
4. **Prompt Cache 经济性**：缓存命中可节省大量成本和延迟，但需要状态结构一致
5. **一致性 vs 新鲜度**：记忆太稳定会过时，太频繁更新会不稳定

---

## 2. 业界主流方案对比

### 2.1 Claude Code — 最精妙的多层记忆系统

**架构**：4 种记忆子系统协同工作

| 子系统 | 作用 | 触发时机 | 存储位置 |
|--------|------|---------|---------|
| extractMemories | 从对话中提取持久化记忆 | 对话结束（fire-and-forget） | `~/.claude/projects/<git-root>/memory/` |
| SessionMemory | 维护当前会话摘要 | 周期性后台（双阈值：5K token + 3 tool calls） | `SESSION_MEMORY.md`（临时文件） |
| autoDream | 巩固、修剪、清理记忆 | 24h + 5 个新会话后 | 修改 memory 目录中的文件 |
| teamMemorySync | 团队间安全同步记忆 | 文件监听触发 | HTTP API + 本地文件 |

**核心设计模式**：

1. **Forked Agent 模式**：所有记忆操作使用 `runForkedAgent()`——完美复制主对话的 prompt cache（CacheSafeParams 5 要素完全匹配），独立 tool 权限控制，不干扰主对话流。缓存命中率达 98%+。

2. **互斥检测**：`hasMemoryWritesSince` 防止主 Agent 和 forked agent 双重写入记忆文件。

3. **三层渐进披露**：MEMORY.md 索引（始终注入 system prompt）→ topic 文件（按需读取 5 个）→ 完整记忆（仅 autoDream 审查）。

4. **记忆不是只增不减**：autoDream 的核心价值是**修剪和清理**——转换相对日期为绝对日期、删除被反驳的旧事实、更新 MEMORY.md 索引。

5. **4 种记忆类型**：user（偏好）、feedback（纠正）、project（决策）、reference（外部指针）。**明确不记忆**：代码模式、Git 历史、调试方案（这些由 CLAUDE.md 或实时查询解决）。

6. **会话内多层压缩梯度**：
   - Time-based Microcompact（60 分钟后清除旧 tool results）
   - Cached Microcompact（API cache_edits，零延迟）
   - Session Memory Compaction（首选，免 API 调用）
   - Full Compact（forked agent 生成 handoff summary）
   - 连续 3 次失败触发熔断器

**关键洞察**：Claude Code 是唯一将 prompt cache 命中率作为一等设计约束的编码代理。contentReplacementState 克隆确保 forked agent 对相同 tool_use_id 做出与主 agent 相同的替换决策，从而保证 wire prefix 一致、缓存命中。

### 2.2 Codex CLI（OpenAI）— 两阶段记忆管线 + 差异上下文管理

**架构**：两阶段记忆提取 + ContextManager + Remote Compact

| 组件 | 作用 | 模型选择 |
|------|------|---------|
| Phase 1 提取 | 每个 Rollout 独立提取记忆 | gpt-5.4-mini + Low reasoning（8 并发） |
| Phase 2 整合 | 全局整合 + 清理（数据库级全局锁） | gpt-5.3-codex + Medium reasoning |
| ContextManager | 对话历史唯一管理者 | — |
| Remote Compact | 服务端压缩 | OpenAI 专用 API |
| Inline Compact | 本地压缩 | 非 OpenAI provider |

**核心设计模式**：

1. **经济性驱动的两阶段设计**：Phase 1 用弱模型 8 并发独立提取（允许 No-op），Phase 2 用强模型单例整合。避免在每个 Rollout 上消耗强模型算力。

2. **三层渐进披露**（注入成本 vs 检索精度平衡）：
   - `memory_summary.md`（≤5000 token，始终注入 system prompt）
   - `MEMORY.md`（Agent 按需 grep 搜索）
   - `rollout_summaries/`（完整详情，按需读取 1-2 个）

3. **差异上下文更新**：`reference_context_item` 保存上次完整上下文快照，每个 turn 只发送变更部分的 diff。Rollback 时清空引用触发完全重注入。

4. **规范化不变量**：`ensure_call_outputs_present`（补缺失 output）和 `remove_orphan_outputs`（删孤立 output）两个互逆操作确保历史始终合法。

5. **字节启发式 Token 估算**：不用精确 tokenizer，普通条目用 JSON 字节长度，Reasoning/Compaction 用 `len * 3/4 - 650` 模拟 base64 解码后大小。

6. **Ghost Snapshot 独立保留**：压缩后 undo 功能仍可用。

**与 Claude Code 的差异**：Codex 用数据库（SQLite state_db）做持久化，Claude Code 用文件系统。Codex 有服务端压缩选项，Claude Code 完全客户端。Codex 的记忆管线更偏"批量离线处理"，Claude Code 更偏"实时增量提取"。

### 2.3 Devin — 容器级状态隔离

**架构**：每个 Session 启动独立虚拟机

Devin 的状态管理策略与 Claude Code/Codex 完全不同——它不依赖精细的记忆提取和上下文压缩，而是通过**容器级隔离**解决问题：

1. **独立 VM per Session**：每次任务启动一个完整虚拟机，包含 shell、编辑器、浏览器。状态天然持久于 VM 内。
2. **无跨会话记忆系统**（公开资料中未见）：Devin 2.0 引入了"shared context"，但具体记忆提取机制未公开。
3. **通过文件系统做检查点**：代码变更通过 Git 管理，探索结果通过文件保存。
4. **批量密钥轮换**：每个 VM 独立认证，密钥独立管理。

**优劣势**：
- 优势：状态管理极其简单——VM 就是状态。不需要上下文压缩因为 VM 内的一切都在。
- 劣势：成本高（每个 Session 一个 VM），跨 Session 知识积累弱。

### 2.4 SWE-Agent / OpenHands — 基于动作历史的简化状态

**架构**：ACI（Agent-Computer Interface）+ 最近 N 步压缩历史

SWE-Agent 的状态管理相对简单：

1. **滑动窗口上下文**：只保留最近 5 步的压缩历史，更早的通过摘要保留。
2. **无持久化记忆**：每次任务从零开始，不跨任务积累知识。
3. **容器隔离**：Docker/SWE-ReX 执行环境，通过容器做状态隔离。
4. **自定义动作模板**：通过 YAML 配置定义动作空间，减少上下文占用。

**设计哲学**：SWE-Agent 是研究型工具，专注于 benchmark 性能，不做跨会话记忆。但它的"最近 N 步"策略对短任务足够有效。

### 2.5 Aider — Git 作为状态后端

**架构**：聊天历史 + Git commit 做检查点

Aider 的状态管理极其轻量：

1. **Git 自动 commit**：每次代码变更自动 commit，Git 历史就是状态历史。
2. **聊天历史保存**：`.aider.chat.history.md` 保存对话记录。
3. **Session 管理**（社区扩展）：`.aider/sessions/` 目录保存聊天历史、文件列表到 JSON。
4. **无跨会话记忆提取**：不做自动记忆提取和知识积累。
5. **repo map 做上下文**：用 tree-sitter 生成 repo 结构概览作为上下文注入。

**设计哲学**：最小化复杂性。Git 已经是代码状态的权威来源，不需要额外的状态管理基础设施。

### 2.6 Letta（MemGPT）— 操作系统式记忆层级

**架构**：类 OS 内存管理 + Sleep-time Compute

| 层级 | 类比 | 存储 | 管理方式 |
|------|------|------|---------|
| Message Buffer | CPU 寄存器 | 最近消息 | FIFO 淘汰 |
| Core Memory | RAM | In-context blocks | Agent 自编辑 |
| Recall Memory | 磁盘（对话历史） | 向量数据库 | 按需检索 |
| Archival Memory | 磁盘（知识库） | 向量/图数据库 | 显式存储和检索 |

**核心创新**：

1. **Agent 自管理记忆**：通过 function call 让 LLM 自主决定何时存储、检索、更新记忆，而非依赖外部规则。
2. **Memory Blocks**：结构化、可编辑的上下文单元，有 label、description、value、字符限制。Agent 通过工具重写自己的 memory blocks。
3. **Sleep-time Compute**：异步记忆管理——在 Agent 空闲时用专门的 sleep-time agent 整理记忆，不阻塞主对话。相比 MemGPT 的同步管理，实现了非阻塞操作和更高质量的记忆整理。
4. **递归摘要**：被淘汰的消息经过递归摘要——与之前的摘要合并。随对话增长，旧消息对摘要的影响递减。

### 2.7 对比矩阵

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent | Aider | Letta/MemGPT |
|------|------------|-----------|-------|-----------|-------|-------------|
| **跨会话记忆** | 4 种类型自动提取 | 两阶段管线 | VM 内持久 | 无 | 无 | Core/Recall/Archival |
| **会话内压缩** | 5 层梯度 | Remote/Inline | VM 内 | 滑动窗口 | 无 | 淘汰 + 递归摘要 |
| **记忆清理** | autoDream 修剪 | Phase 2 整合 | VM 销毁 | 无 | 无 | Sleep-time agent |
| **团队同步** | HTTP API + 密钥扫描 | 无 | 组织级 | 无 | 无 | 无 |
| **状态恢复** | Prompt Cache + ForkedAgent | Checkpoint + Ghost Snapshot | VM 快照 | 容器重启 | Git revert | 消息持久化 |
| **Cache 感知** | 98%+（CacheSafeParams） | 无 | 不适用 | 无 | 无 | 无 |
| **实现复杂度** | 极高 | 高 | 中 | 低 | 极低 | 中 |

---

## 3. 关键设计模式提炼

### 模式 1：多层记忆梯度（Memory Hierarchy）

**是什么**：将记忆按访问频率和重要性分为多层，从"始终注入"到"按需检索"。Claude Code 用 4 种类型 + 3 层披露，Codex 用 3 层（summary/MEMORY.md/rollout_summaries），Letta 用 4 层（buffer/core/recall/archival）。

**为什么有效**：
- 控制注入成本——不是所有记忆都值得在每个 turn 中占用 token
- 分离索引和内容——索引小而全，内容大而精
- 匹配注意力预算——最关键的信息始终在上下文中，次要信息按需加载

**适用场景**：任何需要跨会话持久化的 Agent 系统。即使是最简单的 Aider 也隐式使用了"repo map（始终注入）+ 聊天历史（按需回溯）"的两层梯度。

**关键权衡**：层数越多，检索精度越高，但系统复杂度指数增长。实践中 3 层是甜区。

### 模式 2：Forked Agent / 子代理隔离执行

**是什么**：状态操作（记忆提取、上下文压缩、建议生成）不在主 Agent 循环中执行，而是在独立子代理中运行。子代理克隆主 Agent 的关键状态，但不共享可变状态。

**为什么有效**：
- **不阻塞主循环**：记忆提取是异步的，用户不受影响
- **状态隔离**：子代理的副作用不会污染主 Agent（setAppState → no-op）
- **Cache 共享**：通过精确匹配 CacheSafeParams，子代理复用主 Agent 的 prompt cache（Claude Code 98%+ 命中率）
- **权限最小化**：子代理只有只读权限 + 记忆目录写入权限

**适用场景**：任何需要后台执行 Agent 操作的系统。特别是记忆提取、上下文压缩、进度摘要等"元认知"任务。

**关键权衡**：克隆状态需要精确匹配才能获得 cache 命中。contentReplacementState 的克隆是 Claude Code 中最容易出错的点——如果 fork 对相同 tool_use_id 做出不同替换决策，wire prefix 不一致，整个 prompt cache 失效。

### 模式 3：双阈值触发 + 自然断点检测

**是什么**：不是固定间隔触发记忆操作，而是用多维度阈值 + 自然断点综合判断。Claude Code 的 SessionMemory 用"5000 token 增长 AND (3 次 tool calls OR 无 tool call 自然断点)"。

**为什么有效**：
- Token 增长衡量信息密度——对话可能在 100 token 内就产生了关键决策
- Tool calls 衡量工作强度——3 次 tool call 通常意味着一轮有意义的工作
- 无 tool call 检测自然断点——Agent 刚完成一轮工作，是提取记忆的最佳时机
- Token 阈值始终必需——防止低信息量但高 tool call 频率时的过度提取

**适用场景**：任何周期性的后台操作——记忆提取、进度保存、上下文压缩。

### 模式 4：两阶段记忆管线（Extract → Consolidate）

**是什么**：记忆形成分两步——第一步从原始对话中提取原子化事实，第二步跨会话整合、去重、清理。Codex 的 Phase 1/Phase 2 是最明确的实现，Claude Code 的 extractMemories + autoDream 是隐式实现。

**为什么有效**：
- **经济性**：Phase 1 用弱模型并行处理每个会话，Phase 2 只需运行一次整合
- **信号门控**：Phase 1 允许 No-op，不是所有对话都值得记忆
- **时间性处理**：Phase 2 可以转换相对日期、识别矛盾、合并重复
- **遗忘机制**：Phase 2 主动删除过时/被替代的记忆，防止记忆膨胀

**适用场景**：需要跨会话积累知识的系统。单次任务的 Agent（如 SWE-Agent）不需要。

**关键权衡**：两阶段增加系统复杂度，但换来更好的记忆质量和更低的运行成本。单阶段系统（如 MemGPT 的同步管理）更简单但质量更低。

### 模式 5：检查点与恢复（Checkpoint & Restore）

**是什么**：在关键节点保存 Agent 的完整状态快照，失败后从最近检查点恢复。LangGraph、Microsoft Agent Framework、Google ADK 都内置了这一机制。

**具体实现方式**：

| 系统方式 | 描述 | 存储 |
|---------|------|------|
| LangGraph | 图节点执行后自动 checkpoint，支持 time travel | 可插拔存储（SQLite/Postgres/Memory） |
| Microsoft Agent Framework | Executor 级别状态序列化 + graph hash 验证 | CheckpointStorage |
| Google ADK | 每个 tool call 自动 checkpoint（state machine 模式） | 持久化 Session Service |
| Codex CLI | Ghost Snapshot + Rollback | 本地文件 |
| Claude Code | Prompt Cache + ForkedAgent 状态克隆 | API 缓存 + 本地文件 |

**为什么有效**：
- 长时间运行的任务不必因单点失败从头开始
- 支持人工审批中断-恢复（LangGraph 的 interrupt 模式）
- Graph hash 防止代码变更后的状态不兼容（Microsoft Agent Framework）
- 每个 tool call 级别的自动检查点（Google ADK）提供最细粒度恢复

**适用场景**：多步骤工作流、需要人工审批的流程、长时间运行的任务。

### 模式 6：上下文压缩梯度（Compaction Gradient）

**是什么**：不是等到上下文溢出才压缩，而是按信息损失从小到大逐步压缩。Claude Code 实现了 5 层梯度。

| 层级 | 信息损失 | 延迟 | 成本 |
|------|---------|------|------|
| Cached Microcompact | 几乎无（只删 tool output） | ~0ms | 0 API 调用 |
| Time-based Microcompact | 低（60 分钟后的旧 output） | ~0ms | 0 API 调用 |
| Session Memory Compaction | 低（用已有摘要） | ~0ms | 0 API 调用 |
| Full Compact | 高（历史→摘要） | 5-10s | 1 API 调用 |

**为什么有效**：
- 优先用零成本方式释放空间（microcompact），延缓高成本压缩
- Session Memory Compaction 不需要 API 调用——直接复用已维护的 SESSION_MEMORY.md
- 熔断器防止压缩失败循环（Claude Code 有数据：曾出现单 session 连续失败 3272 次）

**适用场景**：任何上下文窗口有限的 Agent 系统。即使是简单实现也应至少有"微压缩 + 全压缩"两层。

### 模式 7：Agent 自管理记忆（Self-Edit Memory）

**是什么**：让 Agent 自己决定何时存储、更新、删除记忆，而非依赖外部规则。MemGPT/Letta 的核心创新，Claude Code 的主 Agent 记忆写入也遵循此模式。

**为什么有效**：
- Agent 对"什么信息重要"有比规则更好的判断
- 减少人工维护记忆格式的负担
- 记忆更新时机更自然——Agent 在获得新信息时立即更新

**适用场景**：需要个性化、长期交互的 Agent。但需要配合记忆清理机制（如 autoDream），否则记忆只增不减。

**关键权衡**：Agent 自管理有"记忆幻觉"风险——Agent 可能存储不准确的信息。Claude Code 通过 4 种明确类型 + "不记忆清单"来约束。

### 模式 8：差异上下文更新（Differential Context Update）

**是什么**：不每个 turn 都发送完整上下文，而是保存上次的快照，只发送变更部分。Codex 的 `reference_context_item` 机制。

**为什么有效**：
- 减少每个 turn 的 token 发送量
- Rollback 时通过清空引用触发完全重注入，避免基于过时基线的错误 diff
- 消息分组的规范化不变量确保 diff 的正确性

**适用场景**：长对话、上下文频繁变化的 Agent 系统。特别是工具返回结果体积大时。

---

## 4. 最佳实践清单

按优先级从高到低排序。编号前缀表示优先级层级：

### P0：必须有

**1. 实现至少两层上下文管理**

不实现上下文管理的 Agent 在长对话中必然失败。最小可行方案：
- 一层"微压缩"：定期清除旧 tool output
- 一层"全压缩"：上下文溢出时生成摘要

Claude Code 证明了 5 层梯度的价值，但 2 层是最低要求。

**2. 会话状态必须可恢复**

无论通过 checkpoint、文件持久化还是 Git，Agent 必须能在中断后恢复。最简单的方案是 Aider 式的 Git 自动 commit——代码状态天然可恢复。更复杂的系统用 LangGraph 式的图节点 checkpoint。

**3. 记忆必须有遗忘机制**

只增不减的记忆是技术债。Claude Code 的 autoDream 和 Codex 的 Phase 2 都实现了主动遗忘——删除过时信息、合并重复信息、转换相对日期。没有遗忘机制的系统会在长期运行后性能退化。

### P1：应该有

**4. 分离记忆索引和内容**

索引始终注入 system prompt（控制在 25KB 以内），内容按需检索。Claude Code 的 MEMORY.md（≤200行 ≤25KB）+ topic files 是最佳参考。

**5. 用双阈值控制记忆提取频率**

固定间隔或每次对话结束都提取，都不如"token 增长 + 工作强度"双阈值。5000 token 增长 AND 3 次 tool calls 是 Claude Code 验证过的甜区。

**6. 状态操作用子代理/后台执行**

记忆提取、上下文压缩、进度摘要等元认知操作不应在主循环中执行。用 forked agent / subagent 隔离执行，避免阻塞用户交互和状态污染。

**7. 明确记忆的范围——不记忆什么比记忆什么更重要**

Claude Code 的做法值得借鉴：明确列出"不记忆的内容"（代码模式、Git 历史、调试方案），这些由实时查询或 CLAUDE.md 解决。记忆只保存"令人惊讶或非显而易见"的信息。

### P2：锦上添花

**8. 团队记忆同步 + 安全扫描**

多开发者协作时需要共享记忆，但必须做密钥扫描（Claude Code 基于 gitleaks 规则子集）防止凭证泄露。

**9. Prompt Cache 感知设计**

如果使用 Anthropic API，CacheSafeParams 和 contentReplacementState 克隆能显著降低成本。但实现复杂度极高，需要精确匹配 5 个 cache key 要素。

**10. Sleep-time 异步记忆管理**

Letta 的 sleep-time compute 模式——在 Agent 空闲时用专门 Agent 整理记忆——比 MemGPT 的同步管理更高效。Claude Code 的 autoDream 是类似思路。

**11. 差异上下文更新**

Codex 的 `reference_context_item` diff 机制在上下文频繁变化时节省大量 token。但需要正确处理 rollback 和规范化不变量。

---

## 5. 对 xyz-harness 的启示

### 5.1 当前 xyz-harness 的状态管理现状

xyz-harness 的 coding-workflow 扩展管理 5 个 phase 的状态流转：

| 状态维度 | 当前实现 | 潜在问题 |
|---------|---------|---------|
| Phase 进度 | `state.currentPhase` | 单变量，无 checkpoint |
| Phase 交付物 | topic 目录中的文件 | 文件存在但内容未校验（gate-check.py 做部分校验） |
| Review 结果 | `*_review_v*.md` | 无 review 质量追踪 |
| Retrospect | `*_retrospect.md` | phase-start 检查存在性 |
| 跨运行记忆 | 无 | 每次运行从零开始 |

### 5.2 具体启示

#### 启示 1：Harness 需要项目级"记忆"，但不需要 Claude Code 式的 4 子系统

xyz-harness 的核心场景是**编码工作流编排**，不是通用 AI 助手。需要的"记忆"更像是**项目决策历史**和**工作模式偏好**：

- 项目使用什么测试框架、什么 CI 环境
- 之前哪些 phase 经常出问题（dev phase 测试总是不充分？）
- 用户的编码偏好（TDD first？先骨架后细节？）

这可以用一个简单的 `project_context.md` 实现——类似 Codex 的 `memory_summary.md`，始终注入 system prompt。不需要 Claude Code 的 4 种记忆类型和 autoDream 巩固。

**建议**：在 topic 目录中增加 `project_context.md`，由 gate-check.py 检查是否存在。内容可以是手写的，也可以由 retrospect subagent 自动维护。

#### 启示 2：Phase 状态需要 Checkpoint，不仅仅是 currentPhase

当前 `state.currentPhase` 是一个单点状态。如果 Phase 3 的 dev subagent 在执行了 5 个 task 后崩溃，整个 phase 必须重来。

**建议**：借鉴 LangGraph 的 checkpoint 模式，在每个 task 完成后保存进度：

```
topic/
  .harness-state.json   ← {"currentPhase": 3, "completedTasks": ["task-1", "task-2"], ...}
```

这样 subagent 恢复后可以跳过已完成的 task。

#### 启示 3：Retrospect 已经是"遗忘机制"的雏形，但可以更强

xyz-harness 的 retrospect 机制（每个 phase 完成后强制复盘）与 Claude Code 的 autoDream 在理念上相似——都是定期的自我审查。但当前 retrospect 只记录"这次执行怎么样"，不做跨 phase 的知识积累和清理。

**建议**：retrospect subagent 除了产出 `*_retrospect.md`，还可以更新 `project_context.md`——记录"这个项目中什么有效、什么无效"。这实现了类似 autoDream 的"知识积累 + 清理"循环。

#### 启示 4：上下文压缩梯度对 subagent 驱动开发至关重要

xyz-harness 的 dev phase 使用 subagent 逐个执行 plan 中的 task。每个 subagent 的上下文应该只包含当前 task 相关信息，而不是整个 plan。这正是"差异上下文更新"的应用场景。

当前实现已经部分做到了这一点（subagent 独立上下文），但可以更明确：

- **每个 subagent 只注入**：当前 task 的描述 + 相关文件列表 + 已完成的 task 摘要
- **不注入**：其他 task 的详细描述、未完成的 plan

这避免了 Claude Code 文档中描述的"attention decay"问题——subagent 的注意力集中在当前 task 上。

#### 启示 5：ForkedAgent 模式对 review subagent 有参考价值

当前 review subagent 是完全独立的 subagent。如果它能复用主 agent 的 prompt cache（共享 system prompt、tools 定义），可以显著降低 review 的 API 成本。

但这需要 Pi 平台级别的支持——类似 Claude Code 的 `runForkedAgent` + `CacheSafeParams`。在 Pi 平台提供此能力之前，这只是一个值得关注的优化方向。

#### 启示 6：双阈值触发可以优化 SessionMemory 的实现

如果 xyz-harness 未来引入 session-level 的状态追踪（类似 Claude Code 的 SessionMemory），双阈值（token 增长 + tool calls）比固定间隔更有效。特别是 dev phase 中，一个 task 可能产生大量 tool calls，需要更频繁的状态快照。

### 5.3 优先级建议

| 优先级 | 改进项 | 预期收益 | 实现复杂度 |
|--------|--------|---------|-----------|
| P0 | Phase 状态 checkpoint（`.harness-state.json`） | 崩溃恢复，不重复执行 | 低 |
| P1 | 项目级记忆（`project_context.md`） | 跨运行知识积累 | 低 |
| P1 | Retrospect 更新项目记忆 | 自动知识积累 + 清理 | 中 |
| P2 | Subagent 差异上下文注入 | 注意力聚焦，降低成本 | 中 |
| P2 | Review subagent prompt cache 复用 | API 成本降低 | 高（需平台支持） |

---

## 参考文献

### 本地知识库

- Claude Code 源码设计分析：09-核心系统-记忆系统.md（4 种记忆子系统详解）
- Claude Code 源码设计分析：25-基础设施层-ForkedAgent系统.md（CacheSafeParams + 状态隔离）
- Claude Code 源码设计分析：context-engineering.md（多层压缩梯度 + token 阈值体系）
- Codex CLI 源码设计分析：11-核心系统-记忆与上下文管理.md（两阶段记忆管线 + ContextManager）

### 业界文章

- Anthropic: [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)（2025-09，上下文工程方法论）
- Birgitta Böckeler (Thoughtworks): [Context Engineering for Coding Agents](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)（2026-02，Martin Fowler 站点，上下文配置特性综述）
- Letta: [Agent Memory: How to Build Agents that Learn and Remember](https://www.letta.com/blog/agent-memory)（MemGPT 记忆层级 + Sleep-time compute）
- Letta: [Sleep-Time Compute](https://www.letta.com/blog/sleep-time-compute)（异步记忆管理范式）
- Skymod: [Why Memory Matters in LLM Agents](https://skymod.tech/why-memory-matters-in-llm-agents-short-term-vs-long-term-memory-architectures)（STM vs LTM 架构对比）
- Redis: [Build Smarter AI Agents with Memory Management](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis)（工程实践）
- LangChain: [Langmem Conceptual Guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide)（记忆系统设计问题清单）

### 学术论文

- Gaoke Zhang et al.: [Multiple Memory Systems for Enhancing the Long-term Memory of Agent](https://arxiv.org/abs/2508.15294)（2025，检索记忆单元 + 上下文记忆单元对偶设计）
- Mem0: [Building Production-Ready AI Agents with Scalable Long-term Memory](https://arxiv.org/pdf/2504.19413)（2025，短期摘要 + 长期观察的双管线）
- arXiv: [Building AI Coding Agents for the Terminal](https://arxiv.org/html/2603.05344v1)（Adaptive Context Compaction + 经验驱动的记忆管线）

### 系统设计参考

- Google ADK: [Build Long-running AI Agents with Checkpoint and Resume](https://developers.googleblog.com/build-long-running-ai-agents-that-pause-resume-and-never-lose-context-with-adk)
- Microsoft Agent Framework: [Workflows - Checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)
- LangGraph: Time Travel and Checkpointing（图节点级状态恢复）
- Zylos Research: [AI Agent Workflow Checkpointing and Resumability](https://zylos.ai/research/2026-03-04-ai-agent-workflow-checkpointing-resumability)
- Indium: [7 State Persistence Strategies for Long-Running AI Agents](https://www.indium.tech/blog/7-state-persistence-strategies-ai-agents-2026)
