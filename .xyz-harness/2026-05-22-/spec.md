---
verdict: pass
---

# Harness V5 跨项目复盘优化

基于 4 个项目 46 份复盘文件的扫描结果，对 harness 工程进行 16 项优化。按修改面分为 5 个批次（B1-B5），覆盖 P0+P1+P2 全部发现。

## Background

### 问题来源

跨项目复盘扫描（`docs/retrospectives/2026-05-22-cross-project-retrospect-scan.md`）从 llm-simple-router、xyz-agent、dag-executor、xyz-harness-engineering 四个项目的 46 份复盘中提取了 27 个发现。本次优化覆盖其中 P0+P1+P2 的 16 个。

### 核心认知

**AI 的核心弱点不是"写错"，而是"遗漏"。** 8/9 的 MUST FIX 是"应该想到但没想到"的遗漏型缺陷。harness 的防御重心从"发现错误"转向"防止遗漏"——自检清单比审查深度更重要。

### 已有基础设施

| 组件 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 扩展入口 | `extensions/coding-workflow/index.ts` | ~700 | 状态管理、工具注册、事件处理 |
| Gate 脚本 | `extensions/coding-workflow/gate-check.py` | ~300 | 声明式 Phase 验证 |
| Review 调度 | `extensions/coding-workflow/lib/review-dispatcher.ts` | ~140 | Review subagent 派遣 + followUp |
| Subagent | `extensions/coding-workflow/lib/subagent.ts` | ~250 | Pi CLI spawn + JSON streaming |
| 5 个 Phase Skill | `skills/xyz-harness-{brainstorming,writing-plans,phase-dev,phase-test,phase-pr}/SKILL.md` | — | Phase 指令 |
| Expert Reviewer | `skills/xyz-harness-expert-reviewer/SKILL.md` | — | 评审方法论 |
| TDD Skill | `skills/xyz-harness-test-driven-development/SKILL.md` | — | TDD 方法论 |

## Functional Requirements

### FR-1: Frontmatter 扁平化自动兼容（F-01, P0）

`gate-check.py` 的 `parse_yaml_frontmatter()` 统一处理嵌套 YAML：无论 review 文件使用顶层 `verdict`/`must_fix` 还是嵌套 `review.verdict`/`statistics.must_fix`，都能正确解析。删除 `ReviewCheck.nested` 参数区分——所有 review 文件走同一解析路径。

在 `review-dispatcher.ts` 的 `buildReviewTaskPrompt()` 中，强制注入正确的 frontmatter 模板到 task prompt，从源头减少嵌套产出。

### FR-2: 评审不可跳过的硬性前置检查（F-02, P0）

`coding-workflow-gate` tool 的 execute 函数增加前置检查：
- Phase 3+：检查所有前置 phase 的 review 文件存在且 `verdict == "pass"`
- Phase 5：额外检查 Phase 3（code_review）和 Phase 4（test 相关 review）文件存在
- 检查失败 → gate 直接 FAIL，返回错误信息指明缺失的 review 文件

### FR-3: 各 Phase 增加内建自检清单（F-03, P0）

每个 Phase Skill 末尾增加 `<Self-Check Checklist>` 章节，列出该 Phase 常见的遗漏模式：

- **Spec Skill**：
  - 生命周期维度检查：对每个实体走一遍 创建→运行→销毁 链路
  - 枚举值覆盖：每个 FR 枚举值是否都有对应 AC 断言
  - 失败场景引导："如果这一步失败了怎么办？"
- **Plan Skill**：
  - scope 覆盖声明：spec 中每个量化指标的采纳状态（adopted/rejected/postponed）
  - Task 粒度检查：单 Task 超过 10 步应拆分
- **Dev Skill**：
  - MUST FIX 修复后的影响半径检查：同路径相关调用点
  - 迁移类工作用 checklist 驱动：列出所有被迁移的调用点，逐个标注覆盖状态
- **Test Skill**：
  - FR→TC 覆盖矩阵：每条 FR 至少有一个 TC 覆盖
  - 验证方式标注：每个 TC 标注 automated/manual/code_review
- **PR Skill**：
  - 前置 review 存在性确认
  - lint 检查前移提醒（dev phase 应已完成 lint）

### FR-4: Gate 检查深度统一（F-04, P1）

`gate-check.py` 的 `PHASE_SPECS` 中，所有 Phase 的 deliverable `FileCheck` 统一增加 `verdict` 字段检查。Plan gate（Phase 2）的 review 检查增加 `must_fix==0` 断言，与 Phase 1 对齐。Phase 4/5 没有 review subagent，保持不变（只检查 deliverable）。

### FR-5: Spec→Plan→Test 指标传递契约（F-05, P1）

- **Plan Skill** 增加强制章节 `## Spec Metrics Traceability`：列出 spec 中每个量化指标及其采纳状态
- **Test Skill** 中 `test_cases_template.json` 增加字段说明：每个 TC 必须有 `planTaskId`（关联 plan task）和 `ac_ref`（关联 spec AC）
- scope 缩减必须在 plan 中正式声明（不能静默缩小）

