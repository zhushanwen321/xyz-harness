---
verdict: pass
---

# E2E Test Plan - Harness Plan/Dev/Review/Retrospect Enhancement

## Test Scenarios

### TS-1: Phase 2 Gate 通过(L1 plan)

**覆盖 AC:** AC-1, AC-2, AC-11

1. 准备 L1 plan topic 目录,包含 spec.md、plan.md(complexity: L1)、use-cases.md、non-functional-design.md、e2e-test-plan.md、test_cases_template.json、plan_review_v1.md
2. 运行 `gate-check.py <topic_dir> 2`
3. 验证:所有检查 PASS,不检查 plan_bl_review

### TS-2: Phase 2 Gate L2 额外检查

**覆盖 AC:** AC-3, AC-11

1. 准备 L2 plan topic 目录(complexity: L2),增加 plan_bl_review_v1.md
2. 运行 `gate-check.py <topic_dir> 2`
3. 验证:plan_bl_review 检查存在且通过

### TS-3: Phase 3 Gate 五步审查

**覆盖 AC:** AC-4, AC-5, AC-6, AC-10, AC-11

1. 准备 Phase 3 topic 目录,包含 5 个 review 文件(business_logic/integration/standards/taste/robustness)
2. 运行 `gate-check.py <topic_dir> 3`
3. 验证:5 个 review 全部检查,不检查 code_review_v

### TS-4: Collect.py 默认扫描

**覆盖 AC:** AC-7, AC-8

1. 在测试目录下创建多个 retrospect 文件(含/不含 absorbed 字段)
2. 运行 `collect.py --root <test_dir>`
3. 验证:输出未吸收的文件列表,旧版文件视为未吸收

### TS-5: Collect.py 吸收操作

**覆盖 AC:** AC-8

1. 选择一个未吸收的 retrospect 文件
2. 运行 `collect.py --absorb <file> --summary "test absorption"`
3. 验证:YAML frontmatter 更新为 absorbed: true, absorbed_date: today, absorption_summary: "test absorption"
4. 再次扫描,该文件不再出现在未吸收列表中

### TS-6: Collect.py 聚合

**覆盖 AC:** AC-8

1. 创建多个未吸收的 retrospect 文件,含重复的 harness_issues
2. 运行 `collect.py --aggregate --root <test_dir>`
3. 验证:输出去重后按频率排序的 issue 列表

### TS-7: Brainstorming Skill 业务用例

**覆盖 AC:** AC-9

1. 加载更新后的 brainstorming skill
2. 按 skill 指令执行 Phase 1
3. 验证:spec.md 模板包含"业务用例"章节,六要素检查包含 Business use cases 行

### TS-8: Standards Reviewer 无 lint 项目

**覆盖 AC:** AC-5

1. 对无 lint 配置的项目（如本项目 harness-engineering）dispatch standards_review subagent
2. 验证：review 产出不包含 linter_passed 字段，报告中标注“项目未配置 lint”

### TS-9: Standards Reviewer 有 lint+typecheck 项目

**覆盖 AC:** AC-5

1. 对有 ESLint + TypeScript 的项目 dispatch standards_review subagent
2. 验证：review 产出包含 linter_passed: true 和 typecheck_passed: true
3. 如果 lint 失败：验证 linter_passed: false, must_fix>0

## Test Environment

- **运行环境:** 本地 macOS / Linux,Python 3 + PyYAML
- **测试数据:** 在 `.xyz-harness/` 下创建临时测试 topic 目录
- **依赖:** gate-check.py、collect.py、各 reviewer skill 文件
