---
review:
  type: plan_review
  round: 1
  timestamp: "2026-05-31T15:30:00"
  target: ".xyz-harness/2026-05-30-p0-spec-verification-subagent-prompt/plan.md"
  verdict: pass
  summary: "计划评审完成，第1轮，0条MUST FIX，3条LOW和1条INFO，通过"

statistics:
  total_issues: 4
  must_fix: 0
  must_fix_resolved: 0
  low: 3
  info: 1

issues:
  - id: 1
    severity: LOW
    location: "plan.md:BG1/BG2 Subagent 配置表"
    title: "Subagent 配置表使用三步模板但实际仅需两步"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: LOW
    location: "plan.md:BG1 Task 1 Execution Flow Step 1"
    title: "Task 1 Execution Flow 包含矛盾的 TDD read 指令"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: LOW
    location: "use-cases.md"
    title: "use-cases.md 未覆盖 AC-2（Self-Check 增强）和 AC-5（Post-Dispatch Verification）"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: INFO
    location: "plan.md:BG1 Task 1 Checklist 行号引用"
    title: "Checklist Step 5 行号标注为'第31行附近'，实际在第63行"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 计划评审 v1

## 评审记录
- 评审时间：2026-05-31 15:30
- 评审类型：计划评审（模式一）
- 评审对象：`.xyz-harness/2026-05-30-p0-spec-verification-subagent-prompt/plan.md`

## 1. spec 完整性

**目标明确性：** ✅ 合格。spec 一句话能说清楚：增强 brainstorming 和 subagent-driven-development 两个 skill 文件，消除 spec 阶段代码假设错误和 subagent 产出质量问题。

**范围合理性：** ✅ 合格。只改 2 个 SKILL.md 文件，不改 gate-check.py、不改 coding-workflow 扩展代码、不改已有流程。边界清晰，Constraints 章节列出了 5 条约束。

**AC 可量化性：** ✅ 合格。6 个 AC 都可用文档存在性和内容匹配验证（grep 命令模板是否存在、Pre-Dispatch 表格是否有 5 项、Prohibition Block 是否有 6 条等）。

**待决议项：** 无 `[待决议]` 标记。

## 2. plan 可行性

### 2.1 任务拆分合理性

6 个 task，每个改一个 skill 文档的一部分，粒度适中。每个 task 可由一个 subagent 独立完成。✅

### 2.2 依赖关系正确性

| 依赖 | 验证 |
|------|------|
| Task 2 → Task 1 | ✅ 正确。Task 2（Self-Check 增强）修改 `## Self-Check Checklist`，虽然与 Task 1 修改位置不同，但逻辑上 Step 5a 是前提 |
| Task 4/5/6 → Task 3 | ✅ 正确。Task 3 创建 `## Pre-Dispatch Checklist` 章节，Task 4 紧跟其后插入 Prohibition Block。Task 5/6 虽然修改位置更早（`## Red Flags` 前、`### Wave 模式` 内），但同文件串行修改避免 edit 冲突是合理的 |
| BG1 ↔ BG2 无依赖 | ✅ 正确。两个 skill 文件完全独立，可并行 |

### 2.3 工作量评估

合理。6 个 markdown 章节插入，每个章节约 20-50 行，总计不超过 300 行新增内容。

### 2.4 遗漏检查（逐 FR 对照）

| FR | Task | 状态 |
|----|------|------|
| FR-1: Assumption Audit | Task 1 | ✅ |
| FR-2: Self-Check 增强 | Task 2 | ✅ |
| FR-3: Pre-Dispatch Checklist | Task 3 | ✅ |
| FR-4: Prohibition Block | Task 4 | ✅ |
| FR-5: Post-Dispatch Verification | Task 5 | ✅ |
| FR-6: 并行依赖安全 | Task 6 | ✅ |

无遗漏。✅

## 3. spec 与 plan 一致性

### 3.1 FR 逐条覆盖

所有 6 个 FR 都有对应的 Task（见上表）。✅

### 3.2 AC 逐条覆盖

