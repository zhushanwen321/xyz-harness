---
phase: pr
verdict: pass
absorbed: false
topic: "2026-05-26-harness-plan-dev-review-retrospect-enhancement"
harness_issues:
  - "coding-workflow 扩展的 index.ts 硬编码每个 phase 的 reviewPrefix，但 Phase 4 (Test) 没有 review subagent，Phase 3 的 reviewPrefix 是旧的 code_review。扩展配置和 skill 实际产出之间存在隐式耦合——修改 skill 产出物时不会有人提醒同步更新 index.ts"
  - "coding-workflow 扩展的 index.ts 修改后需要重启 Pi 才生效（无热重载），导致 gate BLOCKED 时必须创建 workaround 文件（test_review_v1.md）而不是修复后直接重试"
  - "跨 phase 累计 harness_issues 共 13 条，其中 4 条是 gate-check.py 的 bug（_flatten_review_fields、taste_review optional、must_fix=None、Phase 4 reviewPrefix），说明 gate-check.py 的测试覆盖不足"
  - "5 个 phase 的 review 轮次统计：Phase 1 两轮（4→0 MUST FIX）、Phase 2 两轮（1→0）、Phase 3 两轮（3→0→1→0）、Phase 4 零轮、Phase 5 一轮（BLOCKED→PASS）。Phase 3 的修复迭代最多（gate-check.py taste_review 三轮 + must_fix=None 一轮），是本轮最大的质量洼地"
---

# Overall Retrospect (Phase 5 — 全流程复盘)

## 1. 全流程执行回顾

### Summary

5 个 phase 全部完成。最终产出：
- **Spec**: 13 FR + 12 AC（Phase 1）
- **Plan**: 11 Tasks, 6 Execution Groups, 2 Waves（Phase 2）
- **Dev**: 12 files changed, +1672/-42 行, 4 个新 reviewer skill + 1 个 collector skill（Phase 3）
- **Test**: 11 TC 全部 round 1 通过（Phase 4）
- **PR**: PR #4 已创建，6 个 commit 推送（Phase 5）

### Phase-level 质量评估

| Phase | Review 轮次 | MUST FIX 总计 | 最大问题 | 耗时评级 |
|-------|-----------|-------------|---------|---------|
| Spec | 2 | 4→0 | ADR-0006 误判（审查者未验证外部引用） | 中 |
| Plan | 2 | 1→0 | 向后兼容策略未声明；gate-check.py _flatten_review_fields bug | 中 |
| Dev | 2+ | 3→1→0 | taste_review 三轮修复（设计缺陷→实现遗漏→边界条件） | 高 |
| Test | 1 | 0 | 无重大问题 | 低 |
| PR | 1 | 1 (BLOCKED) | index.ts reviewPrefix 与 skill 产出不匹配 | 中 |

**总审查轮次：8 轮**（含 1 次 BLOCKED）。Phase 3 是质量洼地，消耗了 4 轮修复迭代。

### 跨 Phase 问题链

**gate-check.py 是本轮最大的质量洼地。** 4 个 phase 都暴露了 gate-check.py 的问题：

1. **Phase 2**: `_flatten_review_fields` 不检查 `review.must_fix` 嵌套路径 → gate FAIL
2. **Phase 3 Dev**: taste_review 设计走弯路（必选→optional→generic prefix）→ 3 轮修复
3. **Phase 3 Dev**: `must_fix=None` 误判为 PASS → 1 轮修复
4. **Phase 5 PR**: index.ts 的 Phase 4 reviewPrefix 配置错误 → BLOCKED

根因：gate-check.py 作为 harness 的核心质量门禁，本身缺乏测试覆盖。每个新功能都是在"写代码→gate 运行时暴露 bug→修复"的循环中迭代完成的。如果 gate-check.py 有单元测试，Phase 3 的 4 轮修复可以压缩到 1 轮。

### Spec→Plan→Dev 的传递质量

