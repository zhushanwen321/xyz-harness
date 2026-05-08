# xyz-harness-engineering 实施计划

> **For agentic workers:** 使用 subagent-driven-development 逐 task 执行。步骤使用 checkbox (`- [ ]`) 语法追踪。

**目标：** 构建完整的 Harness Engineering 体系，包含 10 个 skill + 1 个编排器 + 安装脚本 + gate 脚本。

**架构：** 主 agent 纯调度 + subagent 执行 + gate-checker 门禁。所有 skill 统一 `xyz-harness-` 前缀，通过 install.py symlink 安装到全局。

**技术栈：** pi skill（SKILL.md + references）、pi agent（agent.md）、Python（install.py）、symlink

---

## 文件结构

```
skills/
├── xyz-harness-dev-flow/          # Task 8-9
│   ├── SKILL.md
│   ├── scripts/
│   │   └── gate-script.sh        # Task 12（新增）
│   └── references/
│       ├── claude-md-template.md
│       └── wiki-structure.md
├── xyz-harness-brainstorming/      # Task 1
│   └── SKILL.md
├── xyz-harness-writing-plans/      # Task 1
│   └── SKILL.md
├── xyz-harness-subagent-driven-development/  # Task 2
│   ├── SKILL.md
│   ├── implementer-prompt.md
│   └── spec-reviewer-prompt.md
├── xyz-harness-expert-reviewer/    # Task 3
│   └── SKILL.md
├── xyz-harness-coding-skill/       # Task 4-5
│   ├── SKILL.md
│   └── specs/
│       ├── entry.md
│       ├── orchestration.md
│       ├── domain.md
│       ├── data.md
│       ├── integration.md
│       └── infrastructure.md
├── xyz-harness-unit-test-write/    # Task 6
│   └── SKILL.md
├── xyz-harness-verification-before-completion/  # Task 1
│   └── SKILL.md
├── xyz-harness-deploy-verify/      # Task 7
│   └── SKILL.md
└── xyz-harness-test-driven-development/  # Task 1
    └── SKILL.md
install.py                          # Task 10
README.md                           # Task 11
```

---

## Task 1：从 superpowers 提取 5 个 skill（低风险，原样复制）

**Files:**
- Create: `skills/xyz-harness-brainstorming/SKILL.md`
- Create: `skills/xyz-harness-writing-plans/SKILL.md`
- Create: `skills/xyz-harness-subagent-driven-development/SKILL.md`
- Create: `skills/xyz-harness-verification-before-completion/SKILL.md`
- Create: `skills/xyz-harness-test-driven-development/SKILL.md`

- [ ] **Step 1：读取 superpowers 原始 SKILL.md**

读取以下 5 个文件：
- `/Users/zhushanwen/.agents/skills/brainstorming/SKILL.md`
- `/Users/zhushanwen/.agents/skills/writing-plans/SKILL.md`
- `/Users/zhushanwen/.agents/skills/subagent-driven-development/SKILL.md`
- `/Users/zhushanwen/.agents/skills/verification-before-completion/SKILL.md`
- `/Users/zhushanwen/.agents/skills/test-driven-development/SKILL.md`

- [ ] **Step 2：复制到目标路径，修改 name 字段和 LOCAL-OVERRIDE**

对每个文件：
1. 复制内容到 `skills/xyz-harness-{name}/SKILL.md`
2. frontmatter 的 `name` 改为 `xyz-harness-{name}`
3. 保留 LOCAL-OVERRIDE 部分（已指向 `.superpowers/`）
4. 去掉 visual companion 相关内容（brainstorming 中）

- [ ] **Step 3：验证文件内容完整**

确认每个 SKILL.md 可正常读取，frontmatter 格式正确。

---

## Task 2：适配 subagent-driven-development 的 prompt 模板

