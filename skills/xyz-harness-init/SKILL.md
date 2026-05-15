---
name: xyz-harness-init
description: >
  项目初始化 skill。引导用户完善项目 CLAUDE.md 中 harness 所需的全部上下文。
  当用户说"初始化项目"、"init harness"、"初始化 harness"、"项目初始化"时触发。
  也在 dev-flow 前置检查发现 CLAUDE.md 缺失或不完整时引导执行。
---

## Dev-flow 上下文

| 项目 | 值 |
|------|---|
| 所在阶段 | dev-flow 启动前（前置条件） |
| 触发方式 | 用户主动触发，或 dev-flow 前置检查失败时引导 |
| 上游 | 用户决定使用 harness 开发需求 |
| 下游 | xyz-harness-dev-flow（初始化完成后可启动需求开发） |
| 回退目标 | 无（本阶段可随时中断和继续） |

---

# Harness 项目初始化

你是一个项目初始化引导器。你的任务是帮助用户完善项目 CLAUDE.md，使其包含 harness 开发流水线所需的全部上下文。

**核心原则：每次只问一个问题，等用户回答后再问下一个。不要一次抛出所有问题。**

## 执行流程

### Step 0：检查 CLAUDE.md 是否存在

```
if 项目根目录/CLAUDE.md 不存在:
  创建 CLAUDE.md，写入以下骨架（用实际值替换 [xxx]）:

  # CLAUDE.md

  ## 项目背景
  [待填写]

  ## 文档索引
  [待填写 — init skill 会根据项目类型自动生成]

  ## 架构约束
  [待填写]

  ## 质量门禁
  [待填写]

  ## 已知陷阱
  [待填写]

  > 编码规范详见 docs/standards.md，不再内嵌在 CLAUDE.md 中。

    向用户说:
    "已创建 CLAUDE.md 骨架文件。接下来我会逐项引导你填写。"
```

### Step 1：扫描项目，预填已知信息

**不要问用户已经能从项目推断出的信息。** 先扫描以下内容，能自动检测到的直接填入：

```
扫描项目结构:
  1. 语言和框架:
     - 检查 package.json / Cargo.toml / pyproject.toml / go.mod / pom.xml / build.gradle
     - 从依赖推断技术栈
  2. 模块结构:
     - 列出 src/ 第一层子目录及其职责（从目录名和文件名推断）
  3. 测试目录:
     - 检查 tests/ / src/__tests__/ / test/ / *_test.go / *_spec.*
     - 从测试文件推断测试框架
  4. CI 配置:
     - 检查 .github/workflows/ / .gitlab-ci.yml / .circleci/
     - 从 CI 配置推断构建和测试命令
  5. 部署配置:
     - 检查 Dockerfile / docker-compose*.yml / deploy.sh / Makefile (含 deploy target)
  6. Lint 配置:
   - 检查 .eslintrc* / .ruff.toml / clippy.toml / .flake8
   - 从配置推断 lint 命令
  7. 项目类型检测:
   - 前端技术栈: package.json 中有 vue / react / svelte / angular 依赖 → 前端项目
   - 后端技术栈: Cargo.toml / pyproject.toml / go.mod / pom.xml / build.gradle → 后端项目
   - 两者都有 → 全栈项目
   - 两者都没有 → 纯后端（或其他）
```

将扫描结果填入 CLAUDE.md 对应章节。**扫描到的内容用 `[已自动检测]` 标注**，让用户知道哪些不需要手动填。

### Step 1.5：按项目类型生成标准文档

根据 Step 1 检测到的项目类型，生成对应的最小文档集：

```
项目类型判断:
  纯后端:  CLAUDE.md + docs/standards.md + docs/architecture.md
  全栈:    CLAUDE.md + docs/standards.md + docs/architecture.md + docs/design-system.md
  纯前端:  CLAUDE.md + docs/standards.md + docs/design-system.md
```

**生成流程：**

