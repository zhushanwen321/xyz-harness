---
verdict: pass
---

# 业务用例 — p0-spec-verification-subagent-prompt

## UC-1: Spec 阶段消除接口假设错误

- **Actor**: 主 agent（Phase 1 spec）
- **Preconditions**: brainstorming skill 已包含 Assumption Audit 步骤
- **Main Flow**:
  1. 用户确认设计方案
  2. 主 agent 进入 Step 5a（Assumption Audit）
  3. 主 agent 提取设计中引用的接口 `setModel` RPC
  4. 主 agent 执行 `grep -rn "setModel" src/` 验证
  5. grep 返回空结果 → 接口不存在
  6. 主 agent 标记假设失败，修正设计或询问用户
- **Alternative Paths**:
  - 4a. grep 返回结果 → 接口存在，标注 `[VERIFIED]` 继续
  - 4b. 无法确定 → 标记 `[UNVERIFIED]`，在 spec 完成后与用户确认
- **Postconditions**: spec.md 中不包含未验证的接口假设
- **Module Boundaries**: 仅涉及 brainstorming skill 的 Step 5a，不影响 Phase 2/3/4/5

## UC-2: Subagent 产出质量保障

- **Actor**: 主 agent（Phase 3 dev）
- **Preconditions**: subagent skill 已包含 Pre-Dispatch Checklist + Prohibition Block
- **Main Flow**:
  1. 主 agent 准备派遣 subagent 实现 `togglePlugin` 功能
  2. 主 agent 执行 Pre-Dispatch Checklist
  3. 从代码 grep 提取 `togglePlugin` 的完整方法签名
  4. 从代码 grep 提取相关枚举值（PluginState）
  5. 从 spec 提取已知约束
  6. 附加 Prohibition Block（6 条禁止事项）
  7. 列出必须产出的文件列表
  8. 全部 5 项满足 → 派遣 subagent
- **Alternative Paths**:
  - 3a. grep 无结果（新方法）→ 从 plan 的接口签名表提取
  - 2a. 任意必填项缺失 → 禁止派遣，补充后重试
- **Postconditions**: subagent 收到信息完整的 task prompt
- **Module Boundaries**: Pre-Dispatch Checklist 在主 agent 侧执行，不影响 subagent 内部流程

## UC-3: 并行 Task placeholder 预防

- **Actor**: 主 agent（Phase 3 dev，Wave 模式）
- **Preconditions**: subagent skill 已包含并行依赖安全检查
- **Main Flow**:
  1. 主 agent 准备 Wave 2（Task 5 + Task 6 并行）
  2. 执行依赖安全检查
  3. 发现 Task 5 引用 Task 6 产出的 `writeSegmentFile` 函数
  4. 依赖检查失败 → 拒绝并行
  5. 将 Task 6 拆到 Wave 1，Task 5 留在 Wave 2
- **Alternative Paths**:
  - 3a. 无接口依赖 → 允许并行
- **Postconditions**: 同一 Wave 内无接口依赖
- **Module Boundaries**: 依赖检查在 Wave 编排时执行，不影响 Group 内部执行
