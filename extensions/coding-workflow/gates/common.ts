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
          // Inline array: key: [val1, val2] — store directly
          currentKey = kvMatch[1];
          currentArray = val;
        } else if (val === null && kvMatch[2].trim() === "") {
          // Key with empty value — potential array header for `- item` lines
          currentKey = kvMatch[1];
          currentArray = [];
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
    .sort((a, b) => {
      // Natural numeric sort: extract version number after "_v"
      const aNum = parseInt(a.match(/_v(\d+)/)?.[1] || "0", 10);
      const bNum = parseInt(b.match(/_v(\d+)/)?.[1] || "0", 10);
      return bNum - aNum; // descending
    });

  return matching.length > 0 ? path.join(reviewsDir, matching[0]) : null;
}

/**
 * Check if a review file has zero MUST FIX items.
 * Reads YAML frontmatter: must_fix field or verdict field.
 */
export function checkNoMustFix(reviewPath: string): { passed: boolean; error?: string } {
  const yaml = extractYamlBlock(reviewPath);
  if (!yaml) {
    return { passed: false, error: `${reviewPath}: no YAML frontmatter found` };
  }

  if ("must_fix" in yaml) {
    const mf = yaml.must_fix;
    if (Array.isArray(mf) && mf.length > 0) {
      return { passed: false, error: `${reviewPath}: ${mf.length} MUST FIX items remain` };
    }
    if (Array.isArray(mf) && mf.length === 0) {
      return { passed: true };
    }
  }

  // Fallback: check verdict field
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

    const templateIds = new Set(templateCases.map((c: { id: string }) => c.id));
    const execIds = new Set(execCases.map((c: { id: string }) => c.id));

    for (const id of templateIds) {
      if (!execIds.has(id)) {
        errors.push(`Case ${id}: missing from execution record`);
      }
    }

    for (const execCase of execCases) {
      const executions = execCase.executions || [];

      if (executions.length === 0) {
        errors.push(`Case ${execCase.id}: no execution records`);
        continue;
      }

      const lastExec = [...executions].reverse().find((e: { executed: boolean }) => e.executed === true);

      if (!lastExec) {
        errors.push(`Case ${execCase.id}: no executed=true record in final round`);
        continue;
      }

      if (lastExec.passed !== true) {
        errors.push(`Case ${execCase.id}: last execution not passed (passed=${lastExec.passed})`);
      }

      if (lastExec.passed === true && (!lastExec.execute_steps || lastExec.execute_steps.trim() === "")) {
        errors.push(`Case ${execCase.id}: execute_steps is empty`);
      }

      const timestamps = executions.map((e: { timestamp: string }) => new Date(e.timestamp).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        if (Number.isNaN(timestamps[i]) || Number.isNaN(timestamps[i - 1])) continue;
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

/** Check file exists */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/** Read YAML field from a file. Returns value or null. */
export function readYamlField(filePath: string, field: string): unknown {
  const yaml = extractYamlBlock(filePath);
  return yaml ? yaml[field] ?? null : null;
}
