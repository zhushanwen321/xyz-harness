# Harness 术语表

> 所有 harness skill 和 agent 必须使用本表定义的标准术语。首次出现用全称，后续可用简称。
> 文件名、命令名、变量名使用英文原名；面向用户的描述文字使用中文。

---

## 1. 流程层级体系

Harness 使用两级执行层级：**Phase > Stage**。Task 是 plan 文档内部的概念，不属于 workflow 层级。

```
Phase (工作模式)
 +-- Stage (固定执行阶段，有交付物和门禁)

plan.md / e2e-test-plan.md
 +-- Task (AI 自行管理的工作拆分，extension 不追踪)
```

### 核心概念

| 中文 | 英文 | 含义 |
|------|------|------|
| 阶段组 | Phase | 工作模式。Phase 1 = 需求沟通 (Stage 1-8)，Phase 2 = 开发交付 (Stage 9-15) |
| 执行阶段 | Stage | Phase 内的固定执行阶段，有唯一的编号、名称和门禁。共 15 个 Stage |
| 交付物 | Deliverable | Stage 完成时必须产出的文件。extension 在 Stage 推进时验证交付物存在且内容合规 |
| 任务 | Task | plan 文档内部的工作拆分。属于 plan.md（开发计划）或 e2e-test-plan.md（测试计划），由 AI 在 Stage 内部自行管理，extension 不追踪 |

### Task 的归属

Task 不是 workflow 的层级概念，而是 plan 文档的内部概念：

| 文档 | Task 含义 | 所在 Stage |
|------|-----------|------------|
| plan.md | 开发任务，每个 Task = 一次 TDD coder + executor + reviewer 链 | Stage 9 编码实现 |
| e2e-test-plan.md | 测试用例/测试组 | Stage 12 E2E 测试 |

### 流程术语

| 中文 | 英文 | 含义 |
|------|------|------|
| Phase 1 需求沟通 | Phase 1 Requirements | 从用户提出需求到产出自包含的 spec + plan 的全过程。使用 `/coding-workflow design` 启动，包含 Stage 1-8 |
| Phase 2 开发交付 | Phase 2 Development | 基于 Phase 1 产出物执行编码、测试、部署的全过程。使用 `/coding-workflow dev` 启动，包含 Stage 9-15 |
| 确认点 | Checkpoint | 流水线中强制暂停、等待用户决策的节点 |
| 门禁 | Gate | 阶段完成后的质量关卡，通过后才允许进入下一阶段。分 L1（脚本检查）和 L2（subagent 检查）两级 |
| 交付物验证 | Deliverable Check | Stage 推进时的交付物存在性+内容检查，验证必需的文件存在且内容合规 |
| 回退 | Rollback | 门禁或评审不通过时，流水线退回到目标阶段重新执行 |
| 复盘 | Retrospective | Stage 15 的自动分析，回顾回退根因、评审有效性、CLAUDE.md 改进建议 |
| 回退路由表 | Rollback Routing Table | 定义各类失败场景对应的回退目标阶段的查找表 |
| 评审轮次上限 | Review Round Limit | 各评审模式的循环上限。超限则升级到人工决策 |

## 2. 角色

| 中文 | 英文 / Agent 名 | 含义 |
|------|-----------------|------|
| 主 agent | Controller / Main agent | 流水线调度器，不直接执行业务逻辑，只派遣 subagent、检查门禁、在确认点暂停 |
| TDD coder | harness-tdd-coder | 编写失败测试的 subagent，不写实现代码 |
| 执行 subagent | harness-backend-developer | 编写实现代码使测试通过的 subagent |
| 前端开发 subagent | harness-frontend-developer | 前端三阶段开发（骨架→功能→美化）的 subagent，不走 TDD 流程 |
| 评审 subagent | harness-reviewer | 执行 spec/plan/代码/测试评审的 subagent，加载 expert-reviewer skill |
| 门禁 subagent | harness-gate-checker | 独立验证阶段产出的 subagent |
| 后端设计规划 | harness-backend-planner | L2 复杂度下编写 plan-backend.md 和 plan-api-contract.md 的 subagent |
| 前端设计规划 | harness-frontend-planner | L2 复杂度下编写 plan-frontend.md 的 subagent |
| 后端设计评审 | harness-backend-plan-reviewer | L2 复杂度下评审后端设计的 subagent |
| 前端设计评审 | harness-frontend-plan-reviewer | L2 复杂度下评审前端设计的 subagent |
| API 对齐 | harness-api-alignment | L2 复杂度下以后端 API 合约为准修正前端设计的 subagent |
| E2E 测试 subagent | harness-e2e-tester | 按 e2e-test-plan.md 执行端到端测试的 subagent |
| 代码库扫描 subagent | general-purpose (read-only) | Stage 1 开头以只读模式扫描代码库的 subagent，产出 infrastructure-scan.md |

---

## 3. 产出物

