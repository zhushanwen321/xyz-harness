import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
  // must match evidence JSON field name "item_id"
  itemIdField: "item_id",
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
  it("TC-3-01: item_coverage -- all covered -> PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = item_coverage(evidence, TEST_CONFIG, __dirname, undefined);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-02: item_coverage -- totalItems=6 but evidence has 5 -> FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  // item_coverage checks allItems.size >= totalExpected
  // evidence has 5 unique items, set totalItems=6 to trigger failure
  evidence.state.totalItems = 6;
  const result = item_coverage(evidence, TEST_CONFIG, __dirname, undefined);
  assert.strictEqual(result.pass, false);
  assert.ok(result.output.includes("item_coverage"));
  });

  it("TC-3-03: executed_per_item -- all have EXECUTED -> PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = executed_per_item(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-04: executed_per_item -- one only ERROR -> FAIL", () => {
  // Build evidence where case-3 only ever reached ERROR (never EXECUTED)
  const evidence = loadFixture("e2e-evidence-full.json");
  // Remove round 2 where case-3 was re-executed to EXECUTED
  evidence.rounds = [evidence.rounds[0]];
  const result = executed_per_item(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-05: verification_round_completed -- true -> PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = verification_round_completed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-06: verification_round_completed -- false -> FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.completed = false;
  const result = verification_round_completed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-07: verification_all_executed -- all EXECUTED -> PASS", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  const result = verification_all_executed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-08: verification_all_executed -- has ERROR -> FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.items[0].status = "ERROR";
  const result = verification_all_executed(evidence, TEST_CONFIG);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-09: evidence_files_exist -- files exist >1KB -> PASS", () => {
  // The evidence fixture references screenshots like "screenshots/r1-c1.png"
  // We need to create actual files in the fixtures/screenshots/ directory
  const screenshotDir = join(__dirname, "fixtures", "screenshots");
  mkdirSync(screenshotDir, { recursive: true });

  // Create valid screenshot files (>1KB) for all referenced paths
  const validPng = readFileSync(join(__dirname, "fixtures", "screenshot-valid.png"));
  const referencedScreenshots = [
    "r1-c1.png", "r1-c2.png", "r1-c4.png", "r1-c5.png",
    "r2-c3.png",
    "vr-c1.png", "vr-c2.png", "vr-c3.png", "vr-c4.png", "vr-c5.png",
  ];
  for (const name of referencedScreenshots) {
    writeFileSync(join(screenshotDir, name), validPng);
  }

  const evidence = loadFixture("e2e-evidence-full.json");
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, true);
  });

  it("TC-3-10: evidence_files_exist -- file not found -> FAIL", () => {
  const evidence = loadFixture("e2e-evidence-full.json");
  evidence.verification_round.items[0].evidence.screenshots = [
    "/nonexistent/file.png",
  ];
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, false);
  });

  it("TC-3-11: evidence_files_exist -- file too small -> FAIL", () => {
  // Use screenshot-tiny.png (4 bytes, < 1KB) as the referenced file
  const evidence = loadFixture("e2e-evidence-full.json");
  // Point round 1 item 1 to the tiny screenshot
  evidence.rounds[0].items[0].evidence.screenshots = [
    "screenshot-tiny.png",
  ];
  const result = evidence_files_exist(evidence, TEST_CONFIG, __dirname);
  assert.strictEqual(result.pass, false);
  });
});