**Files:**
- Create: `skills/xyz-harness-subagent-driven-development/implementer-prompt.md`
- Create: `skills/xyz-harness-subagent-driven-development/spec-reviewer-prompt.md`
- Modify: `skills/xyz-harness-subagent-driven-development/SKILL.md`（去除 code-quality-reviewer 引用）

- [ ] **Step 1：读取原始 prompt 模板**

读取：
- `/Users/zhushanwen/.agents/skills/subagent-driven-development/implementer-prompt.md`
- `/Users/zhushanwen/.agents/skills/subagent-driven-development/spec-reviewer-prompt.md`

- [ ] **Step 2：适配调度语法**

每个模板中需要修改的内容：
- `Task tool (general-purpose):` → pi 的 subagent 调用格式
- 模型名 → `llm-simple-router/glm-5-turbo`（简单任务）/ `llm-simple-router/glm-5.1`（复杂任务）
- `superpowers:xxx` 引用 → 去掉 `superpowers:` 前缀，改为对应的 `xyz-harness-` 前缀名

- [ ] **Step 3：复制适配后的模板到目标路径**

保存到：
- `skills/xyz-harness-subagent-driven-development/implementer-prompt.md`
- `skills/xyz-harness-subagent-driven-development/spec-reviewer-prompt.md`

- [ ] **Step 4：修改 SKILL.md，移除 code-quality-reviewer 引用**

code-quality-reviewer 的逻辑将并入 expert-reviewer（Task 3）。在 SKILL.md 中：
- 移除 code-quality-reviewer-prompt.md 的引用和描述
- 移除两阶段评审的第二阶段（代码质量评审）
- 只保留 spec 合规检查（task 级）

- [ ] **Step 5：Commit**

```bash
git add skills/xyz-harness-subagent-driven-development/
git commit -m "feat: adapt subagent-driven-development prompt templates for pi"
```

---

## Task 3：新建 xyz-harness-expert-reviewer

**Files:**
- Create: `skills/xyz-harness-expert-reviewer/SKILL.md`

- [ ] **Step 1：设计 expert-reviewer SKILL.md**

skill 需要支持两种模式：

**模式一：计划评审（阶段②）**
- 输入：spec.md + plan.md
- 检查维度：spec 完整性、plan 可行性、任务拆分合理性、范围一致性
- 输出：`changes/reviews/plan_review_v1.md`

**模式二：执行评审（阶段④⑥）**
- 输入：spec + plan + 代码 diff（或测试代码）
- 检查维度：spec 合规、代码质量、测试质量
- 输出：`changes/reviews/code_review_v1.md` 或 `test_review_v1.md`

统一输出格式：
```
每条意见包含：问题描述 + 修改建议 + 优先级（MUST FIX / LOW / INFO）
```

SKILL.md 需要包含：
- frontmatter（name: xyz-harness-expert-reviewer, description 含触发词）
- 两种模式的切换说明（通过 dev-flow 传入的参数/上下文区分）
- 评审维度 checklist
- 输出格式模板
- 评审循环上限（计划评审 ≤3轮，执行评审 ≤2轮）

- [ ] **Step 2：读取原始 code-quality-reviewer-prompt.md 作为参考**

读取 `/Users/zhushanwen/.agents/skills/subagent-driven-development/code-quality-reviewer-prompt.md`，提取代码质量评审的维度和逻辑，融入执行评审模式。

- [ ] **Step 3：写 SKILL.md**

- [ ] **Step 4：Commit**

```bash
git add skills/xyz-harness-expert-reviewer/
git commit -m "feat: add expert-reviewer skill with plan and execution review modes"
```

---

## Task 4：新建 xyz-harness-coding-skill 主文件

**Files:**
- Create: `skills/xyz-harness-coding-skill/SKILL.md`

- [ ] **Step 1：设计 coding-skill SKILL.md**

