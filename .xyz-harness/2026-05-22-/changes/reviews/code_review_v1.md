---
review:
  type: code_review
  round: 1
  timestamp: "2026-05-22T16:30:00"
  target: "跨项目复盘优化（10 文件修改）：gate-check.py, index.ts, review-dispatcher.ts, 5 个 Phase Skill, 3 个 Reference Skill"
  verdict: fail
  summary: "编码评审完成，第1轮，1条MUST FIX，需修改后重审"

statistics:
  total_issues: 3
  must_fix: 1
  must_fix_resolved: 0
  low: 2
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "skills/xyz-harness-writing-plans/SKILL.md"
    title: "缺少 Spec Metrics Traceability 强制章节"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: LOW
    location: "skills/xyz-harness-brainstorming/SKILL.md + skills/harness-retrospect/SKILL.md"
    title: "缺少 retrospect 流程行为记录（FR-12）"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: LOW
    location: "extensions/coding-workflow/lib/review-dispatcher.ts:80"
    title: "\"不能嵌套\"指令与 expert-reviewer 嵌套格式示例矛盾"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 编码评审 v1

## 评审记录

- 评审时间：2026-05-22 16:30
- 评审类型：编码评审
- 评审对象：跨项目复盘优化 — 涉及 10 个文件（gate-check.py, index.ts, 5 个 Phase Skill, 3 个 Reference Skill, review-dispatcher.ts）

---

## 1. Spec 合规检查

逐一对照 spec.md 的 15 个 FR 和 14 个 AC：

### FR-1: Frontmatter 扁平化自动兼容 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| ReviewCheck.nested 字段删除 | ✅ | gate-check.py diff L165: `- nested: bool = False` |
| PHASE_SPECS[3] nested=True 删除 | ✅ | gate-check.py diff L333: `ReviewCheck(prefix="code_review_v")` (no nested) |
| run_phase_checks 统一使用 _flatten_review_fields | ✅ | gate-check.py diff L407-426: 删除了 `if rc.nested` 分支，统一走 `_flatten_review_fields` |
| buildReviewTaskPrompt frontmatter 模板 | ✅ | review-dispatcher.ts L80-82: 已有 `YAML frontmatter 必须包含（在顶层，不能嵌套）` |
| 扁平 + 嵌套两种格式均可解析 | ✅ | _flatten_review_fields() 保持不变，处理两种格式 |

### FR-2: 评审不可跳过 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| Phase 3+ review 前置检查 | ✅ | index.ts diff L322-355: 在 gate execute 中增加，`state.currentPhase >= 3` |
| 检查所有前置 phase review 文件存在 | ✅ | 循环 `for (let p = 1; p < state.currentPhase; p++)` 覆盖所有前置 phase |
| Phase 5 额外检查 Phase 3/4 | ✅ | 同样循环覆盖：Phase 5 时检查 p=1..4，其中 Phase 4 无 reviewPrefix 自动跳过 |
| 错误信息明确指明缺失文件 | ✅ | `Missing reviews:\n${fixInstructions}` |

### FR-3: 自检清单 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| Spec Skill | ✅ | 生命周期 + 枚举覆盖 + 数据模型预检 |
| Plan Skill | ✅ | Scope 覆盖声明 + Task 粒度 + 禁止实现代码 + 伪代码来源 |
| Dev Skill | ✅ | MUST FIX 影响半径 + 迁移类 checklist + 验收标准 |
| Test Skill | ✅ | FR→TC 覆盖矩阵 + 验证方式标注 + 指标传递 |
| PR Skill | ✅ | 前置检查 + Lint 检查 + PR 安全 |
| 每个 checklist ≥ 3 条 | ✅ | 最少 3 条，最多 6 条 |

### FR-4: Gate 深度统一 — ✅ 合规

Plan gate 的 review 检查与 Phase 1 对齐。由于 M1-1 统一了 review 解析路径，`_flatten_review_fields()` 对所有 review 文件一视同仁。Phase 2 的 `ReviewCheck(prefix="plan_review_v")` 自动获得与 Phase 1 相同的检查深度。

### FR-5: 指标传递 — ❌ 不完整

| 检查项 | 结果 | 证据 |
|--------|------|------|
| Plan Skill 增加 Spec Metrics Traceability | ❌ **缺失** | grep 确认不存在该章节。spec 要求 "Plan Skill 增加强制章节 ## Spec Metrics Traceability"。diff 中未体现。**见 Issue #1** |
| plan.md 实例包含该章节 | ✅ | `.xyz-harness/2026-05-22-/plan.md` 已有该章节 |
| Test Skill 包含 planTaskId/ac_ref 说明 | ✅ | Self-Check Checklist 中 indexed |

**关键发现**：plan.md 实例有自己的 `Spec Metrics Traceability`，但 Plan Skill 模板缺少该章节说明。这导致未来的 plan 作者不知道需要包含该章节，违反 spec FR-5 "Spec→Plan→Test 指标传递契约"的长期目标。