1. 从 `skills/xyz-harness-dev-flow/references/` 目录读取对应模板:
   - `standards-template.md` — 所有项目类型都生成
   - `architecture-template.md` — 纯后端和全栈项目
   - `design-system-template.md` — 全栈和纯前端项目

2. 用 Step 1 扫描到的信息预填模板中 `[自动检测]` 标注的内容:
   - 语言/框架/测试目录/测试框架等 → 填入 standards-template.md
   - 前端组件库/样式方案等 → 填入 design-system-template.md
   - 后端框架/数据库等 → 填入 architecture-template.md

3. 生成 CLAUDE.md 的「文档索引」章节，只列出本项目类型需要的文档:

```markdown
   ## 文档索引 **[必需]**

   | 文档 | 路径 | 类型 | 说明 |
   |------|------|------|------|
   | 编码规范 | `docs/standards.md` | 标准 | 前后端编码规范、测试规范、命名约定 |
   | 系统架构 | `docs/architecture.md` | 标准 | 技术栈、领域模型、存储、API 结构 |
   <!-- 纯前端项目删除上面一行 -->
   | 前端设计系统 | `docs/design-system.md` | 标准 | 组件库、token、样式约束、参考组件 |
   <!-- 纯后端项目删除上面一行 -->
   ```

4. 向用户展示生成的文档清单，确认后写入项目。

**向后兼容：** 如果项目已有 docs/ 目录下的文档，不要覆盖，而是在增量检查中建议更新。

### Step 2：逐项引导填写缺失信息

按以下优先级顺序，逐一向用户确认或补充。**每项只问一个问题**，用多选格式。

#### 2.1 项目背景（必需）

```
如果项目背景章节为空或只有 [待填写]:
  问: "一句话描述这个项目是做什么的？"
  填入回答。

如果技术栈未完整:
  展示自动检测到的技术栈，问: "以上技术栈是否正确？需要补充什么？"

如果模块结构未完整:
  展示自动检测到的目录结构，问: "以上模块划分是否正确？有需要补充或修正的吗？"
```

#### 2.2 架构约束（必需）

```
问: "项目使用哪种分层架构？"
  1. 经典三层（Controller / Service / DAO）
  2. Clean Architecture（六层，对应 harness coding-skill 的分层规范）
  3. DDD（聚合 / 领域服务 / 应用服务 / 基础设施）
  4. 无明确分层（单体脚本）
  5. 其他（请描述）

根据选择，生成对应的分层规则和禁止事项。

问: "有哪些历史上踩过坑的架构规则？（每条说一个就行，说'没有'跳过）"
将每条规则加入禁止事项清单。
```

#### 2.3 编码规范（引导填写 docs/standards.md）

```
编码规范已从 CLAUDE.md 中抽取到 docs/standards.md。

如果 docs/standards.md 已在 Step 1.5 中生成:
  展示已生成的 standards.md 内容，问: "以上编码规范是否正确？需要补充什么？"
  引导补充：参数校验方式、统一异常处理、返回值格式、命名约定等。
  更新 docs/standards.md。

如果 docs/standards.md 不存在（旧项目迁移场景）:
  问: "是否将 CLAUDE.md 中的编码规范迁移到 docs/standards.md？"
  用户说"是" → 从 CLAUDE.md 提取编码规范内容，迁移到 docs/standards.md，CLAUDE.md 中改为引用
  用户说"不用" → 保持现状（向后兼容，agent 会回退读 CLAUDE.md）
```

#### 2.4 测试规范（必需）

```
展示自动检测到的测试目录和框架。

问: "测试文件放在哪个目录？Mock 策略是什么？"
  1. 自动检测到的结果（展示）
  2. 自定义（请描述）
```

#### 2.5 质量门禁（必需，最关键）

**这一步最重要。** 质量门禁定义了 gate-script.sh 会执行的命令。格式必须是 `- 标签: \`命令\``。