SKILL.md 需要包含：
- frontmatter（name: xyz-harness-coding-skill）
- Clean Architecture 分层总览：6 层（入口/编排/领域/数据/集成/基础设施）
- 每层引用对应的 specs/ 文件
- 分层依赖规则：外层可调内层，内层不可调外层
- 编码 SOP：读 spec → 确认涉及层 → 加载对应 Spec → 编码 → 自检
- 与项目 CLAUDE.md 的冲突处理规则：项目规范优先

- [ ] **Step 2：写 SKILL.md**

- [ ] **Step 3：Commit**

```bash
git add skills/xyz-harness-coding-skill/SKILL.md
git commit -m "feat: add coding-skill with clean architecture layer overview"
```

---

## Task 5：编写 6 份 Clean Architecture 分层 Spec

**Files:**
- Create: `skills/xyz-harness-coding-skill/specs/entry.md`
- Create: `skills/xyz-harness-coding-skill/specs/orchestration.md`
- Create: `skills/xyz-harness-coding-skill/specs/domain.md`
- Create: `skills/xyz-harness-coding-skill/specs/data.md`
- Create: `skills/xyz-harness-coding-skill/specs/integration.md`
- Create: `skills/xyz-harness-coding-skill/specs/infrastructure.md`

每份 Spec 包含：
- 该层的职责边界
- 该层可调用哪些层（依赖规则）
- 该层不可调用哪些层（禁止规则）
- 通用编码规范（技术栈无关）
- 正面/反面示例

- [ ] **Step 1：编写 entry.md（入口层）**

职责：接收外部请求、参数校验、响应格式化。不包含业务逻辑。

- [ ] **Step 2：编写 orchestration.md（编排层）**

职责：业务流程编排、事务边界管理。协调领域层和集成层。

- [ ] **Step 3：编写 domain.md（领域层）**

职责：核心业务逻辑、领域模型、业务规则。不依赖任何外部层。

- [ ] **Step 4：编写 data.md（数据层）**

职责：数据存取、ORM/查询映射。不包含业务判断。

- [ ] **Step 5：编写 integration.md（集成层）**

职责：外部服务调用、超时设置、降级方案。隔离外部依赖。

- [ ] **Step 6：编写 infrastructure.md（基础设施层）**

职责：配置、中间件、工具函数。横切关注点。

- [ ] **Step 7：Commit**

```bash
git add skills/xyz-harness-coding-skill/specs/
git commit -m "feat: add 6 clean architecture layer specs"
```

---

## Task 6：新建 xyz-harness-unit-test-write

**Files:**
- Create: `skills/xyz-harness-unit-test-write/SKILL.md`

- [ ] **Step 1：设计 unit-test-write SKILL.md**

核心逻辑（Change-driven Testing）：
1. 分析代码变更（git diff），识别修改的接口/API
2. 对每个变更接口编写接口级测试
3. 测试覆盖：正常路径 + 边界条件 + 异常路径
4. 优先使用真实数据构造用例（如果项目有线上数据源）

SKILL.md 需要包含：
- frontmatter
- Change-driven Testing SOP
- 与 TDD 的分工说明（TDD 覆盖单元级，本 skill 覆盖接口级）
- 测试文件命名和目录规范
- 输出格式

- [ ] **Step 2：写 SKILL.md**

- [ ] **Step 3：Commit**

```bash
git add skills/xyz-harness-unit-test-write/
git commit -m "feat: add unit-test-write skill with change-driven testing"
```

---

## Task 7：新建 xyz-harness-deploy-verify

**Files:**
- Create: `skills/xyz-harness-deploy-verify/SKILL.md`

- [ ] **Step 1：设计 deploy-verify SKILL.md**

核心逻辑：
1. 确认部署目标（从 CLAUDE.md 或项目配置读取）
2. 执行部署命令
3. 验证部署成功（健康检查、关键接口可达性）
4. 记录部署结果到 `changes/evidence/deploy_result.md`

SKILL.md 需要包含：
- frontmatter
- 部署验证 SOP（通用化，不绑定特定 CI/CD 工具）
- 验证通过/失败的判断标准
- 失败时的回退指导

