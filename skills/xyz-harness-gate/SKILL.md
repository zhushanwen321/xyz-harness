---
name: xyz-harness-gate
description: Gate check skill for xyz-harness. Validates deliverables per phase — file existence, YAML frontmatter correctness, verdict/required fields. Used standalone in a separate Pi session. Trigger: "run gate check", "verify deliverables", "check gate", "validate phase X".
---

# Gate Check

## Usage

Run this skill in a SEPARATE Pi session (new conversation) for unbiased validation.

### AI — 入口流程

用户说"检查 gate"时，你先确定以下信息：

**1. 找 topic 目录**

从当前项目目录查找 `.xyz-harness/`：
```bash
ls .xyz-harness/
```
列出所有 topic（格式 `YYYY-MM-DD-*` 的目录）。如果只有一个，用它。如果有多个，问用户用哪个。

如果不存在 `.xyz-harness/`，问用户在哪个项目目录工作。

**2. 确定 phase**

问用户要检查哪个 phase（1-5）。或者先检测当前存在哪些交付物推断 phase：
- 只有 `spec.md` → Phase 1
- 有 `plan.md` → Phase 2
- 有 `changes/evidence/test_results.md` → Phase 3
- 有 `test_execution.json` → Phase 4
- 有 `pr_evidence.md` → Phase 5

**3. 开始检查**

确定 topic 和 phase 后，对照下面的清单逐项验证。每个检查必须精确到字段值。

---

## Phase 1 — Spec

| # | 检查项 | 检查方法 |
|---|--------|---------|
| 1.1 | `{topic}/spec.md` 存在 | `read {topic}/spec.md` 前 5 行 |
| 1.2 | spec.md 的 YAML frontmatter 中有 `verdict` 字段 | 用 Python 解析 frontmatter，检查 `data.get("verdict")` 不为空 |
| 1.3 | `{topic}/changes/reviews/spec_review_v*.md` 存在 | 用 `ls {topic}/changes/reviews/spec_review_v*.md` 找最新文件 |
| 1.4 | 最新 review 的 `must_fix` 等于 0 | 解析 review 的 YAML frontmatter，检查 `data.get("must_fix") == 0` |
| 1.5 | 最新 review 的 `verdict` 等于 "pass" | 解析 frontmatter，检查 `data.get("verdict") == "pass"` |

**验证命令示例：**
```bash
python3 -c "
import yaml, sys
with open('{topic}/spec.md') as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    verdict = data.get('verdict')
    print(f'verdict field present: {verdict is not None}')
    if verdict:
        print(f'verdict value: {repr(verdict)}')
else:
    print('No valid YAML frontmatter')
"
```

```bash
python3 -c "
import yaml, sys, glob
files = sorted(glob.glob('{topic}/changes/reviews/spec_review_v*.md'))
if not files:
    print('No review file found')
    sys.exit(1)
latest = files[-1]
with open(latest) as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    print(f'verdict={data.get(\"verdict\")} must_fix={data.get(\"must_fix\")}')
    ok = data.get('verdict') == 'pass' and data.get('must_fix') == 0
    print(f'PASS: {ok}')
"
```

---

## Phase 2 — Plan

| # | 检查项 | 检查方法 |
|---|--------|---------|
| 2.1 | `{topic}/plan.md` 存在 | `read {topic}/plan.md` |
| 2.2 | plan.md 的 `verdict` == "pass" | 解析 frontmatter，检查 `verdict == "pass"` |
| 2.3 | `{topic}/e2e-test-plan.md` 存在 | `read {topic}/e2e-test-plan.md` |
| 2.4 | e2e-test-plan.md 的 `verdict` == "pass" | 解析 frontmatter |
| 2.5 | `{topic}/test_cases_template.json` 存在且是有效 JSON | `python3 -c "import json; json.load(open('{topic}/test_cases_template.json'))"` |
| 2.6 | test_cases_template.json 有 `test_cases` 数组，每个元素有 `id`、`type`、`title` 字段 | 解析 JSON，检查 `all("id" in c and "type" in c and "title" in c for c in data["test_cases"])` |
| 2.7 | `{topic}/changes/reviews/plan_review_v*.md` 存在 | 用 `ls` 找最新文件 |
| 2.8 | 最新 plan_review 的 `verdict` == "pass" 且 `must_fix` == 0 | 解析 YAML frontmatter |

