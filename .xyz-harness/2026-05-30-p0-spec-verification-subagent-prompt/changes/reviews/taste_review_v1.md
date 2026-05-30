---
verdict: pass
must_fix: 0
---

# Taste Review — brainstorming + subagent-driven-development

## 审查范围

1. `skills/xyz-harness-brainstorming/SKILL.md`
2. `skills/xyz-harness-subagent-driven-development/SKILL.md`

## 一、章节详细程度一致性

### brainstorming

整体章节深度分布合理：
- 高层摘要（Phase Loop、Checklist、Key Principles）保持精简，用表格和要点传达
- 核心流程（Step 1-5a、Terminology、Six-Element）有足够的操作细节
- 模板和 frontmatter 规范有完整示例

**发现 1 个轻微不一致：** "Terminology Step (嵌入 Step 2-4)" 与 "Terminology & ADR Step (Step 7)" 两个术语处理章节的关系不够清晰。两者都标为 "MUST + Nullable"，但命名容易混淆——一个是 inline 过程，一个是最终检查。文档内部通过文字说明了差异，但标题上容易误认为是重复内容。建议不改，因为标题下方第一句话已做区分。

**总体判断：** 详细程度梯度合理，从战略到战术到操作层的深度递进自然。没有某个章节过度膨胀或突然变简略。

### subagent-driven-development

详细程度分布：
- 架构说明、铁律、When to Use、Model Selection 保持摘要级
- 流程细节（Context Diet、Pre-Dispatch Checklist、Prohibition Block、Post-Dispatch Verification）有操作级细节
- Example Workflow 提供了具体范例

**发现 1 个不一致：** "Handling TDD Coder Status" 和 "Handling Implementer Status" 两个章节详细程度很高（逐条状态码处理），但 "Spec 合规检查" 角色的处理逻辑只有一句话提到，没有对应的状态码处理章节。作为三角色流程的闭环，spec reviewer 的状态处理应该有同等详细程度。这是 must_fix 以外的品味建议。

**总体判断：** 可接受，但不完美。

## 二、命令模板实用性

### brainstorming

Assumption Audit 章节的命令模板：
```bash
grep -rn "export.*interface\|export.*type\|export.*function" {file_or_dir}
grep -rn "enum\s*\w*\s*{" {file_or_dir} --include="*.ts"
grep -rn "{field_name}" {model_file}
grep -rn "export.*defineComponent\|export default" src/components/
```
**评价：** 可复制粘贴执行（替换 `{placeholder}` 即可）。覆盖了四种典型验证场景。实用。

Self-Check Checklist 中的命令模板同样是 grep 模式，与 Assumption Audit 有少量重复（枚举验证命令出现了两次），但不构成问题——一个在 Step 5a 流程中，一个在 Self-Check 中，上下文不同。

Gate check 命令：`python3 skills/xyz-harness-gate/scripts/check_gate.py {topic_dir} 1`——可执行。

### subagent-driven-development

Pre-Dispatch Checklist 提到 `grep -n "export.*function|..."` 但没有像 brainstorming 那样给出完整的可复制模板。只有一行描述"从代码 grep 提取"。**轻微不足**，建议补充完整命令行。

Post-Dispatch Verification 给出了 `ls -la`、`npx tsc --noEmit`、`npx vitest run` 三个命令——可执行、实用。

**总体判断：** 两个文档的命令模板基本可用。subagent 的 Pre-Dispatch Checklist 可以补一个 grep 命令示例，但不是必须的。

## 三、重复内容

### 跨文档重复

两份文档都有以下重复元素（这是项目级的模板化内容，不算品味问题）：
- Dev-flow 上下文表格
- LOCAL-OVERRIDE 块（完全相同）
- Phase Loop 机制说明（brainstorming 有，subagent 也暗示了）

这些属于 harness 统一模板，保持一致是正确的。

### 文档内部重复

**brainstorming：**
- "铁律" 在两处出现：Step 5a 一处（禁止写入未验证接口），Self-Check 一处（禁止声称未验证）。内容不同，合理。
-枚举验证 grep 命令在 Assumption Audit 和 Self-Check 中各出现一次——上下文不同，可接受。

**subagent-driven-development：**
- "铁律" 在两处出现：主 Agent 禁码一处，Pre-Dispatch Checklist 一处。前者是高层禁止，后者是操作层禁止。角度不同，合理。
- "subagent 不需要自己读 spec/plan 文件" 这个信息在 Context Diet 段落和 Red Flags 段落都出现了——有轻微重复。建议在 Red Flags 中删掉那条，保留 Context Diet 中的权威说明。

**总体判断：** 存在少量可接受的重复（不同上下文强调同一规则），一处可改进的重复（subagent 文档）。

## 四、强调标记使用（铁律/背景/NEVER/MANDATORY）

### 使用统计

| 文档 | 标记类型 | 出现次数 | 评价 |
|------|---------|---------|------|
| brainstorming | **铁律** | 2 | 合理：一处防假数据，一处防未验证接口 |
| brainstorming | `**HARD-GATE**` | 1 | 关键门禁，合理 |
| brainstorming | **MUST + Nullable** | 2 | 精确定义了执行强度和产出预期，好 |
| brainstorming | `**NEVER** | / **No exceptions**` | 2 | 处在关键禁止处，合理 |
| subagent | **铁律** | 2 | 合理：一处禁主 agent 编码，一处禁信息不足派遣 |
| subagent | **背景** | 2 | 为复盘数据驱动的规则提供证据，好 |
| subagent | `[MANDATORY]` | 3 | 流程图中标记强制步骤，合理 |
| subagent | **NEVER** / **Never** | 12+ | **略多**。Red Flags 章节集中了大量 NEVER，但考虑到这是 AI 执行文档，AI 需要强信号，可以接受 |

**总体判断：** 强调标记使用克制且有针对性。没有"狼来了"效应——每个铁律/背景/NEVER 都附带了具体理由（通常是复盘数据）。subagent 文档的 NEVER 密度偏高，但放在 "Red Flags" 集合章节中是合理的组织方式。

## 五、品味评分

| 维度 | brainstorming | subagent | 说明 |
|------|:---:|:---:|------|
| 章节一致性 | 8/10 | 7/10 | subagent 缺 spec reviewer 状态处理章节 |
| 命令模板实用性 | 8/10 | 7/10 | subagent Pre-Dispatch 可补 grep 示例 |
| 重复控制 | 8/10 | 7/10 | subagent 有一处可消除的重复 |
| 强调标记节制 | 9/10 | 7/10 | subagent NEVER 密度略高但可接受 |
| 信息密度 | 9/10 | 8/10 | 两份文档都保持了高信息密度，没有废话 |
| **综合** | **8.4/10** | **7.4/10** | |

## 六、改进建议（非 must_fix）

1. **subagent 文档：** 补充 spec reviewer 的状态码处理章节（NEEDS_CONTEXT / BLOCKED / DONE），与 TDD coder 和 implementer 对齐。
2. **subagent 文档：** Red Flags 中 "Make subagent read plan file" 和 Context Diet 中 "subagent 不需要自己读 spec/plan" 重复，删前者。
3. **subagent 文档：** Pre-Dispatch Checklist 补一个 grep 命令示例，与 brainstorming 的 Assumption Audit 模板对齐。
4. **两份文档：** LOCAL-OVERRIDE 块完全相同，考虑抽取为项目级模板引用（非品味问题，是维护效率问题）。