- [ ] **Step 2：写 SKILL.md**

- [ ] **Step 3：Commit**

```bash
git add skills/xyz-harness-deploy-verify/
git commit -m "feat: add deploy-verify skill"
```

---

## Task 8：新建 xyz-harness-dev-flow 编排器（核心）

**Files:**
- Create: `skills/xyz-harness-dev-flow/SKILL.md`
- Create: `skills/xyz-harness-dev-flow/references/claude-md-template.md`
- Create: `skills/xyz-harness-dev-flow/references/wiki-structure.md`
- Reference: `.superpowers/2026-05-08-harness-engineering/stage-execution-detail.md`（每阶段执行逻辑的详细设计）

这是工作量最大的 task。dev-flow SKILL.md 需要完整描述 11 阶段流水线的调度逻辑。

**所有阶段的执行逻辑设计见 `stage-execution-detail.md`**，每个阶段都包含：
1. 派遣的 subagent（agent 类型、加载 skill、模型、输入）
2. 入口条件检查（subagent 内部先检查，不满足返回 fail）
3. 执行逻辑（subagent 内部做什么）
4. 交付物（产出什么文件）
5. 门禁检查项（gate-checker subagent 检查什么）
6. 人工确认点（展示内容、用户选项、流转规则）

- [ ] **Step 1：复制参考文档**

从 `/Users/zhushanwen/Code/chat_project/harness-engineering/dev-flow/references/` 复制：
- `claude-md-template.md` → `skills/xyz-harness-dev-flow/references/claude-md-template.md`
- `wiki-structure.md` → `skills/xyz-harness-dev-flow/references/wiki-structure.md`

- [ ] **Step 2：编写 dev-flow SKILL.md**

核心内容：
- frontmatter（name: xyz-harness-dev-flow, description 含触发词）
- 调度器角色声明（纯调度，不直接执行）
- 前置检查（worktree / CLAUDE.md / CI）
- loop_task_tracker 使用说明
- 变更管理目录结构和 summary.md 格式
- **通用调度模式**（每个阶段遵循的 4 步流程：派遣 subagent → 门禁检查 → complete_task → 人工确认判断）
- **Subagent 配置表**（执行/评审/门禁三种角色的 agent、工具、模型）
- 11 个阶段的详细描述（**参照 stage-execution-detail.md**）：
  - 每个阶段：派遣 subagent 配置 + 入口条件 + 执行逻辑 + 交付物 + 门禁检查项 + 回退路由 + 人工确认点
- 回退时的 tracker 处理
- 异常处理（评审循环超限、subagent blocked）
- 产出物清单

关键设计点：
- 每个阶段用 subagent 执行（上下文隔离）
- subagent 内部先检查入口条件，不满足返回 fail
- 阶段完成后派遣 gate-checker subagent
- gate-checker pass → complete_task → 下一阶段
- gate-checker fail → 按回退路由处理
- 人工确认点暂停等待用户

- [ ] **Step 3：Commit**

```bash
git add skills/xyz-harness-dev-flow/
git commit -m "feat: add dev-flow orchestrator with 11-stage pipeline"
```

---

## Task 9：编写 dev-flow 各阶段详细描述

**Files:**
- Modify: `skills/xyz-harness-dev-flow/SKILL.md`（扩展每个阶段的详细调度指令）

Task 8 完成 SKILL.md 的骨架，本 task 填充每个阶段的具体调度逻辑。

- [ ] **Step 1：编写阶段 ① 需求分析 的调度描述**

详细描述：
- 派遣执行 subagent，加载 brainstorming + writing-plans skill
- subagent 的输入：需求描述 + 项目上下文
- subagent 的产出：spec.md + plan.md
- gate-checker 检查项：两个文件存在 + spec 包含必要章节 + plan 包含 task 拆分
- 人工确认点1 的展示内容

- [ ] **Step 2：编写阶段 ② 需求评审 的调度描述**

