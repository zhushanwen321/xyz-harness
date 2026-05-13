# 11 阶段执行逻辑详细设计

> 本文档定义 dev-flow 编排器在每个阶段的具体调度流程。主 agent 只做调度(tracker + subagent 派遣 + 确认点),不直接执行任何业务逻辑。

---

## 通用调度模式

每个阶段遵循相同的调度流程。**主 agent 不关心具体执行内容**,只关心:投入(输入)、产出(交付物)、执行状态(pass/fail)。

```
主 agent(纯调度器,不读交付物内容,不修改任何文件)
  │
  ├─ 1. 派遣 执行/评审 subagent
  │     输入:阶段号 + 必要的文件路径(不传文件内容)
  │     ├─ subagent 内部先检查入口条件,不满足 → 返回 {status: fail, reason: "..."}
  │     ├─ 满足 → 执行 → 产出交付物
  │     └─ 返回:{status: done|fail|blocked, deliverables: [路径列表], summary: "一句话摘要"}
  │
  ├─ 1.5 L1 脚本强制检查(仅适用于有 L1 门禁的阶段)
  │     运行:gate-script.sh {stage} {deliverable_paths}
  │     ├─ 脚本检查:文件存在性、编译、测试、lint 等可程序化验证的项
  │     ├─ 通过 → 生成 .xyz-harness/gate/stage-{N}.pass
  │     └─ 不通过 → 直接 fail(不进入 L2 subagent 检查)
  │     返回:{status: pass|fail, checks: [{name, pass, output}], reason: "..."}
  │
  ├─ 2. 派遣 门禁 subagent
  │     输入:阶段号 + deliverables 路径列表
  │     ├─ 门禁 subagent 自己读取交付物并检查
  │     └─ 返回:{status: pass|fail, reason: "...", rollback_target: N}
  │
  ├─ 3. 门禁通过 → complete_task(N)
  │   门禁失败 → 按回退路由处理
  │
  └─ 4. 检查是否有人工确认点
        ├─ 有 → 暂停,透传 subagent.summary 给用户,等待决策
        │        用户说"修改" → 将用户意见作为输入重新派遣 subagent
        └─ 无 → 进入下一阶段
```

### L1/L2 门禁说明

- **L1 脚本检查**:可程序化验证的项(文件存在性、编译、测试、lint 等),由 `gate-script.sh` 执行
- **L2 subagent 检查**:需要判断力的项(内容质量、架构合规、spec 覆盖度等),由门禁 subagent 执行

**L1 适用于**:135789(可程序化验证的阶段)
**L1 不适用于**:2461011(需要判断力的阶段,只有 L2 subagent 检查)

**执行顺序**:主 agent 先执行 L1(如果适用),L1 通过后再执行 L2。

### Subagent 返回值格式

所有 subagent(执行/评审/门禁)统一返回:

```json
{
  "status": "done | fail | blocked | pass",
  "deliverables": ["path/to/file1.md", "path/to/file2"],
  "summary": "一句话摘要,供主 agent 在确认点透传给用户",
  "reason": "失败原因(status=fail 时必填)",
  "rollback_target": 3
}
```

### Subagent 统一说明

| 角色 | 复用 Agent | 工具权限 | 模型 |
|------|-----------|---------|------|
| 执行 subagent | code-fixer | read, edit, write, bash | 简单任务 glm-5-turbo,复杂 glm-5.1 |
| 评审 subagent | code-reviewer | read, bash | glm-5.1 |
| 门禁 subagent | code-reviewer | read, bash | glm-5.1 |

---

## 阶段 ① 需求分析（交互阶段 — 主 agent 直接执行）

**本阶段由主 agent 直接执行，不派遣 subagent。**

原因：brainstorming 需要逐一向用户提问澄清需求，subagent 是非交互子进程，无法与用户对话。主 agent 直接执行可以保持原生交互体验。

### 主 agent 执行流程：

1. **执行 brainstorming skill**
   - 读取项目 CLAUDE.md，理解项目背景
   - 浏览项目文件结构
   - 逐一向用户提问（每次一个问题，优先多选）
   - 提出 2-3 个方案及 trade-off
   - 逐节呈现设计，每节确认
   - 产出 spec.md