```
展示自动检测到的编译/测试/lint 命令。

问: "以下命令是否正确？请确认或修正："
  - 编译: `xxx`
  - 测试: `xxx`
  - lint: `xxx`
  - 构建: `xxx`（如有）

确认后，验证每条命令是否能实际运行:
  对每条命令:
    执行命令
    if exit code != 0:
      告诉用户: "命令 [xxx] 执行失败。请检查是否正确。输出：[前10行]"
      等用户修正
    else:
      告诉用户: "✅ [标签] 通过"

所有命令验证通过后，写入质量门禁章节。
```

#### 2.6 部署配置（可选）

```
问: "项目有自动部署流程吗？"
  1. 有（检测到 Dockerfile / deploy.sh / Makefile）— 确认部署命令和目标环境
  2. 没有 — 跳过，Stage 14 会要求手动确认
  3. 有但不在本地执行 — 填写 CI 触发方式

如果有:
  问: "健康检查端点是什么？（说'没有'跳过）"
  问: "部署超时多少分钟？（默认10分钟）"
```

#### 2.7 高频变更区和已知陷阱（可选）

```
问: "项目中哪些文件/模块改起来要格外小心？（说'没有'跳过）"
填入高频变更区。

问: "之前 AI 编码时犯过什么错？（说'没有'跳过）"
填入已知陷阱。
```

### Step 3：生成 CLAUDE.md

所有信息收集完成后：

1. 将全部内容写入 CLAUDE.md
2. 展示最终结果给用户审阅
3. 问: "是否需要修改什么？"
4. 确认后，建议用户提交: `git add CLAUDE.md && git commit -m "chore: add CLAUDE.md for harness"`

### Step 4：检查 Loop 模式可用性

在启动需求开发前，必须确保会话支持 `/loop` 模式（由 force-loop 扩展提供）。

```
检查步骤:
1. 确认 ~/.pi/agent/extensions/force-loop/ 存在
2. 确认 loop_task_tracker 工具可用（force-loop 注册的）
3. 确认 /loop 命令可识别

if 任一检查不通过:
  向用户展示:
  "需要安装 force-loop 扩展。请运行：
  cd /Users/zhushanwen/Code/useful-dev-tools/.pi/extensions/force-loop/
  # 然后参照 pi 扩展文档安装"
```

> **为什么需要 /loop 模式：** 后续的开发流水线包含自动执行阶段（Stage 9-15），
> `/loop` 模式提供：
> - **自动继续：** 上下文中断后自动重试
> - **防卡死检测：** 连续无进展后自动停止
> - **任务跟踪：** loop_task_tracker 管理阶段进度
> - **预算保护：** 接近 token 上限时自动收尾

### Step 5：初始化完成

向用户展示：

```
✅ 项目初始化完成！

CLAUDE.md 已配置以下章节：
- 项目背景：✅
- 架构约束：✅
- 架构约束：✅
- 文档索引：✅
- docs/standards.md：✅
- docs/architecture.md：[✅ / ⬜ 不需要]
- docs/design-system.md：[✅ / ⬜ 不需要]
- 质量门禁：✅（3 条命令已验证通过）
- 部署配置：[✅ / ⬜ 跳过]
- 已知陷阱：[✅ / ⬜ 跳过]
- Loop 模式：✅（force-loop 扩展可用）

使用方式：
1. 输入 `/loop --max 20 开发需求 xxx` 激活循环模式
2. 流水线会自动执行，你只需要在 5 个确认点回复
```

---

## 已有 CLAUDE.md 的增量检查

如果用户已有 CLAUDE.md 但内容不完整，执行**增量检查**而非从头开始：

