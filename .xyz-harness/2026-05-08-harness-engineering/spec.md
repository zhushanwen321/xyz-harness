# xyz-harness-engineering 设计文档

> 本项目构建一套完整的 Harness Engineering 体系，以 pi（AI 编码 Agent）为载体，实现 11 阶段需求开发流水线。

---

## 1. 架构总览

### 1.1 执行模型

阶段分为两类，执行方式不同：

| 类型 | 阶段 | 执行方式 | 原因 |
|------|------|---------|------|
| **交互阶段** | ① 需求分析 | 主 agent 直接执行 skill | 需要多轮用户对话（brainstorming） |
| **自动阶段** | ②-⑨ | subagent | 不需要用户交互，上下文隔离 |
| **确认阶段** | ⑩-⑪ | 主 agent 直接处理 | 用户确认和复盘 |

```
主 agent
  │
  ├─ ① 交互阶段：直接执行 brainstorming + writing-plans（多轮对话）
  │     完成后 compaction 清理上下文
  │
  ├─ ②-⑨ 自动阶段：纯调度（不读交付物内容、不修改文件）
  │     ├── 使用 loop_task_tracker 管理阶段状态
  │     ├── 派遣 subagent 执行
  │     ├── 派遣 gate-checker subagent 验证门禁
  │     ├── 在人工确认点暂停等待用户决策
  │     └── 根据门禁结果 + 用户决策决定流转（前进/回退）
  │
  └─ ⑩-⑪ 确认阶段：主 agent 直接处理
        透传各阶段 summary，等待用户最终确认
```

**为什么 ① 不用 subagent：** brainstorming 需要逐一向用户提问澄清需求，subagent 是非交互子进程，无法与用户对话。主 agent 直接执行可以保持原生交互体验。

**为什么 ① 之后要 compaction：** 交互阶段会积累大量对话历史（用户需求讨论）。compaction 后主 agent 上下文干净，后续调度阶段不受干扰。

**阶段追踪机制：** 使用 pi 的 `loop_task_tracker` 工具。dev-flow 启动时 `create_tasks` 注册全部 11 个阶段，每阶段完成后 `complete_task` 标记。回退时重新标记对应阶段为未完成。

**自动阶段的三层隔离：**
- 执行 subagent：完成阶段工作（编码、测试、推送等）
- 评审 subagent：独立评审，不继承执行者的上下文
- 门禁 subagent：独立检查产出物，不继承执行者/评审者的上下文

### 1.2 上下文三层

| 层级 | 加载时机 | 内容 | 冲突优先级 |
|------|---------|------|-----------|
| L1 会话常驻 | 每次会话自动 | CLAUDE.md（≤200行） | **最高**（覆盖 L2） |
| L2 阶段常驻 | 进入特定阶段 | 当前阶段 skill + references | 默认值 |
| L3 按需加载 | Agent 主动查阅 | Wiki 知识库 | 补充 |

---

## 2. 10 阶段流水线

### 2.1 完整阶段表

> 每个阶段的详细执行逻辑（subagent 配置、入口条件、交付物、门禁检查项、人工确认展示内容）见 [stage-execution-detail.md](./stage-execution-detail.md)。

