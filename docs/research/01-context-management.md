# 上下文管理 — 业界最佳实践调研

> 调研日期：2026-05-21
> 调研范围：Claude Code、Codex CLI、Devin、SWE-Agent、Aider、Cursor

---

## 1. 核心问题定义

上下文管理要解决的本质矛盾是：**LLM 上下文窗口有限，但开发会话可以无限长**。这个矛盾在 AI coding agent 场景下被放大到极端——一次编码会话可能涉及数十次文件读写、数百条 shell 输出、多个工具调用链路，这些内容的 token 消耗远超任何模型的上下文窗口。

更准确地说，这不是简单的"截断"问题，而是一个**信息保真度优化问题**：如何在有限的 token 预算内，最大化保留对后续开发有用的信息，同时最小化 API 成本和响应延迟。

具体拆解为五个正交的子问题：

### 1.1 单会话上下文溢出

一次开发会话中，对话历史（用户消息 + 工具调用 + 工具输出 + Agent 思考）的 token 总量可能远超模型窗口。系统必须在"保留重要信息"和"避免 413 错误"之间取得平衡。

### 1.2 跨会话知识持久化

LLM 本质上无状态，但软件开发是长期的、累积的、协作的活动。今天的决策、用户的偏好、项目的架构约定，明天启动新会话时需要仍然可用。

### 1.3 上下文相关性与噪声

即使在窗口内，也并非所有内容对当前任务同等重要。10 分钟前读取的配置文件可能是关键上下文，1 小时前的一次 grep 输出可能完全是噪声。系统需要区分"有价值的上下文"和"占用空间的噪声"。

### 1.4 Prompt Cache 经济性

现代 LLM API 提供了 prompt cache 机制——前缀相同的请求可以复用已计算的 KV cache，大幅降低成本和延迟。上下文管理的每个操作（截断、压缩、修改）都可能破坏 cache 前缀，导致全量重计算。优化必须同时考虑信息保真度和 cache 命中率。

### 1.5 信息恢复与"失忆"

上下文压缩必然伴随信息丢失。压缩后的 Agent 面临"失忆"问题——不知道最近读取了哪些文件、当前加载了哪些技能、工作计划是什么。如果不在压缩后主动恢复关键状态，Agent 的第一轮响应质量会急剧下降。

---

## 2. 业界主流方案对比

### 2.1 Claude Code

**压缩策略：5 层渐进式压缩**

Claude Code 拥有业界最精密的上下文管理系统，从轻到重分为 5 层：

| 层级 | 名称 | 触发方式 | 成本 | 信息损失 |
|------|------|----------|------|----------|
| L0 | Snip Compact | 自动 | 零 | 最小（裁剪旧消息） |
| L1 | Microcompact | 自动/时间 | 零 | 中等（清除过期 tool results） |
| L2 | Context Collapse | 自动 | 低 | 可恢复（归档而非删除） |
| L3 | AutoCompact | 阈值触发 | 高（API 调用） | 大（摘要替换） |
| L4 | Reactive Compact | API 413 错误 | 高 | 大 |

**关键创新：Cached Microcompact**

通过 API 的 `cache_edits` 机制，在不修改本地消息内容的前提下在服务端删除旧的 tool results。这使 prompt 前缀保持不变，cache 命中率从约 2% 提升到约 98%。ROI 是整个上下文管理系统中最高的一项优化。

**记忆系统：4 种协作子系统**

| 子系统 | 解决的问题 | 触发时机 |
|--------|-----------|---------|
| extractMemories | 跨会话失忆 | 对话结束时 forked agent 提取 |
| SessionMemory | 会话内压缩辅助 | post-sampling hook 周期性更新 |
| autoDream | 记忆腐败（过时/矛盾） | 24h + 5 个新会话后 |
| teamMemorySync | 团队知识孤岛 | 文件监听 + 增量同步 |

