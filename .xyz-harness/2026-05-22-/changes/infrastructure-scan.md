# Infrastructure Scan — xyz-harness-engineering

Generated: 2026-05-22

---

## 1. Project Structure

```
xyz-harness-engineering/
├── extensions/
│   └── coding-workflow/          # Auto mode Pi extension (TypeScript)
│       ├── index.ts              # Extension entry: tools + commands + events (~700 LOC)
│       ├── gate-check.py         # Gate validation script (~300 LOC)
│       ├── package.json          # deps: js-yaml ^4.1.0
│       └── lib/
│           ├── gate-runner.ts    # Spawn gate-check.py, parse JSON
│           ├── review-dispatcher.ts  # Review subagent dispatch + retrospect followUp
│           ├── subagent.ts       # Pi CLI spawn, JSON streaming, usage stats
│           ├── process-manager.ts    # ChildProcess lifecycle (SIGTERM→SIGKILL)
│           ├── model-resolve.ts  # Model selection from subagent-models.json
│           └── skill-resolver.ts # Skill content caching, no fallback
├── skills/                       # 20 skills (11 harness + 9 project-level)
│   ├── xyz-harness-brainstorming/    # Phase 1: spec
│   ├── xyz-harness-writing-plans/    # Phase 2: plan
│   ├── xyz-harness-phase-dev/        # Phase 3: dev
│   ├── xyz-harness-phase-test/       # Phase 4: test
│   ├── xyz-harness-phase-pr/         # Phase 5: PR
│   ├── xyz-harness-expert-reviewer/  # Unified review (3 modes)
│   ├── xyz-harness-gate/             # Manual gate check skill
│   ├── xyz-harness-backend-dev/      # Backend coding reference
│   ├── xyz-harness-frontend-dev/     # Frontend coding reference
│   ├── xyz-harness-test-driven-development/  # TDD methodology
│   ├── xyz-harness-subagent-driven-development/  # Subagent dispatch pattern
│   ├── xyz-harness-code-standard-protection/  # Code protection framework
│   ├── harness-retrospect/           # Retrospect methodology
│   └── ... (7 project-level skills: zcommit, create-worktree, merge-worktree, etc.)
├── docs/
│   ├── CONTEXT.md                    # Core terminology glossary
│   ├── adr/                          # Architecture Decision Records
│   ├── retrospectives/               # Cross-project retrospective scans
│   ├── research/                     # Industry research (context mgmt, tool systems, etc.)
│   ├── harness-current-state-assessment.md  # V5 gap analysis
│   └── harness-design-framework.md   # 6-dimension diagnostic framework
├── .xyz-harness/                     # Workspace: 12 historical topics + 1 in-progress
└── CLAUDE.md                         # Project instructions
```

Key entry points:
- **Extension entry**: `extensions/coding-workflow/index.ts` → `codingWorkflowExtension(pi)`
- **Gate script**: `extensions/coding-workflow/gate-check.py` → `main()`
- **Phase skills**: loaded via `SkillResolver` from `before_agent_start` event

---

## 2. Existing APIs — Exported Functions

### extensions/coding-workflow/index.ts

| Export | Type | Signature / Purpose |
|--------|------|-------------------|
| `default` | `function` | `codingWorkflowExtension(pi: ExtensionAPI): void` — registers 2 tools, 3 commands, 4 events |
| `PhaseConfig` | `interface` (local) | `{ phase, name, skillName, reviewPrefix, retrospectPrefix, deliverables[], reviewMode }` |
| `WorkflowState` | `interface` (local) | `{ isActive, currentPhase, topicDir, topicName, phaseResults, gateInProgress, gateRetryCount, compactRetryCount }` |
| `parseReviewVerdict` | `function` (local) | `(reviewPath: string) → { verdict: string, mustFix: number }` — reads YAML FM, supports nested (`review.verdict`, `statistics.must_fix`) |

**Registered Tools:**

| Tool | Parameters | Returns |
|------|-----------|---------|
| `coding-workflow-gate` | `{ phase: number }` | PASS with followUp / FAIL with fix list |
| `coding-workflow-phase-start` | `{}` (none) | Advances phase, triggers compact |

**Registered Commands:**

| Command | Purpose |
|---------|---------|
| `/coding-workflow` | Start workflow: accepts arg or extracts from conversation |
| `/coding-workflow-status` | Show current phase/topic/status |
| `/coding-workflow-abort` | Kill subprocesses, reset state |

**Registered Events:**

