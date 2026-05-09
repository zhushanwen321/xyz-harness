# Harness Engineering 故障排除指南

---

## 目录

- [dev-flow 启动问题](#dev-flow-启动问题)
- [阶段执行失败](#阶段执行失败)
- [subagent 问题](#subagent-问题)
- [gate 门禁失败](#gate-门禁失败)
- [评审循环超限](#评审循环超限)
- [回退处理](#回退处理)
- [LLM Token 和成本控制](#llm-token-和成本控制)
- [常见陷阱](#常见陷阱)

---

## dev-flow 启动问题

### 项目没有 CLAUDE.md

**现象：** 启动 dev-flow 后，前置检查发现项目没有 CLAUDE.md。

**处理方式：**
- dev-flow 会自动提示运行 `xyz-harness-init` skill 完成初始化
- 如手动处理，复制参考模板：
  ```bash
  cp <harness-root>/skills/xyz-harness-dev-flow/references/claude-md-template.md ./CLAUDE.md
  ```
- **至少填写「质量门禁」章节**，否则 gate 脚本无法执行

### CLAUDE.md 缺少必需章节

**现象：** dev-flow 提示 "CLAUDE.md 缺少以下必需章节：\[列出缺失项\]"。

**处理方式：**
- 运行 `xyz-harness-init` skill 交互式补全
- 或手动编辑 CLAUDE.md 补充缺失章节
- 最少必需章节：项目背景、技术栈、模块结构、架构约束、编码规范、测试规范、质量门禁

### 不在 worktree 中

**现象：** 当前不在 git worktree 中，dev-flow 建议创建 worktree。

**处理方式：**
- 输入 "创建 worktree" 触发 `create-worktree` skill
- 或在项目 workspace 中手动创建：
  ```bash
  cd <workspace-root>
  git worktree add <分支名> -b <分支名> origin/main
  ```

---

## 阶段执行失败

### subagent 连续返回 BLOCKED

**现象：** 某个 subagent 连续 2 次返回 BLOCKED 状态。

**处理方式：**
1. 主 agent 会自动暂停并向用户展示原因
2. 典型原因：
   - 任务太大 → 拆分为更小的 task
   - 上下文不足 → 补充 spec 细节或项目背景
   - 技术障碍 → 需要人工判断方案
3. 用户提供补充信息或更改方案后，重新派遣

### subagent 返回 NEEDS_CONTEXT

**现象：** TDD coder 或 executor 返回 NEEDS_CONTEXT，表示缺少必要信息。

**处理方式：**
1. 主 agent 检查返回信息中缺少什么
2. 补充缺失的上下文（spec 章节、接口定义、测试框架配置等）
3. 重新派遣同一 subagent，再次返回 NEEDS_CONTEXT 则升级到用户

### 编译/测试/Lint 失败

**现象：** 阶段 ③、⑤、⑧ 的 L1 gate 检查发现编译错误、测试失败或 lint 错误。

**处理方式：**
| 失败类型 | 可能原因 | 处理 |
|---------|---------|------|
| 编译错误 | 实现代码语法错误、类型不匹配 | 回退到阶段 ③ 修复代码 |
| 测试失败 | 测试逻辑错误、实现不满足测试 | 回退到阶段 ③ 修复代码 |
| 测试数 = 0 | TDD 测试未编写 | 回退到阶段 ⑤ 编写测试 |
| Lint 失败 | 代码风格不符合项目规范 | 回退到阶段 ③ 修复代码 |

---

## Subagent 问题

### subagent 并发限制

**现象：** 派遣 subagent 时出现 "too many concurrent subagents" 或类似错误。

**原因：** Pi 限制同一时间执行的 subagent 不超过 5 个。阶段 ③ 的主 agent 是按 task 串行派遣的（TDD coder → executor → reviewer），每个 task 完成后才进入下一个，所以不会触发此限制。

**如果出现此问题：**
- 检查是否有其他阶段的任务在同时运行
- 等待前一个 subagent 完成后再派新的
- dev-flow 的设计是串行调度，不应出现并发超限

### subagent 工具权限不足

**现象：** subagent 无法执行所需操作（如读文件、编辑代码）。

**处理方式：**
- 检查 agent 的 `tools` 字段是否正确配置
- `harness-executor` 需要 `read, edit, write, bash`
- `harness-tdd-coder` 需要 `read, edit, write, bash`
- `harness-reviewer` 需要 `read, bash`
- `harness-gate-checker` 需要 `read, bash`

### subagent 超时

**现象：** subagent 长时间无响应。

**可能原因：**
- 模型推理时间过长（复杂任务用 glm-5.1 可能更慢）
- token 输出限制（LLM 超出 max_tokens）

**处理方式：**
- 复杂 task 分拆为更小的子 task
- 检查 prompt 内容是否过长
- 通过 CLAUDE.md 的「Harness Agent 覆盖」章节调整模型

---

## Gate 门禁失败

### L1 脚本检查失败

**现象：** `gate-script.sh` 返回 exit code != 0。

**查看失败原因：**
```bash
# 重新运行 gate 脚本查看具体失败项
bash <harness-root>/skills/xyz-harness-dev-flow/scripts/gate-script.sh <阶段号> <项目根目录>
```

**常见失败原因：**
- **文件不存在：** 检查交付物路径是否正确
- **编译失败：** 检查 CLAUDE.md 中的编译命令是否正确
- **测试失败：** 检查测试命令和测试代码
- **Lint 失败：** 运行 lint 命令查看具体错误

### L2 subagent 门禁失败

**现象：** gate-checker subagent 返回 fail。

**处理方式：**
- 查看 gate-checker 返回的 `reason` 字段，列出未通过的检查项
- 按回退路由表处理（gate-checker agent 的检查清单中有明确说明）

### L1 pass 但 L2 未通过

**现象：** gate-script.sh 通过（生成了 `.pass` 文件），但 gate-checker subagent 发现内容问题。

**原因：** 设计如此。L1 检查可程序化验证的事项（文件存在性、编译、测试），L2 检查需要判断力的事项（内容质量、架构合规）。

**处理方式：** 按 L2 失败处理，以 L2 结果为准。

---

## 评审循环超限

### 需求评审超过 3 轮

**现象：** 阶段 ② 评审轮次超过 3 轮上限。

**处理方式：**
- 主 agent 暂停，展示最后评审报告和未解决的 MUST FIX
- 用户选择：继续评审 / 接受当前状态 / 回退到阶段 ①
- 正常情况下不应出现，如果频繁出现说明 spec 或需求不清晰

### 编码/测试评审超过 2 轮

**现象：** 阶段 ④ 或 ⑥ 评审轮次超过 2 轮上限。

**处理方式：**
- 同需求评审超限处理方式
- 频繁出现说明代码质量或测试质量有系统性问题

---

## 回退处理

### 回退后 tracker 不一致

**现象：** 回退后 `loop_task_tracker` 显示的状态与实际进度不符。

**处理方式：**
- dev-flow 在回退时会自动重置 tracker：
  1. 识别回退目标阶段 N
  2. 将 tracker 中阶段 N 及之后所有阶段重置为未完成
  3. 清除 `.xyz-harness/gate/` 中被重置阶段的 `.pass` 标记文件
  4. 重新派遣执行 subagent 从阶段 N 开始
- 如果手动操作导致不一致，使用 `list_tasks` 查看当前状态，联系用户确认

### 频繁回退

**现象：** 某个需求经历多次回退（3 次以上）。

**可能原因：**
- 需求本身不清楚 → 阶段 ① 需要更深入的 brainstorming
- CLAUDE.md 规则不完善 → AI 反复做出错误的架构决策
- task 拆分过大 → subagent 一次性 handle 不了

**建议：**
- 复盘阶段会自动分析回退根因
- 如果 CLAUDE.md 缺少规则，补充后再重试

---

## LLM Token 和成本控制

### Token 消耗过高

**现象：** 单次需求消耗大量 token（超过预期）。

**可能原因：**
- 任务拆分不够细，单个 task 的 prompt 过长
- 回退次数过多导致重复工作
- 使用了 glm-5.1 处理简单任务（应使用 glm-5-turbo）

**优化建议：**
- 简单 task（1-2 文件、清晰 spec）使用 `glm-5-turbo`
- task 尽量拆小（单次修改 ≤ 3 个文件、≤ 1000 行）
- 减少回退：确保 spec 足够清晰再进入阶段 ③

### Subagent "完美主义"

**现象：** subagent 花费大量 token 修改非问题代码、做不必要的重构。

**处理方式：**
- `harness-executor` 的 prompt 强调 "最小实现，不做额外优化"
- spec-reviewer 会检查是否做了 spec 之外的事
- 编码评审（阶段 ④）也会审查是否做了不必要的工作

---

## 常见陷阱

### TDD coder 写了通过测试

**现象：** TDD coder 提交的测试在实现代码不存在时 PASS（不应发生）。

**原因：** TDD coder 测试了已有功能而非新功能。

**处理方式：**
- 在 prompt 中明确告诉 TDD coder 要测试哪些新接口/函数
- TDD coder 的工作流程要求在提交前确认测试 FAIL
- 如果主 agent 发现测试 PASS，应重新派遣 TDD coder

### Executor 修改了测试文件

**现象：** executor 修改了 TDD coder 写的测试文件。

**原因：** executor 觉得测试不合理，试图"优化"测试。

**处理方式：**
- executor 的 prompt 明确禁止修改测试文件
- spec-reviewer 会验证测试文件未被修改
- 如果发生，重新派遣 TDD coder 恢复测试文件，重新派遣 executor

### Spec 合规检查与编码评审混淆

**现象：** spec-reviewer（task 级）和 expert-reviewer（阶段 ④）各自发现了类似问题。

**原因：** 两个评审职责边界不清晰。

**说明：**
- **task 级 spec 合规检查（阶段 ③ 内部）：** 只检查代码是否实现了 spec 要求（有无、多少）
- **编码评审（阶段 ④）：** 检查代码质量、架构合规、安全性能
- 两者互补，不是冗余。spec 合规检查在 task 级快速拦截方向错误，编码评审在阶段 ④ 做全面质量把关

### summary.md 从未被更新

**现象：** 流程结束后 `changes/summary.md` 为空。

**原因：** executor subagent 没有执行 summary.md 更新。

**处理方式：**
- 检查 `harness-executor/agent.md` 是否包含 summary.md 更新指令
- 每次派遣 executor 时，prompt 中应明确要求更新 summary.md
- 手动补全：根据各阶段 subagent 返回的 summary 拼接

### .xyz-harness/gate/ 标记文件缺失

**现象：** gate-checker 报告 `.xyz-harness/gate/stage-{NN}.pass` 不存在。

**可能原因：**
- gate-script.sh 未执行（L1 检查尚未运行）
- 目录被误清理
- 当前需求是新开始的，旧标记尚未生成

**处理方式：**
- 检查 gate-script.sh 是否正确执行
- 重新运行 L1 检查：`bash scripts/gate-script.sh <阶段号> <项目根目录>`
- 目录存在但标记文件缺失 → 说明 L1 未通过，查看脚本输出

---

## 快速诊断命令

```bash
# 查看当前 gate 标记状态
ls -la .xyz-harness/gate/

# 手动运行 gate 脚本调试
bash <harness-root>/skills/xyz-harness-dev-flow/scripts/gate-script.sh <阶段号> $(pwd)

# 查看项目 CLAUDE.md 完整性
grep -c '## 质量门禁' CLAUDE.md
grep -c '## 架构约束' CLAUDE.md

# 检查 agent 安装状态
ls -la ~/.pi/agent/agents/harness-*
ls -la ~/.pi/agent/skills/xyz-harness-*

# 查看 metrics 记录
cat .xyz-harness/metrics/*.json 2>/dev/null

# 查看最近提交和未推送变更
git log --oneline -5
git status --short
```