**Post-Compact 恢复**：压缩后主动重新注入最近 5 个文件（50K token 预算）、技能内容（25K 预算）、Plan 文件、工具/MCP 增量通告。这是 Claude Code 压缩可用性的关键——没有它，压缩后 Agent 的响应质量会急剧下降。

**熔断器**：连续 3 次压缩失败后停止重试。生产数据显示，没有熔断器时每天浪费约 25 万次无用 API 调用。

### 2.2 Codex CLI (OpenAI)

**压缩策略：双实现**

Codex CLI 根据 provider 选择不同的压缩实现：OpenAI provider 使用服务端 `compact_conversation_history` API（Remote Compact），其他 provider 使用本地 LLM 生成 handoff summary（Inline Compact）。

**记忆系统：两阶段管线**

- Phase 1：用弱模型（`gpt-5.4-mini` + Low reasoning）对每个 Rollout 独立提取，8 并发并行执行。显式允许 No-op——只有可能改变未来 Agent 行为的信息才提取。
- Phase 2：用强模型（`gpt-5.3-codex` + Medium reasoning）做全局整合，通过数据库级全局锁保证单例运行。

**三层渐进披露**的记忆注入：
1. `memory_summary.md`（轻量摘要，截断到 5000 token，始终注入 system prompt）
2. `MEMORY.md`（中等详细，Agent 按需 grep 搜索）
3. `rollout_summaries/`（完整详情，按需读取）

**Skills 系统：元数据 + 按需加载**

Skills 的元数据（name + description）始终在 system prompt 中，作为触发依据（约百词级成本）。触发后才从磁盘读取 SKILL.md body 并注入上下文。系统可以注册数十个 Skill，但只有被触发的才消耗 token 预算。

**Context Manager 差异更新**：保存上一次的完整上下文快照，每个 turn 只发送变更部分（环境上下文、权限、模型切换等的 diff）。

### 2.3 Devin

**压缩策略：全量快照 + 精选恢复**

Devin 采用更重的上下文管理策略。它在每个关键节点保存完整的环境快照（终端输出、编辑器状态、浏览器截图），压缩时用 LLM 生成结构化的 "Devins state summary"。恢复时不尝试重建全部状态，而是根据当前任务从快照中精选最相关的上下文。

**记忆系统：项目知识库**

Devin 维护一个持久化的项目知识库（Knowledge Base），在会话结束时自动更新。知识库包含：项目架构概览、关键决策记录、已知问题和 workaround。新会话启动时注入知识库摘要。

**特点**：Devin 的独特之处在于它管理的不只是对话上下文，还包括完整的运行环境（浏览器、终端、编辑器）。这意味着它的上下文管理需要处理截图、DOM 快照等非文本内容。

### 2.4 SWE-Agent

**压缩策略：极简滑动窗口**

SWE-Agent 的上下文管理非常简洁——固定长度的滑动窗口，保留最近的 N 条动作-观察对。不使用 LLM 生成摘要，不区分信息的价值高低。

**环境状态压缩**：SWE-Agent 的创新之处在于对环境观察的压缩。比如，`ls` 的完整输出会被截断为只显示最近的文件，`git diff` 会被截断为只显示变更的统计信息而非完整 diff。这种压缩在信息进入上下文之前就完成了，而非事后压缩。

**特点**：SWE-Agent 的设计哲学是"预防而非治疗"——通过在信息进入上下文之前就做裁剪（如限制每次观察的 token 数上限），避免后续需要复杂的压缩机制。代价是可能丢失对问题修复关键的细节。

### 2.5 Aider

**压缩策略：Repo Map + 选择性文件加载**

Aider 的上下文管理核心是 **Repo Map**——一个基于 tree-sitter 的代码库索引，包含所有函数/类的签名和调用关系，但不包含函数体。Repo Map 通常只占几千 token，但为 Agent 提供了代码库的全局视图。

当需要修改某个文件时，Aider 才将该文件的完整内容加入上下文。这种"索引常驻 + 内容按需"的模式与 Codex CLI 的 Skills 渐进式披露异曲同工。

