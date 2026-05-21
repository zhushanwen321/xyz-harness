# Wave 2: Foundation — types, stages, state-manager, common

## Task 2.1: 核心类型定义

**文件：**
- 创建：`extensions/coding-workflow/types.ts`

- [ ] **步骤 1：写入类型定义**

```typescript
// ============================================================================
// Harness V5: Core Type Definitions
// ============================================================================

/** Phase identifier */
export type PhaseId = 1 | 2 | 3 | 4 | 5;

export const PHASE_COUNT = 5;

/** Phase display names */
export const PHASE_NAMES: Record<PhaseId, string> = {
  1: "spec",
  2: "plan",
  3: "dev",
  4: "test",
  5: "pr",
};

/** Stage definition within a phase */
export interface StageConfig {
  name: string;
  description: string;
  /** Execute only on first loop iteration */
  runOnce: boolean;
}

/** L1 gate check result */
export interface GateL1Result {
  passed: boolean;
  errors: string[];
}

/** L2 gate check result from LLM subagent */
export interface GateL2Result {
  passed: boolean;
  error?: string;
  /** Raw response from LLM for debugging */
  raw?: string;
}

/** Combined gate result */
export interface GateResult {
  l1: GateL1Result;
  l2?: GateL2Result;
  passed: boolean;
}

/** Loop state for a single phase */
export interface LoopState {
  phaseNumber: PhaseId;
  loopCount: number;
  currentStageIndex: number;
}

/** Overall workflow state persisted to disk */
export interface WorkflowState {
  /** Current phase (1-5) */
  currentPhase: PhaseId;
  /** Loop state for current phase */
  loop: LoopState;
  /** Topic directory path (e.g. .xyz-harness/2026-05-16-topic) */
  topicDir: string;
  /** Entry ID when current phase started (for tree navigation) */
  phaseStartEntryId: string | null;
  /** Whether retrospect for current phase has been completed */
  retrospectDone: boolean;
  /** Plan complexity level (set during Phase 2) */
  planComplexity?: "L1" | "L2";
  /** Overall workflow completed flag */
  completed: boolean;
}

/** Default workflow state for Phase 1 start */
export function createInitialState(topicDir: string): WorkflowState {
  return {
    currentPhase: 1,
    loop: { phaseNumber: 1, loopCount: 0, currentStageIndex: 0 },
    topicDir,
    phaseStartEntryId: null,
    retrospectDone: false,
    completed: false,
  };
}

/** Phase transition state (stored temporarily for retrospect flow) */
export interface PhaseTransitionState {
  phaseId: PhaseId;
  gateResult: GateResult;
  retrospectPath: string;
  nextPhase: PhaseId;
}
```

- [ ] **步骤 2：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit types.ts 2>&1
```
预期：无错误

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/types.ts
git commit -m "feat: add V5 core type definitions"
```

---

## Task 2.2: Stage 定义

**文件：**
- 创建：`extensions/coding-workflow/stages.ts`

- [ ] **步骤 1：写入 Phase/Stage 配置**

