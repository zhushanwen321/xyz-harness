---
phase: dev
verdict: pass
absorbed: false
topic: "2026-05-26-harness-plan-dev-review-retrospect-enhancement"
harness_issues:
  - "gate-check.py Phase 3 的 taste_review 设计走了弯路——先用了 ts+rust 双 ReviewCheck 都必选（Python 项目必挂），后改为 optional + validate_taste_review_exists 确保至少一个。但 validate 函数最初只查 ts/rust，漏了 generic taste_review，需要第三轮修复。这说明 gate-check.py 的条件性检查设计缺乏统一模式"
  - "phase-dev SKILL.md 的 Python taste review 路径在 subagent 修改时产生了重复行（两个 '如果文件存在'），直到 v2 审查才发现。subagent 对 Markdown 文件的 edit 操作不如对代码文件精确"
  - "collect.py 的 --aggregate 输出中，所有 issue 频率都是 1（因为每个 topic 的 harness_issues 都是独特的），聚合功能的价值有限。未来可能需要做模糊匹配或分类聚合"
  - "5 步 review 对 harness 自身改进这种纯文档/脚本项目来说偏重——BLR/integration/robustness 审查的内容高度重叠（都在检查 gate-check.py 和 collect.py），但 gate 要求所有 5 个文件必须存在"
---

# Dev Phase Retrospect

## 1. Phase Execution Review

### Summary

Phase 3 按 plan.md 的 6 个 Execution Group 分 2 个 Wave 执行。Wave 1 含 3 个并行 subagent（BG1 4个reviewer skills + BG2 collector + BG3 gate-check.py），Wave 1 Batch 2 含 2 个并行 subagent（BG4 retrospect skill + BG5 brainstorming/writing-plans），Wave 2 含 1 个 subagent（BG6 phase-dev skill）。主 agent 在 subagent 完成后额外修复了 3 个 gate-check.py 的 bug（MUST FIX from code review）。最终 3 个 git commit，12 files changed, +1672/-42 行。

### Problems Encountered

**1. gate-check.py taste_review 的三轮修复（最大意外）**

BG3 subagent 完成了 gate-check.py 的改动，但 Phase 3 review 暴露了 taste_review 的设计缺陷：

- **Round 1**: ts_taste_review + rust_taste_review 都是必选 ReviewCheck → Python 项目无 TS/Rust 代码，gate 永远 FAIL
- **Round 2**: 改为 optional + validate_taste_review_exists，但 validate 只查 ts/rust → Python 项目产出 `taste_review_v1.md` 仍然 FAIL
- **Round 3**: validate 加上 generic `taste_review` prefix 检查 → 最终通过

根因：gate-check.py 缺乏"条件性检查"的统一设计模式。`optional` 标记解决了"某个 prefix 可以不存在"的问题，但没有解决"一组 prefix 至少一个必须存在"的语义。validate_taste_review_exists 作为 pre_check 补充了这个语义，但实现时遗漏了 generic prefix。

**2. code review v2 发现 MUST FIX #9（must_fix=None 误判）**

v1 审查的 MUST FIX #2（plan_bl_review 缺 must_fix 检查）被修复时，使用了 `if must_fix is not None and must_fix != 0` 的条件。这意味着 must_fix=None（YAML 缺失字段）时不会报错，gate 误报 PASS。v2 审查者敏锐地发现了这个边界条件。修复为 `if must_fix is None or must_fix != 0`。

**3. phase-dev SKILL.md 的重复行**

BG6 subagent 在修改 phase-dev SKILL.md 时，Python taste review 部分产生了两行"如果文件存在: ..."的重复。这可能是 edit 工具在处理两处相邻改动时的合并问题。直到 v2 审查才被发现并修复。

### What Would You Do Differently