- 派遣评审 subagent（code-reviewer），加载 expert-reviewer skill（计划评审模式）
- subagent 输入：spec.md + plan.md（不继承阶段①的执行上下文）
- gate-checker 检查项：review 文件存在 + 无 MUST FIX 项（或有修复确认）
- 评审循环 ≤3轮
- 人工确认点2

- [ ] **Step 3：编写阶段 ③ 编码实现 的调度描述**

- 派遣执行 subagent，加载 coding-skill + subagent-driven-development
- subagent-driven-development 内部再调度 task 级 subagent（code-fixer）
- 每个 task 内：TDD + spec 合规检查（spec-reviewer-prompt）
- gate-checker 检查项：代码编译通过 + 所有 spec 合规通过

- [ ] **Step 4：编写阶段 ④⑤⑥⑦ 的调度描述**

④ 编码评审：评审 subagent + expert-reviewer（执行评审模式），≤2轮
⑤ 测试编写：执行 subagent + unit-test-write（Change-driven），gate-checker 检查测试文件
⑥ 测试评审：评审 subagent + expert-reviewer（执行评审模式），≤2轮
⑦ 代码推送：执行 subagent + zcommit，gate-checker 检查 push 成功

- [ ] **Step 5：编写阶段 ⑧⑨⑩ 的调度描述**

⑧ CI 验证：执行 subagent + verification-before-completion，门禁条件硬编码（SUCCESS && tests>0 && passed==total），回退路由（0/0→⑤，编译错→③）
⑨ 部署验证：人工确认点4 → 执行 subagent + deploy-verify
⑩ 用户确认：人工确认点5，回退路由（需求不符→①，实现问题→③）

- [ ] **Step 5.5：编写阶段 ⑪ 自动复盘 的调度描述**

⑪ 自动复盘：复盘 subagent（code-reviewer, glm-5.1）
  - 输入：summary.md + 各阶段评审报告路径 + 回退记录 + metrics
  - 执行：分析回退根因、评审有效性、gate 脚本遗漏、CLAUDE.md 改进建议
  - 交付物：changes/retrospective.md
  - 无门禁检查
  - 无人工确认点
  - 完成后：主 agent 展示可改进项，用户决定是否采纳
  - 运行指标记录到 .xyz-harness/metrics/

- [ ] **Step 6：Commit**

```bash
git add skills/xyz-harness-dev-flow/SKILL.md
git commit -m "feat: add detailed stage descriptions for all 11 stages"
```

---

## Task 10：编写 install.py

**Files:**
- Create: `install.py`

- [ ] **Step 1：设计 install.py**

功能：
1. 扫描 `skills/` 目录下所有 `xyz-harness-` 前缀的 skill 目录
2. 对每个 skill 创建 symlink：
   - `~/.pi/agent/skills/{name}` → `{project}/skills/{name}`
   - `~/.agents/skills/{name}` → `{project}/skills/{name}`
3. 清理旧版：如果目标位置已存在不带前缀的同名 skill（如 `dev-flow`），删除旧 symlink
4. 幂等：重复运行不报错

旧版清理映射（需要清理的全局 skill）：
```
dev-flow → xyz-harness-dev-flow
brainstorming → xyz-harness-brainstorming  # 只清理 ~/.agents/skills/ 下的（superpowers 的）
writing-plans → xyz-harness-writing-plans
subagent-driven-development → xyz-harness-subagent-driven-development
verification-before-completion → xyz-harness-verification-before-completion
test-driven-development → xyz-harness-test-driven-development
```

- [ ] **Step 2：实现 install.py**

- [ ] **Step 3：测试运行**

```bash
python3 install.py
# 验证 symlink 创建成功
ls -la ~/.pi/agent/skills/ | grep xyz-harness
ls -la ~/.agents/skills/ | grep xyz-harness
# 验证旧版已清理
ls ~/.agents/skills/dev-flow 2>&1  # 应该不存在
```

