# 工具系统与执行编排 — 业界最佳实践调研

> 调研日期：2026-05-21
> 调研范围：Claude Code、Codex CLI、Devin、SWE-Agent、OpenAI Function Calling
> 数据来源：源码级分析（Claude Code、Codex CLI）+ Web 调研（Devin、SWE-Agent、业界对比）

---

## 第一章：工具系统

### 1.1 核心问题定义

AI coding agent 的工具系统要解决的核心矛盾是：**模型是不可信的，但它必须通过工具操控真实世界**。

具体拆解为五个子问题：

| 问题 | 描述 |
|------|------|
| **接口表达力** | 如何让工具对模型足够简单（JSON 输入输出），同时对系统足够丰富（权限、并发、渲染）？ |
| **安全控制** | 模型可以构造任意输入，如何确保工具执行不破坏系统？ |
| **并发编排** | 模型可能同时请求多个工具调用，如何安全地并发执行？ |
| **可扩展性** | 内置工具 + MCP/插件工具 + 自定义工具如何统一管理？ |
| **性能与成本** | 工具注册、发现、执行的延迟如何最小化？token 消耗如何优化？ |

关键数据（Manus 实测生产数据）：**tool responses 占总 token 消耗的 67.6%**，system prompt 仅占 3.4%。优化工具设计比优化 prompt 更有价值。

### 1.2 业界主流方案对比

#### 1.2.1 工具接口设计

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **语言** | TypeScript (Zod Schema) | Rust (Serde 多态) | 未公开 | Python |
| **接口大小** | 793 行、50+ 方法 | 分三个 crate | 简化接口 | ~10 个方法、~30 行循环 |
| **类型安全** | 编译期（Zod + TS 泛型） | 编译期（Rust + Serde） | 运行时 | 运行时 |
| **核心理念** | 自描述能力单元 | 定义与执行分离 | 内置 IDE+Shell+Browser | **ACI（Agent-Computer Interface）** |
| **Schema** | Zod → JSON Schema | 自定义子集 → Responses API | Function Calling | YAML + Bash |
| **独特设计** | backfill、prepareMatcher | FreeformTool (Lark 文法) | 持久化 VM | 无 tool-calling 接口 |

**洞察 1：接口大小反映设计哲学**

Claude Code 的 793 行接口将安全、并发、渲染、分类等职责内聚到工具自身。新增工具只需改一个文件 + 注册表一行。竞品中新增工具需在 5-8 个文件注册回调，遗漏任何一个都产生安全漏洞。

Codex CLI 三层 crate 分离（定义/核心/处理），定义层可独立被 TUI、测试引用，代价是跨 crate 变更需协调。

**洞察 2：ACI 方法论（SWE-Agent 首创）**

SWE-Agent 第一个系统性提出 **Agent-Computer Interface (ACI)** 概念：LM 是新型"终端用户"，需要专门设计的接口。`mini-swe-agent`（~100 行 Python）证明 single tool + good prompt 在 SWE-bench Verified 达到 74-76.8%。**ACI 设计质量 > 框架优化**。

**洞察 3：工具数量 vs 质量（业界共识）**

- Anthropic："Few thoughtful tools targeting specific high-impact workflows"
- SWE-Agent：单一 bash + 好 prompt 够用
- 共识：工具重叠比工具过多更致命。15 个清晰工具 > 40 个重叠工具

#### 1.2.2 工具注册与发现

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **注册模式** | 集中式 `getAllBaseTools()` | 两阶段计划模式 | 静态注册 | YAML 工具包 |
| **延迟加载** | ToolSearch（BM25 搜索） | tool_search + tool_suggest | 无 | 无 |
| **动态工具** | MCP 运行时加载 | MCP + Connector + Plugin | 固定工具集 | 无 |
| **工具数量** | 40+ 内置 + 无限 MCP | ~15 内置 + MCP | ~20 | ~12 |

**Codex CLI 的 Prompt Cache 优先设计**

Prompt 构建 7 层叠加：instructions → 沙箱权限 → 开发者指令 → AGENTS.md → 技能 → 环境上下文 → 用户消息。**配置变更通过追加消息而非修改旧消息**，保持 cache 前缀不变。禁止中途修改工具列表。