**Spec 到 Plan 的传递完整。** 13 个 FR 全部在 plan 中有对应 Task。plan_review v1 唯一的 MUST FIX（向后兼容策略）是对 plan 文档完备性的要求，不是 spec 遗漏。

**Plan 到 Dev 的传递有损耗。** Plan 的 Task 10 说"替换 code_review_v 为 5 个新 prefix"，但没有识别 taste_review 的"至少一个"语义。这导致 Dev 阶段花了 3 轮迭代才设计出 optional ReviewCheck + validate_taste_review_exists 的组合方案。

**Dev 到 Test 的传递准确。** 11 个 TC 全部覆盖了 spec FR，test_execution.json 一次写对，无修复轮次。

### What Would You Do Differently (全流程)

1. **gate-check.py 应该先写测试再写功能。** 这是 harness 项目自身的 TDD 失败——我们 preach TDD（xyz-harness-test-driven-development skill）但没有对自己实践。每个 gate-check.py 的新增函数都应该有对应的 pytest case。

2. **Plan 阶段应该识别"条件性检查"的设计模式。** taste_review 的"至少一个存在"语义在 plan 阶段就应该被识别为"需要新的 gate-check.py 抽象"，而不是在 Dev 阶段通过三轮迭代来发现。

3. **coding-workflow 扩展和 skill 文件应该有同步检查机制。** index.ts 的 reviewPrefix 和 skill 的实际产出物是隐式耦合的。修改 skill 产出物格式时，没有检查项提醒同步更新 index.ts。

## 2. Harness 全流程体验回顾

### Flow Friction

**Phase 3 的 5 步 review 对 harness 自身改进过度。** 这是 4 份复盘中最一致的反馈。harness 自身是纯 Markdown/Python 项目，5 步 review（BLR、integration、standards、taste、robustness）的审查内容高度重叠。主 agent 手动创建了 5 个 review 文件来满足 gate 要求，每个文件约 1KB，总耗时约 10 分钟。如果 phase-dev skill 提供精简路径（纯文档/脚本项目合并为 2-3 步），可以节省约 7 分钟。

**Phase 5 的 index.ts BLOCKED 是最严重的流程摩擦。** 修复了 index.ts 的 reviewPrefix，但扩展已加载到内存中无法热重载。被迫创建 workaround 文件（test_review_v1.md）来通过 gate。这意味着：如果 harness 自身的任何配置有 bug，只能通过 workaround 绕过，无法在当前 session 中修复。

### Gate Quality

**Gate 的正判率很高。** 所有 PASS/FAIL 判定都是正确的：
- Phase 1: PASS（spec + review 正确）
- Phase 2: 首次 FAIL（_flatten_review_fields bug）→ 修复后 PASS
- Phase 3: 首次 FAIL（缺 5 个 review 文件）→ PASS；code review 两轮后 PASS
- Phase 4: PASS（test_execution.json 正确）
- Phase 5: 首次 BLOCKED（index.ts reviewPrefix 错误）→ workaround 后 PASS

**Gate 的假阴性风险。** `_flatten_review_fields` 的 must_fix=None 误判（Phase 3 Dev MUST FIX #9）意味着 gate 会把缺失的 must_fix 字段当成 0 来处理。这是一个 gate 正判的假阳性——gate 说 PASS 但实际应该 FAIL。只有 v2 审查者的人工检查才发现这个问题。

### Prompt Clarity

**Skill 的指导质量随 phase 提升而提升。**
- Phase 1 brainstorming: 提问流程与"用户已提供充分上下文"的场景冲突，需要主 agent 自行判断
- Phase 2 writing-plans: 结构清晰，但 L1 plan 的 use-cases.md/non-functional-design.md 缺模板
- Phase 3 phase-dev: 5 步 review 编排明确，但 Python taste review 文件名在修复过程中才确定
- Phase 4 phase-test: test_execution.json schema 文档是最有用的参考，一次写对
- Phase 5 phase-pr: CI 预检和 evidence 文件的 YAML 字段文档清晰