**验证命令示例：**
```bash
python3 -c "
import yaml
with open('{topic}/plan.md') as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    assert data.get('verdict') == 'pass', f'verdict is {data.get(\"verdict\")}'
    print('plan.md: OK')
else:
    print('plan.md: no frontmatter')
"
```

```bash
python3 -c "
import json
with open('{topic}/test_cases_template.json') as f:
    data = json.load(f)
cases = data.get('test_cases', [])
for c in cases:
    assert 'id' in c, f'missing id in {c}'
    assert 'type' in c, f'missing type in {c}'
    assert 'title' in c, f'missing title in {c}'
print(f'OK: {len(cases)} test cases, all have id/type/title')
"
```

---

## Phase 3 — Dev

| # | 检查项 | 检查方法 |
|---|--------|---------|
| 3.1 | `{topic}/changes/evidence/test_results.md` 存在 | `read` 确认 |
| 3.2 | test_results.md 的 `verdict` == "pass" | 解析 YAML frontmatter |
| 3.3 | test_results.md 的 `all_passing` == true（布尔值，不是字符串） | 解析 frontmatter，检查 `data.get("all_passing") is True` |
| 3.4 | `{topic}/changes/reviews/code_review_v*.md` 存在 | 用 `ls` 找最新文件 |
| 3.5 | 最新 code_review 的 `verdict` == "pass" 且 `must_fix` == 0 | 解析 YAML frontmatter |

**验证命令示例：**
```bash
python3 -c "
import yaml
with open('{topic}/changes/evidence/test_results.md') as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    verdict = data.get('verdict')
    all_pass = data.get('all_passing')
    print(f'verdict={repr(verdict)} all_passing={repr(all_pass)}')
    assert verdict == 'pass', f'verdict is {verdict}'
    assert all_pass is True, f'all_passing is {all_pass} (must be boolean true)'
    print('PASS')
else:
    print('No frontmatter')
"
```

---

## Phase 4 — Test

| # | 检查项 | 检查方法 |
|---|--------|---------|
| 4.1 | `{topic}/test_cases_template.json` 存在 | 用于提取 case ID 列表 |
| 4.2 | `{topic}/changes/evidence/test_execution.json` 存在 | `read` 确认 |
| 4.3 | test_execution.json 中记录的所有 case ID 必须覆盖 template 中的所有 ID | 对比两个 JSON 的 case ID 集合 |
| 4.4 | 在最终执行轮次（round）中，所有 case 的 `passed` == true | 按 round 分组，最后一轮全部通过 |
| 4.5 | 每个 case 的 `execute_steps` 非空 | 检查 `len(case.get("execute_steps", [])) > 0` |

**验证命令示例：**
```bash
python3 -c "
import json

with open('{topic}/test_cases_template.json') as f:
    template = json.load(f)
template_ids = set(c['id'] for c in template['test_cases'])
print(f'Template case IDs: {len(template_ids)} total')

with open('{topic}/changes/evidence/test_execution.json') as f:
    execution = json.load(f)

# 提取所有已执行的 case ID
executed_ids = set()
cases = execution.get('test_cases', execution.get('execution', []))
for c in cases:
    if isinstance(c, dict) and 'caseId' in c:
        executed_ids.add(c['caseId'])

# 检查覆盖
missing = template_ids - executed_ids
print(f'Executed: {len(executed_ids)}, Missing: {len(missing)}')
assert not missing, f'Missing case IDs: {missing}'

# 检查最后一轮全部通过
rounds = {}
for c in cases:
    r = c.get('round', 1)
    rounds.setdefault(r, []).append(c)
last_round = max(rounds.keys())
for c in rounds[last_round]:
    assert c.get('passed') is True, f'{c.get(\"caseId\")} not passed in round {last_round}'
    steps = c.get('execute_steps', [])
    assert len(steps) > 0, f'{c.get(\"caseId\")} has no execute_steps'

print(f'PASS: all {len(template_ids)} cases executed, round {last_round} all passed')
"
```