### FR-6: Subagent task prompt 量化验收标准（F-06, P1）

- **Dev Skill**（subagent-driven-development）增加规则：task prompt 必须包含量化验收标准——输出文件路径 + 约束条件 + 成功指标
- **TDD Skill** 增加规则：TDD subagent 的 task prompt 必须传递 spec 的关键数据模型定义（接口、类型、枚举值），不能只传"为 X 写测试"

### FR-7: 测试验证方式标注（F-07, P1）

`test_cases_template.json` 和 `test_execution.json` 的 schema 增加 `verification_method` 字段，允许值：`"automated"` / `"code_review"` / `"manual"`。

`gate-check.py` 的 `validate_test_execution` 统计三种方式的占比，输出到检查结果中供 human 参考（不 block gate）。

### FR-8: Gate 跨 topic 隔离（F-08, P1）

`gate-check.py` 所有文件搜索（`find_latest_review()`、`glob` 模式）限定在传入的 `topic_dir` 内，不再扫描整个 `.xyz-harness/` 目录。TS 侧 `runGateScript()` 已经传递 `topicDir`，Python 侧需确保正确使用该参数限定搜索范围。

### FR-9: Gate 竞态修复（F-09, P1）

`gate-check.py` 删除 dirty check（检查工作区是否干净），或排除 `.xyz-harness/` 目录下的变更。这个检查在 gate 层面意义不大，git clean check 应由 skill 层面的 AI 自行处理。

### FR-10: 审查分级 LOW 收紧（F-10, P2）

expert-reviewer SKILL.md 的分级规则增加：
- 只有与本次需求**完全无关**的预存问题才可标 LOW
- 需求核心目标涉及的问题即使预存也必须标 MUST_FIX
- 增加示例说明

### FR-11: 增量审查模式（F-11, P2）

expert-reviewer SKILL.md 增加"增量审查模式"章节：
- 审查文件名包含 `_v2.md` 及以上版本号时，自动读取前一版本（`_v{N-1}.md`）的 MUST_FIX 列表
- 只验证 MUST FIX 项是否已修复 + 检查修复是否引入新问题，不重做全量扫描
- 减少每轮审查的 token 消耗

### FR-12: Retrospect 流程确认（F-12, P2）

验证当前代码中 retrospect 的触发时机是否正确（只在 gate PASS + review PASS 后触发），确认 `buildRetrospectFollowUp()` 不在 review FAIL 时被调用。

如验证通过：在 `skills/xyz-harness-brainstorming/SKILL.md` 和 `skills/harness-retrospect/SKILL.md` 中明确记录 retrospect 只在 gate PASS 后触发的行为。

如验证不通过（发现 retrospect 确实在 review FAIL 时被触发）：修改 `extensions/coding-workflow/lib/review-dispatcher.ts` 的 `buildRetrospectFollowUp()` 调用逻辑，确保只在 review `must_fix == 0` 时才在 followUp 中加入 retrospect 指令。

### FR-13: （已合并至 FR-3）

F-13 的内容已完整包含在 FR-3 的 Dev Skill 自检清单（影响半径检查、迁移 checklist）中，不再单独列出以避免冗余。

### FR-14: Spec 阶段数据模型预检（F-14, P2）

- **Spec Skill** 增加规则：FR 涉及 DB 字段或 API 响应体时，编写前必须 grep 真实代码确认字段存在和类型
- **Plan Skill** 增加规则：涉及 DB JSON 字段的伪代码必须标注数据来源和实际序列化格式

### FR-15: Plan 禁止写实现代码（F-15, P2）

**Plan Skill** 增加硬性规则：plan 中只写接口签名和调用关系，禁止写实现代码（函数体、完整类定义）。未验证的代码从 Phase 2 带到 Phase 3 增加审查噪音。

### FR-16: TDD subagent 上下文传递（F-16, P2）

**TDD Skill** 增加规则：TDD subagent 的 task prompt 必须包含 spec 的关键数据模型定义（接口、类型、枚举值），不能只传"为 X 写测试"。这确保 TDD 测试与最终实现对齐。

## Acceptance Criteria

### AC-1: Frontmatter 兼容性

- review subagent 产出的嵌套 YAML（`review.verdict`）和扁平 YAML（顶层 `verdict`）都能被 gate-check.py 正确解析
- review subagent task prompt 包含正确的 frontmatter 模板
- **验证方式**：用两种格式的 review 文件分别跑 gate-check.py，均返回 PASS

### AC-2: 评审不可跳过

- Phase 5 gate 检查 Phase 3/4 review 文件存在性
- 缺少 review 文件时 gate FAIL，错误信息明确指明缺失文件
- **验证方式**：删除 Phase 3 review 文件后跑 Phase 5 gate，确认 FAIL

### AC-3: 自检清单存在

- 5 个 Phase Skill 的 SKILL.md 都包含 `<Self-Check Checklist>` 章节
- 每个 checklist 至少 3 条检查项，覆盖该 Phase 最常见的遗漏模式
- **验证方式**：grep 确认 5 个文件都有该章节

