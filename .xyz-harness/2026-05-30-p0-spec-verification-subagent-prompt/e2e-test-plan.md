---
verdict: pass
---

# E2E Test Plan — p0-spec-verification-subagent-prompt

## Test Scenarios

### TS-1: Assumption Audit 触发与执行

**覆盖 AC:** AC-1
**前置条件:** brainstorming skill 已更新，用户已确认设计

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 启动 Phase 1，完成 Step 1-4（到用户确认设计） | 设计中包含对现有代码的假设（如引用某接口） |
| 2 | 进入 Step 5a | 主 agent 自动提取设计中的代码假设 |
| 3 | 对假设执行 grep/read 验证 | 验证结果：VERIFIED / 失败 / UNVERIFIED |
| 4 | 假设验证失败时修正设计或与用户确认 | 设计更新或用户确认后继续 |
| 5 | 验证通过的假设在 spec 中标注 [VERIFIED] | spec.md 包含 VERIFIED 标记 |

### TS-2: Self-Check Checklist 增强

**覆盖 AC:** AC-2
**前置条件:** spec.md 写完，准备 dispatch review

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 执行 Self-Check Checklist | 包含"代码假设验证"区块 |
| 2 | 对前端 FR 执行组件职责验证 grep | 返回现有组件列表 |
| 3 | 对后端 FR 执行接口签名验证 grep | 返回接口签名或"Not Found" |
| 4 | 存在 UNVERIFIED 标记 | 检查项提示"未与用户确认" |

### TS-3: Pre-Dispatch Checklist 强制执行

**覆盖 AC:** AC-3
**前置条件:** Phase 3 dev，主 agent 准备派遣 subagent

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 构造 task prompt，缺少"完整方法签名" | 禁止派遣，提示补充信息 |
| 2 | 补充方法签名（从代码 grep 提取） | 通过检查项 |
| 3 | 补充全部 5 项必填信息 | 允许派遣 |

### TS-4: Prohibition Block 自动注入

**覆盖 AC:** AC-4
**前置条件:** task prompt 构造完成

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 检查 task prompt 末尾 | 包含标准 6 条禁止事项 |
| 2 | 派遣 subagent | subagent 收到完整 task prompt 含禁止事项 |

### TS-5: Post-Dispatch Verification

**覆盖 AC:** AC-5
**前置条件:** subagent 返回 DONE

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | subagent 返回 DONE | 主 agent 启动验证 |
| 2 | 检查产出文件是否存在 | 文件存在 |
| 3 | 运行 tsc --noEmit | 编译通过（如适用） |
| 4 | 运行 vitest run | 测试通过（如适用） |

### TS-6: 并行依赖安全

**覆盖 AC:** AC-6
**前置条件:** Wave 模式，多个 Group 准备并行

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | Task 5 引用 Task 6 产出的函数 | 依赖扫描发现接口依赖 |
| 2 | 尝试将 Task 5 和 Task 6 放同一 Wave | 拒绝并行 |
| 3 | 将 Task 6 拆到前一个 Wave | Wave 编排更新 |

## Test Environment

- 项目：xyz-harness-engineering（main worktree）
- 运行方式：Auto Mode（coding-workflow 扩展）
- 验证手段：人工阅读 skill 文档 + 模拟 harness run
- 无需额外基础设施（纯 markdown 文件修改）
