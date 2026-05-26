---
review:
  type: code_review
  round: 1
  timestamp: "2026-05-26T20:30:00"
  target: "skills/xyz-harness-writing-plans/SKILL.md, skills/xyz-harness-phase-dev/SKILL.md, skills/xyz-harness-phase-test/SKILL.md, skills/xyz-harness-expert-reviewer/SKILL.md, skills/xyz-harness-gate/scripts/check_gate.py"
  verdict: fail
  summary: "编码评审完成，第1轮，1条MUST FIX（check_gate.py 类型安全漏洞），2条LOW，建议修复后重审"

statistics:
  total_issues: 3
  must_fix: 1
  must_fix_resolved: 0
  low: 2
  info: 0

issues:
  - id: 1
    severity: MUST_FIX
    location: "skills/xyz-harness-gate/scripts/check_gate.py:197-198"
    title: "in 操作符在非 dict 值上执行子串匹配，可绕过 gate 校验"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 2
    severity: LOW
    location: "skills/xyz-harness-gate/scripts/check_gate.py:177"
    title: "open() 未指定 encoding，可能存在平台编码兼容问题"
    status: open
    raised_in_round: 1
    resolved_in_round: null

  - id: 3
    severity: LOW
    location: "skills/xyz-harness-expert-reviewer/SKILL.md 接口契约审查项"
    title: "L2 检查项条件修饰不统一"
    status: open
    raised_in_round: 1
    resolved_in_round: null
---

# 编码评审 v1

## 评审记录
- 评审时间：2026-05-26 20:30
- 评审类型：编码评审
- 评审对象：5 个文件的修改（4 个 skill SKILL.md + 1 个 gate-check.py）

## 概览

本次实现为 Plan Phase Interface Contract Enhancement 需求，涉及 5 个文件、206 行新增。核心改动：
1. `writing-plans SKILL.md` — 新增 Interface Contracts 章节（~92 行）
2. `gate-check.py` — 新增 interface_chain.json schema 校验 + complexity frontmatter 检查（~70 行）
3. `phase-dev SKILL.md` — 新增接口签名传递规则（~16 行）
4. `phase-test SKILL.md` — 新增 data_flows 消费规则（~10 行）
5. `expert-reviewer SKILL.md` — 新增接口契约审查维度 + 5→6 重编号（~8 行）

---

## 维度一：Spec 合规性（最高优先级）

逐项对照 spec 的 8 个 AC 和 8 个 FR：

### FR 覆盖

| FR | 实现状态 | 说明 |
|----|---------|------|
| FR-1: interface_chain.json schema | ✅ | JSON 定义准确反映在 check_gate.py 校验中 |
| FR-2: plan.md 接口契约章节 | ✅ | writing-plans SKILL.md 包含完整模板和 AC 覆盖矩阵 |
| FR-3: L1/L2 分级 | ✅ | 分级规则表、complexity frontmatter、gate 条件分支均对齐 |
| FR-4: 接口粒度边界 | ✅ | writing-plans 中明确声明纳入/不纳入范围 |
| FR-5: Gate 检查更新 | ✅ | check_gate.py 实现所有 GL1 检查项 + 向后兼容 |
| FR-6: Phase 3 消费 | ✅ | phase-dev 新增 L1/L2 双路径接口签名传递规则 |
| FR-7: Phase 4 消费 | ✅ | phase-test 新增 data_flows 消费说明 |
| FR-8: plan.md ↔ JSON 一致性 | ✅ | expert-reviewer 新增一致性审查维度 |

### AC 覆盖

| AC | 实现状态 | 对应文件 |
|----|---------|---------|
| AC-1: JSON schema 校验通过 | ✅ | check_gate.py `check_interface_chain_schema` |
| AC-2: L1 plan 不强制 JSON | ✅ | check_gate.py 条件分支 + 向后兼容路径 |
| AC-3: plan.md 接口签名表 | ✅ | writing-plans 含代码块模板，非占位符 |
| AC-4: AC 覆盖矩阵无 GAP | ✅ | writing-plans 含矩阵模板 + expert-reviewer 检查 |
| AC-5: cross-reference 校验 | ✅ | expert-reviewer `data_flows cross-reference` 项 |
| AC-6: plan.md ↔ JSON 一致 | ✅ | expert-reviewer `一致性` 项（仅 L2） |
| AC-7: TDD subagent 消费签名 | ✅ | phase-dev L1/L2 双路径 + 最低传递标准 |
| AC-8: complexity frontmatter | ✅ | writing-plans 说明 + gate-check 校验 |

**结论：Spec 覆盖完整，无遗漏。**

---

## 维度二：代码质量

### 问题 1（MUST FIX）：`in` 操作符在非 dict 值上执行子串匹配，可绕过 gate 校验

**位置：** `skills/xyz-harness-gate/scripts/check_gate.py`，check_interface_chain_schema 函数，约第 197-198 行

**问题描述：**

```python
required_method_fields = ("name", "class", "params", "returns")
for i, m in enumerate(methods):
    for field in required_method_fields:
        if field not in m:
            method_errors.append(...)
```

当 `methods` 数组包含字符串而非对象时（例如 `["name_params_returns_class"]`），Python 的 `in` 操作符对字符串执行**子串匹配**而非字典键检查：
- `"name" in "name_params_returns_class"` → `True` ✅（子串匹配通过）
- `"class" in "name_params_returns_class"` → `True` ✅
- `"params" in "name_params_returns_class"` → `True` ✅
- `"returns" in "name_params_returns_class"` → `True` ✅

同样的问题也出现在 data_flows 的 `"id" in df` 和 `"chain" in df` 检查中。