```typescript
import type { PhaseId, StageConfig } from "./types.js";

/** Phase configuration */
export interface PhaseConfig {
  id: PhaseId;
  name: string;
  stages: StageConfig[];
  /** Index of the first stage to loop back to on gate failure */
  loopStartIndex: number;
}

/** All 5 phase definitions */
export const PHASES: PhaseConfig[] = [
  {
    id: 1,
    name: "spec",
    stages: [
      {
        name: "brainstorming",
        description:
          "与用户讨论需求、澄清问题、提出方案。产出：需求理解。",
        runOnce: true,
      },
      {
        name: "写 spec",
        description:
          "产出 spec.md。包含背景、需求、约束、AC（验收标准）、复杂度评估基准。",
        runOnce: false,
      },
      {
        name: "review spec",
        description:
          "评审 spec.md。AI 可自主决定是否 dispatch subagent 做评审。产出 spec_review_v{N}.md，YAML frontmatter 含 must_fix 和 verdict。",
        runOnce: false,
      },
    ],
    loopStartIndex: 1, // 回到"写 spec"
  },
  {
    id: 2,
    name: "plan",
    stages: [
      {
        name: "写 plan",
        description:
          "产出 plan.md + e2e-test-plan.md + test_cases_template.json。L2 复杂度时还产出 plan-backend.md、plan-frontend.md、plan-api-contract.md。",
        runOnce: false,
      },
      {
        name: "review plan",
        description:
          "评审所有 plan 交付物。产出 plan_review_v{N}.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0, // 回到"写 plan"
  },
  {
    id: 3,
    name: "dev",
    stages: [
      {
        name: "TDD",
        description:
          "先写失败的单元测试。后续循环可增量补测试。AI 自主判断增量还是全量。",
        runOnce: false,
      },
      {
        name: "编码",
        description:
          "实现代码使测试通过。产出源代码修改。",
        runOnce: false,
      },
      {
        name: "code review",
        description:
          "评审代码。产出 code_review_v{N}.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0, // 回到"TDD"
  },
  {
    id: 4,
    name: "test",
    stages: [
      {
        name: "执行测试",
        description:
          "基于 test_cases_template.json 执行集成/功能测试。产出 test_execution.json 更新。AI 自主决定本轮执行哪些 case。",
        runOnce: false,
      },
      {
        name: "修复问题",
        description:
          "修复失败的测试。AI 自主决定修复策略。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0, // 回到"执行测试"
  },
  {
    id: 5,
    name: "pr",
    stages: [
      {
        name: "推送+CI+PR",
        description:
          "git push、等待 CI、创建 PR。产出 pr_evidence.md + ci_results.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0,
  },
];

/** Get PhaseConfig by id */
export function getPhaseConfig(id: PhaseId): PhaseConfig {
  const c = PHASES.find((p) => p.id === id);
  if (!c) throw new Error(`Phase ${id} not found`);
  return c;
}

/** Get the display-friendly stage list for a phase */
export function getStageList(phaseId: PhaseId, loopCount: number): StageConfig[] {
  const phase = getPhaseConfig(phaseId);
  if (loopCount === 0) return phase.stages;
  // Skip runOnce stages in subsequent loops
  return phase.stages.filter((s) => !s.runOnce);
}

/** Check if current stage is the last one (triggers gate) */
export function isLastStage(phaseId: PhaseId, stageIndex: number, loopCount: number): boolean {
  const stages = getStageList(phaseId, loopCount);
  return stageIndex === stages.length - 1;
}
```

- [ ] **步骤 2：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit stages.ts 2>&1
```
预期：无错误（需 types.ts 存在）

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/stages.ts
git commit -m "feat: add V5 phase/stage definitions"
```

---

## Task 2.3: 状态管理器

**文件：**
- 创建：`extensions/coding-workflow/state-manager.ts`

- [ ] **步骤 1：写入状态管理器**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorkflowState, PhaseId, PhaseTransitionState } from "./types.js";
import { createInitialState } from "./types.js";

const STATE_FILENAME = "workflow-state.json";

/** Resolve the state file path. projectRoot is the repo root. */
function statePath(projectRoot: string): string {
  return path.join(projectRoot, ".xyz-harness", "gate", STATE_FILENAME);
}

/** Ensure .xyz-harness/gate/ directory exists */
function ensureGateDir(projectRoot: string): void {
  const dir = path.join(projectRoot, ".xyz-harness", "gate");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Load workflow state from disk. Returns null if not found. */
export function loadState(projectRoot: string): WorkflowState | null {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return null;

  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as WorkflowState;

    // AC12: detect V4 format (has stages array, no loop field)
    if ("stages" in parsed && !("loop" in parsed)) {
      return null; // Old format — caller should prompt for reset
    }

    return parsed;
  } catch {
    return null;
  }
}

/** Save workflow state to disk */
export function saveState(state: WorkflowState, projectRoot: string): void {
  ensureGateDir(projectRoot);
  fs.writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2), "utf-8");
}

/** Check if loaded state is V4 format (needs migration prompt) */
export function isV4State(projectRoot: string): boolean {
  const p = statePath(projectRoot);
  if (!fs.existsSync(p)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return "stages" in raw && typeof raw.stages === "object" && !("loop" in raw);
  } catch {
    return false;
  }
}

