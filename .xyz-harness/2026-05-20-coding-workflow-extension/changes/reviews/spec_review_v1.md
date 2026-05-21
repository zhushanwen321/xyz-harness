---
review:
  type: spec_review
  round: 1
  timestamp: "2026-05-21T11:00:00"
  target: ".xyz-harness/2026-05-20-coding-workflow-extension/spec.md"
  verdict: fail
  summary: "计划评审完成，第1轮，3条MUST FIX，需修改后重审"

statistics:
  total_issues: 6
  must_fix: 3
  must_fix_resolved: 0
  low: 2
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "spec.md:FR-3 Gate Tool / FR-11 错误处理"
    title: "Subagent spawn 失败（非零退出之外的情况）未处理"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "spec.md:FR-1 Workflow 启动"
    title: "缺少并发 workflow 启动的防护——state.isActive 检查"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: MUST_FIX
    location: "spec.md:FR-9 状态查询与管理"
    title: "/coding-workflow-abort 未定义 subagent/子进程生命周期管理"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "spec.md:FR-3 Gate Tool / FR-6 Subagent Dispatch"
    title: "Review 版本号自动递增逻辑未在 gate 流程中明确设计"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "spec.md:FR-10 Custom Tool Rendering"
    title: "Custom renderCall/renderResult 描述过于模糊，缺少具体渲染内容定义"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: INFO
    location: "spec.md:FR-4 Phase Start Tool"
    title: "ctx.compact() 的 customInstructions 参数依赖未验证的 Pi API"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录

- 评审时间：2026-05-21 11:00
- 评审类型：计划评审（spec 完整性）
- 评审对象：`.xyz-harness/2026-05-20-coding-workflow-extension/spec.md`
- 评审依据：`skills/xyz-harness-expert-reviewer/SKILL.md`「模式一：计划评审」第 1 项 spec 完整性 + 任务补充审查要点
- 项目架构约束：`CLAUDE.md`（xyz-harness V5 — Manual Skill-Driven Workflow）

---

## 1. Spec 完整性检查

### 1.1 目标明确性

**通过。** "自动化 phase 门禁 + 审查 + 复盘流水线"——一段话说清楚了要做什么。核心设计约束（AI 只能感知当前 phase、gate 不可跳过、subagent 保证客观性、compact 防止污染）在 Background 中清晰列出。

### 1.2 范围合理性

**通过。** 11 个 FR 覆盖了完整的工作流：启动 → 注入 → gate → phase 切换 → TUI → subagent → 持久化 → Phase 5 特殊约束 → 状态管理 → 渲染 → 错误处理。范围有明确边界（不包含 agent 发现逻辑、不重新造 subagent 轮子），不过大也不过小。

### 1.3 验收标准可量化性

**通过。** AC-1 到 AC-7 全部描述为具体可观察的行为（目录是否创建、widget 是否显示、是否注入、是否调用 gate 等），无"提升体验"类模糊验收标准。所有 AC 均可写自动化验证。

### 1.4 [待决议] 项检查

**通过。** spec 全文无 `[待决议]` 或 `[TBD]` 标记。

---

## 2. 约束明确性检查

### 2.1 技术栈

**通过。** TypeScript、Pi Extension API、Node.js 内置模块、无外部 npm 依赖——明确且可实现。

### 2.2 Pi API 使用范围

**通过。** 包含完整表格，每个 API 对应具体用途，无未标注 API 使用。`ctx.sessionManager` 的精确路径类型可在实现阶段验证。

### 2.3 文件结构

**通过。** 目录树和每个文件职责明确。`lib/` 中函数的来源（`xyz-pi-extensions/subagent`）和取舍规则（去掉了 parallel/chain/background）明确。

### 2.4 Phase-Skill 映射

**通过。** 与 CLAUDE.md 完全一致：