#### 1.2.3 安全与权限模型

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **权限层级** | 三层（规则→Hook→分类器） | 渐进式（审批→沙箱→提权） | VM 级隔离 | Docker sandbox |
| **默认策略** | Fail-Closed | 渐进式放行 | 容器级隔离 | 容器级隔离 |
| **Bash 安全** | 23 种模式 + tree-sitter AST | Rust 级沙箱 | VM 环境 | Docker 隔离 |
| **执行隔离** | 本地子进程 | 本地 sandbox (3 模式) | 持久化 VM | Docker sandbox |

**执行隔离模型对比**

| 模式 | 代表 | 优缺点 |
|------|------|--------|
| 本地子进程 | Claude Code, Codex CLI | 零基础设施、低延迟、安全边界依赖 OS |
| Ephemeral Sandbox | Codex CLI cloud | 安全、冷启动成本高 |
| Persistent VM | Devin | 跨 session 状态保持、状态污染风险 |
| Docker 沙箱 | SWE-Agent | 隔离性好、资源占用中等 |

**Claude Code 三层权限**：规则层（零延迟、deny 优先 allow）→ Hook 层（可编程、Shell/HTTP/Agent）→ 分类器层（Haiku 推测性执行，与 UI 并行）。

**Codex CLI 渐进式安全**：审批 → 沙箱首次执行 → 沙箱拒绝时提权重试。

**Devin 持久化 VM**：Auto-derisk（不确定时主动询问用户）、DeepWiki（自动索引仓库）。

**SWE-Agent ACI 组件**：文件查看器（带行号分页）、文件编辑器（精确行替换）、搜索/导航、上下文管理（长输出 collapsing）。

#### 1.2.4 并发控制

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **并发模型** | 流式并发 + 分区策略 | RwLock 读/写锁 | 并行 VM 实例 | 串行 |
| **并发上限** | 默认 10 | 无显式上限 | 按 VM 实例数 | N/A |
| **错误级联** | Bash 错误取消兄弟工具 | 无 | 无 | N/A |

Claude Code 的流式并发：分区策略（连续安全工具合并为 batch 并行）+ 流式结果（完成即返回）+ Fail-Closed 默认。节省 30-60% 时间。

Codex CLI 的 RwLock 模式：读锁（并发安全）可多个持有，写锁（非安全）互斥。零额外数据结构。

#### 1.2.5 Bash 工具安全处理

| 策略 | Claude Code | Codex CLI | SWE-Agent |
|------|-------------|-----------|-----------|
| 命令解析 | tree-sitter AST + legacy | 沙箱处理 | subprocess.run |
| sed/patch | sed 拦截 + diff 预览 | apply_patch (Lark 文法) | 无 |
| 复合命令 | 逐子命令安全检查 | 沙箱级隔离 | 独立进程 |

#### 1.2.6 工具错误处理（业界共识）

**所有主流系统一致：工具返回错误字符串而非抛异常。** 异常打破循环；错误字符串让模型自主纠错。

### 1.3 关键设计模式提炼

**模式 1：Fail-Closed 默认值** — `isConcurrencySafe` 默认 false、`isReadOnly` 默认 false。性能损失容易发现和修复，安全漏洞则潜伏。

**模式 2：工具自描述（Fat Interface）** — 工具知道自己的权限需求、UI 展示、并发行为、安全分类。新增工具只改一个文件。

**模式 3：输入验证多阶段管线** — Zod Schema → validateInput → backfillObservableInput → PreToolUse Hooks → 权限检查（规则→Hook→分类器）→ 执行。每层独立防线。

**模式 4：路径标准化（防绕过）** — Hook 匹配前标准化所有路径为绝对路径。约束：幂等、只变异副本、不影响 API 缓存。

**模式 5：推测性分类器** — 权限检查开始时并行启动 LLM 分类器 API 调用，用户看到对话框时分类器可能已返回自动批准。

**模式 6：ACI 方法论（SWE-Agent）** — 为 LM 设计专门接口，而非沿用人类工具。ACI 设计质量 > 框架优化。

### 1.4 最佳实践清单