**聊天历史管理**：Aider 使用简单的滑动窗口管理对话历史，但有一个精巧的设计——它会在系统提示中注入最近被编辑文件的当前状态（通过 `git diff` 获取），确保 Agent 始终知道文件的最新内容。

**特点**：Aider 证明了"好的索引可以替代大量原始上下文"。一个精确的 Repo Map 比完整的文件内容更高效地帮助 Agent 定位到正确的代码位置。

### 2.6 Cursor

**压缩策略：滑动窗口 + Codebase Indexing**

Cursor 使用简单的滑动窗口截断旧的对话消息，不使用 LLM 生成摘要。但它的核心竞争力在于 Codebase Indexing——通过向量数据库索引整个代码库，根据当前对话内容检索最相关的代码片段，作为上下文注入。

**记忆系统：规则文件**

Cursor 的"记忆"是手写的 `.cursor/rules/` 文件——用户需要手动编写项目约定、编码风格、架构约束等。不支持自动提取、不支持记忆清理、不支持团队同步。

**特点**：Cursor 的上下文管理重心不在对话历史管理，而在代码库的语义检索。它假设"正确的代码上下文比对话历史更重要"，这个假设在大多数编码场景下是成立的。

### 2.7 对比总结

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent | Aider | Cursor |
|------|-------------|-----------|-------|-----------|-------|--------|
| 压缩层数 | 5 层渐进式 | 2 实现（远程/本地） | 全量快照 | 极简滑动窗口 | Repo Map + 选择加载 | 滑动窗口 |
| 记忆提取 | 自动 4 子系统 | 两阶段管线 | 项目知识库 | 无 | 无 | 手动规则文件 |
| Cache 优化 | cache_edits（98% hit） | 差异更新 | 无 | 无 | 无 | 无 |
| 压缩后恢复 | 完整状态恢复 | Ghost Snapshot | 精选恢复 | 无 | 最近文件 diff | 无 |
| 熔断器 | 3 次失败熔断 | 溢出优雅降级 | 无 | 无 | 无 | 无 |
| 代码库索引 | 无（按需读取） | 无 | 无 | 无 | tree-sitter Repo Map | 向量数据库 |
| 信息进入前裁剪 | 无 | 无 | 无 | 有（环境观察压缩） | 有（Repo Map 只含签名） | 无 |

---

## 3. 关键设计模式提炼

### 模式一：渐进式披露（Progressive Disclosure）

**是什么**：将信息按粒度分层，始终保留最粗粒度的元数据在上下文中，中等粒度按需加载，细粒度只在明确需要时读取。

**为什么有效**：解决了"信息完整性 vs 上下文预算"的根本矛盾。元数据（如函数签名、Skill 名称+描述）通常只占几十到几百 token，但足以让 Agent 判断是否需要深入。这样可以在上下文中同时"存在"大量信息的索引，而只对其中少数条目消耗完整 token。

**适用场景**：
- 大量可选功能/工具/技能的注册（Codex CLI 的 Skills 系统）
- 大型代码库的浏览（Aider 的 Repo Map）
- 参考文档的按需加载（Claude Code 的 Skill references）

**实例**：
- Codex CLI Skills：元数据（~100 词）始终在 system prompt → 触发后加载 SKILL.md body → references/scripts 按需读取
- Aider Repo Map：函数签名和调用关系常驻（几 K token） → 修改文件时才加载完整内容
- Claude Code CLAUDE.md：4 级文件加载（Managed → User → Project → Local），越靠近 CWD 优先级越高

### 模式二：多层梯度压缩（Multi-Layer Gradient Compression）

**是什么**：不使用单一压缩策略，而是从轻到重建立多层压缩管线，每层解决特定粒度的上下文压力。

**为什么有效**：不同场景的上下文压力差异巨大——有时只是旧的 tool result 占了太多空间（微压缩即可），有时是整体上下文已经溢出（需要完整摘要）。单一策略要么过于激进（频繁摘要丢失信息），要么过于保守（经常 413 错误）。多层策略让 99% 的情况通过轻量层解决，只有 1% 需要重操作。