| Phase | Skill | 映射正确性 |
|-------|-------|-----------|
| 1 | xyz-harness-brainstorming | ✓ |
| 2 | xyz-harness-writing-plans | ✓ |
| 3 | xyz-harness-phase-dev | ✓ |
| 4 | xyz-harness-phase-test | ✓ |
| 5 | xyz-harness-phase-pr | ✓ |

Review/Retrospect 前缀与 CLAUDE.md 的 phase 产出表一致。

---

## 3. FR 逐项审查

| FR | 完整度 | 备注 |
|----|--------|------|
| FR-1 | ⚠️ | 缺少 state.isActive 检查（见 MUST FIX #2） |
| FR-2 | ✅ | 注入模板和规则清晰，skill 读取路径明确 |
| FR-3 | ⚠️ | spawn 失败无处理（见 MUST FIX #1）；版本递增未设计（见 LOW #4） |
| FR-4 | ✅ | 流程清晰，compact + sendUserMessage 串联合理 |
| FR-5 | ✅ | Widget 内容明确，status 更新清晰 |
| FR-6 | ✅ | Spawn 参数和执行模型详细，复用策略明确 |
| FR-7 | ✅ | 状态结构 + 持久化 + 恢复策略完整 |
| FR-8 | ✅ | Phase 5 约束和 gate 后处理明确 |
| FR-9 | ⚠️ | Abort 缺少子进程清理（见 MUST FIX #3） |
| FR-10 | ⚠️ | 渲染定义含糊（见 LOW #5） |
| FR-11 | ⚠️ | 缺少 spawn 失败场景（见 MUST FIX #1） |

---

## 4. 代码复用策略

**通过。** 从 `xyz-pi-extensions/subagent` 提取的函数列表（`getPiInvocation`、`writePromptToTempFile`、`runSingleAgent` 等 8 个函数）明确，且声明了简化范围（去掉 parallel/chain/background）。模型路由的 fallback 逻辑在 `subagent-models.json` 中有完整路径。

风险点已标注（compact 回调可靠性、版本递增、gate 脚本同步），属于合理的风险评估。

---

## 5. 错误处理充分性

FR-11 覆盖了 4 个场景：
| 场景 | 是否覆盖 |
|------|---------|
| Skill 找不到 | ✅ |
| Gate 脚本执行失败 | ✅ |
| Subagent 非零退出 | ✅ |
| compact 失败 | ✅ |

**未覆盖的关键场景：**

- **Subagent spawn 失败**（pi 二进制找不到、系统资源不足、ENOENT）→ MUST FIX #1
- **并发 workflow 启动** → MUST FIX #2
- **Abort 时 subagent 孤儿进程** → MUST FIX #3

---

## 6. 遗漏的关键设计决策

以下 3 个设计决策在 spec 中缺失或待补充：

### 6.1 Review 版本号递增机制（LOW #4）

FR-3 gate 流程中，review 输出写入 `{prefix}_v{N}.md`。当 AI 多次重新调用 gate（must_fix > 0），subagent 需要确定 `N` 的值。由于 subagent 以 `--no-session` 启动且 gate tool 未传递当前版本号，subagent 无法自行递增。需要设计版本号管理方案（gate tool 传递？/subagent 扫描目录？）。

### 6.2 Custom Tool Rendering 细节（LOW #5）

FR-10 提到 renderCall/renderResult 使用 Pi Text 组件 + theme 颜色，但未定义：
- renderCall 展示什么信息（仅 phase 编号和动作，还是包含交付物路径？）
- renderResult 展示失败项的格式
- Subagent 执行状态的 rendering 方式

### 6.3 compact API 参数确认（INFO #6）

FR-4 使用 `ctx.compact()` 并传入 `customInstructions`。需要确认 Pi 的 compact API 是否接受此参数。如果不支持，需要替代方案。

---

## 发现的问题