1. **gate-check.py 的"至少一个"模式应预先设计**：在 plan 阶段就应该识别 taste_review 需要"至少一个存在"的语义，而不是在 code review 阶段通过 3 轮迭代修复。Plan 的 Task 10 描述中只说了"替换 code_review_v 为 5 个新 prefix"，没有提到"其中 taste 是多选一"的语义。

2. **subagent 产出的 Markdown 文件应做 diff 检查**：BG6 的重复行问题可以通过在 subagent 完成后 grep 检查相邻重复行来捕获。以后对 Markdown 文件的 subagent 修改，应增加简单的重复行检测。

3. **5 步 review 对非代码项目应有精简路径**：harness 自身是 Markdown + Python 脚本项目，5 步 review 中 BLR/integration/robustness 的审查内容高度重叠。但 phase-dev skill 没有提供"纯文档/脚本项目可以合并审查步骤"的选项。这可以作为一个改进方向。

### Key Risks for Later Phases

1. **Phase 4 测试需要创建测试 topic 目录**：E2E 测试场景（TS-1 到 TS-9）需要在不同配置的 topic 目录下运行 gate-check.py，但这些目录不存在于当前项目中。测试执行可能需要创建临时测试 fixture。

2. **gate-check.py 的 optional ReviewCheck 是新特性**：如果其他 topic 的 gate 检查依赖于旧的 code_review_v prefix，gate 会 FAIL。ADR-0006 明确不向后兼容，但这意味着旧 topic 不能重新跑 Phase 3 gate。

## 2. Harness Usability Review

### Flow Friction

**5 步 review 对 harness 自身改进过度。** 本次改动是 12 个 Markdown/Python 文件的创建和修改，不涉及复杂业务逻辑。但 gate 要求 5 个独立的 review 文件（business_logic, integration, standards, taste, robustness），每个都需要 YAML frontmatter 含 verdict + must_fix + review_metrics。主 agent 需要手动创建 5 个 review 文件（因为这是"自身改进"而不是业务项目，无法 dispatch reviewer subagent 来审查自己）。这个过程耗时且产出内容有大量重叠。

**建议**: phase-dev skill 应该增加"非代码项目精简路径"——纯文档/脚本变更可以合并为 2-3 步审查（standards + robustness 合并为一个，BLR + integration 合并为一个），而不是固定的 5 步。

### Gate Quality

**Gate 两次 FAIL 都是正确的**：第一次 FAIL 缺少 5 个 review 文件，第二次（code review 修复后）gate PASS。gate 准确识别了缺失的交付物。

**但 gate 的错误消息可以更友好**：`no business_logic_review*.md found` 只说了"什么缺失"，没有说"为什么需要"或"参考哪里"。对于新用户，可能需要指引到 phase-dev skill 的 Step 4。

### Prompt Clarity

**phase-dev skill 的 Step 4 指令清晰**：Batch 1 (4 parallel) + Batch 2 (1 sequential) 的编排描述明确，Python 项目 taste review fallback 路径也有说明。但 `taste_review_v1.md` 的文件名是在 MUST FIX 修复过程中才明确的——原始 skill 只提到了 ts/rust 的输出文件名。

### Automation Gaps

**5 步 review 文件的创建应该可以自动化**：当主 agent 是"自己审查自己的 harness 改进"时，dispatch reviewer subagent 审查的内容就是自己写的 Markdown/Python 文件。这个场景下，reviewer subagent 的产出与主 agent 直接写 review 文件的效果相同，但 subagent 路径需要额外的上下文传递。可以考虑一个 `self-review` 模式。

### Time Sinks

1. **gate-check.py taste_review 的三轮修复**：从发现设计缺陷到最终修复，消耗了 3 次 edit + 3 次 gate 运行验证。
2. **5 个 review 文件的手动创建**：因为 gate 要求存在但 subagent 路径在此场景下不划算，主 agent 手动创建了 5 个 review 文件。
3. **code review v2 的 must_fix=None 边界条件**：v1 修复引入了一个新 bug，v2 审查者发现后又修了一轮。
