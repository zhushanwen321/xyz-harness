import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// T5: 这些函数在 common.ts 中尚未实现
import {
  item_coverage,
  executed_per_item,
  verification_round_completed,
  verification_all_executed,
  evidence_files_exist,
} from "../gates/common.js";
import type { LoopConfig } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_CONFIG: LoopConfig = {
  name: "Test",
  itemSource: "plan_tasks",
  itemIdField: "case_id",
  allowedStatuses: ["EXECUTED", "ERROR"],
  completedStatus: "EXECUTED",
  maxRounds: 5,
  batchSize: 5,
  requireVerificationRound: true,
  evidenceFile: ".xyz-harness/evidence.json",
  roundPrompt: "",
  gateScript: "phase3",
  gateChecks: [],
  confirmationRequired: false,
};

function loadFixture(name: string) {
  return JSON.parse(
  readFileSync(join(__dirname, "fixtures", name), "utf-8"),
  );
}

describe("G3: L1 Gate check functions", () => {
  it("TC-3-01: item_coverage — all covered → PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = item_coverage(evidence, TEST_CONFIG, __dirname, undefined);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-02: item_coverage — missing 1 → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  // Plan declares case-6 but evidence has 5 items
  const planPath = join(__dirname, "fixtures", "plan-with-6-cases.yaml");
  const result = item_coverage(evidence, TEST_CONFIG, __dirname, planPath);
  assert.strictEqual(result.pass, false);
  assert.ok(result.output.includes("case-6"));
  });

  it("TC-3-03: executed_per_item — all have EXECUTED → PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = executed_per_item(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-04: executed_per_item — one only ERROR → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-incomplete.json");
  const result = executed_per_item(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-05: verification_round_completed — true → PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = verification_round_completed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-06: verification_round_completed — false → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.completed = false;
  const result = verification_round_completed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-07: verification_all_executed — all EXECUTED → PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = verification_all_executed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-08: verification_all_executed — has ERROR → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.items[0].status = "ERROR";
  const result = verification_all_executed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-09: evidence_files_exist — files exist >1KB → PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-10: evidence_files_exist — file not found → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.items[0].evidence.screenshots = [
    "/nonexistent/file.png",
  ];
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-11: evidence_files_exist — file too small → FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, false);
  });
});