2. **执行 writing-plans skill**
   - 基于 spec.md 规划文件结构
   - **评估复杂度等级（L1/L2）**——5 个维度（领域/存储/数据流/API/非功能性），任一命中 L2 则整体 L2
   - 拆分为 bite-sized task，每个 task 标注类型（frontend/backend）
   - L1：产出单文件 plan.md
   - L2：产出 plan.md 总纲（目标、架构概述、task 列表、子文档索引）

3. **L2 并行设计（仅 L2 复杂度时执行）**

   如果评估为 L2，在 plan.md 总纲产出后执行：

   **步骤 A：并行派遣设计 subagent**
   | 子步骤 | Agent | 输入 | 输出 |
   |--------|-------|------|------|
   | A-1 后端设计 | harness-backend-planner | spec.md + plan.md 总纲 + CLAUDE.md + 项目代码 | plan-backend.md + plan-api-contract.md + 更新 docs/architecture.md |
   | A-2 前端设计 | harness-frontend-planner | spec.md + plan.md 总纲 + CLAUDE.md | plan-frontend.md |

   A-1 和 A-2 并行执行。

   **步骤 B：API 对齐**（A-1 和 A-2 都完成后）
   | 子步骤 | Agent | 输入 | 输出 |
   |--------|-------|------|------|
   | B API 对齐 | harness-api-alignment | plan-api-contract.md + plan-frontend.md + plan-backend.md | 更新 plan-frontend.md + api-alignment-report.md |

   harness-api-alignment 以后端 API 合约为准修正前端设计。如果发现后端遗漏 API，报告给主 agent。

   **步骤 C：汇总**
   确认所有子文档就绪，更新 plan.md 总纲的子文档索引。

   **L1 不需要上述额外步骤。**

4. **初始化变更追溯**
   - 创建 `.superpowers/{主题}/changes/summary.md`
   - 创建 `.xyz-harness/gate/` 目录
   - 阶段 ① 状态标记为进行中

5. **交付物：**
   - `.superpowers/{主题}/spec.md`
   - `.superpowers/{主题}/plan.md`
   - `.superpowers/{主题}/plan-backend.md`（L2 时）
   - `.superpowers/{主题}/plan-api-contract.md`（L2 时）
   - `.superpowers/{主题}/plan-frontend.md`（L2 时）
   - `.superpowers/{主题}/changes/summary.md`

### 交互完成后：L1 脚本检查 + compaction

1. 运行 `gate-script.sh 01 {project_root} {spec_path} {plan_path}`
2. 脚本通过 → 生成 `.xyz-harness/gate/stage-01.pass`
3. **执行 compaction**（清理交互阶段的对话历史，保持后续调度上下文干净）
4. `complete_task(1)`

### 人工确认点1：需求待决议确认

**确认点展示（主 agent 基于交互结果）：**
```
阶段① 需求分析完成。

设计文档：{spec_path}
实现计划：{plan_path}

摘要：
- 目标：[spec.md 中的一句话目标]
- 方案：[选定的方案]
- 影响范围：[涉及的文件/模块]
- 任务数量：[plan.md 中的 task 数]
- 待决议项：[列出 spec 中的待决议项，如有]

请确认：
1. 确认 — 进入需求评审
2. 有修改意见 — 告诉我改什么
3. 方向不对 — 重新讨论
```

**流转规则：**
- 确认 → 进入阶段 ②（自动阶段，开始 subagent 模式）
- 有修改意见 → 直接修改 spec/plan → 重新展示
- 方向不对 → 回到提问环节

---

## 阶段 2 需求评审

### 1. 派遣评审 subagent