### FR-6: 验收标准 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| Dev Skill 增加 task prompt 验收标准规则 | ✅ | Self-Check Checklist 中 "Task 验收标准" |
| TDD Skill 增加上下文传递规则 | ✅ | `## Task Prompt 上下文传递规则` 已添加 |
| Subagent-driven-dev 增加规则 | ✅ | `## Task Prompt 验收标准规则` 已添加 |

### FR-7: 验证方式标注 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| gate-check.py 增加 verification_method 统计 | ✅ | validate_test_execution() 末尾增加 Step 7 |
| Test Skill 增加 verification_method 检查 | ✅ | Self-Check Checklist 中覆盖 |

### FR-8: 跨 topic 隔离 — ✅ 合规（验证通过）

`find_latest_review()` 已接收 `topic_dir` 参数，搜索路径 `os.path.join(topic_dir, "changes", "reviews", ...)` 天然限定在 topic_dir 内。验证通过，无需修改。

### FR-9: 竞态修复 — ✅ 合规（验证通过）

gate-check.py 中 `PHASE_SPECS` 的 `pre_checks` 全部为空列表 `[]`，不存在 dirty check 逻辑。验证通过，无需修改。

### FR-10: LOW 收紧 — ✅ 合规

Expert-reviewer SKILL.md 已增加 `## LOW 分级收紧规则` 章节，包含示例和判断标准。

### FR-11: 增量审查 — ✅ 合规

Expert-reviewer SKILL.md 已增加 `## 增量审查模式` 章节，定义 `_v2+` 版本的行为。

### FR-12: Retrospect 流程 — ✅ 代码正确，⚠️ 文档缺失

**代码验证**：index.ts L438-439 检查 `if (mustFix > 0 || verdict !== "pass")`，失败时 return error，不调用 `buildRetrospectFollowUp()`。只有 review PASS 后才走到 L481 构建 retrospect followUp。**逻辑正确。** ✅

**文档验证**：spec 要求验收通过后在 Spec Skill 和 harness-retrospect Skill 中记录该行为。但 git diff 中 Spec Skill 只增加了 Self-Check Checklist，没有 retrospect 行为记录。**文档缺失。** ❌ 见 Issue #2

### FR-13: （已合并至 FR-3，无需独立检查）✅

### FR-14: Spec 数据模型预检 — ✅ 合规

| 检查项 | 结果 | 证据 |
|--------|------|------|
| Spec Skill 增加 "grep 真实代码确认字段存在" 规则 | ✅ | Self-Check Checklist 中 "数据模型预检" |
| Plan Skill 增加 "伪代码标注数据来源" 规则 | ✅ | Self-Check Checklist 中 "伪代码数据来源" |

### FR-15: Plan 禁止实现代码 — ✅ 合规

Plan Skill Self-Check Checklist 包含 "禁止实现代码" 子章节，明确禁止函数体/完整类定义。

### FR-16: TDD 上下文传递 — ✅ 合规

TDD Skill 已增加 `## Task Prompt 上下文传递规则`，包含违反示例和正确示例。

---

## 2. 代码质量检查

### gate-check.py

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 命名清晰度 | ✅ | 变量/函数命名保持原有风格 |
| 无死代码 | ✅ | `check_field_str` / `check_field_int` 仍在 L386/388 被 FileCheck 使用 |
| 错误处理 | ✅ | review 解析失败时返回明确错误信息 |
| 删除不彻底风险 | ⚠️ | `_flatten_review_fields` 是否需处理 `nested` 参数不存在时的旧文件？当前仅用于 gate-check.py 侧解析，旧文件走新路径也能处理 — 无风险 |

### index.ts

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 逻辑位置 | ✅ | review 前置检查插入在 "Verify ALL prior phases" 与 mutex 之间，位置正确 |
| 错误消息 | ✅ | 明确列出缺失的 review 文件，包含 phase 编号和文件名 |
| Phase 4 边界 | ✅ | `if (prevConfig.reviewPrefix)` 安全检查，Phase 4 无 reviewPrefix 自动跳过 |
| PHASES 数组越界 | ✅ | `for (let p = 1; p < state.currentPhase; p++)` 确保 `PHASES[p-1]` 在范围内 |

### Skill 文档修改

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 格式一致性 | ✅ | 所有 5 个 Phase Skill 的 Self-Check Checklist 使用统一格式 |
| YAML frontmatter 正确性 | ✅ | 仅追加内容，不修改已有 frontmatter |
| Expert-reviewer 新增章节 | ✅ | LOW 收紧 + 增量审查，内容完整 |
| TDD 上下文传递示例 | ✅ | 包含违反示例和正确示例，教学效果好 |

---

## 3. 架构合规检查

