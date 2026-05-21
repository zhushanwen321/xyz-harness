// Model selection logic extracted from xyz-pi-extensions/subagent.
// Resolves model by task complexity from ~/.pi/agent/subagent-models.json.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ─── Types ────────────────────────────────────────────────

export type TaskComplexity = "low" | "medium" | "high";
export type ThinkingLevel = "high" | "max";

/** Map subagent ThinkingLevel to Pi CLI --thinking flag values */
export const THINKING_TO_PI: Record<ThinkingLevel, string> = {
	high: "high",
	max: "xhigh",
};

export const COMPLEXITY_DEFAULT_THINKING: Record<TaskComplexity, ThinkingLevel> = {
	low: "high",
	medium: "high",
	high: "max",
};

// ─── Config types ─────────────────────────────────────────

interface SubagentModelEntry {
	id: string;
	provider?: string;
	"task-complexity"?: TaskComplexity[];
	order: number;
	fallbacks?: Array<{ id: string; provider?: string }>;
}

interface SubagentModelsConfig {
	models: SubagentModelEntry[];
}

// ─── Constants ────────────────────────────────────────────

const SUBAGENT_MODELS_PATH = path.join(
	os.homedir(), ".pi", "agent", "subagent-models.json",
);
const VALID_COMPLEXITIES = new Set<TaskComplexity>(["low", "medium", "high"]);

// Lazy singleton: load once per process
let _cachedModels: SubagentModelsConfig | null | undefined = undefined;

// ─── Load config ──────────────────────────────────────────

export function loadSubagentModels(): SubagentModelsConfig | null {
	if (_cachedModels !== undefined) return _cachedModels;
	try {
		const content = fs.readFileSync(SUBAGENT_MODELS_PATH, "utf-8");
		const parsed = JSON.parse(content) as SubagentModelsConfig;
		if (parsed.models) {
			for (const m of parsed.models) {
				if (m["task-complexity"]) {
					const invalid = m["task-complexity"].filter(
						(c) => !VALID_COMPLEXITIES.has(c),
					);
					if (invalid.length > 0) {
						console.warn(
							`[coding-workflow] Invalid complexity values for ${m.id}: ${invalid.join(", ")}`,
						);
					}
				}
				if (!m.provider) {
					console.warn(
						`[coding-workflow] Model entry "${m.id}" has no provider, will be skipped.`,
					);
				}
			}
		}
		_cachedModels = parsed;
		return parsed;
	} catch {
		_cachedModels = null;
		return null;
	}
}

// ─── Fallback resolution ─────────────────────────────────

function getFallbackRefsForModel(modelRef: string): string[] {
	const config = loadSubagentModels();
	if (!config) return [];
	for (const entry of config.models) {
		if (!entry.provider) continue;
		const entryRef = `${entry.provider}/${entry.id}`;
		if (entryRef === modelRef && entry.fallbacks?.length) {
			return entry.fallbacks
				.filter((fb) => fb.provider)
				.map((fb) => `${fb.provider!}/${fb.id}`);
		}
	}
	return [];
}

// ─── Resolve by complexity ────────────────────────────────

/**
 * Resolve a model reference by task complexity.
 * Iterates candidates sorted by `order`, returns first match.
 * Falls back through `fallbacks` if primary model unavailable
 * (since we can't check model registry, we return the first candidate).
 */
export async function resolveModelByComplexity(
	complexity: TaskComplexity,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const config = loadSubagentModels();
	if (!config || !config.models?.length) {
		return {
			ok: false,
			error: `subagent-models.json not found or empty at ${SUBAGENT_MODELS_PATH}`,
		};
	}

	const candidates = config.models
		.filter((m) => m["task-complexity"]?.includes(complexity))
		.sort((a, b) => a.order - b.order);

	if (candidates.length === 0) {
		return {
			ok: false,
			error: `No models configured for complexity "${complexity}" in subagent-models.json`,
		};
	}

	// Return first candidate with a provider
	for (const candidate of candidates) {
		if (!candidate.provider) continue;
		const modelRef = `${candidate.provider}/${candidate.id}`;
		return { ok: true, ref: modelRef };
	}

	const tried = candidates
		.map((c) => `${c.provider ?? "?"}/${c.id}`)
		.join(", ");
	return {
		ok: false,
		error: `No provider-configured models for complexity "${complexity}": ${tried}`,
	};
}

/**
 * Resolve a specific provider/model reference with fallback chain.
 */
export async function resolveModel(
	modelRef: string,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
	const slashIndex = modelRef.indexOf("/");
	if (slashIndex <= 0 || slashIndex === modelRef.length - 1) {
		return {
			ok: false,
			error: `Model must be in "provider/model" format. Got: "${modelRef}".`,
		};
	}

	// Pass through — we can't validate against model registry from extension context.
	const fallbackRefs = getFallbackRefsForModel(modelRef);
	if (fallbackRefs.length > 0) {
		return { ok: true, ref: modelRef };
	}

	return { ok: true, ref: modelRef };
}