**适用场景**：
- 长时间运行的编码会话（数小时的连续开发）
- 工具调用密集的场景（大量文件读取、shell 执行）
- Prompt cache 成本敏感的生产环境

**实例**：
- Claude Code：Snip（裁剪旧消息）→ Microcompact（清除过期 tool results）→ Context Collapse（归档不活跃消息）→ AutoCompact（完整摘要）→ Reactive Compact（413 恢复）
- Codex CLI：环境观察预裁剪 + Inline/Remote Compact
- SWE-Agent：环境观察在进入上下文前就被截断

### 模式三：Cache-Safe 操作（Cache-Safe Operations）

**是什么**：所有上下文管理操作都优先考虑对 prompt cache 的影响，通过不修改本地消息内容、使用 API 层编辑机制、差异更新等手段保持 cache 前缀一致。

**为什么有效**：Prompt cache 的核心约束是"前缀一致"——只要请求的前缀与已缓存的 KV cache 匹配，就可以复用。修改消息内容会破坏前缀一致性，导致全量重计算。通过在 API 层面操作（如 `cache_edits`）而非修改本地消息，可以实现"逻辑上删除但 cache 前缀不变"。

**适用场景**：
- 高频 API 调用的生产环境（每次 cache miss 都意味着完整计费）
- 长对话中需要频繁清理旧上下文的场景
- Forked agent 需要与主 agent 共享 cache 的场景

**实例**：
- Claude Code Cached Microcompact：通过 `cache_edits` 在 API 层删除 tool results，本地消息不变，cache 命中率 98%
- Claude Code Forked Agent：记忆提取和摘要生成都使用 `runForkedAgent`，保证 5 个 CacheSafeParams 完全一致（system prompt、user context、system context、tool use context、fork context messages）
- Codex CLI Context Manager：差异更新只发送变更部分，避免全量重注入破坏 cache

### 模式四：压缩后状态恢复（Post-Compact Recovery）

**是什么**：上下文压缩完成后，主动重新注入关键工作状态（最近文件、技能、计划、工具通告），弥补摘要带来的信息损失。

**为什么有效**：压缩摘要虽然保留了宏观叙事，但丢失了微观的工作状态——Agent 不知道最近在编辑哪个文件、当前的计划是什么、有哪些工具可用。不恢复这些状态，压缩后的第一轮响应质量会急剧下降，用户体验从"无感知压缩"退化为"压缩 = 失忆"。

**适用场景**：
- 任何使用 LLM 摘要作为压缩手段的系统
- Agent 依赖外部状态（文件、工具、技能）的系统
- 压缩频率较高的长时间会话

**实例**：
- Claude Code：重新注入最近 5 个文件（50K token 预算）+ 技能内容（25K 预算）+ Plan 文件 + 工具/MCP 增量通告 + 异步 Agent 状态
- Codex CLI：Ghost Snapshot 独立保留，确保 undo 功能在压缩后仍可用
- Aider：在系统提示中注入最近被编辑文件的当前 diff

### 模式五：两阶段记忆提取（Two-Phase Memory Extraction）

**是什么**：先用低成本模型对每个会话/任务独立提取候选记忆（允许 No-op），再用高成本模型做全局整合和去重。

**为什么有效**：经济性。不是所有对话都包含值得持久化的信息（如一次简单的 `ls` 调用不应该产生记忆）。弱模型的"No-op 门控"过滤了大部分无价值的候选项，只让有信号的内容进入昂贵的整合阶段。强弱模型搭配将总成本降低一个数量级。

**适用场景**：
- 大量并发的会话需要记忆提取
- 记忆质量和提取成本需要平衡
- 记忆需要跨多个会话整合（去重、合并、清理）

**实例**：
- Codex CLI Phase 1：`gpt-5.4-mini` + Low reasoning，8 并发，显式允许 No-op
- Codex CLI Phase 2：`gpt-5.3-codex` + Medium reasoning，全局锁单例，整合 + 清理
- Claude Code extractMemories：forked agent 在对话结束时 fire-and-forget 提取，主 Agent 已写入则跳过（互斥）