**影响：** 一个精心构造的 `interface_chain.json` 可以使用字符串数组替代对象数组，通过所有 schema 检查，却提供零个真实方法签名。这构成 gate 绕过——与项目的"AI 是不可信的执行者"核心理念直接冲突。

**修复方向：** 在循环中检查 `m` 是否为 dict，或使用 `isinstance(m, dict)` 守卫：

```python
for i, m in enumerate(methods):
    if not isinstance(m, dict):
        method_errors.append(f"methods[{i}] expected object, got {type(m).__name__}")
        continue
    for field in required_method_fields:
        if field not in m:
            method_errors.append(f"methods[{i}] missing '{field}'")
```

同样的守卫应添加到 data_flows 循环中。

### 问题 2（LOW）：`open()` 未指定 encoding

**位置：** `skills/xyz-harness-gate/scripts/check_gate.py:177`

```python
with open(ic_path) as f:
    ic_data = json.load(f)
```

`open()` 默认使用 locale 相关的编码。在非 UTF-8 系统上，如果 `interface_chain.json` 包含非 ASCII 字符（如 spec_refs 含中文描述），可能导致 UnicodeDecodeError。建议明确指定：

```python
with open(ic_path, 'r', encoding='utf-8') as f:
```

该问题目前不会在开发环境中触发（macOS 默认 UTF-8），但降低跨平台兼容性。

---

## 维度三：内容质量

### 问题 3（LOW）：L2 检查项条件修饰不统一

**位置：** `skills/xyz-harness-expert-reviewer/SKILL.md` 接口契约审查章节

当前有三项检查标记了 `（仅 L2）`：
- **plan.md ↔ interface_chain.json 一致性**（仅 L2）
- **data_flows cross-reference**（仅 L2）

但 **AC 覆盖矩阵完整性** 和 **类型传递一致性** 没有标记条件。从 spec 看：
- AC 覆盖矩阵：对所有 plan（L1/L2）都强制（FR-3 表中 `AC 覆盖矩阵: 强制`）→ 正确，不应标 L2-only
- 类型传递一致性：data_flows 在 L1 中为"可选"，所以此检查仅在有 data_flows 时有意义 → 实际上也是 L2 隐式条件

问题不在于内容错误，而在于读者可能困惑：为什么有的标了 `（仅 L2）` 有的没标？建议添加注释说明条件判定逻辑，或统一所有 L2-only 项的标注。

### 内容完整度检查

**writing-plans SKILL.md：** ✅
- 方法签名表模板：使用标准 markdown 代码块（` ```markdown `），含完整表格框架 ⚠️ 但模板是**结构骨架**而非填充示例——`{module-name}`、`{ClassName}` 占位符清晰，TDD subagent 能正确填充使用
- AC 覆盖矩阵模板：含明确 `[GAP]` 和 `[POSTPONED]` 语义说明
- 接口粒度边界、禁止实现代码豁免：均有明确说明

**phase-dev SKILL.md：** ✅
- L1/L2 双路径清晰
- 最低传递标准精确定义（方法名+参数类型列表+返回类型）
- 偏差记录机制完备

**phase-test SKILL.md：** ✅
- Data flows 消费规则简洁准确
- 明确不改 test_cases_template.json schema

**expert-reviewer SKILL.md：** ✅
- 4 项检查维度完整覆盖 spec FR-5 GL2
- 5→6 重编号正确
- 新增项位置（L1 后端检查清单之前）正确

---

## 维度四：架构合规

### 与 CLAUDE.md 对齐检查

| 约束 | 状态 | 证据 |
|------|------|------|
| Skill YAML frontmatter 未破坏 | ✅ | 无 SKILL.md 的 YAML frontmatter 被改动 |
| "禁止实现代码"规则豁免声明 | ✅ | writing-plans 中明确声明接口签名不受限 |
| 向后兼容 | ✅ | complexity 字段缺失时 PASS + 不触发 JSON 检查 |
| GL1 保持简单 | ✅ | check_gate.py 仅做 schema 字段存在性校验，不做语义验证 |
| Subagent 模型架构不变 | ✅ | 未引入新的 agent 定义，所有 subagent 仍使用 general-purpose |
| Gate 检查项不无限扩展 | ✅ | 新增函数独立封装（check_interface_chain_schema），check_phase_2 按需调用 |

**结论：符合项目架构约束。**

---

## 维度五：安全与性能

无安全/性能问题。gate-check.py 是开发者本地工具，只读本地文件，无网络/外部输入。

---

## 发现的问题

| # | 优先级 | 文件/位置 | 描述 | 修改建议 |
|---|--------|----------|------|---------|
| 1 | **MUST FIX** | `check_gate.py:197-198` | `in` 操作符对非 dict 值做子串匹配，可构造字符串数组绕过所有 schema 校验 | 添加 `isinstance(m, dict)` / `isinstance(df, dict)` 守卫 |
| 2 | LOW | `check_gate.py:177` | `open()` 未指定 `encoding='utf-8'`，跨平台可能因 locale 编码不同而失败 | 明确指定 encoding |
| 3 | LOW | `expert-reviewer SKILL.md` | L2 标签标注不一致：部分检查项有 `（仅 L2）` 标签，部分没有，读者可能困惑 | 统一标注策略或添加条件说明 |

---

## 结论

需修改后重审。1 条 MUST FIX（check_gate.py 类型安全漏洞），修复后 gate 不再可被字符串数组绕过。2 条 LOW 不影响 gate，但建议主动修复以提高代码健壮性。

### Summary

编码评审完成，第1轮，1条MUST FIX，需修改后重审。
