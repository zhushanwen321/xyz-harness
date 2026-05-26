---
review:
  type: code_review
  round: 1
  timestamp: "2026-05-26T19:30:00"
  target: "12 files (+1656/-39): 4 new reviewer skills, 1 collector skill + script, gate-check.py, 4 SKILL.md updates, 1 symlink"
  verdict: fail
  summary: "编码评审完成，第1轮，3条MUST FIX（gate-check.py verdict 检查缺失、must_fix 检查缺失、Python taste review 无输出路径），需修改后重审"

statistics:
  total_issues: 8
  must_fix: 3
  must_fix_resolved: 0
  low: 3
  info: 2

issues:
  - id: 1
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L404-L407"
    title: "use-cases.md 和 non-functional-design.md 的 FileCheck 缺少 verdict: pass 字段检查"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 2
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L245"
    title: "validate_plan_bl_review 提取了 must_fix 但未检查 must_fix=0"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 3
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L430-L431 + skills/xyz-harness-phase-dev/SKILL.md:L194"
    title: "Python 项目 taste review 无输出文件名，gate-check 无对应 prefix，Python 项目 Phase 3 gate 永远失败"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 4
    severity: LOW
    location: "skills/harness-retrospect-collector/scripts/collect.py:L308-L313"
    title: "aggregate 模式重复扫描文件"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 5
    severity: LOW
    location: "extensions/coding-workflow/gate-check.py:run_phase_checks"
    title: "FileCheck fields 为空时文件存在但无 PASS 消息输出"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 6
    severity: LOW
    location: "skills/xyz-harness-standards-reviewer/SKILL.md"
    title: "standards-reviewer review_metrics 中 duration_estimate 默认值 '3' 与其他 reviewer 的 '5' 不一致"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 7
    severity: INFO
    location: "skills/xyz-harness-writing-plans/SKILL.md:L47-L90"
    title: "non-functional-design.md 模板描述引用了本项目特有内容（YAML frontmatter、Skill 文件）"
    status: open
    raised_in_round: 1
    resolved_in_round: null
  - id: 8
    severity: INFO
    location: "skills/xyz-harness-integration-reviewer/SKILL.md"
    title: "integration-reviewer 的 review_metrics 额外包含 boundaries_checked 字段，其他 reviewer 无此字段"
    status: open
    raised_in_round: 1
    resolved_in_round: null

---

# 编码评审 v1

## 评审记录
- 评审时间：2026-05-26 19:30
- 评审类型：编码评审（模式二）
- 评审对象：12 files, +1656/-39 行（base commit: 8d91224e）
- Spec 参考：`.xyz-harness/2026-05-26-harness-plan-dev-review-retrospect-enhancement/spec.md`

## Spec 合规检查

### FR 覆盖矩阵

