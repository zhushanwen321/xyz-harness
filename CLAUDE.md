# XYZ Harness Engineering

## Project Background

xyz-harness V5 — Loop-Based Phase Architecture. Contains:
- `extensions/coding-workflow/` — Pi extension: 5-Phase Loop development workflow controller with L1/L2 gate system
- `extensions/todolist/` — Pi extension: Task tracking
- `extensions/claude-rules-loader/` — Pi extension: Cross-project rule loading
- `agents/` — Subagent definitions (harness-retrospect)
- `skills/` — SKILL.md skill definitions
- `commands/` — Slash command definitions

Tech stack: TypeScript (Pi Extension API), Markdown (agent/skill definitions).

## Architecture Constraints

### Extension Architecture
- Pi Extension compiled via ESBuild (syntax check only, no type checking)
- Imports use `.js` extension (ESM)
- Global types from `@mariozechner/pi-coding-agent` (Pi runtime)
- Extension directory resolved via `import.meta.url`

### Gate System (coding-workflow)
- Each Phase has independent L1 gate (`gates/gate_<phase>.ts`)
- `common.ts` provides shared utilities (file checks, YAML parsing, test case comparison)
- `gate-runner.ts` dispatches by phase number
- `gate-verifier.ts` provides L2 LLM anti-fabrication verification (fail-open)
- L2 verification runs automatically after L1 passes

### Script Management
- Scripts in `extensions/coding-workflow/scripts/`
- Skill directories use symlinks to extension directory

## Document Index

| Document | Path | Purpose |
|----------|------|---------|
| V5 Spec | `.superpowers/2026-05-16-harness-v5-loop-phases/spec.md` | Architecture design |
| V5 Plan | `.superpowers/2026-05-16-harness-v5-loop-phases/plan.md` | Implementation plan |
| Phase Definitions | `extensions/coding-workflow/stages.ts` | 5 Phase config |
| Gate System | `extensions/coding-workflow/gates/` | Per-phase L1 gates |
| L2 Verifier | `extensions/coding-workflow/gate-verifier.ts` | LLM anti-fabrication |
| State Manager | `extensions/coding-workflow/state-manager.ts` | Workflow state persistence |
| Workflow Controller | `extensions/coding-workflow/index.ts` | Main entry + tool registration |
| Retrospect Subagent | `agents/harness-retrospect/agent.md` | Phase retrospective |
| Retrospectives | `docs/retrospectives/` | Post-harness retrospective notes |

## Quality Gates

- Type check: `npx tsc --noEmit`
- Test: `npx tsx --test extensions/coding-workflow/__tests__/*.test.ts`
- Lint: `npx tsc --noEmit`
