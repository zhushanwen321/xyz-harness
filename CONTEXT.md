# xyz-harness

AI 编码工作流引擎的术语表。定义 xyz-harness V5 中的核心概念、边界和关系。

## 执行单元

**Phase**:
Harness 的顶层执行单元。每个 Phase 有独立的 Skill 注入（IL1）、Gate 验证、System Subagent 派遣、Compact。Phase 之间通过 Gate + Compact 强制隔离。共 5 个：Spec、Plan、Dev、Test、PR。
_Avoid_: 阶段（模糊）

**Stage**:
Phase 内部的逻辑步骤，定义在 Skill 文档中（如 Phase 1 的 brainstorming → 写 spec → review spec）。当前是 Skill 中的描述性概念，Harness 扩展不追踪 Stage 状态。计划升级为运行时追踪的执行单元。
_Avoid_: 步骤（太泛）

**Topic**:
一次 Harness 工作流的完整执行单元。由用户通过 `/coding-workflow <topic>` 发起，包含 5 个 Phase 的全部产出。Topic 之间完全独立。
_Avoid_: 任务（与 plan.md 中的 task 混淆）

**Topic Directory**:
Topic 的文件系统存放位置。格式：`.xyz-harness/{YYYY-MM-DD}-{slug}/`。包含 spec.md、plan.md、changes/ 子目录等。
_Avoid_: workspace（与 Harness Workspace 混淆）

**Harness Workspace**:
项目根目录下的 `.xyz-harness/` 目录。可包含多个 Topic Directory，代表该项目所有的 Harness 执行历史。

**Loop**:
Phase 内部的迭代机制。当 Gate 返回 FAIL 时，AI 修复 deliverables 后重新提交 Gate，形成循环。循环起点由 Phase 定义。当前实现为隐式循环（AI 自主重试），计划升级为显式状态机。

**Execution Group**:
plan.md 中按文件边界划分的 Task 分组。同一 Group 内的 Task 修改同一批文件，由单个 Task Subagent 串行执行。不同 Group 之间通过依赖关系和 Wave 编排决定执行顺序。命名约定：BG（Backend Group）、FG（Frontend Group）等。
_Avoid_: 任务组（太泛）

**Wave**:
Execution Group 之间的执行批次。同一 Wave 内的 Group 可并行派遣 Task Subagent，不同 Wave 之间串行。由 plan.md 的依赖图推导得出。同一 Wave 内最多 3 个 subagent 并行（Semaphore 限制），同一文件不允许多个 subagent 同时修改。
_Avoid_: 轮次（太泛）、批次（与 batch 混淆）

## 指令注入

**Instruction Layer（IL）**:
Harness 在不同时机向 AI 上下文注入指令的分层机制。层级越高，注入时机越早，优先级越高。共四层。

**IL0 — System Instruction（系统指令）**:
会话启动时自动加载的指令。包括 CLAUDE.md、项目 rules、Pi 全局配置、Skill 元数据列表（name + description）。优先级最高。
_Avoid_: 全局指令、基础指令

**IL1 — Phase Instruction（Phase 指令）**:
进入 Phase 时通过 `before_agent_start` 注入的指令。即当前 Phase 对应的 Skill 全文。一个 Phase 对应一个 Phase Skill。
_Avoid_: 阶段指令

**IL2 — On-demand Instruction（按需加载指令）**:
Phase 内由 AI 自主判断是否 read 加载的 Reference Skill。包括编码规范、评审方法论、TDD 流程等。AI 自行决定加载时机和内容。
_Avoid_: 参考指令、附加指令

**IL3 — Gate Instruction（Gate 指令）**:
Gate 触发时加载的指令。Gate Skill（如 xyz-harness-gate）视为特殊的 Phase Skill，在独立 session 或 subagent 中加载。优先级等同 IL1。

## 质量验证

**Gate**:
Phase 结束时的质量验证关口。是 GL1（脚本检查）+ GL2（AI 评审）+ Retrospect（复盘）的综合统一。三者全部通过才视为 Gate PASS。
_Avoid_: 检查点（太泛）、验证（太泛）

**Gate Layer（GL）**:
Gate 内部的分层验证机制。

**GL1 — Script Check（脚本检查）**:
确定性的脚本验证（gate-check.py）。检查文件存在性、YAML frontmatter 格式和字段值。AI 无法伪造脚本输出。
_Avoid_: L1 检查（与 IL1 混淆）、机械检查