| FR | 描述 | 覆盖状态 | 问题 |
|----|------|---------|------|
| FR-1 | Plan 阶段新增 use-cases.md | ⚠️ 部分覆盖 | writing-plans SKILL.md 有模板和格式要求 ✓；gate-check.py 检查文件存在但未检查 verdict: pass（Issue #1） |
| FR-2 | Plan 阶段新增 non-functional-design.md | ⚠️ 部分覆盖 | 同 FR-1，gate-check.py 未检查 verdict: pass（Issue #1） |
| FR-3 | Business Logic Reviewer 双模式 | ✅ 完整覆盖 | SKILL.md 含 Plan/Dev 双模式方法论、模拟数据格式、执行路径记录、review_metrics |
| FR-4 | Integration Reviewer | ✅ 完整覆盖 | SKILL.md 含 D1-D4 维度、与 BLR 依赖说明、review_metrics |
| FR-5 | Standards Reviewer | ✅ 完整覆盖 | SKILL.md 含 Phase A/B 两阶段、无 lint 项目处理、linter_passed 条件逻辑 |
| FR-6 | Robustness Reviewer | ✅ 完整覆盖 | SKILL.md 含 D1-D6 六维度、逐文件扫描方法论、去重合并规则 |
| FR-7 | Retrospect YAML 元数据增强 | ✅ 完整覆盖 | harness-retrospect SKILL.md 新增字段定义表 + 吸收工作流章节 |
| FR-8 | Retrospect Collector + Script | ✅ 完整覆盖 | collect.py 支持 scan/absorb/aggregate/json 全模式，向后兼容旧文件 |
| FR-9 | Phase 1 Spec 业务用例章节 | ✅ 完整覆盖 | brainstorming SKILL.md 增加模板 + 六要素表新行 |
| FR-10 | Phase 3 五步审查编排 | ⚠️ 部分覆盖 | phase-dev SKILL.md 编排正确；Python taste review 缺输出文件名（Issue #3） |
| FR-12 | review_metrics 字段 | ✅ 完整覆盖 | 所有 4 个新 reviewer 含 review_metrics，phase-dev SKILL.md 文档化格式 |
| FR-13 | Gate-check.py 更新 | ⚠️ 部分覆盖 | Phase 2/3 新增检查项结构正确；use-cases.md 和 non-functional-design.md 缺 verdict 检查（Issue #1）；plan_bl_review 缺 must_fix 检查（Issue #2）；Python taste 无 prefix（Issue #3） |

### AC 覆盖矩阵

| AC | 描述 | 状态 | 验证结果 |
|----|------|------|---------|
| AC-1 | use-cases.md 格式和内容 | ⚠️ | SKILL.md 模板正确，gate 缺 verdict 检查 |
| AC-2 | non-functional-design.md 覆盖五维度 | ⚠️ | SKILL.md 模板正确，gate 缺 verdict 检查 |
| AC-3 | BLR 双模式可 dispatch | ✅ | SKILL.md 方法论完整 |
| AC-4 | Integration Reviewer 可消费上游 | ✅ | SKILL.md 含 BLR 依赖说明 |
| AC-5 | Standards Reviewer lint + 规范对比 | ✅ | SKILL.md 含 Phase A/B + 边界条件处理 |
| AC-6 | Robustness Reviewer 六维度 | ✅ | SKILL.md 含 D1-D6 |
| AC-7 | Retrospect YAML 含吸收元数据 | ✅ | SKILL.md 字段定义完整 |
| AC-8 | Collector 脚本可用 | ✅ | collect.py 全模式可用 |
| AC-9 | Phase 1 spec 含业务用例 | ✅ | brainstorming SKILL.md 更新正确 |
| AC-10 | Phase 3 五步审查可执行 | ⚠️ | 编排正确，Python taste 缺输出路径 |
| AC-11 | Gate-check.py 通过新规则 | ❌ | 3 个 MUST FIX 影响 gate 正确性 |
| AC-12 | Retrospect 记录审查价值 | ✅ | review_metrics 格式统一定义 |

---