| 中文 | 文件名 | 含义 |
|------|--------|------|
| 需求设计文档 | spec.md | 记录需求目标、范围、约束、决策、验收标准的设计文档。Phase 1 核心产出 |
| 实现计划 | plan.md | 基于 spec 拆分的 task 列表，每个 task 包含描述、验收标准、文件变更、风险点 |
| E2E 测试计划 | e2e-test-plan.md | 基于 spec + plan 生成的端到端测试用例，面向 AI agent 的操作手册 |
| 后端设计文档 | plan-backend.md | L2 复杂度下的后端详细设计（领域模型、状态机、存储设计） |
| API 合约文档 | plan-api-contract.md | L2 复杂度下的 API 端点请求/响应结构定义 |
| 前端设计文档 | plan-frontend.md | L2 复杂度下的前端详细设计（组件设计、交互逻辑） |
| 全流程追溯 | summary.md | 需求从启动到完成的全过程状态记录，每阶段实时更新 |
| 评审报告 | review_v{N}.md | 评审 subagent 产出的意见列表（MUST FIX / LOW / INFO），版本递增不删除 |
| 验证证据 | evidence/*.md | 本地验证输出、CI 结果、部署结果的原始记录 |
| 复盘报告 | retrospective.md | Stage 15 产出的回退根因分析和改进建议 |
| 运行指标 | metrics.json | 每个需求的 token 消耗、耗时、回退次数等量化指标 |
| 门禁通过标记 | stage-{NN}.pass | gate-script.sh 生成的通过标记文件，gitignore 不入库 |
| 基础设施扫描报告 | infrastructure-scan.md | 代码库扫描 subagent 产出的项目结构和代码索引，供 brainstorming 和 spec 编写使用 |

### 交付物 vs 产出物

统一使用**交付物**。指一个阶段完成时向外输出的文件或状态。以下语境中固定使用：

- 「交付物：」— 阶段描述中列出该阶段产出的文件
- subagent 返回值 `deliverables` 字段 — 交付物路径列表

---

## 4. 概念

| 中文 | 英文 | 含义 |
|------|------|------|
| 任务 | Task | plan 文档（plan.md / e2e-test-plan.md）内部的工作拆分，由 AI 在 Stage 内自行管理。不是 workflow 层级概念 |
| 子任务 | Subtask | todolist 的 expand_step 展开的 Phase 1 Step 内部子步骤 |
| TDD | Test-Driven Development | 先写失败测试再写实现的红绿重构循环 |
| Change-driven Testing | Change-driven Testing | Stage 11 的测试方法论：分析代码变更，对每个变更接口编写接口级测试，与 TDD（函数级）互补 |
| L1 门禁 | L1 Gate | 可程序化验证的质量检查（文件存在、编译、测试、lint），由 gate-script.sh 执行 |
| L2 门禁 | L2 Gate | 需要判断力的质量检查（内容质量、spec 覆盖度），由 gate-checker subagent 执行 |
| L1 复杂度 | L1 Complexity | 实现计划只需单文件 plan.md，无并行前端/后端设计 |
| L2 复杂度 | L2 Complexity | 实现计划需要拆分为 plan-backend.md + plan-api-contract.md + plan-frontend.md |
| spec 合规检查 | Spec Compliance Check | 验证代码实现是否覆盖 spec 中该 Task 的所有要求，由 reviewer subagent 执行 |
| 验收标准 | Acceptance Criteria | spec.md 或 plan.md Task 中具体的、可检查的通过条件 |
| 六要素完整性检查 | Six-element Completeness Check | Stage 1 中对 spec 的 Outcomes/Scope/Constraints/Decisions/Verification/行为约束 的逐项检查 |
| 引用扫描 | Reference Scan | spec-ref-scan.sh 检查 spec 中提到的代码标识符和文件路径是否存在 |
| 基础设施扫描 | Infrastructure Scan | Stage 1 开头的代码库扫描，产出 infrastructure-scan.md 供后续提问和 spec 编写使用 |
| Context Diet | Context Diet | 每个 subagent 只传入完成任务所需的最小上下文，不传完整 spec/plan |
| Compaction | Compaction | 确认点 1 通过后清理交互阶段对话历史，保持调度阶段上下文干净 |

### 评审体系

| 中文 | 英文 | 含义 |
|------|------|------|
| 计划评审 | Plan Review | Stage 5 的评审模式，审 spec + plan 的完整性、可行性和一致性。循环上限 ≤3 轮 |
| 编码评审 | Code Review | Stage 10 的评审模式，审 spec 合规 + 代码质量 + 架构合规 + 安全性能。循环上限 ≤2 轮 |
| 测试评审 | Test Review | Stage 13 的评审模式，审测试覆盖度 + 质量 + 可维护性 + 数据构造。循环上限 ≤2 轮 |
| 上下文隔离 | Context Isolation | 评审 subagent 的核心原则：不继承执行 subagent 的对话历史和上下文，只看交付物和规范，保证评审客观性 |
| AC 覆盖矩阵 | AC Coverage Matrix | 测试评审中必须产出的表格，逐条列出 spec 验收标准与测试的覆盖关系（✅完整 / ⚠️部分 / ❌未覆盖） |

### subagent 返回值

| 状态 | 含义 | 适用角色 |
|------|------|----------|
| DONE | 任务完成，交付物就绪 | 执行/评审/门禁 subagent |
| DONE_WITH_CONCERNS | 任务完成但有关注点（非阻塞），主 agent 评估后决定是否进入下一步 | 执行 subagent |
| NEEDS_CONTEXT | 缺少必要信息，主 agent 补充上下文后重新派遣 | 执行/TDD subagent |
| BLOCKED | 无法完成，需升级到用户决策 | 执行/TDD subagent |
| pass | 门禁通过 | 门禁 subagent |
| fail | 门禁不通过，附 rollback_target 指示回退目标阶段 | 门禁/执行 subagent |

### 评审意见优先级

| 级别 | 含义 | 处理方式 |
|------|------|----------|
| MUST FIX | 不修复则评审不通过，阻塞流程、消耗轮次预算 | 必须修复后重审 |
| LOW | 建议修复但不阻塞 | 记录但不强制 |
| INFO | 观察记录，无需操作 | 仅存档 |

### spec.md 必填章节

spec.md 中以下章节为必填，缺少则在计划评审（Stage 5）时标记为 MUST FIX。

| 章节名 | 含义 |
|--------|------|
| 行为约束 | 用三层边界约束 agent 行为：Always（必须遵守）、Ask First（需确认）、Never（绝对禁止） |
| 已做决策 | 明确列出已确定的技术选型（数据库、认证、状态管理等），防止 agent 重新选择 |
| 已有基础设施 | 列出可复用的 API、接口/类型定义位置、技术调研结论、已知技术债务 |
| 数据流 | 涉及数据存储/传递时的必填章节，用表格+流程图定义字段的生产者、存储位置、消费者和时序 |
| 验收标准 | 具体的、可检查的通过条件列表 |

### 编码方法论

| 中文 | 英文 | 含义 |
|------|------|------|
| 红绿重构 | Red-Green-Refactor | TDD 的核心循环：RED（写失败测试）→ GREEN（最小实现）→ REFACTOR（重构） |
| 骨架→功能→美化 | Framing→Plumbing→Finishing | 前端开发 subagent 的三阶段工作流。骨架：布局占位编译通过；功能：交互逻辑 API 集成；美化：视觉对齐截图验证 |
| 四层验证策略 | Four-layer Verification | E2E 测试的验证分层：API 响应 → DOM/A11y → 视觉对比 → 数据库。每个用例至少覆盖两层 |
| 实现偏差记录 | Spec Deviations | 执行 subagent 返回的与 spec 的偏差列表，主 agent 回写到 spec.md 确保后续评审读到最新状态 |
| 模式 A / 模式 B | Mode A (TDD) / Mode B (non-TDD) | executor 的两种工作模式。Mode A 有预先失败测试；Mode B 自行 TDD。Harness 流程中禁用 Mode B |

### Clean Architecture 分层

| 层 | 英文 | 职责 |
|----|------|------|
| 入口层 | Entry Layer | 接收外部请求、参数校验、响应格式化 |
| 编排层 | Orchestration Layer | 用例编排、事务管理、调用领域层 |
| 领域层 | Domain Layer | 业务规则、领域模型、纯逻辑无外部依赖 |
| 数据层 | Data Layer | 数据访问抽象、Repository 接口 |
| 集成层 | Integration Layer | 外部服务调用（HTTP client、消息队列） |
| 基础设施层 | Infrastructure Layer | 框架绑定、DI 配置、启动引导 |

外层可调用内层（单向依赖），集成层和基础设施层可被任意层调用。

### Spec 质量检查概念

| 中文 | 英文 | 含义 |
|--------|------|------|
| 歧义标记 | [AMBIGUOUS] | 六要素检查中在 spec 里标记的歧义语言（模糊形容词、未量化阈值等），必须逐一与用户确认后消除 |
| 设计系统预检 | Design System Pre-check | 前端 agent 阶段 0 的必执行步骤：加载编码规范→验证基础设施→加载参考组件 |
| 视觉闭环 | Visual Closed-loop | 前端美化阶段的验证策略：CDP computed style diff（精确层）+ VLM 截图对比（语义层） |
| A11y 优先定位 | A11y Tree First Location | E2E 测试和前端评审中优先使用 role+name 定位元素，禁止用 CSS class 做 selector |

---

## 5. 文件路径约定

| 路径 | 含义 |
|------|------|
| `.xyz-harness/` | 项目级 harness 工作目录 |
| `.xyz-harness/{yyyy-MM-dd}-{主题}/` | 单个需求的产出物目录，不同需求禁止混放 |
| `.xyz-harness/gate/` | 门禁运行时状态目录，gitignore 不入库 |
| `docs/standards.md` | 项目编码规范（优先于 CLAUDE.md 中的编码规范章节） |
| `docs/architecture.md` | 项目架构文档 |
| `docs/design-system.md` | 前端设计系统文档 |