### 模式六：记忆巩固与清理（Memory Consolidation & Pruning）

**是什么**：记忆不是只增不减的，需要定期审查、合并矛盾条目、删除过时信息、转换相对日期为绝对日期。

**为什么有效**：不清理的记忆比没有记忆更危险——过时的架构约定、已经修复的 bug workaround、相对日期（"昨天"）在三周后完全无法解读。记忆腐败会误导 Agent 做出错误决策。定期清理确保记忆始终反映项目的真实状态。

**适用场景**：
- 长期运行的项目（数周到数月）
- 多人协作的代码库（团队成员各自的记忆可能矛盾）
- 高频变更的代码库（架构约定经常变化）

**实例**：
- Claude Code autoDream：24h + 5 个新会话后触发，审查多个历史会话的转录，清理矛盾记忆
- Codex CLI Phase 2 遗忘机制：按过期天数批量删除 DB 行，增量清理被移除 thread 支持的内容

### 模式七：信息进入前裁剪（Pre-Entry Filtering）

**是什么**：在信息进入上下文之前就做裁剪，而非事后压缩。限制每次观察的 token 数上限、只保留签名而非完整内容、截断 diff 为统计信息。

**为什么有效**：预防比治疗更经济。信息一旦进入上下文，后续的压缩需要 LLM 调用来判断哪些可以丢弃。在信息进入前就做裁剪，只需要简单的规则（如 token 上限、正则匹配），成本几乎为零。

**适用场景**：
- 工具输出量大且可预测的场景（`ls`、`grep`、`git diff`）
- Agent 不需要完整输出的场景（如只需要知道"有没有匹配"而非"所有匹配内容"）
- 上下文预算非常紧张的嵌入式场景

**实例**：
- SWE-Agent：`ls` 输出截断为最近文件、`git diff` 截断为统计信息
- Aider Repo Map：tree-sitter 提取只保留函数签名和调用关系，不包含函数体
- Codex CLI 大 Rollout 按 70% 上下文窗口截断（head+tail 保留）

### 模式八：差异更新（Differential Update）

**是什么**：保存上一次的完整状态快照作为基线，每次只发送变更部分，而非全量重发。

**为什么有效**：大多数 turn 之间只有少量状态变化（如权限更新、新工具注册），全量重发会浪费大量 token 和破坏 cache。差异更新将增量成本从 O(n) 降低到 O(delta)。

**适用场景**：
- 系统上下文、工具列表等每 turn 都需要注入但变化频率低的内容
- 多 turn 对话中重复注入大量不变内容的场景

**实例**：
- Codex CLI Context Manager：`reference_context_item` 保存上一次快照，每 turn 只发 diff
- Claude Code Post-Compact 增量通告：只通告压缩前存在但压缩后缺失的工具/Agent/MCP（delta 模式）
- Claude Code Deferred Tools：通过 `defer_loading` 延迟加载的工具，只在需要时注入工具描述

---

## 4. 最佳实践清单

按优先级从高到低排序，每条说明做什么以及为什么。

### P0：必须有（缺了就不可用）

#### 4.1 实现多层压缩而非单一策略

**做什么**：建立至少 3 层压缩——轻量裁剪（清除旧 tool results）、中等压缩（归档不活跃消息）、完整摘要（LLM 生成 handoff summary）。每层有不同的触发条件和成本特征。

**为什么**：Claude Code 的生产数据表明，没有分层策略的系统要么过于激进（频繁摘要导致信息丢失），要么过于保守（经常触发 413 错误）。分层让 99% 的情况通过低成本层解决。Codex CLI 的溢出优雅降级也证明了多层 fallback 的必要性。

#### 4.2 压缩后必须恢复关键工作状态

**做什么**：压缩完成后，主动重新注入：最近访问的文件（带 token 预算上限）、当前工作计划、已加载的技能/工具、异步任务状态。