### AC-4: Gate 深度统一

- Phase 2 gate 检查 plan.md 的 `verdict` 字段和 review 的 `must_fix==0`
- 与 Phase 1 gate 检查深度一致
- **验证方式**：构造缺少 verdict 的 plan.md 跑 Phase 2 gate，确认 FAIL

### AC-5: 指标传递

- Plan Skill 包含 `## Spec Metrics Traceability` 章节说明
- Test Skill 包含 `planTaskId` 和 `ac_ref` 字段说明
- **验证方式**：grep 确认两个 skill 文件包含相关内容

### AC-6: 验收标准

- Dev Skill 包含 task prompt 量化验收标准规则
- TDD Skill 包含上下文传递规则
- **验证方式**：grep 确认

### AC-7: 验证方式标注

- gate-check.py 的 `validate_test_execution` 接受 `verification_method` 字段
- 输出中包含验证方式统计（automated/code_review/manual 占比）
- **验证方式**：构造含 `verification_method` 字段的 test_execution.json 跑 gate

### AC-8: 跨 topic 隔离

- gate-check.py 的文件搜索限定在 topic_dir 内
- 多 topic 目录下不会误检其他 topic 的文件
- **验证方式**：在 `.xyz-harness/` 下放两个 topic 目录，验证 gate 只检查指定的那个

### AC-9: 竞态修复

- gate-check.py 不再因 `.xyz-harness/` 内文件变更报 dirty check 失败
- **验证方式**：修改 workflow-state.json 后跑 gate，确认不报 dirty

### AC-10: LOW 收紧

- expert-reviewer SKILL.md 包含 LOW 分级收紧规则和示例
- **验证方式**：grep 确认

### AC-11: 增量审查

- expert-reviewer SKILL.md 包含增量审查模式章节
- 说明 `_v2+` 版本自动读取前一版本 MUST_FIX 列表的流程
- **验证方式**：grep 确认

### AC-12: Plan 禁止写实现代码（F-15）

- Plan Skill 包含"禁止写实现代码"硬性规则
- **验证方式**：grep `skills/xyz-harness-writing-plans/SKILL.md` 确认包含该规则

### AC-13: Spec 数据模型预检（F-14）

- Spec Skill 包含"数据模型预检"规则（FR 涉及 DB/API 字段时必须 grep 真实代码）
- Plan Skill 包含"伪代码标注数据来源"规则
- **验证方式**：grep 两个 skill 文件确认包含相关规则

### AC-14: Retrospect 流程验证（F-12）

- 确认 `buildRetrospectFollowUp()` 只在 review `must_fix == 0` 时被调用
- 如需修改：review-dispatcher.ts 中增加条件判断
- 如已正确：在 skill 文档中记录该行为
- **验证方式**：代码审查 review-dispatcher.ts 的 followUp 生成逻辑

## Constraints

- **不兼容旧 topic**：所有改动只对新 topic 生效，不处理历史 `.xyz-harness/` 目录下的旧文件
- **不区分 Auto/Manual Mode**：所有改动自然覆盖两种模式（gate-check.py 和 skill 文档是共享的）
- **不涉及 P3**：P3 的 11 个方法论完善项（F-17 到 F-27）不在本次范围内
- **不修改 Pi SDK**：所有改动在 harness 自身代码内完成
- **技术栈不变**：Python 3 + PyYAML（gate-check.py），TypeScript + js-yaml（扩展代码），Markdown（skill 文档）
- **实施策略**：按修改面分 5 批（B1→B5），每批内聚可独立验证

## Complexity Assessment

### 规模

- **修改文件数**：~15 个（1 Python 脚本 + 2 TS 文件 + 7 Skill 文档 + 1 Reviewer Skill + gate schema 相关）
- **代码修改**：~200 行（gate-check.py ~80 行 + index.ts ~50 行 + review-dispatcher.ts ~30 行）
- **文档修改**：~500 行（7 个 skill 各增加 30-80 行自检清单/规则）

### 风险

| 批次 | 风险 | 缓解 |
|------|------|------|
| B1 gate-check.py | 低：纯 Python 脚本，可独立测试 | 用 mock 文件目录跑 gate 验证 |
| B2 index.ts | 中：影响扩展状态机 | 只增加前置检查，不改变现有流程 |
| B3 Skill 文档 | 低：纯文档修改 | grep 验证章节存在 |
| B4 Expert-reviewer | 低：方法论调整 | grep 验证规则存在 |
| B5 test_execution schema | 低：新增字段 | 向后兼容（新字段 optional） |

### 依赖关系

- B3（Plan Skill 的 scope 声明）依赖 B1（gate 检查深度统一）才能被 gate 验证
- B2（review 前置检查）依赖 B1（frontmatter 扁平化）才能正确解析 review 文件
- B5 独立，可并行
- B4 独立，可并行

### 建议实施顺序

B1 → B2 → B5（可并行） → B3 → B4
