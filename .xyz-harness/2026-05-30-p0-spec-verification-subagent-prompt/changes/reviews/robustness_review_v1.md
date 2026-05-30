---
verdict: fail
must_fix: 3
---

# Robustness Review — Skill 文档修改

## 审查范围

| 文件 | 大小 | 行数 |
|------|------|------|
| `skills/xyz-harness-brainstorming/SKILL.md` | 28,411 bytes / 593 lines | ~7.5k tokens |
| `skills/xyz-harness-subagent-driven-development/SKILL.md` | 28,454 bytes / 546 lines | ~7.5k tokens |

两个文件各约 28KB，合计 56KB。brainstorming skill 是加载到主 agent 上下文的（Phase 1 全程），subagent-driven-development 作为主 agent 参考文档。28KB 偏大但仍在可接受范围内——单个 skill 约 7-8k tokens，未超过典型 AI 上下文窗口的 5%。

## 审查项

### 1. Step 5a grep 命令在文件不存在时是否会出错

**文件：** brainstorming SKILL.md, Step 5a Assumption Audit 章节

**问题：** Step 5a 提供了 4 个 grep 命令模板，但都没有处理文件/目录不存在的情况：

```bash
grep -rn "export.*interface\|export.*type\|export.*function" {file_or_dir}
grep -rn "enum\s*\w*\s*{" {file_or_dir} --include="*.ts"
grep -rn "{field_name}" {model_file}
grep -rn "export.*defineComponent\|export default" src/components/
```

**风险：** 如果 `{file_or_dir}` 或 `{model_file}` 不存在，`grep` 返回 exit code 1 并输出 `No such file or directory`。AI 主 agent 可能将此输出误判为"接口不存在"（假设不成立），或误判为命令执行失败而卡住。

**严重程度：** LOW-MEDIUM。AI 主 agent 执行时通常能从 grep 的 stderr 输出判断是"文件不存在"还是"没匹配到"。但考虑到本 skill 强调"代码验证"的严谨性，缺少对文件不存在的显式处理可能导致误判。

**建议修复：** 在 Step 5a 的"代码验证"步骤中增加一条前置检查说明：

```
验证前先确认目标文件/目录存在：
  ls {file_or_dir} || echo "FILE_NOT_FOUND"
文件不存在 → 标记 [UNVERIFIED]，不视为验证失败
```

**must_fix: 0**（不阻塞 gate，但建议修复）

---

### 2. Pre-Dispatch Checklist 的「禁止派遣」是否有明确的重试路径

**文件：** subagent-driven-development SKILL.md, Pre-Dispatch Checklist 章节

**分析：** Pre-Dispatch Checklist 规定了 5 项必填信息，"不满足任一项 → 禁止派遣，必须先补充信息"。但文档中没有明确说明补充信息的具体流程：

- 信息缺失时，主 agent 应该从哪里获取？（grep 代码？读 spec？问用户？）
- 如果通过 grep 获取失败（文件不存在、grep 无结果），怎么办？
- 是否有信息缺失的降级处理（如标记 [UNVERIFIED] 继续）？

**与此相关的 Red Flags 章节有 dispatcher 失败处理：**

> **If subagent dispatch fails (agent not found / model unavailable):** Stop immediately. Report the exact error to the user. Suggest fix. Wait for user confirmation before retrying.

但这只覆盖了 dispatcher 技术层面的失败，不覆盖 Pre-Dispatch Checklist 信息不完整的情况。

**严重程度：** MEDIUM。主 agent 在实践中大概率能自行处理（grep 代码获取签名），但缺少显式指导意味着行为不一致——不同执行轮次可能走不同的补全路径。

**建议修复：** 在 Pre-Dispatch Checklist 后增加"信息补全流程"章节：

```
信息缺失时的补全顺序：
1. grep 代码提取 → 优先
2. 读 spec/plan 文档 → 次选
3. 标记 [UNVERIFIED] 并在 task prompt 中声明 → 最后手段
   （仅适用于枚举值/import 路径，不适用于完整方法签名）
```