## 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | MUST FIX | `extensions/coding-workflow/gate-check.py:L404-L407` | use-cases.md 和 non-functional-design.md 的 FileCheck 缺少 `verdict: pass` 字段检查。`FileCheck(path="use-cases.md")` 和 `FileCheck(path="non-functional-design.md")` 的 `fields` 列表为空，导致 gate 只检查文件是否存在且有合法 YAML frontmatter，不检查 verdict 值。AC-11 明确要求 "Phase 2 gate 检查 use-cases.md 和 non-functional-design.md 存在且 verdict: pass"。 | 为两个 FileCheck 添加 `fields=[FieldCheck("verdict", "str", "pass")]`。 |
| 2 | MUST FIX | `extensions/coding-workflow/gate-check.py:L245` | `validate_plan_bl_review` 调用 `_flatten_review_fields(rdata)` 提取了 `verdict` 和 `must_fix`，但只检查了 `verdict`，完全没有检查 `must_fix == 0`。AC-11 要求 "Phase 2 L2 gate 额外检查 plan_bl_review 存在且 verdict: pass, must_fix: 0"。 | 在 verdict 检查通过后，添加 must_fix 检查逻辑：`if must_fix is None: FAIL; elif must_fix != 0: FAIL`。 |
| 3 | MUST FIX | `extensions/coding-workflow/gate-check.py:L430-L431` + `skills/xyz-harness-phase-dev/SKILL.md:L194` | Python 项目 taste review 无输出文件名。phase-dev SKILL.md 中 Python 项目 fallback（read essence.md 注入 task prompt）没有指定产出文件名（只列了 ts_taste_review 和 rust_taste_review）。gate-check.py 只有 `ts_taste_review` 和 `rust_taste_review` 两个 prefix，无通用 taste_review prefix。导致：(1) Python 项目运行 taste review 后无处写文件；(2) 跳过 taste review 时 `validate_taste_review_exists` 永远 FAIL。 | 方案 A：在 gate-check.py 新增 `ReviewCheck(prefix="taste_review", optional=True)` 并更新 `validate_taste_review_exists` 也检查此 prefix；在 phase-dev SKILL.md 中指定 Python taste review 产出 `taste_review_v1.md`。方案 B：Python 项目跳过时，在 standards_review 中标记，gate-check 检查 standards_review 中的 skip 标记。推荐方案 A。 |
| 4 | LOW | `skills/harness-retrospect-collector/scripts/collect.py:L308-L313` | aggregate 模式在 main() 中先扫描所有文件到 `records`（L292-296），再在 aggregate 分支中重新扫描到 `all_records`（L308-311）。两次扫描的文件列表相同（同一个 `files` 变量），第二次完全多余。虽然 aggregate 需要"含已吸收"的数据，但可以在第一次扫描时保留全量记录再过滤，而非重新扫描。 | 在第一次扫描后保存原始全量 `records`，过滤后赋给新变量 `filtered`。aggregate 分支直接使用原始全量 `records`。 |
| 5 | LOW | `extensions/coding-workflow/gate-check.py:run_phase_checks` (FileCheck 分支) | 当 `FileCheck.fields` 为空且文件存在时，`for f in fc.fields` 循环不执行，结果是没有添加任何 PASS 检查到 checks 列表。文件"通过"但不出现在输出中。这虽然不影响 gate 判定（不会 FAIL），但用户看不到确认信息，且与有 fields 的 FileCheck 行为不一致。 | 在 `else` 分支中，fields 循环前添加：`if not fc.fields: checks.append((fc.path, PASS, "exists with valid frontmatter"))` |
| 6 | LOW | `skills/xyz-harness-standards-reviewer/SKILL.md` (review_metrics 模板) | standards-reviewer 的 review_metrics 模板中 `duration_estimate: "3"`（3 分钟），其他三个 reviewer 都是 `duration_estimate: "5"`。虽然是可选手动填写的字段，但模板默认值不一致可能暗示 standards review "更快"，对 subagent 产生 anchoring 效应。 | 统一为 `"5"` 或全部移除默认值让审查者自行填写。 |
| 7 | INFO | `skills/xyz-harness-writing-plans/SKILL.md:L47-L90` | non-functional-design.md 的五维度描述中混入了本项目特有内容（"YAML frontmatter 修改的安全性"、"Skill 文件作为 AI 行为指令的安全影响"、"文件扫描、YAML 解析的性能评估"）。这些是作为 writing-plans 模板的示例指导，plan 阶段 AI 会根据实际项目替换内容。模板本身功能正确，只是描述不够通用。 | 无需修改。如果后续发现 plan 阶段 AI 机械复制这些描述，可以改为更通用的示例。 |
| 8 | INFO | `skills/xyz-harness-integration-reviewer/SKILL.md` (review_metrics) | integration-reviewer 的 review_metrics 额外包含 `boundaries_checked` 字段，robustness-reviewer 额外包含 `dimensions_checked` 字段。这些 per-reviewer 扩展字段在 phase-dev SKILL.md 的通用 review_metrics 文档中未提及。 | 建议：无。这是合理的 per-reviewer 扩展，统一模板无法覆盖所有专业维度。 |