**为什么**：没有恢复的压缩 = 失忆。Claude Code 的 Post-Compact 恢复设计（5 个文件 + 50K token 预算 + 去重优化）是压缩系统可用性的关键。Codex CLI 的 Ghost Snapshot 保留了 undo 能力。

#### 4.3 实现熔断器防止无限重试

**做什么**：连续 N 次压缩失败后停止自动重试，通知用户手动处理。

**为什么**：Claude Code 生产数据显示，没有熔断器时 1,279 个会话出现 50+ 次连续失败（最多 3,272 次），每天浪费 25 万次 API 调用。不可恢复的上下文溢出不会自行修复，继续尝试只会浪费资源。

#### 4.4 所有上下文操作必须考虑 Prompt Cache 影响

**做什么**：优先使用不修改消息内容的压缩方式（API 层编辑、差异更新），避免在需要 cache 命中的场景下修改 prompt 前缀。

**为什么**：Claude Code 的 Cached Microcompact 将 cache 命中率从 2% 提升到 98%，这是 ROI 最高的优化。任何修改消息内容的操作都会破坏 prompt cache，导致完整重计费。Codex CLI 的差异更新也是同样的思路。

### P1：应该有（显著提升体验）

#### 4.5 记忆提取应该自动化而非手动

**做什么**：对话结束时自动提取关键信息（用户偏好、项目决策、反馈纠正），写入持久化存储，下次会话自动注入。

**为什么**：手动编写记忆/规则文件（如 Cursor 的 `.cursor/rules/`）的 adoption 极低——用户不会持续维护。自动提取（Claude Code 的 extractMemories、Codex CLI 的两阶段管线）确保记忆始终是最新且完整的。

#### 4.6 记忆需要定期清理和巩固

**做什么**：建立定期审查机制——合并矛盾条目、删除过时信息、转换相对日期为绝对日期、限制索引大小。

**为什么**：不清理的记忆比没有记忆更危险。Claude Code 的 autoDream 证明了记忆腐败是真实存在的问题——旧架构约定、已修复的 workaround、模糊的相对日期都会误导 Agent。

#### 4.7 使用渐进式披露管理可选内容

**做什么**：将可选功能/工具/文档按粒度分层——元数据常驻（低 token 成本）、完整内容按需加载、资源文件按需读取。

**为什么**：Codex CLI 的 Skills 系统证明了这种模式可以在上下文中同时"存在"数十个可选功能，而只消耗被触发的功能的 token。Aider 的 Repo Map 用几千 token 提供了整个代码库的全局视图。

#### 4.8 信息进入上下文前就做裁剪

**做什么**：为工具输出设置 token 上限，对 `ls`/`grep`/`diff` 等输出在进入上下文前截断，只保留最相关的部分。

**为什么**：SWE-Agent 和 Aider 证明了"预防比治疗更经济"。信息一旦进入上下文，后续的压缩需要 LLM 调用来判断重要性。在进入前用简单规则裁剪，成本几乎为零。

### P2：可以有（锦上添花）

#### 4.9 团队记忆同步

**做什么**：支持在团队成员间同步记忆，包含密钥扫描保护、增量同步、冲突解决策略。

**为什么**：Claude Code 的 teamMemorySync 解决了"团队知识孤岛"问题——协作者不需要各自独立发现相同的事实。密钥扫描（基于 gitleaks 规则）防止凭证泄露。

#### 4.10 两阶段记忆提取

**做什么**：用弱模型做初步过滤（允许 No-op），只用强模型做全局整合。

**为什么**：Codex CLI 的实践表明，大部分会话不包含值得持久化的信息。弱模型的 No-op 门控过滤了大部分无价值候选项，将总成本降低一个数量级。

#### 4.11 差异更新系统上下文

**做什么**：保存上一次的完整上下文快照，每 turn 只发送变更部分。