| Event | Handler Behavior |
|-------|-----------------|
| `before_agent_start` | Injects phase skill via `SkillResolver`; HARD BLOCK on missing retrospects |
| `session_start` | Reconstruct state from session entries |
| `turn_end` | Update widget |
| *(message renderer)* | `coding-workflow-context` → minimal display |

### lib/gate-runner.ts

| Export | Signature |
|--------|-----------|
| `GateCheckItem` | `{ name: string; passed: boolean; detail: string }` |
| `GateResult` | `{ passed: boolean; output: string; checks?: GateCheckItem[] }` |
| `runGateScript` | `(gateScriptPath, topicDir, phase) → Promise<GateResult>` — spawns `python3 gate-check.py ... --json`, 30s timeout |

### lib/review-dispatcher.ts

| Export | Signature |
|--------|-----------|
| `PhaseConfigForReview` | `{ phase, name, reviewPrefix, retrospectPrefix, deliverables[], reviewMode }` |
| `ReviewDispatchResult` | `{ success, reviewPath, result?: SingleResult, error?: string }` |
| `dispatchReviewSubagent` | `(phaseConfig, topicDir, skillResolver, signal?, onUpdate?, processRegistry?) → Promise<ReviewDispatchResult>` |
| `buildRetrospectFollowUp` | `(phaseConfig, topicDir, skillResolver, allPhases) → string` — generates followUp instructing main agent to write retrospect |

### lib/subagent.ts

| Export | Signature |
|--------|-----------|
| `UsageStats` | `{ input, output, cacheRead, cacheWrite, cost, contextTokens, turns }` |
| `SingleResult` | `{ exitCode, messages, stderr, usage, model?, stopReason?, ... }` |
| `runSingleAgent` | `({ task, systemPrompt, resolvedModel, thinkingLevel?, cwd, tools?, signal?, onUpdate?, processRegistry? }) → Promise<SingleResult>` |
| `formatUsageStats` | `(usage, model?) → string` |
| `getFinalOutput` | `(messages: Message[]) → string` |
| `cleanupOldTempFiles` | `() → void` — removes temp files > 1hr old |

### lib/process-manager.ts

| Export | Signature |
|--------|-----------|
| `ProcessOpts` | `{ cwd, shell?, stdio?, activityTimeoutMs?, globalTimeoutMs?, signal?, processRegistry? }` |
| `ProcessResult` | `{ exitCode, stdout, stderr, wasAborted }` |
| `ProcessManager` (class) | `spawn(command, args, opts) → Promise<ProcessResult>` — dual timer (5min activity / 10min global), SIGTERM→SIGKILL |

### lib/model-resolve.ts

| Export | Signature |
|--------|-----------|
| `TaskComplexity` | `"low" \| "medium" \| "high"` |
| `ThinkingLevel` | `"high" \| "max"` |
| `THINKING_TO_PI` | `{ high: "high", max: "xhigh" }` |
| `COMPLEXITY_DEFAULT_THINKING` | `{ low: "high", medium: "high", high: "max" }` |
| `loadSubagentModels` | `() → SubagentModelsConfig \| null` — reads `~/.pi/agent/subagent-models.json` |
| `resolveModelByComplexity` | `(complexity) → Promise<{ ok, ref \| error }>` |
| `resolveModel` | `(modelRef) → Promise<{ ok, ref \| error }>` — passthrough with fallback chain |

### lib/skill-resolver.ts

| Export | Signature |
|--------|-----------|
| `SkillResolver` (class) | `setSkills(skills[])`, `resolve(name) → string` (cached), `resolvePath(name) → string`, `has(name) → boolean` |

---

## 3. Type Definitions

### Core Interfaces (index.ts)

```typescript
interface PhaseConfig {
  phase: number;            // 1-5
  name: string;             // "Spec" | "Plan" | "Dev" | "Test" | "PR"
  skillName: string;        // maps to skill in Pi registry
  reviewPrefix: string;     // e.g. "spec_review" → spec_review_v1.md
  retrospectPrefix: string; // e.g. "spec_retrospect" → spec_retrospect.md
  deliverables: string[];   // relative paths within topicDir
  reviewMode: string;       // Chinese description for expert-reviewer skill
}

interface WorkflowState {
  isActive: boolean;
  currentPhase: number;                    // 1-5
  topicDir: string;                        // absolute path
  topicName: string;                       // "{date}-{slug}"
  phaseResults: Record<number, "passed">;  // keyed by phase number
  gateInProgress: boolean;                 // mutex
  gateRetryCount: number;                  // per-phase, max 10
  compactRetryCount: number;               // per-phase-start, max 3
}
```