**GL2 — Gate Review（防伪造验证）**:
Gate 自动 dispatch 的 System Subagent。验证 deliverable 是否真实可信（非伪造），不审查内容质量。使用 gate-reviewer skill。产出 `gate_review_{phase}.md`。
_Avoid_: L2 检查（与 IL2 混淆）、内容审查

**Retrospect**:
Gate 流程的最后一环。独立 System Subagent 产出的阶段复盘文件，覆盖执行质量和 Harness 可用性两个维度。不验证质量（永远 verdict: pass），而是记录过程改进建议。
_Avoid_: 复盘（口语）、回顾

**Deliverable**:
Phase 的核心产出物。是 Gate 检查的主要目标。存放位置由 Phase 决定（Phase 1/2 在 Topic 根目录，Phase 3/4/5 在 `changes/evidence/`）。
_Avoid_: 产出、输出

**Evidence**:
Deliverable 的子类。存放在 `changes/evidence/` 目录下的客观证据文件（测试结果、测试执行记录、PR 证据、CI 结果）。
_Avoid_: 证明、凭据

**Review**:
Deliverable 的子类。存放在 `changes/reviews/` 下的评审文件。包括：
- Task Review（`*_review_v{N}.md`）：phase 执行过程中的内容质量审查，由主 agent 按 skill 指令 dispatch
- Gate Review（`gate_review_{phase}.md`）：gate 阶段的防伪造验证，由 gate tool 自动 dispatch
- Retrospect（`*_retrospect.md`）：阶段复盘文件

## Skill

**Skill**:
以 SKILL.md 为载体的 AI 指令文档。通过 Pi 的 skill 系统注册和发现。

**Phase Skill**:
直接驱动某个 Phase 执行的 Skill。通过 IL1 注入到主 agent 上下文。一个 Phase 对应一个 Phase Skill。包括：xyz-harness-brainstorming、xyz-harness-writing-plans、xyz-harness-phase-dev、xyz-harness-phase-test、xyz-harness-phase-pr。
_Avoid_: 主 skill、核心 skill

**Reference Skill**:
不驱动 Phase 执行，而是被主 agent 或 subagent 在需要时通过 IL2 加载的方法论参考。包括：expert-reviewer、gate-reviewer、backend-dev、frontend-dev、TDD、subagent-driven-development。
_Avoid_: 辅助 skill、次要 skill

**Gate Skill**:
驱动 Gate 验证流程的 Skill。视为特殊的 Phase Skill，在独立 session 中加载。即 xyz-harness-gate。

## Subagent

**Subagent**:
由主 agent 或 Harness 扩展派遣的独立 AI 执行单元。拥有独立的上下文、独立的模型选择、独立的工具集。不继承派遣者的对话历史。

**System Subagent**:
由 Harness 扩展代码自动派遣的 Subagent。派遣逻辑硬编码在 `coding-workflow-gate` tool 的 execute 函数中。包括 Gate Review Subagent（防伪造验证）。Task Review Subagent 由主 agent 按 skill 指令 dispatch，不属于 System Subagent。
_Avoid_: 自动 subagent

**Task Subagent**:
由主 agent 根据 Skill 指令自主派遣的 Subagent。包括 TDD coder、executor、spec compliance checker 等。派遣由 AI 决定，Harness 扩展不感知。
_Avoid_: 手动 subagent

## 运行模式

**Auto Mode**:
由 coding-workflow 扩展驱动的全自动执行模式。用户通过 `/coding-workflow <topic>` 发起。扩展自动管理 Phase 推进、Skill 注入、Gate 验证、System Subagent 派遣、Compact。AI 只需按注入的 Skill 指令工作并调用 gate/phase-start tool。

**Manual Mode**:
用户手动驱动的执行模式。用户按需触发 Skill、自行决定 Phase 推进时机、手动 dispatch Subagent、手动运行 gate-check.py。不依赖 coding-workflow 扩展的状态管理。

## 术语实践

**ADR（Architecture Decision Record）**:
架构决策记录。存放在 `docs/adr/` 目录下，编号递增。Phase 1/2 中必须执行 ADR 评估 step（MUST），评估决策是否满足三条件（难以逆转、无上下文会惊讶、真实权衡）。评估后无满足条件的决策时，不写 ADR 文件（可空产出）。

**Terminology Step（术语识别 Step）**:
Phase 1 brainstorming 中的 MUST step。AI 必须过一遍 spec 中的术语，识别模糊概念并提议精确定义。产出可空（简单需求可能无模糊术语）。