1. **Fail-Closed 默认值**：安全属性默认最保守值
2. **工具自描述接口**：权限、并发、渲染、分类内聚到工具自身
3. **多层权限防线**：规则 → Hook → 分类器，渐进式安全
4. **延迟加载工具**：超过 20 个时初始只暴露核心工具
5. **路径标准化前置**：Hook 匹配前标准化所有路径
6. **并发由工具自声明**：基于输入内容判断，非系统静态推断
7. **流式并发执行**：完成即返回，不等全部完成
8. **Bash 错误级联**：Bash 失败取消兄弟工具
9. **结果大小保护**：超阈值持久化到磁盘
10. **工具返回错误字符串**：让模型自主纠错
11. **工具少而精**：15 个清晰工具 > 40 个重叠工具
12. **Prompt Cache 优先**：工具列表顺序稳定，配置变更追加消息

### 1.5 补充：安全事件与教训

**真实事故（2025-2026）**：
- Claude Code 创建名为 `~` 的目录，随后在父目录中执行 `rm -rf `，shell 展开为 home 目录——权限系统本身失效
- Mike Wolak Issue #10077：从 root 执行 `rm -rf` 销毁所有用户拥有的文件——即使没有 `--dangerously-skip-permissions`

**教训**：沙箱是结构性隔离层，权限是逻辑控制层，两者互补而非替代。沙箱只应用于 Bash 是不够的，Read/Write/Edit 等工具在宿主进程执行仍是安全缺口。

**多 Agent 编排的安全隐患**：
- 无编排的多 Agent 系统失败率 >40%
- 2→5 Agent 协调开销从 200ms 增长到 4+ 秒（二次增长）
- 正式编排框架降低失败率 3.2x
- 共享上下文污染：一个被攻陷的 agent 可毒化所有下游
- 记忆管理是多 Agent 系统的 #1 失败原因

**NVIDIA 安全指南关键建议**：
1. 全虚拟化隔离：始终在 VM/Kata 容器中运行 agentic 工具
2. 不仅沙箱 shell：钩子、MCP 配置、skill 脚本都可能绕过沙箱
3. 敏感文件保护：`.env`、SSH keys、credentials 必须从沙箱中排除

### 1.6 对 xyz-harness 的启示

| 启示 | 具体建议 |
|------|---------|
| Gate Check 即工具 | 采用自描述接口设计，每个 phase 的 gate 知道验证什么、如何渲染 |
| Fail-Closed 审批 | gate check 默认 FAIL，只有明确通过才 PASS |
| 多层防护 | L1 上下文隔离 → 规则层；L2 脚本门禁 → Hook 层；L3 独立评审 → 分类器层 |
| 工具设计 > 框架设计 | 优化 gate 和 phase-start 的描述和返回格式比优化循环框架更重要 |
| 工具返回错误字符串 | gate 失败返回结构化错误（具体缺失文件、不满足字段），让 AI 自纠错 |
| 工具 token 成本优化 | tool responses 占 67.6% token，优化 gate/review 返回格式 |
| 并发控制 | review subagent 可并发（读），retrospect 写入串行 |
| 延迟加载 skill | 每个 phase 只注入当前 skill（ToolSearch 思路） |
| 结果大小保护 | review 和 retrospect 输出应有大小限制 |
| 编排不是可选项 | 无编排的多 Agent 系统失败率 >40%，harness 的 phase 编排就是编排框架。正式编排降低 3.2x 失败率 |
| 记忆管理是 #1 失败原因 | 多 subagent 系统最大问题是上下文/记忆混乱，不是模型能力不足。harness 的 compact() + per-phase skill 隔离正是解决方案 |
| 协调器不可执行原则 | Claude Code 的 Coordinator agent 不能执行 Bash、不能读文件。harness 的主 agent 只做编排，不直接写代码 |

---

## 第二章：执行编排

### 2.1 核心问题定义

执行编排的核心矛盾：**Agent Loop 是无限循环，但真实世界的任务有边界条件**。

| 问题 | 描述 |
|------|------|
| **循环结构** | while-true？状态机？事件驱动？ |
| **终止条件** | 何时安全退出循环？ |
| **错误恢复** | API 失败、上下文溢出、工具错误如何恢复？ |
| **状态持久化** | 长任务如何 checkpoint/resume？ |
| **子 Agent 调度** | 如何编排主 Agent 和子 Agent 协作？ |

关键数据：Codex CLI 实测连续运行 25 小时，消耗 13M tokens，生成 30k 行代码。多 agent 系统成本约 15x tokens（标准聊天 = 1x）。**KV-cache hit rate 是唯一最重要的指标**：命中 $0.30/百万 tokens vs 未命中 $3/百万 tokens，10 倍差异。

