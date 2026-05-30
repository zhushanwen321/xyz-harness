---
verdict: pass
must_fix: 0
---

# Standards Review v1 — Skill 文档修改规范审查

## 审查范围

| 文件 | 路径 |
|------|------|
| brainstorming SKILL.md | `skills/xyz-harness-brainstorming/SKILL.md` |
| subagent-driven-development SKILL.md | `skills/xyz-harness-subagent-driven-development/SKILL.md` |

## 审查依据

- `CLAUDE.md` 编码规范
- 项目 YAML frontmatter 格式规范（冒号引号、块标量、特殊字符）

---

## 1. YAML Frontmatter 格式

### brainstorming SKILL.md

```yaml
---
name: xyz-harness-brainstorming
description: >-
  Phase 1 (spec) ...
---
```

- `name` 值为简单字符串，无特殊字符，无需引号 -- 合规
- `description` 使用 `>-` 块标量 -- 合规（CLAUDE.md 推荐方式）
- 块标量内含双引号包裹的 `"start Phase 1"` 等短语 -- 在 `>-` 块标量内引号是普通字符，YAML 不会误解析 -- 合规
- `yaml.safe_load` 解析结果：`name` 和 `description` 均正确提取 -- 通过

### subagent-driven-development SKILL.md

```yaml
---
name: xyz-harness-subagent-driven-development
description: >-
  Subagent-driven-development 编码模式参考...
---
```

- `name` 值为简单字符串（kebab-case），无特殊字符 -- 合规
- `description` 使用 `>-` 块标量 -- 合规
- 中文内容无冒号后跟空格的陷阱 -- 合规
- `yaml.safe_load` 解析结果正确 -- 通过

**结论：两个文件的 YAML frontmatter 格式均合规，解析无报错。**

---

## 2. CLAUDE.md 编码规范合规性

| 检查项 | brainstorming | subagent-driven-dev | 结论 |
|--------|:---:|:---:|------|
| 不在 skill 中硬编码 `llm-simple-router/xxx` provider | 合规 | 合规 | 通过 |
| Subagent 模型使用 `taskComplexity` 而非硬编码 provider | 合规（多处指定 `taskComplexity: low/medium`） | 合规（多处指定 `taskComplexity: low/medium/high`） | 通过 |
| 所有 subagent 使用 `general-purpose` agent | 合规（表格和流程图中均指定） | 合规（架构说明明确禁止加载本文档到 subagent） | 通过 |
| 评审 subagent 通过 task prompt 注入方法论（read skill） | 合规（Spec Review 章节指定 read expert-reviewer skill） | 合规（Agent 角色表格明确） | 通过 |
| 不创建专用 agent | 合规 | 合规 | 通过 |

**结论：未发现违反 CLAUDE.md 编码规范的内容。**

---

## 3. 文档风格一致性

### 标题层级

brainstorming SKILL.md：
- `## Dev-flow 上下文` (H2)
- `## Phase Loop 机制` (H2)
- `# Brainstorming Ideas Into Designs` (H1) -- 主标题
- `## Checklist` / `## Process Flow` / `## The Process` (H2)
- `### Step 1` / `### On-demand Deep Scan` 等 (H3)
- `#### Question Hierarchy` (H4)

subagent-driven-development SKILL.md：
- `## 架构说明` (H2)
- `## Dev-flow 上下文` (H2)
- `# Subagent-Driven Development` (H1) -- 主标题
- `## The Process` / `## Model Selection` 等 (H2)
- `### Wave 模式` / `### 前端 task 路由` (H3)

**两个文件都遵循相同的标题层级模式：H1 主标题 + H2 章节 + H3 子章节 + H4 细分。Dev-flow 上下文表格作为统一的开头模板。风格一致。**

### 列表格式

- 两个文件均使用 `- **粗体标题** — 描述` 的列表格式
- 表格使用标准 Markdown 表格语法
- 代码块使用 ` ```dot `（流程图）、` ```bash `（命令）、` ```markdown `（模板）等语言标注

**风格一致，无格式冲突。**

### LOCAL-OVERRIDE 块

两个文件都包含 `<!-- LOCAL-OVERRIDE:START -->` ... `<!-- LOCAL-OVERRIDE:END -->` 注释块，内容格式一致（主目录、子目录命名、路径映射、文档精简规则）。

---

## 4. TODO/FIXME/Placeholder 检查

`grep` 扫描结果：

| 匹配行 | 文件 | 判定 |
|--------|------|------|
| `Placeholder scan: Any "TBD", "TODO"...` | brainstorming L407 | **非 placeholder**，这是 Inline Checks 检查指令，指导 AI 去扫描文档中的 placeholder。内容是对审查流程的描述，不是遗漏的 TODO |
| `并行 Task 间的接口依赖会导致 placeholder 代码` | subagent-dev L151 | **非 placeholder**，这是对问题现象的描述（"会导致"），不是未完成的 placeholder |
| `禁止留 TODO/FIXME/placeholder/no-op 实现` | subagent-dev L509 | **非 placeholder**，这是 Prohibition Block 规则内容，禁止出现 placeholder |
| `placeholder/no-op 占 20%` | subagent-dev L515 | **非 placeholder**，这是复盘数据的描述 |

**结论：两个文件中不存在未完成的 TODO/FIXME/placeholder/TBD/HACK。所有匹配项均为对规则的描述或问题现象的说明，不属于遗漏。**

---

## 审查总结

| 维度 | 状态 | 说明 |
|------|------|------|
| YAML frontmatter 格式 | PASS | `>-` 块标量正确使用，`yaml.safe_load` 解析无报错 |
| CLAUDE.md 编码规范 | PASS | 无硬编码 provider、无专用 agent、taskComplexity 用法正确 |
| 文档风格一致性 | PASS | 标题层级、列表格式、LOCAL-OVERRIDE 块均与其他 skill 一致 |
| TODO/FIXME/Placeholder | PASS | 无遗漏的 placeholder，匹配项均为规则描述 |

**最终结论：两个文件均通过规范审查，无需修复。**