| AC | Task | 状态 |
|----|------|------|
| AC-1: Assumption Audit 可执行 | Task 1 | ✅ |
| AC-2: Self-Check Checklist 增强 | Task 2 | ✅ |
| AC-3: Pre-Dispatch Checklist 强制执行 | Task 3 | ✅ |
| AC-4: Prohibition Block 自动注入 | Task 4 | ✅ |
| AC-5: Post-Dispatch Verification 可执行 | Task 5 | ✅ |
| AC-6: 并行依赖安全 | Task 6 | ✅ |

无遗漏。✅

### 3.3 plan 中 spec 未提及的额外工作

- Task 1 包含更新 Checklist Step 5 描述（追加 Step 5a 引用）和 Process Flow dot graph（增加 Assumption Audit 节点）。这是 FR-1 的自然延伸，不算过度设计。✅

### 3.4 插入位置精确性验证

通过 `grep -n` 验证 plan 中的行号引用：

| 插入位置 | plan 标注 | 实际行号 | 偏差 |
|---------|----------|---------|------|
| `## After the Design` | ~211 | 211 | 0 |
| `## Self-Check Checklist` | ~521 | 521 | 0 |
| `### 数据模型预检` 之后 | — | 535 | — |
| `## Task Prompt 验收标准规则` | 475 | 475 | 0 |
| `## Red Flags` | 405 | 405 | 0 |
| `### Wave 模式` | 140 | 140 | 0 |
| Checklist Step 5 "Write design doc" | ~31 | 63 | +32 |

所有关键章节行号精确匹配。Checklist Step 5 的行号偏差较大（+32），但引用的是 "Checklist 的 Step 5 描述"，通过章节名定位无歧义。⚠️（记录为 INFO，见 Issue #4）

## 4. Execution Groups 合理性

### 4.1 分组合理性

| Group | 文件数 | Task 数 | 评价 |
|-------|--------|---------|------|
| BG1 | 1 (modify) | 2 | ✅ ≤10 文件, ≤4 Task |
| BG2 | 1 (modify) | 4 | ✅ ≤10 文件, ≤4 Task |

### 4.2 类型划分

所有 task 标记为 "backend"。对于 markdown 文档修改，此标记不算准确（不是后端代码），但不影响执行——没有前后端混合导致的冲突问题。✅

### 4.3 功能关联度

- BG1: Task 1（Step 5a）和 Task 2（Self-Check 增强）都属于 brainstorming skill，逻辑关联紧密。✅
- BG2: Task 3-6 都属于 subagent skill 的调度增强，围绕 "dispatch 前中后" 的质量保障。✅

### 4.4 依赖关系

BG1 和 BG2 无依赖，Wave 1 并行。✅

### 4.5 Wave 编排

同一 Wave 内 BG1 和 BG2 修改不同文件（brainstorming SKILL.md vs subagent SKILL.md），无文件冲突、无数据竞争。✅

### 4.6 Subagent 配置完整性

每组都有 Agent、Model、注入上下文、读取文件、修改/创建文件。✅

但 Subagent 配置表与实际 Execution Flow 存在不一致，见 Issue #1。

### 4.7 上下文充分性

注入上下文包含 "Task 描述 + spec 相关 FR + 当前 skill 内容"，对 markdown 编辑任务足够。✅

## 5. 接口契约审查

Plan 声明 L1 复杂度，明确标注 "interface_chain.json 不产出"。AC 覆盖通过 Spec Coverage Matrix 直接追踪。

Spec Coverage Matrix 完整性：6/6 AC 有对应行，无遗漏。✅

## 6. use-cases 覆盖检查

| AC | use-cases.md 覆盖 | 状态 |
|----|-------------------|------|
| AC-1 | UC-1（Spec 阶段消除接口假设错误） | ✅ |
| AC-2 | 无独立 UC（Self-Check 是辅助机制） | ⚠️ 见 Issue #3 |
| AC-3 | UC-2（Pre-Dispatch Checklist 步骤 2-8） | ✅ |
| AC-4 | UC-2（步骤 6: 附加 Prohibition Block） | ✅ |
| AC-5 | 无独立 UC（Post-Dispatch 未在 UC-2 中延伸） | ⚠️ 见 Issue #3 |
| AC-6 | UC-3（并行 Task placeholder 预防） | ✅ |