### 2.2 业界主流方案对比

#### 2.2.1 循环架构

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **架构模型** | while-true + AsyncGenerator | CSP 双队列（Actor） | 自适应 Plan-Execute | while-true + 同步 |
| **核心抽象** | `queryLoop()` | `submission_loop` + CodexThread | Adaptive Planning | ~30 行 while |
| **通信模型** | yield/return Generator | Channel (Sender/Receiver) | VM 内消息 | 同步 subprocess |
| **语言** | TypeScript | Rust | 未公开 | Python |

**Claude Code 的同步 Generator 模型**

`queryLoop()` 是 `async function*`，yield 产出消息，return 终止。单线程，State 对象在迭代间传递。简单直观、调试容易。

**Codex CLI 的 CSP 双队列模型**

`tx_sub: Sender<Submission>` 和 `rx_event: Receiver<Event>` 解耦输入输出。每次 turn 可包含数百次 inference↔tool 迭代。多前端天然支持（TUI、VS Code、App Server）。

**SWE-Agent 的极简循环**

核心仅 ~30 行：每轮一条 bash 命令 → sandbox 执行 → stdout 成为下轮 observation。纯文本交互，无需 tool-calling 接口。

**Devin 的自适应计划**

Plan → Implement → Test → Debug → Deploy 多阶段，计划在执行中持续演变。

#### 2.2.2 终止条件

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **终止路径** | 10 种 | 3 种 TurnAbortReason | N/A | 固定轮次 |
| **正常退出** | 无 tool_use + stop hooks | 模型完成 | 任务完成 | 最大轮次 |
| **Stop Hooks** | 有（可阻止退出） | 无 | 无 | 无 |

**Claude Code 的 10 种退出路径**

| 终止原因 | 条件 |
|---------|------|
| `completed` | 模型返回无 tool_use，stop hooks 通过 |
| `aborted_streaming` | 用户在 streaming 期间中断 |
| `aborted_tools` | 用户在工具执行期间中断 |
| `max_turns` | 达到 maxTurns 限制 |
| `model_error` | API 未预期异常 |
| `blocking_limit` | 上下文超出硬限制 |
| `prompt_too_long` | reactive compact 无法恢复 |
| `stop_hook_prevented` | Stop hook 阻止 |
| `hook_stopped` | 工具 hook 阻止 |

关键：**Stop Hooks 防死循环**——API error 后跳过 stop hooks。

**Codex CLI 三阶段中断**：cancel → 100ms 优雅等待 → 强制 abort。用户中断在历史中插入特殊标记。

#### 2.2.3 错误恢复

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **API 重试** | 指数退避 (base 500ms, max 32s) | 双策略：退避 + 协议降级 | 自纠错 | 简单重试 |
| **模型 Fallback** | Opus → Sonnet | WebSocket → HTTPS | N/A | 无 |
| **上下文溢出** | 6 层恢复链 | 加密 compaction API | collapsing | collapsing |
| **输出截断** | 3 次递增 + 64K 升级 | N/A | N/A | 无 |

**Claude Code 的 6 层上下文溢出恢复**

```
Proactive autocompact → Microcompact → History Snip → Context Collapse →
Reactive Compact → Max output tokens recovery (3次) → Escalated max tokens (8k→64k)
```

**Withheld 机制**：可恢复错误在 streaming 期间被"扣留"，不 yield 给调用方。

**Codex CLI 加密 Compaction**：使用 `/responses/compact` 端点，返回 `encrypted_content` 保留模型 latent understanding，支持 ZDR。

**长任务处理策略对比**

| 策略 | 代表 | 机制 |
|------|------|------|
| 多层压缩 | Claude Code | 6 层 progressively 更激进 |
| 自动 compaction | Codex CLI | API 端点 + 加密内容 |
| 进度文件 | Anthropic harness | `claude-progress.txt` + feature_list.json |
| Git 提交 | Anthropic harness | 每次 session 结束 commit，新 session 读 git log |
| Interactive Planning | Devin 2.0 | 用户可介入修改计划 |
| Subagent 隔离 | Claude Code | Task 工具派生子 agent，返回压缩摘要 |

