# TDD RED Report — Phase 2/3/4 Split + Loop Engine

## Summary

7 test files, 37 test cases total. All groups have failing tests (RED state confirmed).

## Test Groups

| Group | File | Total | RED | PASS | Failure Reason |
|-------|------|-------|-----|------|----------------|
| G1 | `g1-types-stages.test.ts` | 10 | 5 | 5 | WORKFLOW_STAGES has 16 not 15; no LoopConfig export; wrong phase distribution |
| G2 | `g2-loop-engine.test.ts` | 11 | 11 | 0 | `loop-engine.js` module not found |
| G3 | `g3-l1-checks.test.ts` | 11 | 11 | 0 | `item_coverage` etc. functions not exported from common.js |
| G4 | `g4-phase3-gate.test.ts` | 5 | 5 | 0 | `gate_phase3.js` module not found |
| G5 | `g5-state-manager.test.ts` | 6 | 4 | 2 | StateManager has no loop methods (initLoopState, advanceLoopRound, etc.) |
| G6 | `g6-backward-compat.test.ts` | 3 | 2 | 1 | No `_legacy` flag; no legacy gate dispatch |
| G7 | `g7-integration.test.ts` | 8 | 8 | 0 | `loop-engine.js` module not found |

## Fixture Files

- `fixtures/e2e-evidence-full.json` — 5 cases, 2 rounds, 1 ERROR fixed in round 2, verification complete
- `fixtures/e2e-evidence-incomplete.json` — 5 cases, 1 round, 3 ERROR items
- `fixtures/e2e-evidence-empty.json` — Initial empty evidence

## Task-to-Test Mapping

| Task | Test Group | Key Tests |
|------|------------|-----------|
| T1 (types.ts) | G1 TC-1-01, TC-1-05 | currentPhase=3|4, LoopConfig/GateCheck exports |
| T2 (stages.ts) | G1 TC-1-02, TC-1-03, TC-1-06 | 15 stages, confirmation points, gate mapping |
| T4 (loop-engine) | G2 all | Full state machine: init→round→verify→gate |
| T5 (L1 checks) | G3 all | 5 check functions × pass/fail scenarios |
| T6 (gate_phase3) | G4 all | Combined L1+L2 gate |
| T8 (state manager) | G5 all | LoopState persistence, advanceTo phase 3→4 |
| T7+T11 (index.ts) | G7 all | Phase transitions, legacy detection |
| T11 (backward compat) | G6 all | Legacy state loading, _legacy flag |

## Next Steps (GREEN phase)

1. Wave 1: Implement T1 (types) + T9 (prompt template) + T10 (agent doc)
2. Wave 2: Implement T2 (stages) + T5 (L1 checks)
3. Wave 3: Implement T4 (loop-engine)
4. Wave 4: Implement T6 (gate_phase3) + T8 (state manager)
5. Wave 5: Implement T7+T11 (index.ts integration + backward compat)
6. Wave 6: Run all tests — expect GREEN
