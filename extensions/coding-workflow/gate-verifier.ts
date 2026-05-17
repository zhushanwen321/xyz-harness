// L2 LLM anti-fabrication verification
// Calls llm-simple-router via HTTP. Fail-open on network errors.
import type { PhaseId, GateL2Result } from "./types.js";
import { PHASE_NAMES } from "./types.js";
import * as fs from "node:fs";

const LLM_ROUTER_URL = "http://127.0.0.1:9981/v1/messages";
const L2_TIMEOUT_MS = 30_000;

interface L2Response {
  verdict: "pass" | "fail";
  reason?: string;
}

function collectDeliverables(topicDir: string, phaseId: PhaseId): string[] {
  const files: string[] = [];
  const add = (p: string) => {
    if (fs.existsSync(p)) files.push(p);
  };

  const td = topicDir;
  const ed = `${td}/changes/evidence`;
  const rd = `${td}/changes/reviews`;

  switch (phaseId) {
    case 1:
      add(`${td}/spec.md`);
      add(`${rd}/spec_review_v1.md`);
      add(`${rd}/spec_review_v2.md`);
      add(`${rd}/spec_review_v3.md`);
      break;
    case 2:
      add(`${td}/plan.md`);
      add(`${td}/e2e-test-plan.md`);
      add(`${td}/plan-backend.md`);
      add(`${td}/plan-frontend.md`);
      add(`${td}/plan-api-contract.md`);
      add(`${rd}/plan_review_v1.md`);
      add(`${rd}/plan_review_v2.md`);
      break;
    case 3:
      add(`${ed}/test_results.md`);
      add(`${rd}/code_review_v1.md`);
      add(`${rd}/code_review_v2.md`);
      break;
    case 4:
      add(`${ed}/test_execution.json`);
      add(`${td}/test_cases_template.json`);
      break;
    case 5:
      add(`${ed}/pr_evidence.md`);
      add(`${ed}/ci_results.md`);
      break;
  }

  return files;
}

function buildL2Prompt(phaseId: PhaseId, topicDir: string): string {
  const phaseName = PHASE_NAMES[phaseId];
  const deliverables = collectDeliverables(topicDir, phaseId);

  let prompt = `You are verifying Phase ${phaseId} (${phaseName}) deliverables for fabrication.\n\n`;
  prompt += `Files to verify:\n`;
  for (const f of deliverables) {
    prompt += `- ${f}\n`;
  }
  prompt += `\nVerify that:\n`;
  prompt += `1. All files exist and have valid YAML frontmatter\n`;
  prompt += `2. Review files have zero remaining MUST FIX items\n`;
  prompt += `3. Test results are consistent with actual code changes\n`;
  prompt += `4. No fabricated or placeholder content exists\n`;
  prompt += `\nRespond with JSON only:\n`;
  prompt += `{"verdict": "pass" | "fail", "reason": "explanation"}`;

  return prompt;
}

export async function runL2Verification(
  phaseId: PhaseId,
  topicDir: string,
  _projectRoot: string,
): Promise<GateL2Result | undefined> {
  const prompt = buildL2Prompt(phaseId, topicDir);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), L2_TIMEOUT_MS);

    const response = await fetch(LLM_ROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llm-simple-router/glm-5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Fail-open: HTTP errors don't block
    if (!response.ok) {
      return { passed: true, error: `L2 HTTP ${response.status} — fail-open` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: true, error: "L2 response not parseable — fail-open" };
    }

    let parsed: L2Response;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return { passed: true, error: "L2 JSON parse error — fail-open" };
    }

    if (parsed.verdict === "fail") {
      return {
        passed: false,
        error: parsed.reason || "L2 verdict: fail",
        raw: content,
      };
    }

    return { passed: true };
  } catch {
    // Network error or timeout — fail-open
    return { passed: true, error: "L2 network error — fail-open" };
  }
}