| 阶段 | 入口条件 | 执行方式 | 质量门禁 | 失败回退 | 人工确认 |
|------|---------|---------|---------|---------|---------|
| ① 需求分析 | 需求提交 | 执行 subagent（S1+S2） | spec.md + plan.md 产出（L1 脚本强制） | —（第一阶段） | **确认点1**：需求待决议确认 |
| ② 需求评审 | ①门禁通过 + 用户确认 | 评审 subagent（S4计划评审） | review 通过 ≤3轮 | → ① | **确认点2**：计划评审后确认 |
| ③ 编码实现 | ②门禁通过 + 用户确认 | 执行 subagent（S5+S3+S9，含 task 级 spec 合规 + TDD） | 所有 task 完成 + 编译通过 + 测试通过（L1 脚本强制） | task 内修复 | — |
| ④ 编码评审 | ③门禁通过 | 评审 subagent（S4执行评审） | review 通过 ≤2轮 | → ③ | **确认点3**：编码评审后确认 |
| ⑤ 测试编写 | ④门禁通过 + 用户确认 | 执行 subagent（S6） | 测试文件产出 + 测试通过（L1 脚本强制） | → ③（代码不可测）或 ⑤ 内修复 | — |
| ⑥ 测试评审 | ⑤门禁通过 | 评审 subagent（S4执行评审） | review 通过 ≤2轮 | → ⑤ | — |
| ⑦ 代码推送 | ⑥门禁通过 | 执行 subagent（zcommit） | push 成功（L1 脚本强制） | 修复重试 | — |
| ⑧ CI 验证 | ⑦门禁通过 | 执行 subagent（S7 + dev-flow 内建） | SUCCESS && tests>0 && passed==total（L1 脚本强制） | 0/0→⑤；编译错→③；失败→③/⑤ | — |
| — | ⑧门禁通过 | — | — | — | **确认点4**：部署目标确认 |
| ⑨ 部署验证 | ⑧通过 + 用户确认 | 执行 subagent（S8） | 部署成功（L1 脚本强制） | → ③ 或配置修复 | — |
| ⑩ 用户确认 | ⑨门禁通过 | 主 agent 直接处理 | 用户确认 | 需求不符→①；实现问题→③ | **确认点5**：最终交付确认 |
| ⑪ 自动复盘 | ⑩用户确认完成 | 复盘 subagent | retrospective.md 产出 | — | — |

### 2.2 回退路由表

| 失败场景 | 回退到 | 说明 |
|---------|--------|------|
| ② 需求评审不通过 | → ① | 计划不合理或需求不清晰 |
| ③ spec 合规不通过 | → 当前 task 内修复 | task 级 |
| ④ 编码评审不通过（≤2轮） | → ③ | 代码质量问题 |
| ⑤ 代码不可测试 | → ③ | 代码结构不支持测试编写 |
| ⑥ 测试评审不通过（≤2轮） | → ⑤ | 测试质量问题 |
| ⑦ push 失败 | → 修复重试 | 网络/权限问题，不回退 |
| ⑧ CI 测试数=0 | → ⑤ | 测试未实际运行 |
| ⑧ CI 编译错误 | → ③ | 编译问题 |
| ⑧ CI 测试失败 | → ③ 或 ⑤ | 按错误类型判断 |
| ⑨ 部署失败 | → ③ 或配置修复 | 代码问题回 ③，配置问题就地修复 |
| ⑩ 需求不符 | → ① | 方向错误 |
| ⑩ 实现问题 | → ③ | 实现有误 |

### 2.3 评审循环上限

- 需求评审（阶段②）：≤3 轮
- 编码评审（阶段④）：≤2 轮
- 测试评审（阶段⑥）：≤2 轮
- 超出上限 → 暂停，升级到人工决策

### 2.5 人工确认点（5 个）

1. **确认点1**（① 完成后）：需求分析是否正确？spec + plan 是否符合预期？
2. **确认点2**（② 完成后）：AI 评审通过的 plan 是否合理？
3. **确认点3**（④ 完成后）：代码实现是否符合预期？
4. **确认点4**（⑨ 开始前）：部署目标环境是否正确？
5. **确认点5**（⑩）：整个需求是否完成交付？

### 2.6 阶段追踪机制

dev-flow 使用 pi 的 `loop_task_tracker` 管理阶段流转：

| tracker 操作 | 时机 | 说明 |
|-------------|------|------|
| `create_tasks(10个阶段)` | dev-flow 启动时 | 注册全部阶段 |
| `complete_task(id)` | gate-checker 返回 pass 后 | 标记阶段完成 |
| `list_tasks` | 每个阶段开始前 | 查看当前进度和剩余阶段 |
| 重新标记为未完成 | 回退发生时 | 回退目标阶段及后续阶段重置 |

### 2.7 门禁保证机制

每个阶段完成后，主 agent 派遣 gate-checker subagent 独立验证：

1. **产出物检查**：验证门禁要求的文件是否存在、内容是否合规
2. **命令验证**：运行可程序化验证的命令（编译、测试、lint）
3. **返回 pass/fail + 原因**