> 优先级定义：
> - **MUST FIX**：不修复则评审不通过，会阻塞流程
> - **LOW**：建议修复，但不阻塞
> - **INFO**：观察记录，无需操作

---

## 代码质量分析

### gate-check.py 新增函数

**validate_plan_bl_review**: 结构清晰，先读 plan.md 的 complexity 再决定是否检查。但有两个遗漏：(1) 不检查 must_fix=0（Issue #2）；(2) 文件发现逻辑用 os.listdir 遍历而非复用 find_latest_review，但功能等价。

**validate_taste_review_exists**: 设计巧妙——ts_taste_review 和 rust_taste_review 都是 optional=True，但 pre_check 确保至少一个存在。这样 Gate 会先标记两个 optional review "skipped"，再由 pre_check FAIL 标记"至少需要一个"。输出略冗余但逻辑正确。缺少对 Python 项目的处理（Issue #3）。

**validate_standards_linter**: 正确处理三种状态（true/false/absent）。仅当字段存在时才检查值。符合 AC-5 对"无 lint 配置项目"的处理要求。

**_flatten_review_fields**: 新增 `review.must_fix` 提取逻辑，与已有的 `review.verdict` 提取模式一致。正确。

**ReviewCheck.optional**: 新增字段 + run_phase_checks 中的 optional 分支处理正确。optional=True 的 review 缺失时输出 PASS + "skipped"。

### collect.py

**scan_one**: 正确处理旧文件 backward compatibility——`meta.get("absorbed", False)` 确保 absent 时默认 false。topic 从路径推断是合理的 fallback。

**absorb_file**: 使用 yaml.dump 重写 frontmatter 会丢失原始格式（缩进、注释等），但 sort_keys=False 保留键序。功能正确，格式损失可接受。

**aggregate_issues**: normalize_issue 用 `re.sub(r"[^\w]", "", ...)` 过于激进，会将 "Phase 3 slow" 和 "Phase3slow" 视为相同。实际使用场景中不太会产生误匹配，但可以改进为只去空格和标点末尾比较。

**CLI**: 参数设计完整，--absorb + --summary 必须一起使用有校验。错误信息清晰。

### SKILL.md 文件

四个新 reviewer skill 的 YAML frontmatter 全部通过解析验证。方法论描述结构一致：
- 适用场景表 + 角色描述 + 上下文隔离声明
- 输入/输出/上游下游
- 审查方法（步骤化）
- Review 输出模板（含 review_metrics）
- 严重度判定规则
- 返回值格式 + 审查流程

这种一致性降低了 subagent dispatch 时的 prompt 构造复杂度。

---

## 架构合规

- 不违反 CLAUDE.md 声明的架构约束 ✓
- Skill 定义结构符合项目约定（YAML frontmatter + Markdown body）✓
- gate-check.py 的 PhaseSpec dataclass 扩展（optional 字段、pre_checks）与现有模式一致 ✓
- Python 脚本仅依赖 stdlib + PyYAML ✓

## 向后兼容

- Phase 1 gate：无变更，不受影响 ✓
- Phase 2 gate：新增 use-cases.md / non-functional-design.md 检查。旧 topic 缺少这些文件时 gate FAIL。plan.md 注释中说明了 ADR-0006 策略 ✓
- Phase 3 gate：code_review_v 替换为 5 个新 review。旧 topic 的 code_review 不再被识别，gate FAIL。同上 ADR-0006 ✓
- collect.py：旧版 retrospect 无 absorbed 字段默认 false ✓

---

## 结论

需修改后重审。3 条 MUST FIX 均在 gate-check.py 和 phase-dev SKILL.md，涉及 gate 检查完整性（verdict 缺失、must_fix 缺失、Python taste review 无路径）。

### Summary

编码评审完成，第1轮，3条MUST FIX，需修改后重审。
