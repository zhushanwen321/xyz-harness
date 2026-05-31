---
name: xyz-harness-gate
description: >-
  Gate check skill for xyz-harness. Validates deliverables per phase — file existence, YAML frontmatter correctness, verdict/required fields. Used standalone in a separate Pi session. Trigger: "run gate check", "verify deliverables", "check gate", "validate phase X".
---

# Gate Check

## Usage

Run this skill in a SEPARATE Pi session (new conversation) for unbiased validation.

### AI — 入口流程

用户说"检查 gate"时，你先确定以下信息：

**1. 找 topic 目录**

```bash
ls .xyz-harness/
```
列出所有 topic。如果找不到，问用户在哪个项目目录工作。

**2. 确定 phase**

问用户要检查哪个 phase（1-5）。或者检测已有文件推断：
- 只有 `spec.md` → Phase 1
- 有 `plan.md` → Phase 2
- 有 `changes/evidence/test_results.md` → Phase 3
- 有 `test_execution.json` → Phase 4
- 有 `pr_evidence.md` → Phase 5

**3. 运行检查脚本**

确定 topic 和 phase 后，运行验证脚本：

```bash
python3 scripts/check_gate.py {topic_dir} {phase_number}
```

脚本路径：脚本与本 skill 在同一目录下的 `scripts/check_gate.py`。

例如：
```bash
python3 ~/.pi/agent/skills/xyz-harness-gate/scripts/check_gate.py .xyz-harness/2026-05-17-system-setting 2
```

脚本会自动检查该 phase 的所有交付物并输出结构化报告。

如果脚本不可用（Python/path 问题），按下面章节的检查表逐项手动验证。

---

## 检查表（供手动验证参考）

### Phase 1 — Spec

| # | 检查项 | 期望 |
|---|--------|------|
| 1.1 | `{topic}/spec.md` 存在 | 文件存在 |
| 1.2 | spec.md 的 YAML `verdict` 不为空 | `verdict` 字段存在且非空（通常是 "pass"） |
| 1.3 | `{topic}/changes/reviews/spec_review_v*.md` 存在 | 至少有一个 review 文件 |
| 1.4 | 最新 spec_review 的 `verdict` == "pass" | 字符串 `"pass"` |
| 1.5 | 最新 spec_review 的 `must_fix` == 0 | 数字 `0` |

### Phase 2 — Plan

| # | 检查项 | 期望 |
|---|--------|------|
| 2.1 | `{topic}/plan.md` 存在 | 文件存在 |
| 2.2 | plan.md 的 `verdict` == "pass" | 字符串 `"pass"` |
| 2.3 | `{topic}/e2e-test-plan.md` 存在 | 文件存在 |
| 2.4 | e2e-test-plan.md 的 `verdict` == "pass" | 字符串 `"pass"` |
| 2.5 | `{topic}/test_cases_template.json` 存在且是有效 JSON | `json.load()` 成功 |
| 2.6 | test_cases_template.json 有 `test_cases` 数组，每项有 `id`/`type`/`title` | 结构完整 |
| 2.7 | `{topic}/changes/reviews/plan_review_v*.md` 存在 | 至少有一个 review 文件 |
| 2.8 | 最新 plan_review 的 `verdict` == "pass" 且 `must_fix` == 0 | 字符串 `"pass"`, 数字 `0` |
| 2.9 | **L2 复杂度：** plan.md 的 `complexity` == "L2" 时，`plan-backend.md` 存在 | 文件存在 |
| 2.10 | **L2 复杂度：** plan.md 的 `complexity` == "L2" 时，`plan-frontend.md` 存在 | 文件存在 |
| 2.11 | **L2 复杂度：** plan.md 的 `complexity` == "L2" 时，`plan-api-contract.md` 存在 | 文件存在 |

> **L2 检查为条件性：** 仅当 plan.md 的 YAML frontmatter 中 `complexity: L2` 时执行 2.9-2.11。L1 时跳过。

### Phase 3 — Dev

| # | 检查项 | 期望 |
|---|--------|------|
| 3.1 | `{topic}/changes/evidence/test_results.md` 存在 | 文件存在 |
| 3.2 | test_results.md 的 `verdict` == "pass" | 字符串 `"pass"` |
| 3.3 | test_results.md 的 `all_passing` == true | **布尔值** `true`（不是字符串 `"true"`） |
| 3.4 | `{topic}/changes/reviews/code_review_v*.md` 存在 | 至少有一个 review 文件 |
| 3.5 | 最新 code_review 的 `verdict` == "pass" 且 `must_fix` == 0 | 字符串 `"pass"`, 数字 `0` |

