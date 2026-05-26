---
review:
  type: code_review
  round: 2
  timestamp: "2026-05-26T20:15:00"
  target: "Incremental review of fixes for MUST FIX #1/#2/#3 from v1 (base: 8d91224e)"
  verdict: fail
  summary: "第 2 轮审查：MUST FIX #1 ✅、#3 ✅ 已修复；#2 ⚠️ 部分修复（must_fix=None 未拦截）；新增 1 条 LOW（validate_plan_bl_review must_fix=None 未拦截）+ 1 条 INFO（SKILL.md 重复行）。"

statistics:
  total_issues: 3
  must_fix: 1
  must_fix_resolved: 2
  low: 1
  info: 1

issues:
  - id: 1
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L404-L407"
    title: "use-cases.md 和 non-functional-design.md 的 FileCheck 缺少 verdict: pass 字段检查"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 2
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L245"
    title: "validate_plan_bl_review 提取了 must_fix 但未检查 must_fix=0"
    status: open
    raised_in_round: 1
    resolved_in_round: null
    notes: "部分修复：must_fix != 0 已检查，但 must_fix=None（缺失字段）不触发 FAIL"
  - id: 3
    severity: MUST_FIX
    location: "extensions/coding-workflow/gate-check.py:L430-L431 + skills/xyz-harness-phase-dev/SKILL.md:L194"
    title: "Python 项目 taste review 无输出文件名，gate-check 无对应 prefix"
    status: resolved
    raised_in_round: 1
    resolved_in_round: 2
  - id: 9
    severity: LOW
    location: "extensions/coding-workflow/gate-check.py:validate_plan_bl_review"
    title: "must_fix=None（缺失字段）不触发 FAIL"
    status: open
    raised_in_round: 2
    resolved_in_round: null
  - id: 10
    severity: INFO
    location: "skills/xyz-harness-phase-dev/SKILL.md:L237-L238"
    title: "Python Taste Review Fallback 有重复行"
    status: open
    raised_in_round: 2
    resolved_in_round: null

---

# 编码评审 v2（增量修复验证）

## 评审记录
- 评审时间：2026-05-26 20:15
- 评审类型：第 2 轮增量审查
- 评审对象：v1 的 3 条 MUST FIX 修复情况
- 验证方法：git diff 8d91224e..HEAD 检查修复 + 完整性验证

---

## MUST FIX #1: FileCheck 缺少 verdict 检查

### 修复验证

```python
# gate-check.py Phase 2 spec
FileCheck(path="use-cases.md", fields=[FieldCheck("verdict", "str", "pass")]),
FileCheck(path="non-functional-design.md", fields=[FieldCheck("verdict", "str", "pass")]),
```

### 判断

从旧代码的 `FileCheck(path="use-cases.md")`（无 fields）改为带 `fields=[FieldCheck("verdict", "str", "pass")]`，与 AC 要求一致。

同时，`xyz-harness-writing-plans/SKILL.md` 中新增了 use-cases.md 和 non-functional-design.md 的 YAML frontmatter 模板（`verdict: pass`），前后端一致。

**状态：✅ 已修复**

---

## MUST FIX #2: validate_plan_bl_review 没检查 must_fix==0

### 修复验证

```python
verdict, must_fix = _flatten_review_fields(rdata)
if verdict is None or verdict != "pass":
    checks.append(("plan_bl_review", FAIL, f"verdict={repr(verdict)}, expected 'pass'"))
    return
if must_fix is not None and must_fix != 0:
    checks.append(("plan_bl_review must_fix", FAIL, f"must_fix={must_fix}, expected 0"))
    return
checks.append(("plan_bl_review", PASS, "found, verdict=pass, must_fix=0"))
```

新增了 must_fix != 0 的检查逻辑。`_flatten_review_fields` 也增加了从 `data["review"]["must_fix"]` 和 `data["statistics"]["must_fix"]` 提取 must_fix 的 fallback 逻辑。

### 遗留问题：must_fix=None 未拦截

检查条件 `if must_fix is not None and must_fix != 0` 意味着当 `must_fix` 为 `None`（YAML frontmatter 中缺失该字段）时，条件不成立，不会 FAIL，直接输出 "found, verdict=pass, must_fix=0"——但实际 must_fix 从未被找到。

**正确做法：** 改为 `if must_fix is None or must_fix != 0`，确保缺失字段也触发 FAIL（已上升为新的 MUST FIX，Issue #9）。

### 边缘情况确认

- ✅ plan.md 不存在 → 跳过（安全）
- ✅ complexity != "L2" → skip（正确）
- ✅ 文件不存在 → FAIL（正确）
- ✅ verdict != "pass" → FAIL（正确）
- ⚠️ must_fix 存在且 != 0 → FAIL（正确）
- ❌ must_fix 不存在（None）→ PASS（应该 FAIL）