**为什么**：Codex CLI 的 Context Manager 将每 turn 的系统上下文注入成本从 O(n) 降低到 O(delta)。在系统上下文大但变化频率低的场景下效果显著。

---

## 5. 对 xyz-harness 的启示

### 5.1 当前 xyz-harness 的上下文管理现状

xyz-harness 的 Auto Mode 通过 `coding-workflow` 扩展实现了 phase 级别的上下文隔离——每个 phase 只注入对应的 skill 指令，`compact()` 在 phase 切换时清除对话历史。这是一种"phase 粒度的上下文管理"，核心目标是防止 AI 利用前序 phase 的记忆偷跑或跳过。

### 5.2 改进方向一：Phase 内的细粒度上下文管理

**现状**：xyz-harness 在 phase 切换时做全量 compact，但 phase 内（尤其是 Phase 3 dev，可能涉及数十个文件的修改）没有上下文管理机制。长时间运行的 Phase 3 可能遇到上下文溢出。

**启示**：借鉴 Claude Code 的多层压缩，在 phase 内引入轻量级的上下文管理：
- 已完成的 subagent 结果可以压缩为摘要（而非保留完整输出）
- 旧的 tool results 可以在 subagent 完成后清除
- Phase 内的 gate 检查结果可以替代原始测试输出作为上下文

**具体建议**：在 subagent 返回结果后，只保留摘要 + 关键文件路径 + verdict，清除完整的测试输出和 shell 日志。这与 Claude Code 的 Microcompact 思路一致——清除过期的 tool results，只保留决策上下文。

### 5.3 改进方向二：跨 Phase 的状态恢复

**现状**：phase 切换时 compact 清除所有历史，但新 phase 不知道前一 phase 产出了什么文件、做了什么决策。目前通过"deliverables 路径"传递，但 AI 需要自行读取这些文件来恢复上下文。

**启示**：借鉴 Claude Code 的 Post-Compact Recovery，在 phase 切换时主动注入前一 phase 的关键状态：
- 前一 phase 产出的所有 deliverables 路径 + 简要描述
- 前一 phase 的 review 结论（关键问题列表）
- 当前 phase 需要读取的文件列表

**具体建议**：在 phase-start 的 skill 注入中，不仅包含当前 phase 的指令，还包含一个 `previous_phase_summary` 附件（限制在 5K token 内），包含前一 phase 的关键产出和决策。这比让 AI 自行读取 spec.md/plan.md 更高效。

### 5.4 改进方向三：Retrospect 的记忆化

**现状**：retrospect 文件是每个 phase 独立生成的，但没有跨 phase 的记忆整合。Phase 1 的 retrospect 和 Phase 4 的 retrospect 之间没有关联。

**启示**：借鉴 Claude Code 的 autoDream 和 Codex CLI 的 Phase 2 整合，在整体 workflow 结束时（Phase 5 的 overall_retrospect）做一次跨 phase 的记忆整合：
- 识别跨 phase 重复出现的问题模式
- 提取可复用于未来 workflow 的经验教训
- 清理已过时的上下文假设

**具体建议**：在 `overall_retrospect.md` 模板中增加"跨 Phase 模式"章节，要求 AI 识别在整个 workflow 中反复出现的问题和成功的策略。这些模式可以注入到未来的 harness 运行中作为参考。

### 5.5 改进方向四：Skill 内容的渐进式披露

**现状**：xyz-harness 的 skill 通过 `before_agent_start` 事件完整注入 SKILL.md 内容。对于长 skill（如 `xyz-harness-brainstorming` 的完整指令），一次性注入可能占用大量上下文。

**启示**：借鉴 Codex CLI Skills 的三级渐进式披露，将 skill 内容分层：
- **始终注入**：skill 名称 + 核心目标 + deliverables 要求（约 200 词）
- **按需加载**：完整的方法论和步骤指引（skill body）
- **引用按需**：references 和 scripts

**具体建议**：将每个 SKILL.md 拆分为 `summary`（始终注入）和 `body`（按需注入）。在 `before_agent_start` 中只注入 summary，当 AI 需要执行具体步骤时再通过 tool 加载完整 body。这将每个 phase 的初始 skill 注入从可能的数千 token 降低到数百 token。