#### 2.2.4 子 Agent 调度

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **调度模式** | 同步/异步/Fork 三种 | 串行 (at most 1 task) | 并行 VM 实例 | 无子 Agent |
| **上下文共享** | Fork 共享 prompt cache | 无缓存共享 | DeepWiki 索引 | N/A |
| **权限隔离** | permissionMode 覆盖 | 独立审批上下文 | VM 级隔离 | Docker 隔离 |
| **状态恢复** | sidecar + resume | ZDR + 加密 compaction | 持久化 VM | 轨迹文件回放 |

**Claude Code 的 Fork 机制**

核心：让子 Agent 的 API 请求前缀与父级 byte-identical，最大化 prompt cache 命中。

```
父级: [system][tools][msg1]...[msgN]          → 缓存写入
Fork:  [system][tools][msg1]...[msgN][directive] → 缓存命中!
```

`CacheSafeParams` 保证 system prompt、tools、model、messages prefix、thinking config 完全匹配。防递归：检测 `FORK_BOILERPLATE_TAG`。

**Codex CLI 的严格串行模型**

任何时刻最多一个活跃 task。`spawn_task` 第一步是 `abort_all_tasks`。`MailboxDeliveryPhase`（CurrentTurn/NextTurn）控制 Agent 间消息处理时机。

**Devin 的并行 VM 模型**

多个 Devin 实例同时运行在独立 VM 中，工程师一个早上可启动 4 个并行实例。

#### 2.2.5 状态持久化与恢复

| 维度 | Claude Code | Codex CLI | Devin | SWE-Agent |
|------|-------------|-----------|-------|-----------|
| **会话恢复** | sidecar + transcript | ZDR + 加密 compaction | 持久化 VM | .traj 轨迹回放 |
| **远程恢复** | pollRemoteSessionEvents | N/A | 原生 | N/A |
| **长任务策略** | 进度文件 + git commit | 自动 compaction API | Interactive Planning | collapsing |

Claude Code：`contentReplacementState` 从 sidechain 重建，确保相同 tool_result 被重新替换（cache 稳定性）。稳定空闲检测：远程 Agent 需连续 5 次检测到空闲才认为结束。

### 2.3 关键设计模式提炼

**模式 1：状态机 > 纯 Agentic Loop**

| 维度 | 纯 Agentic Loop | 状态机驱动的 Loop |
|------|----------------|-------------------|
| 终止条件 | LLM 自行决定（可能无限循环或过早停止） | 显式定义终止状态 |
| 错误处理 | LLM 自己想办法 | 预定义的错误处理状态 |
| 可预测性 | 低 | 高——每个状态只有合法转换 |
| 状态转换 | 隐式，由 LLM 输出决定 | 显式，由条件/事件触发 |

Claude Code 的 `State.transition.reason` 就是状态机思想的体现——记录前一次迭代为什么 continue，防止无限重试同一策略。

**模式 2：Plan-and-Execute > ReAct**

与每步都调用 LLM 的 ReAct 不同，plan-and-execute 先由 planner 生成完整任务分解，再由 executor 逐步执行。LangChain 的 LLMCompiler 实现 DAG 任务流，**报告相比顺序 ReAct 有 3.6 倍加速**。

**模式 3：起始简单原则** — OpenAI 和 Anthropic 一致建议：从单 agent loop 开始，只有任务复杂度确实需要时才引入多 agent 编排。大多数生产系统从单个 agent loop 起步。

**模式 4：AsyncGenerator 循环** — `async function*` yield 产出、return 终止。惰性产出、流式响应、可控终止。

**模式 5：不可变状态更新** — State 对象整体替换，避免部分更新不一致。

**模式 6：Withheld 机制** — 可恢复错误扣留不暴露，防止调用方过早终止。

**模式 7：Fork Prompt Cache 共享** — byte-identical 前缀最大化 cache 命中。KV-cache 10 倍成本差异。

**模式 8：三阶段中断** — 信号 → 优雅等待(100ms) → 强制终止。

**模式 9：Checkpoint 三种粒度**

| 粒度 | 代表 | 特点 |
|------|------|------|
| 节点级 | LangGraph | 每个节点前后写入 checkpoint，恢复时重复最少，存储量最大 |
| 活动级 | Temporal | Event History 重放，跳过已完成活动，确定性工作流代码 |
| 显式提交点 | 自定义 | 开发者手动插入 save，逻辑清晰但可能重复更多工作 |