### Phase 4 — Test

| # | 检查项 | 期望 |
|---|--------|------|
| 4.1 | `{topic}/test_cases_template.json` 存在（用于 cross-ref） | 文件存在 |
| 4.2 | `{topic}/changes/evidence/test_execution.json` 存在 | 文件存在 |
| 4.3 | test_execution.json 中所有记录有 `caseId`/`round`/`passed` | 结构完整 |
| 4.4 | 每个记录的 `execute_steps` 非空 | `len(steps) > 0` |
| 4.5 | 所有 template case ID 在 execution 中有记录 | 全部覆盖 |
| 4.6 | 最终轮次（round）所有 case `passed` == true | 布尔值 `true` |

### Phase 5 — PR

| # | 检查项 | 期望 |
|---|--------|------|
| 5.1 | `{topic}/changes/evidence/pr_evidence.md` 存在 | 文件存在 |
| 5.2 | pr_evidence.md 的 `pr_created` == true | **布尔值** `true`（不是字符串 `"true"`） |
| 5.3 | `{topic}/changes/evidence/ci_results.md` 存在 | 文件存在 |
| 5.4 | ci_results.md 的 `ci_passed` == true | **布尔值** `true` |

---

## 手动 YAML 解析（脚本不可用时）

```bash
python3 -c "
import yaml
with open('{path}') as f:
    content = f.read()
first = content.find('---')
second = content.find('---', first + 3)
if first >= 0 and second > first:
    data = yaml.safe_load(content[first+3:second])
    for k, v in data.items():
        print(f'{k}={repr(v)} (type={type(v).__name__})')
else:
    print('No valid YAML frontmatter')
"
```

---

## Common Failure Modes

### YAML 字段类型错误（最常见）

| 错误写法 | 正确写法 | 原因 |
|---------|---------|------|
| `all_passing: "true"` | `all_passing: true` | gate 检查布尔值 `true`，字符串 `"true"` 不通过 |
| `pr_created: "true"` | `pr_created: true` | 同上，必须是布尔值 |
| `ci_passed: "true"` | `ci_passed: true` | 同上 |
| `must_fix: "0"` | `must_fix: 0` | gate 检查数字 `0`，字符串 `"0"` 不通过 |
| `must_fix: "3"` | `must_fix: 0` | 即使修复后也必须改为数字 `0` |
| `verdict: true` | `verdict: pass` | `verdict` 是字符串，不是布尔值 |
| `verdict: pass  ` | `verdict: pass` | YAML 尾部空格可能导致解析问题 |
| 没有 `---` | 文件顶部有 `---\nverdict: pass\n---\n` | 没有 frontmatter 会导致 gate 报 "verdict missing" |

### 文件不存在

- phase 未完成或文件放在错误目录
- gate 检查脚本找不到文件时会报错

### JSON 无效

- test_cases_template.json 或 test_execution.json 有 trailing comma
- 缺少 `]` 或 `}`

### Case ID 不匹配

- test_execution.json 中的 `caseId` 不在 test_cases_template.json 的 `test_cases` 中
- gate 做 cross-reference 时会报 missing

### execute_steps 为空

- test_execution.json 中每个记录的 `execute_steps` 必须是 string 数组且至少有一个元素

---

## L2: Anti-Fabrication Check

检查完成后，评估交付物是否可信：

- **Phase 1**: spec 中描述的 feature 在项目中真实存在对应路由/模型？
- **Phase 2**: plan 中的 task 文件路径指向真实文件？"新建"的文件确实不存在？
- **Phase 3**: test_results 中的 pytest 输出可信？不是 AI 编造的？
- **Phase 4**: test_execution 中的命令步骤真实可运行？
- **Phase 5**: PR URL 在 GitHub 上真实存在？CI 结果真实？

凭判断力告知用户。

---

## Output Format

```
## Phase {N} Gate Check

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 1.1 | spec.md exists | ✅ | |
| 1.2 | verdict field | ✅ | "pass" |
| ... |

L2: ✅ deliverables appear genuine

**Phase {N}: PASS ✅**
```

```
## Phase {N} Gate Check

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 2.1 | plan.md exists | ❌ | file not found |

L2: ⚠️ cannot verify

**Phase {N}: FAIL ❌ — {N} errors**
```
