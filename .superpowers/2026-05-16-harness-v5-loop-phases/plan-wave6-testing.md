# Wave 6: 测试 + 集成验证

## Task 6.1: Phase 循环单元测试

**文件：**
- 创建：`extensions/coding-workflow/__tests__/g1-phase-loop.test.ts`

- [ ] **步骤 1：写入测试**

```typescript
import { describe, it } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We test the state manager and stage logic directly
import {
  loadState,
  saveState,
  advanceStage,
  restartLoop,
  advancePhase,
  markRetrospectDone,
  createInitialState,
} from "../state-manager.js";
import { getPhaseConfig, getStageList, isLastStage } from "../stages.js";
import type { WorkflowState } from "../types.js";

// Temp directory for test state files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-test-"));
const projectRoot = tmpDir;

// Create minimal .xyz-harness structure
fs.mkdirSync(path.join(tmpDir, ".xyz-harness", "gate"), { recursive: true });

const topicDir = path.join(tmpDir, ".xyz-harness", "2026-05-16-test");

function cleanState(): WorkflowState {
  const s = createInitialState(topicDir);
  return s;
}

describe("Phase Loop — Stage Advancement", () => {
  it("should advance through stages in order", () => {
    const state = cleanState();
    assert.equal(state.loop.currentStageIndex, 0);
    assert.equal(state.loop.loopCount, 0);

    // Phase 1 has 3 stages: brainstorming, write spec, review spec
    const r1 = advanceStage(state, projectRoot);
    assert.equal(r1.state.loop.currentStageIndex, 1);
    assert.equal(r1.shouldCheckGate, false);

    const r2 = advanceStage(state, projectRoot);
    assert.equal(r2.state.loop.currentStageIndex, 2);
    assert.equal(r2.shouldCheckGate, true); // last stage
  });

  it("should detect last stage correctly", () => {
    const state = cleanState();
    // Phase 1: 3 stages (brainstorming runOnce, write spec, review spec)
    assert.equal(isLastStage(1, 0, 0), false); // brainstorming
    assert.equal(isLastStage(1, 1, 0), false); // write spec
    assert.equal(isLastStage(1, 2, 0), true); // review spec
  });

  it("should skip runOnce stages after first loop", () => {
    const stages0 = getStageList(1, 0); // loop 0
    assert.equal(stages0.length, 3);
    assert.equal(stages0[0].name, "brainstorming");

    const stages1 = getStageList(1, 1); // loop 1
    assert.equal(stages1.length, 2); // brainstorming skipped
    assert.equal(stages1[0].name, "写 spec");
    assert.equal(stages1[1].name, "review spec");
  });

  it("should restart loop on gate failure", () => {
    const state = cleanState();
    state.loop.currentStageIndex = 2; // at last stage
    state.loop.loopCount = 0;

    const restarted = restartLoop(state, projectRoot);
    assert.equal(restarted.loop.loopCount, 1);
    assert.equal(restarted.loop.currentStageIndex, 1); // back to "写 spec" (loopStartIndex=1)
  });

  it("should advance phase and reset loop on completion", () => {
    const state = cleanState();
    state.phaseStartEntryId = "entry-123";
    markRetrospectDone(state, projectRoot);
    assert.equal(state.retrospectDone, true);

    const next = advancePhase(state, projectRoot);
    assert.notEqual(next, null);
    assert.equal(next!.currentPhase, 2);
    assert.equal(next!.loop.loopCount, 0);
    assert.equal(next!.loop.currentStageIndex, 0);
    assert.equal(next!.phaseStartEntryId, null);
    assert.equal(next!.retrospectDone, false);
  });

  it("should complete workflow after Phase 5", () => {
    const state = cleanState();
    state.currentPhase = 5;
    state.phaseStartEntryId = "entry-final";
    state.retrospectDone = true;

    const next = advancePhase(state, projectRoot);
    assert.equal(next, null);
    assert.equal(state.completed, true);
  });

  it("should detect V4 state format", async () => {
    const { isV4State } = await import("../state-manager.js");
    // Write V4-format state
    const v4Path = path.join(tmpDir, ".xyz-harness", "gate", "workflow-state.json");
    fs.writeFileSync(
      v4Path,
      JSON.stringify({ currentPhase: 2, stages: [{ number: 1, status: "pass" }] })
    );
    assert.equal(isV4State(projectRoot), true);
  });
});

// Cleanup
process.on("exit", () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

- [ ] **步骤 2：运行测试**

```bash
npx tsx --test extensions/coding-workflow/__tests__/g1-phase-loop.test.ts 2>&1
```
预期：7 tests PASS, 0 FAIL

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/__tests__/g1-phase-loop.test.ts
git commit -m "test: add phase loop unit tests (7 cases)"
```