| 架构约束 | 结果 | 说明 |
|---------|------|------|
| 不修改 Pi SDK | ✅ | 所有改动在 harness 自身代码内 |
| 不区分 Auto/Manual Mode | ✅ | gate-check.py 和 skill 文档是共享的 |
| 向后兼容 | ✅ | 新增字段（verification_method）为 optional |
| Python 3 + PyYAML | ✅ | gate-check.py 无新增依赖 |
| TypeScript + js-yaml | ✅ | index.ts 无新增依赖 |

---

## 4. 安全和性能检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 注入风险 | ✅ | gate-check.py 仅接受文件路径参数，无命令注入 |
| 性能问题 | ✅ | 新增的 review 前置检查是 O(n) 目录扫描，n ≤ 5 |
| 竞态条件 | ✅ | 前置检查在 mutex 之前执行，无并发问题 |

---

## 5. 集成验证

### Hook/Component 调用链验证

| 组件 | 注册点 | 调用链 | 结果 |
|------|--------|--------|------|
| Review 前置检查 | index.ts gate execute 函数 | `execute()` → 前置检查 → mutex → gate script | ✅ 在 gate 脚本运行前执行 |
| verification_method 统计 | gate-check.py validate_test_execution | `run_phase_checks()` → `validate_test_execution()` → Step 7 | ✅ 在所有 round 验证后执行 |

### 数据字段消费者追溯

| 字段 | 写入者 | 消费者 | 结果 |
|------|--------|--------|------|
| `verification_method` | 新增 optional 字段 | gate-check.py 统计输出 | ✅ 写入路径存在，消费者已实现 |
| `planTaskId` / `ac_ref` | 计划阶段 | Test Skill checklist 中提及 | ⚠️ 仅 checklist 提及，无强制校验 |

---

## 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | **MUST FIX** | `skills/xyz-harness-writing-plans/SKILL.md` | 缺少 `## Spec Metrics Traceability` 强制章节。Spec FR-5 和 AC-5 要求 Plan Skill 包含该章节说明，作为 plan 的强制模板。当前 plan.md 实例有该章节，但 skill 模板缺少，未来 plan 作者不会知道需要包含。 | 在 Plan Skill 文件的 Plan Document Header 之前增加 `## Spec Metrics Traceability` 章节，包含模板表格和三个采纳状态定义（adopted/rejected/postponed）。具体内容见 plan.md M3-2 中的模板文本。 |
| 2 | **LOW** | `skills/xyz-harness-brainstorming/SKILL.md` + `skills/harness-retrospect/SKILL.md` | 缺少 retrospect 流程行为记录。Spec FR-12（AC-14）要求验证 retrospect 只在 review PASS 后触发，并在 skill 文档中记录该行为。index.ts 代码逻辑已正确（L438-439），但 skill 文档未同步更新。 | 在 Spec Skill 和 harness-retrospect Skill 中增加一行说明：retrospect 只会在 gate PASS + review must_fix==0 后触发。 |
| 3 | **LOW** | `extensions/coding-workflow/lib/review-dispatcher.ts:80` | Frontmatter 模板指令 "不能嵌套" 与 expert-reviewer skill 的输出格式示例矛盾。模板写 "在顶层，不能嵌套"，但 expert-reviewer skill 文档显示嵌套格式（`review.verdict`、`statistics.must_fix`）。gate 侧 `_flatten_review_fields()` 能处理两种格式，所以无功能风险，但可能迷惑 subagent。 | 建议将模板中的 "不能嵌套" 改为 "推荐使用顶层字段（如 `verdict`、`must_fix`），嵌套格式（如 `review.verdict`、`statistics.must_fix`）也兼容"。 |

---

## 等级判定校准

| 口诀 | 检查结果 |
|------|---------|
| 数据丢失 | ❌ 无。所有字段有消费者 |
| 功能失效 | ❌ 无。所有新增逻辑有调用链 |
| 数据语义错误 | ❌ 无。字段定义清晰 |
| 重复副作用 | ❌ 无。幂等性不受影响 |
| 时序错误 | ❌ 无。消费者在写入后读取 |

Issue #1 判定为 MUST FIX：缺少 Spec Metrics Traceability 章节会导致 FR-5（Spec→Plan→Test 指标传递契约）在未来 plan 中静默退化，属于"数据流链路断裂"。不是风格问题。

---

## 结论

**需修改后重审。** 1 条 MUST FIX 未解决：Plan Skill 缺少 `## Spec Metrics Traceability` 强制章节。2 条 LOW 建议性修复。gate-check.py 和 index.ts 的代码修改质量合格，5 个 Phase Skill 和 3 个 Reference Skill 的文档修改完整覆盖对应 FR。

### Summary

编码评审完成，第1轮，1条MUST FIX，需修改后重审。

#### 修复优先级

1. **MUST FIX**：在 `skills/xyz-harness-writing-plans/SKILL.md` 中添加 `## Spec Metrics Traceability` 强制章节
2. **LOW**：在 Spec Skill 和 harness-retrospect Skill 中记录 retrospect 行为
3. **LOW**：调整 review-dispatcher.ts 的 frontmatter 模板措辞