**must_fix: 0**（不阻塞 gate，但建议修复）

---

### 3. Post-Dispatch Verification 的验证失败是否有修复流程

**文件：** subagent-driven-development SKILL.md, Post-Dispatch Verification 章节

**分析：** Post-Dispatch Verification 规定了 3 项检查（文件存在性、编译、测试），并声明"验证失败 → subagent 产出不可信，必须修复或重新派遣"。

但**没有定义修复的具体流程**：

- 文件不存在 → 重新派遣同一个 subagent？还是派遣新的？
- 编译失败 → 重新派遣 executor subagent 修复？
- 测试失败 → 是 TDD 测试失败还是回归测试失败？处理路径不同

相比之下，Handling Implementer Status 章节有完整的 4 状态处理流程（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED），但 Post-Dispatch Verification 的验证失败与 implementer 的状态是两个不同的检查点，缺乏衔接。

**严重程度：** MEDIUM-HIGH。这是 quality gate 的关键缺口。Post-Dispatch Verification 声明了"验证失败必须修复"但没有给出修复路径，主 agent 可能：
- 无限循环重试
- 跳过验证声称"看起来没问题"
- 修复了错误的文件

**建议修复：** 在 Post-Dispatch Verification 章节增加"修复流程"：

```
验证失败时的处理：
1. 文件不存在 → dispatch fix subagent，传入原始 task prompt + 失败详情
2. 编译失败 → dispatch fix subagent，附加编译错误输出
3. 测试失败 → 区分：
   - 新增测试失败 → dispatch fix subagent 修复实现
   - 已有测试回归 → dispatch fix subagent，标注为回归
4. 修复后重新执行验证（最多 2 轮重试）
5. 2 轮后仍失败 → 标记 task 为 BLOCKED，记录到 memory.md，跳过当前 task 继续
```

**must_fix: 1**（Post-Dispatch Verification 缺少修复流程是 quality gate 缺口，应修复）

---

### 4. 并行依赖安全检查是否有边界情况遗漏

**文件：** subagent-driven-development SKILL.md, Wave 模式章节

**分析：** "并行依赖安全检查"章节规定了 3 条规则：

1. 检查同 Wave 内 Group 间是否有接口依赖
2. 如存在 → 拒绝并行，拆到下一个 Wave
3. 仅当互相独立时才允许并行

**遗漏的边界情况：**

| 边界情况 | 当前处理 | 风险 |
|----------|---------|------|
| **间接依赖**（Group A 依赖 Group B，Group B 依赖 Group C） | 未提及 | A 和 C 在同一 Wave 不会触发检查，但通过 B 存在间接依赖。不过只要 A、C 之间没有直接接口引用，并行是安全的——共享 B 的接口已被 B 的 Wave 产出。**实际风险低。** |
| **循环依赖**（A 引用 B 的接口，B 也引用 A 的接口） | 未提及 | 循环依赖意味着两个 Group 必须串行，但先执行哪个都有一方引用未产出的接口。这是 **plan 阶段的缺陷**，dev 阶段不应出现。如果出现，说明 plan.md 本身有设计问题。**应在检查中报告而非静默处理。** |
| **同 Wave 内通过共享类型文件依赖** | 检查了"函数/类型/接口"引用 | 部分覆盖。但两个 Group 都 import 了同一个 `types.ts` 中的类型，这不算接口依赖（类型文件是共享的），可能被误报为依赖。 |
| **运行时依赖 vs 编译时依赖** | 未区分 | 编译时依赖（类型引用）通常可以通过共享类型文件解决，运行时依赖（函数调用）才需要串行。不区分可能导致过度保守的拆分。 |

**严重程度：** LOW。循环依赖是 plan 阶段的缺陷，dev 阶段发现时正确做法是报告而非处理。间接依赖分析复杂度高，实际风险低（因为检查的是"直接接口引用"）。