主 agent 只在 gate-checker 返回 pass 后才推进到下一阶段。fail 则按回退路由表处理。

### 2.8 上下文隔离原则

- 评审 subagent **不继承**编码 subagent 的上下文
- 评审者只看到：spec + plan + 代码 diff + CLAUDE.md 编码规范
- 评审者看不到编码过程中的讨论、尝试、错误
- 门禁 subagent 同样独立于执行者和评审者

### 2.9 约束层级

每个阶段完成后有三种约束机制，强度递增：

| 层级 | 机制 | 强度 | 适用场景 |
|------|------|------|--------|
| L1 脚本强制 | gate-script.sh 执行，生成 `.xyz-harness/gate/{stage}.pass` 标记文件 | 硬（AI 无法伪造脚本输出） | 文件存在性、编译、测试、lint、push 状态 |
| L2 subagent 检查 | gate-checker subagent 验证 | 中（AI 可能跳过或伪造） | 评审报告完整性、代码/测试质量判断 |
| L3 人工确认 | 用户手动确认 | 最高 | 5 个确认点 |

执行顺序：L1 先行（脚本不过直接 fail），L1 通过后 L2（subagent 判断），L2 通过后检查是否有 L3。

---

## 3. Skill 清单（9 个）

### 3.1 从 superpowers 提取（5 个）

| # | Skill 名 | 来源 | 触发阶段 | 需适配 |
|---|---------|------|---------|--------|
| S1 | xyz-harness-brainstorming | superpowers brainstorming | ① | 去 visual companion、保留 LOCAL-OVERRIDE |
| S2 | xyz-harness-writing-plans | superpowers writing-plans | ① | 去 superpowers 引用、保留 LOCAL-OVERRIDE |
| S3 | xyz-harness-subagent-driven-development | superpowers subagent-driven-dev | ③ | pi 调度语法、模型名、保留 spec-reviewer-prompt |
| S7 | xyz-harness-verification-before-completion | superpowers v-b-c | ⑧ | 几乎无需改动 |
| S9 | xyz-harness-test-driven-development | superpowers TDD | ③（subagent 内部） | 几乎无需改动 |

### 3.2 新建（4 个）

| # | Skill 名 | 触发阶段 | 说明 |
|---|---------|---------|------|
| S4 | xyz-harness-expert-reviewer | ②④⑥ | 统一评审 skill，两种模式：计划评审（审 spec+plan）/ 执行评审（审代码+测试） |
| S5 | xyz-harness-coding-skill | ③ | Clean Architecture 分层编码规范，含分层 Spec 文件 |
| S6 | xyz-harness-unit-test-write | ⑤ | Change-driven Testing（接口/API 级） |
| S8 | xyz-harness-deploy-verify | ⑨ | 部署验证 SOP |

### 3.3 编排器（1 个）

| Skill 名 | 说明 |
|---------|------|
| xyz-harness-dev-flow | 10 阶段编排器，纯调度模式 |

### 3.4 Prompt 模板归属

| 模板 | 归属 | 说明 |
|------|------|------|
| implementer-prompt.md | xyz-harness-subagent-driven-development | 编码 subagent 指令模板 |
| spec-reviewer-prompt.md | xyz-harness-subagent-driven-development | task 级 spec 合规检查模板 |
| code-quality-reviewer-prompt.md | 并入 xyz-harness-expert-reviewer | 逻辑整合进 expert-reviewer 的执行评审模式 |

### 3.5 不纳入本项目的 skill

| Skill | 原因 |
|-------|------|
| unit-test-ci | 编码到 dev-flow 阶段 ⑧ 描述中 |
| aone-ci-generate | 原文项目特定（阿里内部 CI 工具） |
| code-review（独立） | 已有 code-review-worktree 全局 skill 替代 |

---

## 4. 测试策略分工

| 阶段 | 策略 | 粒度 | 产出 |
|------|------|------|------|
| ③ 编码实现 | TDD（红绿重构） | 函数/类级，mock 外部依赖 | 单元测试 |
| ⑤ 测试编写 | Change-driven Testing | 接口/API 级，真实或 mock 服务 | 集成/接口测试 |

---

## 5. 变更管理目录