| # | 优先级 | 位置 | 描述 | 修改建议 |
|---|--------|------|------|---------|
| 1 | **MUST FIX** | FR-3 Gate Tool / FR-11 错误处理 | **Subagent spawn 失败（非零退出之外的情况）未处理。** FR-11 只覆盖了"Subagent 非零退出 → 作为 tool error 返回"，但 spawn 本身可能失败（pi 二进制找不到、PATH 未配置、fork 资源不足等）。此时 gate 流程无 error path，workflow 会卡死。 | 在 FR-3 step 3 的 subagent dispatch 周围加 try-catch，spawn 失败时返回明确错误消息给 AI 并允许重试。FR-11 增加 spawn 失败场景的描述。 |
| 2 | **MUST FIX** | FR-1 Workflow 启动 | **缺少并发 workflow 启动的防护。** FR-1 在启动时直接创建目录和初始化状态，但未检查 `state.isActive`。如果用户在工作流进行中再次输入 `/coding-workflow`，state 会被覆盖，导致状态数据丢失和前一个 workflow 的 orphan 目录。 | FR-1 增加 `if (state.isActive) → return error` 检查。同时 FR-9 的 `/coding-workflow-abort` 也应增加 active 检查以避免误 abort。 |
| 3 | **MUST FIX** | FR-9 状态查询与管理 | **`/coding-workflow-abort` 未定义 subagent/子进程生命周期管理。** 当用户 abort 时，FR-3 中 dispatch 的 review/retrospect subagent 进程可能仍在运行。没有清理机制会导致：孤儿进程持续占用资源、可能同时读写文件导致竞争。 | FR-9 增加 abort 时主动 kill 子进程的机制：维护活跃 subagent 的进程引用列表（child_process.ChildProcess），abort 时遍历 kill()。对于已独立的 gate-check 子进程，通过进程组 kill。 |
| 4 | **LOW** | FR-3 Gate Tool / FR-6 Subagent Dispatch | **Review 版本号自动递增未在 gate 流程中明确设计。** Spec 在"代码复用策略"中提到了此风险，但 FR-3 的 gate 流程没有设计版本号管理方式。当 AI 重新调用 gate 时，subagent 无法知道当前版本号。 | 方案 A：gate tool 在 dispatch review 前扫描 `{topicDir}/changes/reviews/{prefix}_v*.md` 确定下一版本号，作为环境变量或 task prompt 参数传入。方案 B：在 subagent 的 task prompt 中明确指定当前版本号。 |
| 5 | **LOW** | FR-10 Custom Tool Rendering | **Custom renderCall/renderResult 描述过于模糊。** "使用 Pi 的 Text 组件 + theme 颜色"没有说明：renderCall 显示什么信息、renderResult 的失败项格式、subagent 执行状态如何渲染。 | 建议增加各场景的渲染示例（renderCall 展示 phase 编号和 action，renderResult 展示 gate 状态/失败项列表/subagent 进度条）。 |
| 6 | **INFO** | FR-4 Phase Start Tool | **`ctx.compact()` 的 `customInstructions` 参数依赖未验证的 Pi API。** Spec 假设 compact 接受此参数来"保留 phase 关键产出物路径"，但从本项目文档无法确认此 API 是否存在。 | 实现前需验证 Pi 的 compact API 签名。如果不支持，可改为在 compact 前将关键路径写入 session entries，compact 后通过 sendUserMessage 附带。 |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

---

## 结论

**需修改后重审。**

Spec 整体质量较高：目标明确、范围合理、验收标准可量化、约束完整、Phase-Skill 映射正确、代码复用策略可行。但存在 3 条 MUST FIX——集中在进程生命周期管理（spawn 失败、并发防护、子进程清理）这三个缺失的 error path 上。这些问题在生产环境必然导致 workflow 卡死或数据损坏。

修复后重新 dispatch 第 2 轮审查。

---

## Summary

计划评审完成，第1轮，3条MUST FIX，需修改后重审。