### Gate-check.py Dataclasses

```python
@dataclass
class FieldCheck:
    name: str; type: str; expected: Any; optional: bool

@dataclass
class FileCheck:
    path: str; fields: list[FieldCheck]; validator: Callable | None

@dataclass
class ReviewCheck:
    prefix: str; nested: bool  # nested=True → use _flatten_review_fields

@dataclass
class PhaseSpec:
    name: str; deliverables: list[FileCheck]; reviews: list[ReviewCheck]; pre_checks: list[Callable]
```

---

## 4. Patterns in Use

### Gate-check.py Validation per Phase

| Phase | Deliverable Checks | Review Checks | Special Validators |
|-------|-------------------|---------------|-------------------|
| 1 Spec | `spec.md` → `verdict=="pass"` | `spec_review_v*` → `verdict=="pass"`, `must_fix==0` | — |
| 2 Plan | `plan.md` → verdict, `e2e-test-plan.md` → verdict, `test_cases_template.json` → structure | `plan_review_v*` → verdict + must_fix | `validate_test_cases_template`: checks each case has id/type/title |
| 3 Dev | `test_results.md` → `verdict`, `all_passing==true`, `linter_passed==true` (optional) | `code_review_v*` (nested=True) → `review.verdict` / `statistics.must_fix` | — |
| 4 Test | `test_execution.json` → validated via `validate_test_execution` | (none) | Cross-ref template IDs, final round all passed |
| 5 PR | `pr_evidence.md` → `pr_created==true`, `ci_results.md` → `ci_passed==true` | (none) | — |

**Key patterns:**
- Phase 3 reviews use `nested=True` → `_flatten_review_fields()` checks both top-level and `review.verdict` / `statistics.must_fix`
- Phase 4/5 have NO review subagent dispatch (only gate script)
- `find_latest_review()` picks the highest `_v{N}` file via sorted glob
- YAML frontmatter parsed with `yaml.safe_load()` between `---` delimiters

### Review Subagent Dispatch Flow

```
gate-tool execute()
  → runGateScript()            # 1. gate-check.py --json
  → dispatchReviewSubagent()   # 2. spawn review subagent
      → resolveModelByComplexity("medium")
      → skillResolver.resolve("xyz-harness-expert-reviewer")  # system prompt
      → buildReviewTaskPrompt()  # task prompt with review mode
      → runSingleAgent()         # spawn `pi --mode json` child process
  → parseReviewVerdict()        # 3. parse review file's YAML FM
  → if must_fix > 0: return FAIL with review content
  → buildRetrospectFollowUp()   # 4. generate followUp for main agent
  → pi.sendUserMessage(followUp, { deliverAs: "followUp" })
```

**Review subagent config:**
- Model: complexity `"medium"` → first match in `subagent-models.json`
- Tools: `read,bash,write,edit`
- Thinking: `"high"` (maps to `--thinking high`)
- Timeout: 5min activity / 10min global (SIGTERM→SIGKILL)

### Frontmatter Parsing (TS side)

```typescript
// parseReviewVerdict() in index.ts
// 1. Find "---" delimiters
// 2. yaml.load() the middle section
// 3. Check top-level verdict, fallback to review.verdict
// 4. Check top-level must_fix, fallback to statistics.must_fix
```

### Frontmatter Parsing (Python side)

```python
# parse_yaml_frontmatter() in gate-check.py
# Same delimiter approach
# _flatten_review_fields() handles nested: data["review"]["verdict"], data["statistics"]["must_fix"]
```

### Retrospect Flow

- **NOT dispatched as subagent** — main agent writes it directly
- Gate tool sends `followUp` with instructions to read `harness-retrospect` skill
- `phase-start` tool checks ALL prior phase retrospect files exist with valid frontmatter
- `before_agent_start` HARD BLOCKs if any retrospect is missing

---

## 5. Dependencies

### TypeScript (extensions/coding-workflow)

| Package | Version | Purpose |
|---------|---------|---------|
| `js-yaml` | ^4.1.0 | YAML frontmatter parsing |
| `@mariozechner/pi-coding-agent` | (Pi SDK) | Extension API, `withFileMutationQueue` |
| `@mariozechner/pi-tui` | (Pi SDK) | `Text` widget |
| `@mariozechner/pi-ai` | (Pi SDK) | `Message` type |
| `typebox` | (Pi SDK) | JSON Schema type builder |
| Node builtins | — | `fs`, `path`, `child_process`, `crypto`, `os` |

