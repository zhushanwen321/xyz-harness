---
verdict: pass
---

# E2E Test Plan — Harness V5 跨项目复盘优化

## Test Scenarios

### TS-1: Frontmatter 兼容性验证（AC-1）

**前置条件：** 准备两个 mock topic 目录，一个含嵌套 YAML review 文件（`review.verdict`），一个含扁平 YAML review 文件（顶层 `verdict`）。

**步骤：**
1. 对嵌套 YAML review 目录执行 `python3 gate-check.py <topic_dir> 1 --json`
2. 对扁平 YAML review 目录执行 `python3 gate-check.py <topic_dir> 1 --json`
3. 验证两者均返回 `"passed": true`

### TS-2: 评审不可跳过验证（AC-2）

**前置条件：** 准备一个 Phase 5 的 mock topic 目录，缺少 Phase 3 的 code_review 文件。

**步骤：**
1. 删除 `changes/reviews/code_review_v1.md`
2. 执行 gate-check.py Phase 5 或验证 index.ts 的前置检查逻辑
3. 验证返回 FAIL 且错误信息包含 "code_review"
4. 恢复 code_review 文件，验证 Phase 5 gate PASS

### TS-3: 自检清单存在性验证（AC-3）

**步骤：**
1. `grep -l "Self-Check Checklist" skills/xyz-harness-*/SKILL.md`
2. 验证返回 5 个文件（brainstorming, writing-plans, phase-dev, phase-test, phase-pr）
3. 对每个文件验证 checklist 包含至少 3 条检查项

### TS-4: Gate 深度统一验证（AC-4）

**前置条件：** 准备一个 Phase 2 mock topic 目录，plan.md 缺少 verdict 字段。

**步骤：**
1. 构造 plan.md 只有 `---\n---` 的空 frontmatter
2. 执行 `python3 gate-check.py <topic_dir> 2 --json`
3. 验证返回 FAIL 且错误信息包含 "verdict"

### TS-5: 验证方式标注（AC-7）

**前置条件：** 准备含 `verification_method` 字段的 test_execution.json。

**步骤：**
1. 构造 test_execution.json，部分 case 标注 `automated`，部分 `code_review`，部分无标注
2. 执行 `python3 gate-check.py <topic_dir> 4 --json`
3. 验证输出包含 verification methods 统计信息
4. 验证不会因缺少 `verification_method` 而 FAIL

### TS-6: 跨 topic 隔离验证（AC-8）

**前置条件：** 在 `.xyz-harness/` 下放两个 topic 目录。

**步骤：**
1. 在 topic-a 的 spec.md 中设置 verdict: fail
2. 对 topic-b 执行 gate-check.py Phase 1
3. 验证 topic-a 的 fail 状态不影响 topic-b 的检查结果

### TS-7: LOW 收紧 + 增量审查（AC-10, AC-11）

**步骤：**
1. grep expert-reviewer SKILL.md 确认包含 "LOW 分级收紧规则" 和 "增量审查模式"
2. 验证 LOW 收紧规则包含反例（"需求是消除 X，评审发现 X 仍存在 → MUST_FIX"）
3. 验证增量审查模式描述了 `_v{N-1}.md` 读取逻辑

### TS-8: Skill 规则完整性（AC-5, AC-6, AC-12, AC-13）

**步骤：**
1. grep Plan Skill 确认包含 "Spec Metrics Traceability" 和 "禁止实现代码"
2. grep Test Skill 确认包含 "planTaskId" 和 "ac_ref"
3. grep Dev Skill 确认包含 "验收标准" 或 "量化验收标准"
4. grep Spec Skill 确认包含 "数据模型预检" 或 "grep 真实代码"
5. grep TDD Skill 确认包含上下文传递规则

## Test Environment

- **Python 环境：** Python 3 + PyYAML（gate-check.py）
- **TypeScript 环境：** Node.js + TypeScript（index.ts 编译检查）
- **验证工具：** grep、python3 gate-check.py --json、npx tsc --noEmit
- **Mock 数据：** 在 `.xyz-harness/test-mock/` 下构造测试用 topic 目录