```
.superpowers/{yyyy-MM-dd}-{主题}/
├── spec.md                        # 需求设计文档
├── plan.md                        # 实现计划
└── changes/
    ├── summary.md                 # 全流程追溯（每阶段实时更新）
    ├── reviews/                   # 评审记录（版本递增，永不删除）
    │   ├── plan_review_v1.md      # 阶段②
    │   ├── code_review_v1.md      # 阶段④
    │   └── test_review_v1.md      # 阶段⑥
    ├── evidence/                  # 验证证据
    │   ├── verification_output.md # 本地验证
    │   ├── ci_result.md           # CI 结果
    │   └── deploy_result.md       # 部署结果
    └── retrospective.md           # 复盘记录
```

---

## 6. .xyz-harness/ 运行时目录

使用 Harness 的目标项目中，系统运行时文件统一放在 `.xyz-harness/` 下：

```
.xyz-harness/
├── gate/                         # L1 门禁标记文件
│   ├── stage-01.pass             # 阶段①脚本检查通过
│   ├── stage-03.pass             # 阶段③脚本检查通过
│   └── ...                       # 每个阶段一个
├── metrics/                      # 运行指标
│   └── {yyyy-MM-dd}-{需求名}.json  # token 消耗 + 各阶段耗时
└── harness-health.md             # 跨需求聚合健康报告（手动触发更新）
```

### gate/ 目录

- 每个新需求开始时清空旧标记
- gate-script.sh 执行通过后生成 `{stage-N}.pass`
- 主 agent 检查标记文件存在才允许 complete_task(N)
- 标记文件内容为通过时间和检查项摘要

### metrics/ 目录

- 每个需求一个 JSON 文件
- 记录：总 token 消耗、总耗时、各阶段 subagent 的 token/耗时、回退次数
- 用于后续聚合分析

### harness-health.md

- 跨需求聚合健康报告，手动触发更新（非自动）
- 内容：累计需求数、平均回退次数、常见错误模式、评审有效率、CLAUDE.md 改进建议

---

## 7. 仓库结构

```
xyz-harness-engineering/
├── skills/
│   ├── xyz-harness-dev-flow/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── claude-md-template.md
│   │       └── wiki-structure.md
│   ├── xyz-harness-brainstorming/
│   │   └── SKILL.md
│   ├── xyz-harness-writing-plans/
│   │   └── SKILL.md
│   ├── xyz-harness-subagent-driven-development/
│   │   ├── SKILL.md
│   │   ├── implementer-prompt.md
│   │   └── spec-reviewer-prompt.md
│   ├── xyz-harness-expert-reviewer/
│   │   └── SKILL.md
│   ├── xyz-harness-coding-skill/
│   │   ├── SKILL.md
│   │   └── specs/
│   │       ├── entry.md           # 入口层（Controller/Handler/Router）
│   │       ├── orchestration.md   # 编排层（Service/Application）
│   │       ├── domain.md          # 领域层（Domain/Business Logic）
│   │       ├── data.md            # 数据层（Repository/DAO/Database）
│   │       ├── integration.md     # 集成层（External Service/Adapter）
│   │       └── infrastructure.md  # 基础设施层（Config/Middleware/Utils）
│   ├── xyz-harness-unit-test-write/
│   │   └── SKILL.md
│   ├── xyz-harness-verification-before-completion/
│   │   └── SKILL.md
│   ├── xyz-harness-deploy-verify/
│   │   └── SKILL.md
│   └── xyz-harness-test-driven-development/
│       └── SKILL.md
├── agents/
│   ├── harness-executor/          # 编码执行 agent
│   ├── harness-tdd-coder/         # TDD 测试先行 agent
│   ├── harness-frontend-developer/ # 前端三阶段开发 agent
│   ├── harness-reviewer/          # 评审 agent（代码/测试）
│   ├── harness-e2e-tester/        # E2E 测试 agent
│   ├── harness-gate-checker/      # 门禁检查 agent
│   ├── harness-backend-planner/   # 后端设计方案规划 agent（含模板）
│   ├── harness-backend-plan-reviewer/ # 后端设计评审 agent
│   ├── harness-frontend-planner/  # 前端设计方案规划 agent
│   └── harness-api-alignment/     # 前后端 API 对齐 agent
├── extensions/
│   └── (如需 extension)
├── install.py                     # symlink 安装 + 清理旧版
├── .superpowers/                  # 本项目自身的需求追踪
│   └── 2026-05-08-harness-engineering/
│       ├── spec.md
│       └── plan.md
└── README.md
```

