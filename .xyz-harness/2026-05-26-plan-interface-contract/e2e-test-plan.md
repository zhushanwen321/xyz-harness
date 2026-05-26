---
verdict: pass
---

# E2E Test Plan — Plan Interface Contract Enhancement

## Test Scenarios

### Scenario 1: L2 plan 完整接口契约流程 (covers AC-1, AC-3, AC-4, AC-5, AC-6, AC-8)

**Preconditions:**
- 一个真实的 spec.md 存在于 topic 目录
- spec 包含多个 AC（至少 3 个）

**Steps:**
1. 使用更新后的 writing-plans skill 编写 plan.md（complexity: "L2"）
2. 验证 plan.md 包含 Interface Contracts 章节（AC-3）
3. 验证 plan.md 包含 Spec Coverage Matrix（AC-4）
4. 验证 plan.md frontmatter 包含 complexity: "L2"（AC-8）
5. 产出 interface_chain.json
6. 运行 gate-check.py Phase 2 检查
7. 验证 gate 通过（AC-1）
8. dispatch plan review subagent
9. 验证 review 检查了 cross-reference 和一致性（AC-5, AC-6）

**Expected Result:** 所有检查通过，无 GAP。

### Scenario 2: L1 plan 简化接口契约流程 (covers AC-2, AC-3, AC-4, AC-8)

**Preconditions:**
- 一个简单的 spec.md（1-2 个类，3-5 个方法）

**Steps:**
1. 使用更新后的 writing-plans skill 编写 plan.md（complexity: "L1"）
2. 不产出 interface_chain.json
3. 验证 plan.md 包含 Interface Contracts markdown 表（AC-3）
4. 验证 plan.md 包含 Spec Coverage Matrix（AC-4）
5. 运行 gate-check.py Phase 2 检查
6. 验证 gate 通过（AC-2 — 不检查 JSON）

**Expected Result:** Gate 通过，无 interface_chain.json 但 plan.md 有接口表和覆盖矩阵。

### Scenario 3: TDD subagent 消费接口签名 (covers AC-7)

**Preconditions:**
- Phase 2 已完成，plan.md 和 interface_chain.json 已产出

**Steps:**
1. 进入 Phase 3 (dev)
2. 主 agent 构造 TDD coder subagent task prompt
3. 验证 task prompt 包含方法签名（方法名、参数类型、返回类型）

**Expected Result:** subagent 收到明确的接口签名，不需要猜测方法名或参数类型。

### Scenario 4: 向后兼容 — 旧 plan 通过 gate (covers Constraints)

**Preconditions:**
- 一个旧格式的 plan.md（无 complexity 字段，无 interface_chain.json）

**Steps:**
1. 运行 gate-check.py Phase 2 检查
2. 验证 gate 不因缺少 complexity 字段而 FAIL

**Expected Result:** Gate 行为与更新前一致。

## Test Environment

- 项目根目录: `/Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/`
- Gate 脚本: `skills/xyz-harness-gate/scripts/check_gate.py`
- 测试 topic 目录: `.xyz-harness/2026-05-26-plan-interface-contract/`
- Python 3 + PyYAML