/** Advance to next stage within current phase. Returns true if gate should be checked. */
export function advanceStage(
  state: WorkflowState,
  projectRoot: string,
): { shouldCheckGate: boolean; state: WorkflowState } {
  const stages = getStageList(state.currentPhase, state.loop.loopCount);
  const isLast = state.loop.currentStageIndex >= stages.length - 1;

  if (isLast) {
    // Don't advance — caller should run gate
    return { shouldCheckGate: true, state };
  }

  state.loop.currentStageIndex++;
  saveState(state, projectRoot);
  return { shouldCheckGate: false, state };
}

/** Loop back to loopStartIndex. Increments loopCount. Call when gate fails. */
export function restartLoop(state: WorkflowState, projectRoot: string): WorkflowState {
  const phase = getPhaseConfig(state.currentPhase);
  state.loop.loopCount++;
  state.loop.currentStageIndex = phase.loopStartIndex;
  saveState(state, projectRoot);
  return state;
}

/**
 * Advance to next phase. Resets loop state. Call when gate passes and
 * retrospect is done. Returns null if workflow is complete.
 */
export function advancePhase(state: WorkflowState, projectRoot: string): WorkflowState | null {
  if (state.currentPhase >= 5) {
    state.completed = true;
    saveState(state, projectRoot);
    return null; // Workflow complete
  }

  const nextPhase = (state.currentPhase + 1) as PhaseId;
  state.currentPhase = nextPhase;
  state.loop = { phaseNumber: nextPhase, loopCount: 0, currentStageIndex: 0 };
  state.phaseStartEntryId = null;
  state.retrospectDone = false;
  saveState(state, projectRoot);
  return state;
}

/** Mark retrospect as done for current phase */
export function markRetrospectDone(state: WorkflowState, projectRoot: string): void {
  state.retrospectDone = true;
  saveState(state, projectRoot);
}

/** Store phase start entry ID (for tree navigation at phase exit) */
export function setPhaseStartEntry(state: WorkflowState, entryId: string, projectRoot: string): void {
  state.phaseStartEntryId = entryId;
  saveState(state, projectRoot);
}

/** Store plan complexity level (set during Phase 2) */
export function setPlanComplexity(state: WorkflowState, complexity: "L1" | "L2", projectRoot: string): void {
  state.planComplexity = complexity;
  saveState(state, projectRoot);
}