- [ ] **Step 4：Commit**

```bash
git add install.py
git commit -m "feat: add install.py with symlink setup and legacy cleanup"
```

---

## Task 11：编写 README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1：写 README.md**

内容：
- 项目简介（一句话）
- Harness Engineering 概念链接
- Skill 清单和说明
- 安装方式（install.py）
- 使用方式（在 pi 中触发 dev-flow）
- 目录结构

- [ ] **Step 2：Commit**

```bash
git add README.md
git commit -m "docs: add project README"
```

---

## Task 12：编写 gate-script.sh

**Files:**
- Create: `skills/xyz-harness-dev-flow/scripts/gate-script.sh`

- [ ] **Step 1：设计 gate-script.sh**

脚本功能：接受阶段号和交付物路径作为参数，执行可程序化验证的检查项。

调用方式：`gate-script.sh <stage> <project_root> [additional_args...]`

脚本逻辑按阶段号分支：

**阶段 01（需求分析）：**
- 检查 spec.md 存在且非空
- 检查 plan.md 存在且非空
- 检查 plan.md 包含至少 1 个 "Task" 或 "### Task" 标题

**阶段 03（编码实现）：**
- 读取 CLAUDE.md 中的编译命令并执行，检查 exit code == 0
- 读取 CLAUDE.md 中的测试命令并执行，检查 exit code == 0 且 tests > 0
- 读取 CLAUDE.md 中的 lint 命令并执行，检查 exit code == 0

**阶段 05（测试编写）：**
- git diff --name-only HEAD~N 中包含 test 相关文件
- 执行测试命令，检查新增测试通过

**阶段 07（代码推送）：**
- git status --short 为空
- git log origin/{branch} 有新 commit

**阶段 08（CI 验证）：**
- 执行所有 CLAUDE.md 验证命令
- 检查 exit code == 0
- 解析测试输出：tests > 0 && passed == total

**阶段 09（部署验证）：**
- 健康检查端点返回 200（如果配置了健康检查 URL）
- 或检查部署状态命令输出包含成功关键词

**通用逻辑：**
- 所有检查通过 → 创建 `.xyz-harness/gate/stage-{NN}.pass`，内容为时间戳 + 检查项摘要
- 任一检查失败 → 输出失败项 + 原因，exit code 1

- [ ] **Step 2：实现 gate-script.sh**

- [ ] **Step 3：测试**

手动测试各阶段分支的检查逻辑。

- [ ] **Step 4：Commit**

```bash
git add skills/xyz-harness-dev-flow/scripts/
git commit -m "feat: add gate-script.sh for L1 mandatory checks"
```

---

## Spec 覆盖度自检

| Spec 要求 | 对应 Task |
|-----------|----------|
| 从 superpowers 提取 5 个 skill | Task 1 |
| 适配 prompt 模板 | Task 2 |
| 新建 expert-reviewer | Task 3 |
| 新建 coding-skill + 分层 Spec | Task 4, 5 |
| 新建 unit-test-write | Task 6 |
| 新建 deploy-verify | Task 7 |
| dev-flow 编排器 | Task 8, 9 |
| install.py + 清理旧版 | Task 10 |
| README | Task 11 |
| xyz-harness- 前缀 | 所有 Task |
| loop_task_tracker | Task 8（dev-flow SKILL.md） |
| gate-checker subagent | Task 9（阶段描述） |
| 5 个人工确认点 | Task 9（阶段描述） |
| 回退路由表 | Task 9（阶段描述） |
| 上下文三层 | Task 8（dev-flow SKILL.md） |
| L1 gate 脚本 | Task 12 |
| .xyz-harness/ 目录 | Task 8（dev-flow SKILL.md 中引用） |
| 阶段 ⑪ 复盘 | Task 9（阶段描述） |
| 运行指标记录 | Task 9（阶段⑪描述中） |
| 跨需求聚合（手动触发） | Task 8（dev-flow 中说明触发方式） |