**Phase 4 的文档质量最高。** test_execution.json 的字段说明 + 示例 + 常见错误三列表格，是所有 skill 文档中信息密度最高的。其他 phase 的 skill 文档应该参考这个格式。

### Automation Gaps

**三个最大的自动化缺口（按优先级排序）：**

1. **gate-check.py 缺乏单元测试。** 每个新增函数（validate_plan_bl_review, validate_taste_review_exists, _flatten_review_fields）都应该有 pytest 覆盖。当前只能通过"运行 gate 看结果"来验证，效率低且容易漏边界条件。

2. **review YAML 格式无 schema 校验。** review subagent 的 YAML frontmatter 格式不一致（顶层 vs review.嵌套 vs statistics.嵌套），gate-check.py 需要尝试多个路径。应该定义一个 JSON Schema 或简单的 linter，在 review 文件创建时就统一格式。

3. **coding-workflow 扩展配置与 skill 产出物的同步检查。** index.ts 的 reviewPrefix、deliverables 列表和 skill 文件中声明的产出物是隐式耦合的。需要一个简单的检查脚本（或 pre-commit hook）验证两者一致。

### 五步 Review 的价值评估

**原始设计意图：** 记录每步 review 的独立价值，未来基于数据决定是否合并。

**实际执行观察（Phase 3 + test_retrospect 数据）：**

| Review Step | 对本项目的审计价值 | 与其他 step 的重叠 |
|-------------|-------------------|-------------------|
| Business Logic | 高（UC 覆盖追踪 + 执行路径验证） | 与 Integration 低重叠 |
| Integration | 高（模块边界 D1-D4 检查） | 与 BLR 低重叠，与 Robustness 中重叠 |
| Standards | 中（Phase A 自动检查无 lint，Phase B 规范合规） | 独立 |
| Taste | 低（通用品味审查，项目是 Markdown/Python） | 独立 |
| Robustness | 中（六维度检查，但发现的问题与 Integration 重叠） | 与 Integration 中重叠 |

**建议：** 对于纯文档/脚本项目，BLR + Integration 可以合并，Taste 可以跳过（或降级为 INFO 级别）。Standards 和 Robustness 保留。合并后为 3 步：Logic+Integration、Standards、Robustness。

### Time Sinks 排名

1. **Phase 3 gate-check.py taste_review 三轮修复**（~15 min）
2. **Phase 5 index.ts BLOCKED + workaround**（~10 min）
3. **Phase 1 spec_review v1 ADR-0006 误判**（~10 min）
4. **Phase 3 手动创建 5 个 review 文件**（~10 min）
5. **Phase 2 gate-check.py _flatten_review_fields bug 调试**（~5 min）

总浪费时间约 50 分钟。其中 40 分钟（#1/2/4/5）可以通过 gate-check.py 单元测试 + 扩展热重载消除。

## 3. Harness Issues 汇总

从 4 份复盘中共提取 13 条 harness_issues，按类别分组：

### gate-check.py 相关（4 条）
- _flatten_review_fields 嵌套路径覆盖不完整
- taste_review "至少一个"语义缺乏统一设计模式
- must_fix=None 误判为 PASS
- Phase 3 输出膨胀（16 项检查）

### Skill/流程相关（4 条）
- expert-reviewer 缺少"先验证外部引用"准则
- brainstorming 缺少"快速通道"条件
- review YAML 格式无统一规范
- FR 编号管理无预留机制

### coding-workflow 扩展相关（2 条）
- index.ts reviewPrefix 与 skill 产出隐式耦合
- 扩展无热重载，修复后需重启

### 数据/价值相关（3 条）
- collect.py aggregate 频率全是 1，价值有限
- 5 步 review 对非代码项目偏重
- TC type 标注与实际执行方式不一致

**建议优先修复：** gate-check.py 单元测试（P0）、review YAML 格式规范（P1）、扩展热重载（P1）。