**建议修复：** 增加一条防御性说明：

```
注意：
- 循环依赖（A↔B）是 plan 缺陷，发现时标记 BLOCKED 并报告用户
- 只检查直接接口引用，不追踪间接依赖
```

**must_fix: 0**（不阻塞 gate，但建议修复）

---

### 5. 新增内容是否导致 skill 文件过大

**数据：**

| 文件 | 大小 | 估算 tokens |
|------|------|------------|
| brainstorming SKILL.md | 28,411 bytes (593 lines) | ~7,500 |
| subagent-driven-dev SKILL.md | 28,454 bytes (546 lines) | ~7,500 |

**影响分析：**

- **brainstorming SKILL.md** 是 Phase 1 全程加载到主 agent 上下文的 skill。28KB ≈ 7.5k tokens，占典型 200k 上下文窗口的 ~3.75%。Phase 1 的对话轮次多、subagent summary 累积大，skill 文件的 7.5k token 是固定开销。**可接受，但有优化空间。**
- **subagent-driven-development SKILL.md** 是参考文档，主 agent 按需参考而非注入上下文。28KB 不会直接占用 subagent 上下文。**无影响。**

**与同项目其他 skill 对比：** 这两个文件是项目中最大的 skill 文件。其他 skill（如 gate-reviewer、harness-retrospect）通常在 3-5KB。

**严重程度：** LOW。文件大小不影响功能正确性，但在 Phase 1 长对话中会累积上下文压力。

**建议：** 不阻塞。如果未来进一步扩展（如新增 Step），考虑将 Assumption Audit、Terminology Step 等独立章节拆分为子文档，主文档保留概述和引用路径。

**must_fix: 0**

---

## 汇总

| 审查项 | 严重程度 | must_fix | 状态 |
|--------|---------|----------|------|
| Step 5a grep 文件不存在 | LOW-MEDIUM | 0 | 建议修复 |
| Pre-Dispatch 禁止派遣重试路径 | MEDIUM | 0 | 建议修复 |
| Post-Dispatch Verification 修复流程 | MEDIUM-HIGH | 1 | **必须修复** |
| 并行依赖安全检查边界情况 | LOW | 0 | 建议修复 |
| 文件大小 | LOW | 0 | 可接受 |

### 额外发现

1. **Self-Check Checklist 重复定义**：brainstorming SKILL.md 中有两个 "Self-Check" 相关章节——"## Self-Check"（Checklist 之后）和 "## Self-Check Checklist"（文档末尾 LOCAL-OVERRIDE 之后）。两者内容有重叠（都有文件存在性检查、验证命令），但不完全相同。建议合并为一个章节，减少 AI 的混淆风险。

2. **Post-Dispatch Verification 与 Handling Implementer Status 的职责边界模糊**：前者是主 agent 对 subagent 产出的验证，后者是 subagent 自报告的状态处理。但主 agent 验证失败后的修复行为（dispatch fix subagent）与 Handling Implementer Status 中的 BLOCKED 处理（"Dispatch fix subagent with specific instructions"）高度相似。缺少衔接说明可能导致主 agent 不确定该走哪条路径。**must_fix 归入第 3 项。**

3. **brainstorming SKILL.md 的 Inline Checks 位置**：Inline Checks（Placeholder scan、Internal consistency、Scope check）放在 Spec Review 之前，但它的功能（检查 spec 完整性）与 Six-Element Completeness 章节重叠。这两个章节的执行顺序和优先级不明确。

## 结论

**verdict: fail, must_fix: 3**

3 个 must_fix 的来源：
- Post-Dispatch Verification 缺少修复流程（第 3 项，MEDIUM-HIGH）
- Self-Check 重复定义导致歧义（额外发现 1，MEDIUM）
- Post-Dispatch 与 Handling Implementer 职责边界模糊（额外发现 2，MEDIUM）

这三个问题都可能在实际执行中导致 AI 行为不一致。其余审查项为建议修复，不阻塞 gate。