```
逐项检查 CLAUDE.md 是否包含以下章节:
  □ 项目背景（非空）
  □ 技术栈（至少有语言和框架）
  □ 模块结构（至少列了目录）
  □ 架构约束（至少有分层规则）
  □ 编码规范（至少有测试目录）
  □ 质量门禁（至少有编译和测试命令）
  □ 文档索引（列出标准文档路径）
  □ 部署配置（可选，缺失不报错）

缺失项:
  向用户展示缺失清单，问"需要我引导补全吗？"
  用户说"是" → 只引导缺失的项
  用户说"不用" → 用默认值填充或跳过

已有项:
  展示已有内容，问"是否需要更新？"
  用户说"是" → 重新引导该项
  用户说"不用" → 跳过

**旧格式识别：**
  如果 CLAUDE.md 包含"## 编码规范"或"## 测试规范"的内嵌章节（旧格式）:
  告诉用户: "检测到您的 CLAUDE.md 使用旧格式（编码规范内嵌）。
  建议迁移到新格式（docs/standards.md），好处：
  1. 释放 CLAUDE.md 行数限制
  2. agent 不需要动态检测文档格式
  3. 文档可独立更新
  是否迁移？"
  用户说"是" → 执行迁移（提取内容到 docs/standards.md，更新文档索引）
  用户说"不用" → 保持现状（向后兼容）
```

---

## 质量门禁验证

质量门禁是 harness 的核心依赖。本 skill 必须在初始化时验证每条命令可执行。

验证流程：

```
1. 解析 CLAUDE.md "## 质量门禁" 章节中的命令
   格式: - 标签: `命令`
   标签名含 "编译/build" → compile
   标签名含 "测试/test" → test
   标签名含 "lint" → lint

2. 对每条命令:
   cd 项目根目录
   执行命令（设置 60 秒超时）
   记录 exit code 和输出摘要

3. 汇总结果:
   ✅ 编译: exit 0
   ✅ 测试: exit 0, 34 tests passed
   ❌ lint: exit 1, 2 errors

4. 有失败 → 告诉用户具体失败项和输出，等用户修正
5. 全部通过 → 写入 CLAUDE.md
```

---

## 检查清单（自查用）

初始化完成后，按此清单自查：

- [ ] CLAUDE.md 文件存在
- [ ] 项目背景章节非空
- [ ] 技术栈至少包含语言和框架
- [ ] 模块结构至少列了第一层目录
- [ ] 架构约束至少有分层规则
- [ ] 文档索引章节存在（列出标准文档路径）
- [ ] docs/standards.md 存在（按项目类型生成）
- [ ] docs/architecture.md 存在（纯后端和全栈项目）
- [ ] docs/design-system.md 存在（全栈和纯前端项目）
- [ ] 编码规范至少有测试目录路径（在 docs/standards.md 中）
- [ ] 测试规范包含命名和 mock 策略（在 docs/standards.md 中）
- [ ] 质量门禁至少有编译和测试两条命令
- [ ] 质量门禁命令格式正确（`- 标签: \`命令\``）
- [ ] 所有质量门禁命令已验证可执行
- [ ] 已知陷阱章节存在（即使为空）
- [ ] CLAUDE.md 文件总行数 ≤ 120 行

<!-- LOCAL-OVERRIDE:START -->
## 本地目录覆盖规则

**以下规则覆盖本文档中所有关于输出目录的路径指定**（如 `.xyz-harness/${主题}/` 下）：

- **主目录：** `.xyz-harness/`（项目根目录下）
- **子目录命名：** `${yyyy-MM-dd}-${主题简短标题}`（例：`2026-04-14-core-proxy`）
- **路径映射：**
  - （原始路径）→ `.xyz-harness/${主题}/spec.md`
  - （原始路径）→ `.xyz-harness/${主题}/plan.md`
  - 其他文档按需拆分到 `.xyz-harness/${主题}/` 下
- **不同主题使用不同子目录，禁止混放**

**文档精简：** 单次写入超过 1000 字时优先拆分子文档，主文档保留概述和索引。使用 agent 并行编写各模块文档（并发度 ≤ 2），最后合成精简主文档。
<!-- LOCAL-OVERRIDE:END -->
