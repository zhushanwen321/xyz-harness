---
phase: dev
verdict: pass
---

# Dev Phase Retrospect — plan-interface-contract

## 1. Phase Execution Review

### Summary

Phase 3 修改了 5 个文件（4 个 skill 文档 + 1 个 Python 脚本），共 206 行新增。使用复杂路径（5 个 Task + 2 个 Execution Groups），Wave 1 并行 dispatch BG1 和 BG2 两个 subagent。

关键执行情况：
- BG1（4 个 skill 文档修改）：1 个 subagent 串行修改 4 个文件，4 轮完成
- BG2（gate-check.py）：1 个 subagent 修改 Python 代码，6 轮完成
- Code review 发现 1 条 MUST_FIX（`in` 操作符对非 dict 的子串匹配），修复后第 2 轮通过
- Gate review（GL2）发现 1 条 MUST_FIX（test_results.md 使用模板变量 `{topic}`），修复后通过

### Problems Encountered

1. **check_gate.py 的 `in` 操作符安全漏洞**：code review subagent 准确发现 `for field in required_method_fields: if field not in m` 对非 dict 元素做子串匹配而非字典键查找。如果 methods 数组中放入字符串 `"name_class_params_returns"`，所有 4 个字段检查都会通过。这与项目"AI 是不可信执行者"的设计哲学直接冲突。修复方式：添加 `isinstance(m, dict)` / `isinstance(df, dict)` 守卫。这个发现验证了独立 code review 的价值——subagent 能在编码者看不到的角度发现安全问题。

2. **test_results.md 使用模板变量被 gate review 抓出**：gate review subagent 发现 `{topic}` 未被替换为实际路径，判定为"AI 模板式伪造"。实际原因是我在写 test_results.md 时为了简洁用了缩写，但 gate review 的判定标准是"命令中不应出现未替换的模板变量"，这个标准是正确的。修复后用实际命令输出替换了模板。这验证了 GL2（gate review）的防伪造机制有效。

3. **BG2 subagent 用了 6 轮（比 BG1 的 4 轮多）**：gate-check.py 是 Python 代码，需要精确理解现有代码结构（parse_yaml_frontmatter、check_field_str 等工具函数）再插入新函数。skill 文档修改相对简单，只需要在正确位置插入 markdown 文本。

### What Would You Do Differently

- **test_results.md 应该直接粘贴实际命令输出，不要用模板简化**：gate review 对测试证据的真实性要求极高，任何模板化的写法都会被视为伪造风险。实际命令输出即使冗长，也比简洁但不可信的摘要好。
- **可以在 BG2 subagent task prompt 中更精确地指定插入位置**：当前只说了"在 2.1 之后、2.2 之前"，subagent 花了额外轮次理解代码结构。如果直接给出"在 `plan_data = data` 这行之后插入"，可以减少探索轮次。

### Key Risks for Later Phases

- **Phase 4 (test) 的 test_cases_template.json 中有 6 个 manual 类型用例**：这些用例无法自动化执行，需要人工验证或转为 code_review 类型。Phase 4 执行时需要决定如何处理。
- **skill 文档修改的正确性尚未经过真实 plan 阶段验证**：writing-plans SKILL.md 中的 Interface Contracts 章节模板是否足够清晰，需要等下一次真实使用 plan 阶段时才能验证。

## 2. Harness Usability Review

### Flow Friction

- **复杂路径的 subagent dispatch 流畅**：两个 subagent 并行启动，BG1 先完成，BG2 后完成，没有阻塞。Wave 编排有效。
- **Code review 的 2 轮上限合理**：本次只用 2 轮就修复了 MUST_FIX。如果问题更复杂，2 轮可能不够。

### Gate Quality

- **Gate review（GL2）有效发现了测试证据伪造**：gate review 不仅检查 deliverable 存在性，还检查内容真实性。这是一个高价值的检查层，防止 AI 用模板变量伪造测试输出。
- **Code review 准确发现了安全漏洞**：`in` 操作符的子串匹配问题是一个真实的攻击向量，code review 在第 1 轮就发现了。

### Prompt Clarity

- **BG1 subagent 的 task prompt 精确度足够**：4 个文件的修改位置和内容都明确指定，subagent 4 轮完成所有修改。
- **BG2 subagent 的 task prompt 可以更精确**：Python 代码修改需要指定精确的插入位置（行号或锚点文本），而不是"在某个函数之后"。

### Automation Gaps

- **test_results.md 的真实性验证可以部分自动化**：gate review 发现的 `{topic}` 模板变量问题，可以通过一个简单的 grep（检查是否包含 `{topic}`、`{spec_path}` 等模板变量）在 GL1 层面拦截，不需要等 GL2 的 AI 审查。

### Time Sinks

- **test_results.md 的重写**：因为 gate review 的 MUST_FIX，需要重写整个 test_results.md 并重新运行 gate check。如果一开始就粘贴实际命令输出，可以避免这个额外轮次。这是"偷懒用模板"vs"一次做对"的典型权衡。