### Python (gate-check.py)

| Package | Purpose |
|---------|---------|
| `yaml` (PyYAML) | `yaml.safe_load()` for frontmatter parsing |
| `json` | test_cases_template.json / test_execution.json parsing |
| `glob` | `find_latest_review()` file pattern matching |
| `dataclasses` | `PhaseSpec`, `FileCheck`, `FieldCheck`, `ReviewCheck` |
| stdlib | `os`, `sys`, `typing` |

### External Config

| File | Location | Purpose |
|------|----------|---------|
| `subagent-models.json` | `~/.pi/agent/subagent-models.json` | Model selection by task complexity |

---

## 6. Recent Changes & Optimization Targets

### gate-check.py — Architecture

- **Declarative spec pattern**: `PHASE_SPECS` dict maps phase → `PhaseSpec` with `deliverables[]` and `reviews[]`
- **Generic engine**: `run_phase_checks()` iterates spec, runs field validators and review checks
- **Custom validators**: `validate_test_cases_template()` and `validate_test_execution()` as callables
- **Dual output**: human-readable table (default) or JSON (`--json` flag)

### expert-reviewer SKILL.md — Review Methodology

Three modes determined by input:
1. **Plan Review** (spec.md + plan.md): completeness, feasibility, spec↔plan consistency, execution groups
2. **Code Review** (spec.md + git diff): spec compliance, code quality, architecture, security, integration verification, hook/data-flow checks
3. **Test Review** (spec.md + test diff): AC coverage matrix (mandatory output), test quality, maintainability, data construction

**Key design:**
- Context isolation: reviewer never inherits executor context
- Round management: v1→v2→v3, old versions preserved
- Severity: MUST_FIX / LOW / INFO with calibration rules
- YAML frontmatter required for machine parsing

### Cross-Project Retrospect Scan — Optimization Targets (from `docs/retrospectives/2026-05-22-cross-project-retrospect-scan.md`)

| Priority | ID | Issue | Impact |
|----------|----|-------|--------|
| **P0** | F-01 | YAML frontmatter nesting (review.verdict vs verdict) — 8+ occurrences | 4-5 wasted turns per workflow |
| **P0** | F-02 | Review can be skipped (pr-worktree doesn't check review files) | Bugs reach main |
| **P0** | F-03 | No built-in self-check lists per phase — 8/9 MUST_FIX are omissions | 50%+ preventable |
| P1 | F-04 | Gate check depth inconsistent across phases | Quality variance |
| P1 | F-05 | Spec→Plan→Test metric traceability broken | Scope creep undetected |
| P1 | F-06 | Subagent task prompt lacks quantified acceptance criteria | First-round failures |
| P1 | F-07 | test_execution.json can't distinguish automated vs code-review-as-test | Misleading coverage |
| P1 | F-08 | Gate scans across topics (no --topic-dir scoping) | False failures |
| P2 | F-10 | LOW severity too lenient, issues accumulate across phases | LOW debt |
| P2 | F-11 | Full re-review on single-line MUST_FIX fix — 30-40% time waste | Efficiency |
| P2 | F-12 | Retrospect skipped or triggered too early | Quality gap |

**AI behavior patterns (from 46 retrospects):**
- 8/9 MUST_FIX are omission-type (should-have-thought-of) not error-type
- Happy path coverage is strong; failure scenarios consistently missed
- "Fix one side, forget the other" pattern is common
- Spec written from memory vs. empirical verification (grep real code)

---

## Appendix: File Sizes

| File | Lines | Role |
|------|-------|------|
| extensions/coding-workflow/index.ts | ~700 | Extension entry, state management, tools |
| extensions/coding-workflow/gate-check.py | ~300 | Gate validation script |
| extensions/coding-workflow/lib/subagent.ts | ~250 | Pi CLI spawn + JSON streaming |
| extensions/coding-workflow/lib/review-dispatcher.ts | ~140 | Review dispatch + followUp |
| extensions/coding-workflow/lib/process-manager.ts | ~120 | ChildProcess lifecycle |
| extensions/coding-workflow/lib/model-resolve.ts | ~110 | Model resolution |
| extensions/coding-workflow/lib/skill-resolver.ts | ~60 | Skill caching |
| extensions/coding-workflow/lib/gate-runner.ts | ~70 | Gate script runner |