UC-1/UC-2/UC-3 各有完整的 Main Flow、Alternative Paths、Postconditions、Module Boundaries。格式规范。✅

## 7. non-functional-design 五维度检查

| 维度 | 覆盖 | 评价 |
|------|------|------|
| 1. 稳定性 | ✅ | markdown-only 改动，最差情况跳过新步骤，风险极低 |
| 2. 数据一致性 | ✅ | 不涉及数据存储，git history 保证可追溯 |
| 3. 性能 | ✅ | 量化评估：~5 次 grep 调用（Assumption Audit）+ ~3 次/task（Pre-Dispatch），耗时 <10s |
| 4. 业务安全 | ✅ | Prohibition Block 是正向安全改进 |
| 5. 数据安全 | ✅ | 不涉及敏感信息 |

## 8. e2e-test-plan 覆盖检查

6 个 Test Scenario 完整覆盖 6 个 AC。每个 TS 有前置条件、操作步骤、预期结果。测试环境说明合理（人工阅读 + 模拟 harness run，无需额外基础设施）。✅

---

### 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | LOW | plan.md:BG1/BG2 Subagent 配置表 | Subagent 配置表使用 `general-purpose → general-purpose → general-purpose` 三步模板（暗示 TDD → implementer → reviewer），但 Execution Flow 明确说"无需 TDD（修改 markdown 文档）"，实际只需 2 步（implementer → reviewer）。模板与实际流程不一致，可能误导执行者 dispatch 不必要的 TDD subagent | 将 Subagent 配置表的 Agent 行改为 `general-purpose → general-purpose`（两步），或删除通用模板、直接引用各 Task 的 Execution Flow 作为配置来源 |
| 2 | LOW | plan.md:BG1 Task 1 Execution Flow | Step 1 写 `general-purpose (read xyz-harness-test-driven-development + xyz-harness-backend-dev)`，但紧接着标注 `→ 无需 TDD（修改 markdown 文档）`。让 subagent read TDD + backend-dev skill 然后不用，浪费 token 且自相矛盾 | 去掉 Step 1 中的 TDD/backend-dev read 指令，改为 `general-purpose → 修改 SKILL.md`（仅保留实际需要的操作） |
| 3 | LOW | use-cases.md | AC-2（Self-Check Checklist 增强）和 AC-5（Post-Dispatch Verification）没有对应的业务用例。UC-2 覆盖了 Pre-Dispatch 但未延伸到 Post-Dispatch 阶段。虽然这两个 AC 在 plan 的 Task 列表中有完整覆盖，但 use-cases.md 作为独立文档应有完整覆盖 | 补充 UC-2a（Self-Check 增强后执行 spec 自检）或扩展 UC-2 的 Post-conditions 包含 Post-Dispatch Verification；或在 use-cases.md 中明确说明 AC-2/AC-5 为辅助机制、不需要独立 UC |
| 4 | INFO | plan.md:BG1 Task 1 | Checklist Step 5 "Write design doc" 的行号标注为"第 31 行附近"，实际在第 63 行（偏差 +32）。不过引用了章节名 "Checklist 的 Step 5 描述" 作为锚定，执行时不会产生歧义 | 无需修改。后续 plan 可考虑只用章节名锚定，不再标注行号（行号在文件修改后很快过时） |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

### 结论

**通过。**

Plan 完整覆盖了 spec 的所有 6 个 FR 和 6 个 AC，插入位置经过行号验证均准确（6/7 精确匹配，1 个偏差但锚定清晰），Execution Groups 分组合理，Wave 编排无冲突。发现的 3 条 LOW 问题均为文档表述层面的不一致（Subagent 配置模板 vs 实际流程、TDD read 指令矛盾、UC 覆盖缺口），不影响 plan 的可执行性和 spec 合规性。

### Summary

计划评审完成，第1轮，0条MUST FIX，3条LOW，1条INFO，通过。