### 5.6 改进方向五：Subagent 结果的 Cache-Safe 处理

**现状**：review subagent 和 retrospect subagent 的结果作为普通消息注入主 agent 上下文。如果多个 subagent 并行运行，它们的完整输出会同时占用上下文。

**启示**：借鉴 Claude Code 的 Forked Agent + CacheSafeParams 设计：
- Subagent 与主 agent 共享 prompt cache（相同的 system prompt + tools 配置）
- Subagent 结果在注入主 agent 前做摘要压缩（保留 verdict + 关键发现，清除分析过程）
- 使用差异通告而非全量重发

**具体建议**：为 review/retrospect subagent 的结果定义标准化的摘要格式（verdict + must_fix 列表 + nice_to_have 数量），只注入摘要而非完整报告。完整报告写入文件，AI 按需读取。

### 5.7 改进方向六：熔断器和优雅降级

**现状**：xyz-harness 没有熔断机制。如果某个 phase 的 subagent 反复失败（如 gate check 连续不通过），系统会无限重试。

**启示**：借鉴 Claude Code 的 3 次熔断器：
- Gate check 连续失败 3 次后暂停自动重试，提示用户介入
- Review subagent 失败后不阻塞 workflow，而是标记 WARNING 让 phase-start 二次拦截
- Retrospect 失败后有明确的 fallback 路径（创建空文件 or 用户手动创建）

**具体建议**：在 coding-workflow 扩展的 gate check 循环中加入失败计数器。连续失败 N 次后，不再自动重试，而是返回明确的错误信息和建议的人工干预方式。

### 5.8 改进方向七：Workflow 级别的记忆持久化

**现状**：每个 harness workflow 是独立的，上一次 workflow 的经验不会传递到下一次。

**启示**：借鉴 Claude Code 的跨会话记忆提取和 Codex CLI 的两阶段记忆管线：
- Workflow 结束时自动提取经验教训（什么策略有效、什么导致了 rework）
- 存储到项目级记忆文件（如 `.harness/learnings.md`）
- 新 workflow 启动时注入相关的历史经验

**具体建议**：在 Phase 5 的 `overall_retrospect.md` 中增加"未来 Workflow 建议"章节，并将关键洞察追加到 `.harness/learnings.md`。新 workflow 启动时，skill 注入中包含最近 3 条相关 learnings。

---

## 附录：关键数据点

| 指标 | Claude Code | Codex CLI |
|------|-------------|-----------|
| AutoCompact 触发缓冲 | 13,000 tokens | 上下文窗口 70% |
| 压缩摘要最大 output | 20,000 tokens (p99.99 = 17,387) | 20,000 tokens |
| Post-Compact 文件恢复 | 5 个文件, 50K token 预算 | Ghost Snapshot 保留 undo |
| Post-Compact 技能恢复 | 25K token 预算, 每技能 5K 截断 | 无 |
| 熔断器阈值 | 3 次连续失败 | 溢出时逐条移除 |
| 记忆索引上限 | 200 行, 25KB | 5000 token (memory_summary) |
| 记忆巩固周期 | 24h + 5 个新会话 | Phase 2 全局锁单例 |
| Microcompact 时间阈值 | 60 分钟（匹配 cache TTL） | 无 |
| Cache 命中率优化 | 2% → 98% (Cached MC) | 差异更新 |
| 无熔断器的浪费 | ~250K API 调用/天 | 无数据 |

---

## 参考材料

1. Claude Code 源码设计分析 - 04-核心系统-上下文管理系统
2. Claude Code 源码设计分析 - 09-核心系统-记忆系统
3. Codex CLI 源码设计分析 - 10-核心系统-Skills系统
4. Codex CLI 源码设计分析 - 11-核心系统-记忆与上下文管理
5. Claude Code Context 工程设计详解 (cc-agent-design references)