**模式 10：多层上下文压缩** — 6 层 progressively 更激进：Snip → Microcompact → Collapse → AutoCompact → Reactive → Output Recovery。

### 2.4 最佳实践清单

1. **while-true + AsyncGenerator**：简单直观，调试容易。差异在循环外围
2. **状态机 > 纯 Agentic Loop**：显式状态转换、预定义错误处理、高可预测性
3. **Plan-and-Execute > ReAct**：先规划再执行，报告 3.6 倍加速
4. **起始简单原则**：从单 agent loop 开始，只在需要时引入多 agent
5. **不可变状态更新**：每次迭代整体替换 State
6. **多层错误恢复**：API 重试、模型 fallback、上下文压缩、输出恢复
7. **Withheld 机制**：可恢复错误不立即暴露
8. **流式工具执行**：减少等待 30-60%
9. **严格终止条件枚举**：Claude Code 10 种，每种都有处理
10. **三阶段中断**：信号 → 优雅等待 → 强制终止
11. **Fork Cache 共享**：KV-cache 10 倍成本差异
12. **Checkpoint 三种粒度**：节点级（LangGraph）、活动级（Temporal）、显式提交点
13. **Stop Hooks 防死循环**：API error 后跳过 stop hooks
14. **per-turn context**：每次提交自包含

### 2.5 对 xyz-harness 的启示

| 启示 | 具体建议 |
|------|---------|
| Phase 循环 = Agent Loop | phase 1→2→3→4→5 是特殊的 Agent Loop。gate check 是终止条件，phase-start 是状态转移 |
| Withheld 等价物 | gate check 失败时 `phase-start BLOCKED` 已实现 withheld 效果 |
| 多层恢复 | gate/review 失败时渐进式恢复：重试 → 降级检查 → 人工干预 |
| Fork 等价物 | review/retrospect subagent 独立 fork，有自己上下文和权限，通过 topic 目录共享数据。Fork cache 共享可降低 API 成本 |
| 状态持久化 | harness state（currentPhase、phaseResults）应持久化，支持中断后 resume |
| 终止条件枚举 | 每 phase 明确退出路径：正常完成、gate 失败（可恢复）、gate 失败（不可恢复）、用户中断 |
| 流式执行 | review + retrospect 并发启动，phase-start 等两者都完成 |
| per-phase context | 每 phase 只注入当前 skill，compact() 清除历史。等价 per-turn context |
| 进度文件 | 参考 Anthropic harness 的 `claude-progress.txt`，在 topic 目录维护进度文件 |
| 状态机思维 | harness 的 phase 1→2→3→4→5 就是显式状态机。每个 phase 是一个状态，gate check 是状态转换条件，phase-start 是状态转换动作。比纯 LLM 循环更可预测 |
| Plan-and-Execute 对应 | harness 的 Phase 2 (plan) 对应 planner，Phase 3 (dev) 对应 executor。plan-execute 分离是业易证有效的模式，报告 3.6 倍加速 |
| Checkpoint 粒度选择 | harness 采用“显式提交点”模式——每个 phase 结束是一个 checkpoint（spec.md、plan.md、test_results.md）。这是最粗粒度但逻辑最清晰的。可考虑在 phase 内部增加更细粒度的 checkpoint |
| 工具 token 成本 | tool responses 占 67.6% token。优化 gate/review 返回格式，避免冗余 |

---

## 附录：核心参考资料

| 资料 | 内容 |
|------|------|
| Claude Code 工具系统 | 793 行接口、流式并发执行、分区策略、Zod Schema |
| Claude Code Agent 循环 | 10 种终止条件、6 层上下文恢复、AsyncGenerator |
| Claude Code 子代理系统 | Fork 机制、CacheSafeParams、Task 框架、状态隔离 |
| Codex CLI 工具系统 | 三层 crate、RwLock、渐进式安全、tool_search |
| Codex CLI Agent 循环 | CSP 双队列、三阶段中断、协议降级、oneshot 审批 |
| Claude Code 安全模型 | 三层权限、tree-sitter Bash 解析、23 种安全模式 |
| SWE-Agent | ACI 方法论、~30 行核心循环、mini-swe-agent |
| Devin | 持久化 VM、自适应 Plan-Execute、并行实例、Auto-derisk |
| 业界对比 | arXiv 9 维度分类法、Manus token 成本数据、KV-cache 10x 成本差异 |