**状态：⚠️ 部分修复（仍有 must_fix=None 未拦截的问题）**

---

## MUST FIX #3: Python 项目 taste review 无输出文件名

### 修复验证

**gate-check.py：** Phase 3 reviews 新增：
```python
ReviewCheck(prefix="ts_taste_review", optional=True),
ReviewCheck(prefix="rust_taste_review", optional=True),
ReviewCheck(prefix="taste_review", optional=True),  # ← 新增 Python 通用
```

**validate_taste_review_exists** 新增 generic 路径检查：
```python
generic_path = find_latest_review(topic_dir, "taste_review")
found = ts_path or rust_path or generic_path
```

**xyz-harness-phase-dev/SKILL.md** 输出定义：
```
- 输出: `{topic_dir}/changes/reviews/ts_taste_review_v1.md` 或
  `rust_taste_review_v1.md` 或 `taste_review_v1.md`（Python 项目）
```

### 判断

- Python 项目产出 `taste_review_v1.md` ✅
- gate-check 新增 `taste_review` prefix ✅
- `validate_taste_review_exists` 识别 generic taste_review ✅
- 三个 prefix 全部 `optional=True`，`pre_checks` 确保至少一个存在 ✅

### 小瑕疵：重复行

Python Taste Review Fallback 节最后两行重复（README 中也有）。不影响功能，但属格式问题。见 Issue #10。

**状态：✅ 已修复**

---

## 新发现的问题

| # | 优先级 | 位置 | 描述 | 建议 |
|---|--------|------|------|------|
| 9 | MUST_FIX | gate-check.py:validate_plan_bl_review L247 | must_fix=None（缺失字段）不触发 FAIL，直接输出 "must_fix=0" 误导性通过 | 将 `if must_fix is not None and must_fix != 0` 改为 `if must_fix is None or must_fix != 0` |
| 10 | INFO | skills/xyz-harness-phase-dev/SKILL.md L237-L238 | Python Taste Review Fallback 中 `- 如果文件存在:` 出现两次（第二行缺少 "产出 \`taste_review_v1.md\`"），应是复制粘贴遗漏 | 删除 L238 重复行 |

### Issue #9 详细分析

**问题：** must_fix=None（缺失字段）时 validate_plan_bl_review 返回 PASS

**根因：** `_flatten_review_fields` 从三个位置尝试提取 must_fix：
1. 顶层 `data.get("must_fix")`
2. `data["review"]["must_fix"]`
3. `data["statistics"]["must_fix"]`

如果三个位置都没有，返回 `None`。但 `validate_plan_bl_review` 的检查条件是：
```python
if must_fix is not None and must_fix != 0:
```
当 must_fix=None 时条件不满足，不触 FAIL，继续执行到：
```python
checks.append(("plan_bl_review", PASS, "found, verdict=pass, must_fix=0"))
```
输出错误地声称 must_fix=0，但实际找不到 must_fix 字段。

**影响：** 写 review 时如果跳过 must_fix 字段，gate 会静默通过。虽然 reviewer skill 模板都包含 must_fix，但 AI 可能遗漏。

**修正方案：** 第 247 行改为：
```python
if must_fix is None or must_fix != 0:
```

---

## 代码质量观察

### _flatten_review_fields 扩展

新增的 `must_fix` 提取逻辑与已有的 `verdict` 提取模式一致。review.must_fix 和 statistics.must_fix 的 fallback 是合理的多层次查找。✅

### validate_taste_review_exists

`ts_path or rust_path or generic_path` 的链式短路选择第一个找到的路径，设计正确。`found` 为路径字符串（非空→truthy），`os.path.basename(found).replace(".md", "")` 生成命名正确的 PASS 消息。✅

### gate-check.py 动态注册

`pre_checks` 机制（Callable 列表）用于 `validate_plan_bl_review`、`validate_taste_review_exists`、`validate_standards_linter`，与 PhaseSpec dataclass 配合良好。✅

### Phase 3 review 的 optional 语义

`optional=True` 的 review 缺失时输出 PASS + "skipped"。由 `validate_taste_review_exists`（pre_checks 中）确保至少一个 taste review 存在。这种前置检查 + 可选标记的组合设计清晰。✅

---

## 结论

| MUST FIX | 状态 | 说明 |
|----------|------|------|
| #1 FileCheck 缺 verdict | ✅ 已修复 | fields 添加正确 |
| #2 plan_bl_review 缺 must_fix 检查 | ⚠️ 部分修复 | must_fix != 0 已检查，但 None 不触发 FAIL |
| #3 Python taste 缺输出路径 | ✅ 已修复 | taste_review_v1.md 指定 + gate 更新 |

修正 Issue #9 后可通过 gate。Issue #10 属格式问题，建议一并清理。

### Summary

增量审查完成，第 2 轮。2 条已修复，1 条部分修复（must_fix=None 缺口），新增 1 条 MUST FIX（验证缺失字段）。