**L1 复杂度（单文件 plan.md）：**

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(计划评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md 路径 + plan.md 路径 + 项目根目录 |

**L2 复杂度（并行评审）：**

同时派遣两个评审 subagent：

| 角色 | Agent | 输入 |
|------|-------|------|
| 后端设计评审 | harness-backend-plan-reviewer | spec.md + plan-backend.md + plan-api-contract.md + 项目根目录 |
| 前端+整体评审 | code-reviewer | spec.md + plan.md + plan-frontend.md + 项目根目录 |

两个评审并行执行。主 agent 收集结果后汇总所有 MUST FIX。

**subagent 入口条件检查:**
- spec.md 存在
- plan.md 存在
- 阶段 1 已确认(用户已回复确认)

**subagent 执行逻辑:**
1. 读取 spec.md 和 plan.md（L2 时加读 plan-backend.md / plan-frontend.md / plan-api-contract.md）
2. 读取项目 CLAUDE.md 中的架构约束和编码规范
3. 执行评审:
   - spec 完整性检查(目标明确?范围合理?验收标准可量化?)
   - plan 可行性检查(任务拆分合理?依赖关系正确?工作量估算现实?)
   - spec 与 plan 一致性检查(plan 是否覆盖 spec 所有需求?)
   - L1 时：后端设计充分性检查（详见 expert-reviewer skill）
   - L2 时：后端评审由 harness-backend-plan-reviewer 独立执行
4. 产出评审报告,每条意见标注优先级(MUST FIX / LOW / INFO)
5. 写入 `changes/reviews/plan_review_v1.md`（L2 时加写 `backend_plan_review_v1.md`）

**交付物:**
- `.superpowers/{主题}/changes/reviews/plan_review_v1.md` - 评审报告

### 2. 派遣 门禁 subagent

**检查项:**
1. `plan_review_vN.md` 存在且非空
2. 评审报告中无未解决的 MUST FIX 项(或有修复确认记录)
3. 评审轮次 ≤ 3

**返回:** pass → 继续;fail(回退1, MUST FIX 未解决) → 主 agent 将 fail.reason 传给执行 subagent,重新派遣修改 spec/plan

### 3. complete_task(2)

### 4. 人工确认点2:计划评审后确认

**确认点展示(主 agent 透传 subagent.summary):**
```
阶段2 需求评审完成。

评审报告:{deliverables[0]}

{subagent.summary}

请确认:
1. 确认 - 进入编码实现
2. 有修改意见 - 告诉我改什么
3. 计划不合理 - 回到需求分析
```

**流转规则:**
- 确认 → 进入阶段 3
- 有修改意见 → 将用户意见作为输入,重新派遣执行 subagent 修改 spec/plan,修改后再派遣评审 subagent
- 计划不合理 → 回退到阶段 1

---

## 阶段 3 编码实现

### 1.5 L1 脚本检查

运行:`gate-script.sh 03 {项目根目录}`
- 编译/类型检查通过(运行 CLAUDE.md 中的编译命令)
- 测试通过且 tests > 0
- Lint 通过
- 通过 → 生成 .xyz-harness/gate/stage-03.pass

### 1. 派遣 执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-subagent-driven-development, xyz-harness-coding-skill, xyz-harness-test-driven-development |
| 模型 | glm-5.1(阶段级调度) |
| 输入 | spec.md 路径 + plan.md 路径 + 项目根目录 |

**subagent 入口条件检查:**
- spec.md + plan.md 存在
- 阶段 2 已通过且用户已确认

**subagent 执行逻辑:**

subagent-driven-development 内部按 plan.md 中的 task 逐个执行。对每个 task:

1. **派遣 task 级编码 subagent**(code-fixer, 模型按任务复杂度选择)
   - 加载 coding-skill(L2 阶段常驻)
   - 加载 test-driven-development(TDD 红绿重构)
   - 输入:task 描述 + spec 相关章节 + CLAUDE.md
   - 执行:写失败测试 → 确认失败 → 最小实现 → 确认通过 → 提交

2. **派遣 task 级 spec 合规检查 subagent**(code-reviewer, glm-5.1)
   - 加载 spec-reviewer-prompt 模板
   - 输入:spec 相关章节 + 当前 task 的代码 diff(不看编码过程历史)
   - 检查:代码是否实现了 spec 要求
   - 不通过 → 编码 subagent 修复 → 重审

3. **所有 task 完成后** → 产出完成报告

**交付物:**
- 代码变更(已 git commit)
- TDD 单元测试(函数/类级)

### 2. 派遣 门禁 subagent

**检查项:**
1. plan.md 中所有 task 对应的代码变更已提交(git log 检查)
2. 编译/类型检查通过(运行 CLAUDE.md 中的编译命令)
3. TDD 单元测试通过(运行测试命令,tests > 0 && passed == total)
4. 无残留 TODO / FIXME / placeholder

**返回:** pass → 继续;fail(回退3, 具体失败项) → 重新派遣执行 subagent 修复

### 3. complete_task(3)

### 4. 人工确认点:无

编码实现完成后自动进入阶段 4 编码评审。

---

## 阶段 4 编码评审

### 1. 派遣 评审 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(执行评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff(阶段 3 的全部代码变更) + 项目根目录 |

**subagent 入口条件检查:**
- 阶段 3 门禁通过
- git diff 有内容(确实有代码变更)

**subagent 执行逻辑:**
1. 读取 spec.md + plan.md(不继承阶段 3 编码 subagent 的上下文)
2. 读取 CLAUDE.md 中的编码规范
3. 读取 git diff(只看变更内容,不看编码过程)
4. 执行 expert-reviewer 执行评审模式:
   - spec 合规(代码是否实现了 spec 所有要求)
   - 代码质量(可读性、错误处理、边界条件)
   - 架构合规(是否违反 CLAUDE.md 中的架构约束)
   - 安全和性能
5. 每条意见标注 MUST FIX / LOW / INFO
6. 写入 `changes/reviews/code_review_v1.md`

**交付物:**
- `.superpowers/{主题}/changes/reviews/code_review_vN.md` - 编码评审报告

### 2. 派遣 门禁 subagent

**检查项:**
1. `code_review_vN.md` 存在且非空
2. 无未解决的 MUST FIX 项
3. 评审轮次 ≤ 2

**返回:** pass → 继续;fail(回退3, MUST FIX 列表) → 主 agent 将 fail.reason 传给执行 subagent,重新派遣编码 subagent 修复

### 3. complete_task(4)

### 4. 人工确认点3:编码评审后确认

**确认点展示(主 agent 透传 subagent.summary):**
```
阶段4 编码评审完成。

评审报告:{deliverables[0]}

{subagent.summary}

请确认:
1. 确认 - 进入单元测试编写
2. 有修改意见 - 告诉我改什么
3. 实现不符合预期 - 回到编码实现
```

**流转规则:**
- 确认 → 进入阶段 5
- 有修改意见 → 将用户意见作为输入,重新派遣执行 subagent 修改代码,修改后再派遣评审 subagent
- 实现不符合预期 → 回退到阶段 3

---

## 阶段 5 单元测试编写

### 1.5 L1 脚本检查

运行:`gate-script.sh 05 {项目根目录}`
- 新增测试文件存在(git diff --name-only 中有 test 相关文件)
- 新增测试通过
- 通过 → 生成 .xyz-harness/gate/stage-05.pass

### 1. 派遣 执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-unit-test-write |
| 模型 | glm-5.1 |
| 输入 | spec.md + plan.md + git diff(阶段 3 代码变更) + 项目根目录 |

**subagent 入口条件检查:**
- 阶段 4 门禁通过且用户已确认
- 代码变更存在(有变更才能写接口级测试)

**subagent 执行逻辑:**
1. 分析 git diff,识别所有变更的接口/API
2. 对每个变更接口:
   - 编写接口级测试(正常路径 + 边界条件 + 异常路径)
   - 优先使用真实数据构造用例(如果项目有数据源配置)
3. 运行测试确认通过
4. 提交测试代码

**交付物:**
- 接口级测试文件(已 git commit)

### 2. 派遣 门禁 subagent

**检查项:**
1. 新增测试文件存在
2. 新增测试数 > 0
3. 所有新增测试通过
4. 测试覆盖了 spec 中的关键验收标准

**返回:** pass → 继续;fail(回退5) → 修复测试;fail(回退3, 代码不可测试) → 回退到编码实现重构

### 3. complete_task(5)

### 4. 人工确认点:无

自动进入阶段 6 测试评审。

---

## 阶段 6 单元测试评审

### 1. 派遣 评审 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | xyz-harness-expert-reviewer(执行评审模式) |
| 模型 | glm-5.1 |
| 输入 | spec.md + 阶段 5 的测试代码 diff + 项目根目录 |

**subagent 入口条件检查:**
- 阶段 5 门禁通过
- 测试代码 diff 有内容

**subagent 执行逻辑:**
1. 读取 spec.md(不继承阶段 5 的执行上下文)
2. 读取测试代码 diff
3. 执行 expert-reviewer 执行评审模式(测试评审视角):
   - 测试覆盖度(关键场景是否覆盖)
   - 测试质量(断言是否充分、是否测试了正确的东西)
   - 测试可维护性(是否过于脆弱)
   - 数据构造合理性
4. 每条意见标注 MUST FIX / LOW / INFO
5. 写入 `changes/reviews/test_review_v1.md`

**交付物:**
- `.superpowers/{主题}/changes/reviews/test_review_vN.md` - 测试评审报告

### 2. 派遣 门禁 subagent

**检查项:**
1. `test_review_vN.md` 存在且非空
2. 无未解决的 MUST FIX 项
3. 评审轮次 ≤ 2

**返回:** pass → 继续;fail(回退5, MUST FIX 列表) → 重新派遣测试编写 subagent 修复

### 3. complete_task(6)

### 4. 人工确认点:无

自动进入阶段 7 代码推送。

---

## 阶段 7 代码推送

### 1.5 L1 脚本检查

运行:`gate-script.sh 07 {项目根目录} {分支名}`
- git status --short 为空(无未提交变更)
- git log origin/{branch} 有新 commit(push 成功)
- 通过 → 生成 .xyz-harness/gate/stage-07.pass

### 1. 派遣 执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | zcommit(全局 skill,不加前缀) |
| 模型 | glm-5-turbo |
| 输入 | 项目根目录 + 分支名 |

**subagent 入口条件检查:**
- 阶段 6 门禁通过
- 有未提交的变更或未推送的 commit

**subagent 执行逻辑:**
1. 分析变更范围(git status --short)
2. 生成 commit message
3. git add + git commit(如果尚未提交)
4. git push -u origin {branch}

**交付物:**
- git push 成功
- 远端分支有新 commit

### 2. 派遣 门禁 subagent

**检查项:**
1. 本地无未提交变更(git status --short 为空)
2. push 成功(git log origin/{branch} 有新 commit)

**返回:** pass → 继续;fail(修复重试) → 修复权限/网络问题后重试 push

### 3. complete_task(7)

### 4. 人工确认点:无

自动进入阶段 8 CI 验证。

---

## 阶段 8 CI 验证

### 1.5 L1 脚本检查

运行:`gate-script.sh 08 {项目根目录}`
- 运行 CLAUDE.md 中所有验证命令
- 所有命令 exit code == 0
- 测试数 > 0 且 passed == total
- 通过 → 生成 .xyz-harness/gate/stage-08.pass

### 1. 派遣 执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-verification-before-completion |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + CLAUDE.md 中的验证命令 |

**subagent 入口条件检查:**
- 阶段 7 门禁通过
- 代码已推送到远端

**subagent 执行逻辑:**
1. 读取 CLAUDE.md 中的质量门禁章节
2. 依次执行所有验证命令(编译、类型检查、lint、测试)
3. 对每条命令:运行 → 读完整输出 → 检查 exit code → 记录结果
4. 如有 CI 配置(.github/workflows/ 等),触发 CI 并等待结果
5. 将所有验证输出写入 `changes/evidence/verification_output.md`
6. CI 结果写入 `changes/evidence/ci_result.md`

**门禁条件(硬编码,不可跳过):**
- 编译:exit code == 0
- 测试:exit code == 0 **且** test count > 0 **且** failures == 0
- Lint:exit code == 0

**交付物:**
- `changes/evidence/verification_output.md` - 本地验证输出
- `changes/evidence/ci_result.md` - CI 结果(如有)

### 2. 派遣 门禁 subagent

**检查项:**
1. `verification_output.md` 存在
2. 所有本地验证命令 exit code == 0
3. 测试数 > 0 且 passed == total
4. CI 结果:status == SUCCESS(如有 CI)

**返回:**
- pass → 继续
- fail(回退5, 测试数=0) → 测试未实际运行
- fail(回退3, 编译错误) → 编译问题
- fail(回退3或5, 测试失败) → 按错误类型判断

### 3. complete_task(8)

### 4. 人工确认点:无

自动进入确认点4。

---

## 确认点4:部署目标确认

**位置:** 阶段 8 门禁通过后,阶段 9 开始前。

**确认点展示(主 agent 透传 subagent.summary):**
```
阶段8 CI 验证通过。

验证结果:{deliverables[0]}
CI 结果:{deliverables[1]}

{subagent.summary}

即将进入部署验证。请确认部署目标:
1. 确认 - 部署到目标环境
2. 修改目标 - 告诉我部署到哪里
3. 暂不部署 - 等一下再继续
```

**流转规则:**
- 确认 → 进入阶段 9
- 修改目标 → 更新配置 → 重新展示
- 暂不部署 → 暂停,等待用户回来

---

## 阶段 9 部署验证

### 1.5 L1 脚本检查

运行:`gate-script.sh 09 {项目根目录}`
- 健康检查端点返回 200(如果项目配置了健康检查)
- 通过 → 生成 .xyz-harness/gate/stage-09.pass

### 1. 派遣 执行 subagent

| 项目 | 值 |
|------|---|
| Agent | code-fixer |
| 加载 Skill | xyz-harness-deploy-verify |
| 模型 | glm-5.1 |
| 输入 | 项目根目录 + 部署目标环境 + 部署方式 |

**subagent 入口条件检查:**
- 阶段 8 门禁通过
- 用户已确认部署目标
- 部署命令/脚本存在

**subagent 执行逻辑:**
1. 读取部署配置(从 CLAUDE.md 或项目配置文件)
2. 执行部署命令
3. 等待部署完成
4. 执行健康检查(HTTP 探测、关键接口可达性)
5. 记录部署结果到 `changes/evidence/deploy_result.md`

**交付物:**
- 部署成功
- `changes/evidence/deploy_result.md` - 部署结果

### 2. 派遣 门禁 subagent

**检查项:**
1. `deploy_result.md` 存在
2. 部署状态为成功
3. 健康检查通过

**返回:** pass → 继续;fail(回退3, 部署失败原因) → 代码问题回退编码;fail(配置修复) → 修复配置后重试

### 3. complete_task(9)

### 4. 人工确认点:无

自动进入阶段 10。

---

## 阶段 10 用户最终确认

本阶段由主 agent 直接处理,不派遣 subagent。主 agent 只透传各阶段 subagent 返回的 summary,不读取交付物内容。

### 主 agent 执行逻辑:

1. 更新 loop_task_tracker:所有阶段标记为完成
2. 向用户展示最终交付确认(基于各阶段 subagent 返回的 summary 拼接):

```
全部 11 阶段完成。

需求:[用户原始需求描述]
变更追溯:.superpowers/{主题}/changes/summary.md

阶段完成情况(基于各阶段 subagent.summary):
1 {阶段1 summary}
2 {阶段2 summary}
3 {阶段3 summary}
...
9 {阶段9 summary}

请确认最终交付:
1. 确认完成 - 进入合并流程
2. 需求不符 - 回到需求分析(说明哪里不符)
3. 实现有问题 - 回到编码实现(说明什么问题)
```

### 流转规则:
- 确认完成 → 触发 merge-worktree(合并 → 发布 → 清理)
- 需求不符 → 回退到阶段 1(更新 loop_task_tracker,重置 1 及后续)
- 实现有问题 → 回退到阶段 3(更新 loop_task_tracker,重置 3 及后续)

---

## 阶段 11 自动复盘

本阶段自动执行,不需要人工确认。

### 1. 派遣 复盘 subagent

| 项目 | 值 |
|------|---|
| Agent | code-reviewer |
| 加载 Skill | 无(通用分析能力) |
| 模型 | glm-5.1 |
| 输入 | summary.md + 各阶段评审报告路径 + 回退记录 + .xyz-harness/metrics/ |

**subagent 入口条件检查:**
- 阶段 10 用户已确认完成
- summary.md 存在

**subagent 执行逻辑:**
1. 读取 summary.md,了解完整流程状态
2. 读取各阶段评审报告(reviews/ 目录)
3. 读取 .xyz-harness/metrics/ 中的指标数据
4. 分析:
   a. 哪些阶段发生了回退?根因分类(需求不清/代码问题/测试问题/环境问题)
   b. 评审 agent 是否有效拦截了问题?(评审发现的问题 vs 用户发现的问题)
   c. L1 gate 脚本是否有遗漏?(该拦没拦的场景)
   d. 哪些阶段 AI 犯了不该犯的错?(对照 CLAUDE.md 规则检查)
   e. CLAUDE.md 缺少什么规则?需要新增或修改什么?
5. 产出 retrospective.md

**交付物:**
- `.superpowers/{主题}/changes/retrospective.md` - 复盘报告

### 2. 无门禁检查(复盘结果不影响流程)

### 3. complete_task(11)

### 4. 无人工确认点

### 5. 复盘产出后,主 agent 检查是否有可改进项

如果有 CLAUDE.md 改进建议,主 agent 向用户展示:

```
11 复盘完成。报告:changes/retrospective.md

发现以下可改进项:
1. [问题描述] → 建议新增 CLAUDE.md 规则:[规则]
2. [问题描述] → 建议修改规则:[原规则] → [新规则]

是否采纳?采纳后我会更新 CLAUDE.md。
```

### 6. 运行指标记录

主 agent 将本次需求的所有运行指标汇总写入 `.xyz-harness/metrics/{yyyy-MM-dd}-{需求名}.json`:

```json
{
  "requirement": "需求名称",
  "date": "2026-05-08",
  "total_duration_seconds": 3600,
  "total_tokens": 150000,
  "stages": [
    {"stage": 1, "duration_seconds": 300, "tokens": 15000, "status": "pass", "retries": 0},
    {"stage": 2, "duration_seconds": 120, "tokens": 8000, "status": "pass", "retries": 1}
  ],
  "rollbacks": [
    {"from": 4, "to": 3, "reason": "编码评审 MUST FIX"}
  ],
  "review_effectiveness": {
    "issues_found_by_agent": 5,
    "issues_found_by_user": 1
  }
}
```

---

## 回退时的 tracker 处理

回退发生时,主 agent 需要:

1. 识别回退目标阶段 N
2. 将 tracker 中阶段 N 及之后的所有阶段重置为未完成
3. 重新派遣执行 subagent 从阶段 N 开始

```
例:阶段 4 编码评审不通过 → 回退到 3
  → complete_task(3) 撤销(重新标记为未完成)
  → complete_task(4) 撤销(如果已标记)
  → 重新派遣执行 subagent 从 3 开始
```

---

## 异常处理

### 评审循环超限

当评审轮次超出上限时(需求评审 > 3轮,编码/测试评审 > 2轮):

1. 主 agent 暂停
2. 向用户展示:
   ```
   阶段 {N} 评审已达到轮次上限({N}轮),仍未通过。

   最后一次评审报告:{路径}
   未解决的 MUST FIX:{列出}

   请决策:
   1. 继续评审 - 再给一轮
   2. 接受当前状态 - 跳过评审,进入下一阶段
   3. 回退 - 回到 {回退目标}
   ```

### subagent 返回 blocked

当执行 subagent 连续 2 次返回 blocked:

1. 主 agent 暂停
2. 向用户说明阻塞原因
3. 建议拆分任务、换方案、或人工介入
4. 等待用户决策
