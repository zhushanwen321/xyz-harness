/**
 * ReviewDispatcher — dispatches review subagent and builds retrospect followUp.
 *
 * Handles: model resolution, system prompt from SkillResolver, subagent spawn,
 * and followUp message construction for the main agent to write retrospects.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ChildProcess } from "node:child_process";
import type { SkillResolver } from "./skill-resolver.js";
import {
	runSingleAgent,
	getFinalOutput,
	cleanupOldTempFiles,
	type SingleResult,
} from "./subagent.js";
import {
	resolveModelByComplexity,
	COMPLEXITY_DEFAULT_THINKING,
} from "./model-resolve.js";

// ─── Types ────────────────────────────────────────────────

/** Minimal phase config needed by review dispatcher. */
export interface PhaseConfigForReview {
	phase: number;
	name: string;
	reviewPrefix: string;
	retrospectPrefix: string;
	deliverables: string[];
	reviewMode: string;
}

export interface ReviewDispatchResult {
	success: boolean;
	reviewPath: string;
	result?: SingleResult;
	error?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function getNextReviewVersion(topicDir: string, prefix: string): number {
	const reviewsDir = path.join(topicDir, "changes", "reviews");
	if (!fs.existsSync(reviewsDir)) return 1;
	const files = fs.readdirSync(reviewsDir);
	let maxVersion = 0;
	for (const f of files) {
		const match = f.match(new RegExp(`^${prefix}_v(\\d+)\\.md$`));
		if (match) {
			const v = parseInt(match[1]!, 10);
			if (v > maxVersion) maxVersion = v;
		}
	}
	return maxVersion + 1;
}

function buildReviewTaskPrompt(
	phaseConfig: PhaseConfigForReview,
	topicDir: string,
	nextVersion: number,
): string {
	const reviewPath = path.join(
		topicDir, "changes", "reviews",
		`${phaseConfig.reviewPrefix}_v${nextVersion}.md`,
	);
	const deliverableList = phaseConfig.deliverables
		.map((d) => `   - ${path.join(topicDir, d)}`)
		.join("\n");

	return [
		`你是独立审查专家。按以下步骤执行审查：`,
		``,
		`1. read \`skills/xyz-harness-expert-reviewer/SKILL.md\`，找到「${phaseConfig.reviewMode}」章节`,
		`2. read 以下待审查文件：`,
		deliverableList,
		`3. 按方法论逐项审查，将结果写入：`,
		`   ${reviewPath}`,
		`4. YAML frontmatter 必须包含（在顶层，不能嵌套）:`,
		`   - verdict: "pass" 或 "fail"`,
		`   - must_fix: 数字（open MUST_FIX 问题数量）`,
	].join("\n");
}

// ─── Retrospect followUp ──────────────────────────────────

export function buildRetrospectFollowUp(
	phaseConfig: PhaseConfigForReview,
	topicDir: string,
	skillResolver: SkillResolver,
	allPhases: PhaseConfigForReview[], // for overall retrospect (phase 5)
): string {
	const retrospectPath = path.join(
		topicDir, "changes", "reviews",
		`${phaseConfig.retrospectPrefix}.md`,
	);
	const isOverall = phaseConfig.phase === 5;
	const retrospectSkillPath = skillResolver.resolvePath("harness-retrospect");

	const parts = [
		`现在执行 Phase ${phaseConfig.phase}（${phaseConfig.name}）的${isOverall ? "整体" : ""}复盘。`,
		``,
		`步骤：`,
		`1. read ${retrospectSkillPath} 获取复盘方法论`,
		`2. 基于你在本 phase 中的完整工作经历，按方法论覆盖两个维度（Phase 执行质量 + Harness 体验）`,
	];

	if (isOverall) {
		const prevRetrospects = allPhases
			.filter((p) => p.phase < 5)
			.map((p) => `   - ${path.join(topicDir, "changes", "reviews", `${p.retrospectPrefix}.md`)}`)
			.join("\n");
		parts.push(
			`3. read 之前 phase 的复盘记录（如果存在）：`,
			prevRetrospects,
		);
	}

	parts.push(
		`4. 将复盘结果写入：${retrospectPath}`,
		`5. YAML frontmatter: \`phase: ${phaseConfig.name.toLowerCase()}\`, \`verdict: pass\``,
		``,
		`完成后调用 coding-workflow-phase-start() 进入下一阶段。`,
	);

	return parts.join("\n");
}

// ─── Review dispatch ──────────────────────────────────────

export async function dispatchReviewSubagent(
	phaseConfig: PhaseConfigForReview,
	topicDir: string,
	skillResolver: SkillResolver,
	signal?: AbortSignal,
	onUpdate?: (partial: any) => void,
	processRegistry?: ChildProcess[],
): Promise<ReviewDispatchResult> {
	const modelResult = await resolveModelByComplexity("medium");
	if (!modelResult.ok) {
		return { success: false, reviewPath: "", error: modelResult.error };
	}

	const systemPrompt = skillResolver.resolve("xyz-harness-expert-reviewer");
	const nextVersion = getNextReviewVersion(topicDir, phaseConfig.reviewPrefix);
	const reviewPath = path.join(
		topicDir, "changes", "reviews",
		`${phaseConfig.reviewPrefix}_v${nextVersion}.md`,
	);
	const taskPrompt = buildReviewTaskPrompt(phaseConfig, topicDir, nextVersion);

	cleanupOldTempFiles();
	const result = await runSingleAgent({
		task: taskPrompt,
		systemPrompt,
		resolvedModel: modelResult.ref,
		thinkingLevel: COMPLEXITY_DEFAULT_THINKING.medium,
		cwd: topicDir,
		signal,
		onUpdate,
		processRegistry,
	});

	if (result.exitCode !== 0) {
		const errMsg = result.stderr || getFinalOutput(result.messages) || "Unknown error";
		return { success: false, reviewPath, error: `Review subagent failed: ${errMsg}` };
	}

	return { success: true, reviewPath, result };
}