// Re-export from stages.ts for internal use
import { getPhaseConfig, getStageList } from "./stages.js";
```

- [ ] **步骤 2：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit state-manager.ts 2>&1
```
预期：无错误

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/state-manager.ts
git commit -m "feat: add V5 state manager with loop tracking"
```

---

## Task 2.4: 共享工具函数

**文件：**
- 创建：`extensions/coding-workflow/gates/common.ts`

- [ ] **步骤 1：写入共享工具函数**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Extract YAML frontmatter from a markdown file.
 * Returns parsed object, or null if no frontmatter found.
 */
export function extractYamlBlock(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  try {
    // Simple YAML parsing: key: value pairs, supports arrays
    const result: Record<string, unknown> = {};
    const lines = match[1].split("\n");
    let currentKey: string | null = null;
    let currentArray: unknown[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const arrMatch = trimmed.match(/^\s*-\s+(.+)$/);
      if (arrMatch && currentKey) {
        currentArray.push(parseYamlValue(arrMatch[1]));
        continue;
      }

      // Flush previous array
      if (currentKey && currentArray.length > 0) {
        result[currentKey] = currentArray;
        currentArray = [];
        currentKey = null;
      }

      const kvMatch = trimmed.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
      if (kvMatch) {
        const val = parseYamlValue(kvMatch[2]);
        if (Array.isArray(val)) {
          currentKey = kvMatch[1];
          currentArray = val;
        } else {
          result[kvMatch[1]] = val;
          currentKey = null;
        }
      }
    }

    // Flush remaining array
    if (currentKey && currentArray.length > 0) {
      result[currentKey] = currentArray;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function parseYamlValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~" || trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  // Remove surrounding quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Find the latest review file matching pattern.
 * Pattern example: changes/reviews/spec_review_v{N}.md
 */
export function findLatestReview(
  baseDir: string,
  prefix: string,
): string | null {
  const reviewsDir = path.join(baseDir, "changes", "reviews");
  if (!fs.existsSync(reviewsDir)) return null;

  const files = fs.readdirSync(reviewsDir);
  const matching = files
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .sort()
    .reverse();

  return matching.length > 0 ? path.join(reviewsDir, matching[0]) : null;
}

/**
 * Check if a review file has zero MUST FIX items.
 * Reads YAML frontmatter: must_fix field.
 */
export function checkNoMustFix(reviewPath: string): { passed: boolean; error?: string } {
  const yaml = extractYamlBlock(reviewPath);
  if (!yaml) {
    return { passed: false, error: `${reviewPath}: no YAML frontmatter found` };
  }

  // Check must_fix array
  if ("must_fix" in yaml) {
    const mf = yaml.must_fix;
    if (Array.isArray(mf) && mf.length > 0) {
      return { passed: false, error: `${reviewPath}: ${mf.length} MUST FIX items remain` };
    }
    if (Array.isArray(mf) && mf.length === 0) {
      return { passed: true };
    }
  }

  // Fallback: check verdict
  if (yaml.verdict === "pass") {
    return { passed: true };
  }

  return { passed: false, error: `${reviewPath}: verdict is not "pass"` };
}

/**
 * Compare test_execution.json cases against template.
 * Returns pass/fail with specific errors.
 */
export function checkTestExecution(
  templatePath: string,
  executionPath: string,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!fs.existsSync(templatePath)) {
    return { passed: false, errors: [`Template not found: ${templatePath}`] };
  }
  if (!fs.existsSync(executionPath)) {
    return { passed: false, errors: [`Execution record not found: ${executionPath}`] };
  }

  try {
    const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
    const execution = JSON.parse(fs.readFileSync(executionPath, "utf-8"));

    const templateCases = template.cases || [];
    const execCases = execution.cases || [];

    // Check case ID sets match
    const templateIds = new Set(templateCases.map((c: { id: string }) => c.id));
    const execIds = new Set(execCases.map((c: { id: string }) => c.id));

    for (const id of templateIds) {
      if (!execIds.has(id)) {
        errors.push(`Case ${id}: missing from execution record`);
      }
    }

    // Check each case
    for (const execCase of execCases) {
      const executions = execCase.executions || [];

      if (executions.length === 0) {
        errors.push(`Case ${execCase.id}: no execution records`);
        continue;
      }

      // Get last executed=true record
      const lastExec = [...executions].reverse().find((e: { executed: boolean }) => e.executed === true);

      if (!lastExec) {
        errors.push(`Case ${execCase.id}: no executed=true record in final round`);
        continue;
      }

      if (lastExec.passed !== true) {
        errors.push(`Case ${execCase.id}: last execution not passed (passed=${lastExec.passed})`);
      }

      // Check execute_steps is non-empty for passed=true records
      if (lastExec.passed === true && (!lastExec.execute_steps || lastExec.execute_steps.trim() === "")) {
        errors.push(`Case ${execCase.id}: execute_steps is empty`);
      }

      // Check timestamps are increasing
      const timestamps = executions.map((e: { timestamp: string }) => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] <= timestamps[i - 1]) {
          errors.push(`Case ${execCase.id}: timestamps not monotonically increasing at index ${i}`);
        }
      }
    }

    return { passed: errors.length === 0, errors };
  } catch (e) {
    return { passed: false, errors: [`JSON parse error: ${(e as Error).message}`] };
  }
}

/** Check file exists (with optional message) */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/** Read YAML field from a file. Returns value or null. */
export function readYamlField(filePath: string, field: string): unknown {
  const yaml = extractYamlBlock(filePath);
  return yaml ? yaml[field] ?? null : null;
}
```

- [ ] **步骤 2：类型检查**

```bash
cd extensions/coding-workflow && npx tsc --noEmit gates/common.ts 2>&1
```
预期：无错误

- [ ] **步骤 3：提交**

```bash
git add extensions/coding-workflow/gates/common.ts
git commit -m "feat: add V5 shared gate utilities"
```