---

## 8. Agent 角色映射

| Harness 角色 | Agent | 何时派遣 | 模型选择 |
|-------------|--------|---------|---------|
| 调度器 | 主 agent（dev-flow skill） | 全程 | 当前会话模型 |
| 执行者（编码） | harness-executor | 阶段 ③⑤ | 简单任务 glm-5-turbo，复杂 glm-5.1 |
| TDD coder | harness-tdd-coder | 阶段 ③（每个 task 先写测试） | glm-5.1 |
| 前端开发 | harness-frontend-developer | 阶段 ③（前端 task） | 按项目配置 |
| E2E 测试 | harness-e2e-tester | 阶段 ④ | glm-5.1 |
| 评审者 | harness-reviewer | 阶段 ②④⑥ | glm-5.1 |
| 门禁检查 | harness-gate-checker | 每阶段完成后 | glm-5.1 |
| 后端设计规划 | harness-backend-planner | 阶段 ① L2 时 | glm-5.1 |
| 后端设计评审 | harness-backend-plan-reviewer | 阶段 ② L2 时 | glm-5.1 |
| 前端设计规划 | harness-frontend-planner | 阶段 ① L2 时 | glm-5.1 |
| API 对齐 | harness-api-alignment | 阶段 ① L2 时 | glm-5-turbo |

---

## 9. 命名规则

- 所有本项目产出的 skill/agent/extension 统一 `xyz-harness-` 前缀
- 前缀加在目录名和 SKILL.md 的 name 字段上
- 现有全局 skill（create-worktree, zcommit 等）不加前缀
- install.py 安装新版时自动删除旧版（不带前缀的 dev-flow 等）

---

## 10. 决策记录

| # | 决策 | 结论 | 原因 |
|---|------|------|------|
| D1 | subagent-driven-development 评审逻辑 | 保留 task 级 spec 合规检查，代码质量评审移到独立阶段 ④⑥ | 执行与评判分离 |
| D2 | TDD vs Change-driven 边界 | TDD 单元级，Change-driven 接口级 | 层次清晰不重叠 |
| D3 | unit-test-ci | 编码到 dev-flow 阶段 ⑧ | 逻辑太短不值得独立 skill |
| D4 | coding-skill 分层基础 | Clean Architecture + 项目 CLAUDE.md 可覆盖 | 通用默认 + 项目定制 |
| D5 | 命名前缀 | 全部 xyz-harness- 前缀 | 统一管理 |
| D6 | 物理位置 | 当前项目仓库，install.py symlink | 独立仓库管理 |
| D7 | coding_report | 不需要，由评审 agent 产出 review 报告 | 减少冗余产出物 |
| D8 | 门禁保证 | gate-checker subagent 独立验证 | 硬保证替代 prompt 级软保证
| D15 | 阶段①交互执行 | 需求分析由主 agent 直接执行（非 subagent） | brainstorming 需要多轮用户对话，subagent 无法交互 |
| D16 | compaction | 阶段①完成后主 agent 做 compaction | 清理交互阶段的对话历史，保持后续调度上下文干净 | |
| D9 | 约束层级 | L1脚本（gate-script.sh）+ L2 subagent + L3 人工确认 | AI 倾向于跳过检查，需要硬约束 |
| D10 | gate 脚本 | 统一定义，放在 xyz-harness-dev-flow/scripts/ 下 | 统一管理 |
| D11 | 运行时目录 | .xyz-harness/ | harness 系统文件和需求交付物分开 |
| D12 | 复盘阶段 | 作为阶段⑪加入流水线，自动执行 | 持续改进 |
| D13 | 跨需求聚合 | 手动触发，更新 harness-health.md | 不增加自动开销 |
| D14 | 运行指标 | 记录 token 消耗和耗时 | 量化分析 |