---

## Task 6.2: JSON 模板示例 + Schema

**文件：**
- 创建：`.superpowers/2026-05-16-harness-v5-loop-phases/test_cases_template.example.json`

- [ ] **步骤 1：写入示例模板**

```json
{
  "metadata": {
    "plan_ref": ".xyz-harness/2026-05-16-topic/plan.md",
    "total_cases": 3
  },
  "cases": [
    {
      "id": "TC-1",
      "name": "Gate L1 check returns correct errors for missing spec.md",
      "category": "functional",
      "priority": "P0",
      "steps": [
        "删除 topicDir 下的 spec.md",
        "调用 gateSpec(topicDir)",
        "验证返回 errors 包含 'spec.md not found'"
      ],
      "expected": "返回 { passed: false, errors: ['spec.md not found...'] }",
      "executions": []
    },
    {
      "id": "TC-2",
      "name": "Gate L1 check passes when all deliverables present",
      "category": "functional",
      "priority": "P0",
      "steps": [
        "创建有效的 spec.md（含 YAML verdict: pass）",
        "创建 spec_review_v1.md（YAML must_fix: []）",
        "调用 gateSpec(topicDir)",
        "验证返回 { passed: true, errors: [] }"
      ],
      "expected": "返回 { passed: true, errors: [] }",
      "executions": []
    },
    {
      "id": "TC-3",
      "name": "Loop restarts on gate FAIL and advances on PASS",
      "category": "integration",
      "priority": "P0",
      "steps": [
        "设置 state 到 Phase 1 last stage (review spec)",
        "确保 spec.md 缺失 → gate FAIL",
        "验证 state 回到 loopStartIndex=1（写 spec）",
        "创建 spec.md → gate PASS",
        "验证 retrospect 流程启动"
      ],
      "expected": "Gate FAIL 时 loopCount 递增 + 回到写 spec；PASS 时进入复盘",
      "executions": []
    }
  ]
}
```

- [ ] **步骤 2：提交**

```bash
git add .superpowers/2026-05-16-harness-v5-loop-phases/test_cases_template.example.json
git commit -m "docs: add test case template example"
```

---

## Task 6.3: 集成验证

- [ ] **步骤 1：全量类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit 2>&1
```
预期：0 errors

- [ ] **步骤 2：测试全部通过**

```bash
npx tsx --test extensions/coding-workflow/__tests__/*.test.ts 2>&1
```
预期：ALL PASS

- [ ] **步骤 3：创建 V5 symlink**

```bash
# 重新建立 symlink（从 W1 删除后恢复）
ln -sf /Users/zhushanwen/Code/xyz-harness-engineering-workspace/xyz-harness-engineering/extensions/coding-workflow ~/.pi/agent/extensions/coding-workflow
# 启动 Pi 验证 extension 加载无报错
```
预期：Pi 启动显示 `coding-workflow` 在 Extensions 列表中，无加载错误

- [ ] **步骤 4：提交**

```bash
git add -A
git commit -m "chore: final integration verification for V5"
```
