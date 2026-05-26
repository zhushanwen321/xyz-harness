---
phase: dev
verdict: pass
---

# Dev Phase Retrospect

## Phase Execution Review

### Summary

Phase 3 完成了 10 个文件的修改（2 个代码文件 + 8 个 Skill 文档），涉及 16 个 FR 中的 13 个实际修改 + 3 个验证确认无需修改。总变更量 +534/-22 行。

执行模式：Subagent 调度，Wave 1（BG1 + BG3 + BG4 并行，3 个 subagent）→ 验证 → Wave 2（BG2，1 个 subagent）→ Code review v1 → MUST FIX 修复 → Code review v2。

关键数据：
- **Subagent 执行准确率**：4/4 subagent 首次产出满足验收标准
- **Code review 拦截率**：v1 发现 1 条 MUST FIX（Plan Skill 缺少 Spec Metrics Traceability 章节），v2 确认修复
- **Gate 回归测试**：Phase 1/2 gate 在修改后各跑一次，确认无回归

### Problems Encountered

1. **Expert-reviewer subagent 插入多余 `---`**：BG4 subagent 在 SKILL.md 追加内容时插入了 `---` 分隔符，与其他 Skill 文件的追加风格不一致。虽然不影响 YAML frontmatter 解析（frontmatter 只在文件开头），但违反了"只追加不修改已有内容"的约束。主 agent 手动移除。

2. **Code review v1 发现 1 条 MUST FIX**：Plan Skill 缺少 `## Spec Metrics Traceability` 强制章节。根因是 plan 将 FR-5（"Plan Skill 增加 Scope 覆盖声明"）解读为 Self-Check Checklist 中的检查项，而非独立强制章节。plan.md 实例文件已有该章节，但 Skill 模板缺失 → 未来使用者不知道需要包含。修复方法：在 `## Plan Document Header` 之前插入完整的 `## Spec Metrics Traceability (强制章节)` 含模板表格和三态定义。

3. **BG1 subagent 删除了更多代码**：除了删除 `ReviewCheck.nested` 字段和 `if rc.nested` 分支，还删除了 `else` 分支中的 `check_field_str`/`check_field_int` 调用。这是正确的——统一用 `_flatten_review_fields()` 后旧函数不再需要，但删除范围比 plan 描述的更大。

4. **index.ts 编译错误全部是预存的**：新增 35 行代码没有引入任何新的 TS 编译错误，但 `npm run lint` 报了 99 个 error（全部预存）。这使得"是否有新引入的 lint 问题"难以快速判断——需要手动 diff。

### What Would You Do Differently

- **BG3 的 Plan Skill 修改应该一次性覆盖所有模板要求**，不仅仅是 Self-Check Checklist。遗漏 Spec Metrics Traceability 的根因是 task prompt 中只列出了"追加 Self-Check Checklist"，没有对照 plan.md 实例检查是否还有其他必要章节
- **Code review 应该在 Wave 1+Wave 2 全部完成后统一执行**，而不是在 Wave 2 之后。实际上就是这么做的，但如果 Wave 2 有问题需要返工，统一 review 可以减少总 review 轮次
- **Lint 检查应该只检查新增代码**：`npx eslint extensions/coding-workflow/index.ts` 报了 8 个 error，但全部是预存的。如果能在 review 时只过滤新增行的 lint 问题，效率更高

### Key Risks

- **实际风险低于预期**：plan 标注 BG2 为"中风险"，但实际新增代码只有 35 行（review 前置检查），逻辑清晰，无编译错误
- **最大风险是遗漏而非错误**：MUST FIX 1 条，类型是"应该想到但没做"（omission），不是"做错了"（error）。这与跨项目复盘的核心发现一致：AI 的主要弱点是遗漏
- **Pre-commit hook 提供了有效防护**：8 个 SKILL.md 的 YAML frontmatter 全部通过验证，无 false positive

## Harness Usability Review

### Flow Friction

- **Subagent 调度模式的 Wave 并行设计是最大亮点**：BG1（gate-check.py）、BG3（5 个 Phase Skill）、BG4（3 个 Reference Skill）同时执行，3 个 subagent 并行完成后统一验证。这比串行执行节省了约 60% 的时间
- **BG2 依赖 BG1 的设计正确**：index.ts 的 review 前置检查不依赖 gate-check.py 的 frontmatter 扁平化结果，但 plan 中标记了依赖关系作为安全保障。实际执行中 BG2 的代码完全独立于 BG1 的修改
- **两次 code review（v1 + v2）是合理的开销**：v1 发现 MUST FIX → 修复 → v2 增量审查确认。增量审查模式（只检查 MUST FIX 修复和回归）比全量审查效率高

### Gate Quality

- **Gate check 回归验证有效**：BG1 修改 gate-check.py 后，立即用 Phase 1 和 Phase 2 的 gate 验证无回归。这种"修改验证工具后立即自检"的模式值得保留
- **Phase 3 gate 的 code_review 检查正确**：`_flatten_review_fields()` 统一处理了 review v2 的 frontmatter（顶层 verdict/must_fix），确认扁平化修改生效

### Prompt Clarity

- **BG1 的 task prompt 包含完整 Python 代码片段**：subagent 执行准确度最高——直接复制代码片段替换。这验证了"在 task prompt 中提供具体代码"比"描述修改逻辑让 subagent 自己实现"更可靠
- **BG3/BG4 的 task prompt 包含完整 markdown 内容**：5+3=8 个 Skill 文件的追加内容全部在 task prompt 中提供，subagent 只需追加到文件末尾。这避免了 subagent 自行编写内容导致的风格不一致
- **BG2 的 task prompt 只有逻辑描述没有代码片段**：subagent 仍然正确实现了功能，但这是因为修改逻辑足够简单（一个 for 循环 + 一个 if 判断）。对更复杂的修改，纯描述可能不够

### Automation Gaps

- **Lint 只检查新增代码**：目前无法快速判断 99 个 lint error 中哪些是本次引入的。需要 `git diff HEAD | eslint --stdin` 或类似机制
- **SKILL.md 追加验证**：如果有工具能自动检查"追加的内容是否包含 `---`"，可以避免手动修复
- **Subagent 产出验证**：主 agent 需要手动 `grep` 验证 subagent 的修改是否正确。如果有 diff-aware 的验证脚本会更高效

### Time Sinks

- **读取 index.ts 完整文件（~950 行）**：这是第二次完整读取（Phase 2 读过一次）。如果能在 plan 中标注"只读第 290-360 行"，可以节省 context
- **Code review v1 → 修复 → v2 的三步流程**：消耗了 2 个 subagent 调度 + 主 agent 的修复时间。如果 BG3 的 task prompt 更完整（覆盖所有模板要求），可以一次通过
- **Expert-reviewer `---` 的手动修复**：小问题但消耗了一轮 edit