**CONTEXT.md Step（术语表产出 Step）**:
Phase 1 brainstorming 中的 MUST step。AI 必须尝试从 spec 中提取术语写入或更新 CONTEXT.md。产出可空（已有且无需更新时跳过写入）。CONTEXT.md 是可选 deliverable（gate 不强制检查），但 Phase 2/3 的 subagent 可引用它对齐概念。

**MUST + Nullable（必须 + 可空产出）**:
Step 的执行强度语义。AI 必须进入该 step 并执行评估，但评估结果可以为"无需产出"。跳过 step 本身 = 违规；执行后判断无需产出 = 可接受。

## 安全属性

**Information Isolation（信息隔离）**:
Harness 的核心安全属性。AI 在任意时刻只能看到当前 Phase 的指令和 deliverables 路径，无法获知全局 Phase 数量、后续 Phase 内容、或之前 Phase 的详细讨论。通过 Compact 实现。

**Compact**:
Phase 切换时的上下文压缩操作。清除当前 Phase 的对话历史，保留 minimal 的 transition instructions。当前实现为 `ctx.compact()`，计划升级为 tree branch summary。

**Escape Mode（逃脱模式）**:
AI 可能采取的规避 Harness 约束的行为模式。包括跳过检查、伪造结果、偷看上下文、提前规划、静默降级。Harness 的全部设计目标是防止这些行为。

## 标记的歧义

**Interface Contract（接口契约）**:
plan 阶段产出的接口设计契约，填补 plan（task 粒度）和 code（method 粒度）之间的设计空白。包含三类信息：方法签名表（按模块分组的公有方法签名）、数据流链（方法间调用关系和类型传递）、AC 覆盖矩阵（spec AC → interface method → task 的追踪）。根据 plan 复杂度分 L1/L2 两级。

**interface_chain.json**:
L2 plan 的结构化接口契约文件。包含 methods[]（方法签名数组，每项有 name/class/params/returns/spec_refs）和 data_flows[]（数据流数组，每项有 id/description/chain/spec_refs）。L1 plan 不产出此文件。Phase 2 gate GL1 做 schema 校验，GL2 做 cross-reference 验证。

**Complexity L1/L2（plan 复杂度分级）**:
plan.md 的 YAML frontmatter 中 `complexity` 字段取值。L1（简化版）：markdown 方法签名表 + AC 覆盖矩阵，无 interface_chain.json。L2（完整版）：markdown + interface_chain.json + data_flows。评估维度为架构分拆复杂度（是否需要前后端并行设计），而非影响范围（文件数）。

**Phase vs Stage**（已解决）:
Phase 是顶层执行单元（共 5 个），Stage 是 Phase 内部的逻辑步骤。V4 中曾用 Stage 统称两者（16-Stage 方案），V5 统一为 Phase + Stage 的二级结构。Stage 当前为 Skill 文档中的描述性概念，计划升级为运行时追踪。

**L1/L2 命名冲突**（已解决）:
指令注入层级用 IL0-IL3（Instruction Layer），Gate 门禁层级用 GL1-GL2（Gate Layer）。两套体系独立编号，避免混淆。

**Deliverable vs Evidence vs Review**（已解决）:
Deliverable 是统称。Evidence 和 Review 是 Deliverable 的子类，按性质和存放位置区分。Evidence 在 `changes/evidence/`，Review 在 `changes/reviews/`。

## 示例对话

> **Dev**: Phase 3 的 Gate 挂了，GL1 说 test_results.md 的 all_passing 是字符串不是布尔值。
>
> **QA**: 典型的 YAML 类型问题。AI 把 `all_passing: "true"` 写成了字符串。修一下，重新跑 Gate。
>
> **Dev**: 修好了。这次 GL1 过了，GL2 的 Gate Review Subagent 也返回 verdict: pass, must_fix: 0。
>
> **QA**: 那 Retrospect 跑了吗？Gate 是 GL1 + GL2 + Retrospect 三合一。
>
> **Dev**: Retrospect 是主 agent 写的，`dev_retrospect.md` 已生成。现在可以调用 phase-start 了。
>
> **QA**: phase-start 会检查 Retrospect 文件存在，然后做 Compact 进入 Phase 4。Phase 4 的 IL1 会注入 xyz-harness-phase-test 的 Skill。
>
> **Dev**: 明白。AI 在 Phase 4 中如果需要参考 TDD 方法论，自行 IL2 加载就行，不用我们管。