---

## Phase 5 — PR

| # | 检查项 | 检查方法 |
|---|--------|---------|
| 5.1 | `{topic}/changes/evidence/pr_evidence.md` 存在 | `read` 确认 |
| 5.2 | pr_evidence.md 的 `pr_created` == true（布尔值） | 解析 YAML frontmatter |
| 5.3 | `{topic}/changes/evidence/ci_results.md` 存在 | `read` 确认 |
| 5.4 | ci_results.md 的 `ci_passed` == true（布尔值） | 解析 YAML frontmatter |

**验证命令示例：**
```bash
python3 -c "
import yaml
with open('{topic}/changes/evidence/pr_evidence.md') as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    assert data.get('pr_created') is True, f'pr_created={data.get(\"pr_created\")}'
    print('pr_evidence.md: OK')
"
```

---

## How to Parse YAML Frontmatter

所有 markdown 交付物使用标准 YAML frontmatter（`---` 分隔）：

```
---
verdict: pass
must_fix: 0
all_passing: true
---
```

用 Python 解析：
```bash
python3 -c "
import yaml
with open('{path}') as f:
    content = f.read()
parts = content.split('---')
if len(parts) >= 3:
    data = yaml.safe_load(parts[1])
    for k, v in data.items():
        print(f'{k}={repr(v)} (type={type(v).__name__})')
else:
    print('ERROR: no valid YAML frontmatter')
"
```

关键：YAML 中的 `true` 解析为 Python `True`（布尔类型），`false` 为 `False`，数字为 int。

## How to Check JSON

```bash
python3 -c "
import json, sys
with open('{path}') as f:
    data = json.load(f)
print(json.dumps(data, indent=2)[:1000])
"
```

## L2: Anti-Fabrication Check

在每 phase 检查完成后，额外做一步真实性验证：

- **Phase 1**: spec.md 中描述的 feature 确实存在（项目中有对应的路由/模型/组件）？还是 AI 虚构的？
- **Phase 2**: plan.md 中的 task 文件路径是否指向项目中真实存在的文件？create 类 task 不应该有同名文件（如果已有，说明不是新建）？
- **Phase 3**: test_results.md 中描述的结果是否可信？AI 可能编造 pytest 输出。
- **Phase 4**: test_execution.json 中的命令步骤是否真实可运行？
- **Phase 5**: PR URL 是否真实存在于 GitHub？CI 结果是否真实？

AI 凭判断力告知用户哪些内容看起来不可信。

## Output Format

On PASS:
```
## Phase {N} Gate Check

| # | Check | Result |
|---|-------|--------|
| 1.1 | spec.md exists | ✅ |
| 1.2 | verdict field present | ✅ |
| 1.3 | spec_review exists | ✅ |
| 1.4 | must_fix == 0 | ✅ |
| 1.5 | verdict == "pass" | ✅ |

L2: ✅ deliverables appear genuine

**Phase {N}: PASS ✅**
```

On FAIL:
```
## Phase {N} Gate Check

| # | Check | Result | Detail |
|---|-------|--------|--------|
| 2.1 | plan.md exists | ✅ | |
| 2.2 | verdict == "pass" | ✅ | |
| 2.3 | e2e-test-plan.md exists | ❌ | file not found at {path} |
| 2.4 | verdict == "pass" | ⏭️ | skipped (file missing) |
| 2.5 | test_cases_template.json valid | ⏭️ | skipped |
| 2.6 | case has id/type/title | ⏭️ | skipped |
| 2.7 | plan_review exists | ❌ | no plan_review file found |
| 2.8 | verdict == "pass" must_fix == 0 | ⏭️ | skipped |

L2: ⚠️ cannot verify — missing files may indicate incomplete phase

**Phase {N}: FAIL ❌ — 2 errors**

Fix before advancing to next phase.
```
