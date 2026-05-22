/**
 * ReviewDispatcher — dispatches gate anti-fraud review subagent and builds retrospect steer.
 *
 * Gate review verifies deliverables are genuine (not fabricated by AI).
 * Content quality review is done by expert-reviewer during phase execution.
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

// gate review uses fixed filename (gate_review_{phase}.md), no version tracking needed

function buildGateReviewTaskPrompt(
	phaseConfig: PhaseConfigForReview,
	topicDir: string,
	skillPath: string,
): string {
	const reviewPath = path.join(
		topicDir, "changes", "reviews",
		`gate_review_${phaseConfig.phase}.md`,
	);
	const deliverableList = phaseConfig.deliverables
		.map((d) => `   - ${path.join(topicDir, d)}`)
		.join("\n");

	return [
		`你是 Gate 防伪造审查员。你的职责是验证 deliverable 是否真实可信，而非审查内容质量。`,
		``,
		`1. read \`${skillPath}\`，找到「Phase ${phaseConfig.phase} — ${phaseConfig.name}」章节`,
		`2. read 以下 deliverable 文件：`,
		deliverableList,
		`3. 按方法论中的伪造信号检查每项 deliverable`,
		`4. 可使用 bash 工具验证文件存在性、git log 等`,
		`5. 将审查结果写入：`,
		`   ${reviewPath}`,
		`6. YAML frontmatter 必须包含（在顶层，不能嵌套）:`,
		`   - verdict: "pass" 或 "fail"`,
		`   - must_fix: 数字（确认为伪造或严重缺失的问题数量）`,
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

	const systemPrompt = skillResolver.resolve("xyz-harness-gate-reviewer");
	const skillPath = skillResolver.resolvePath("xyz-harness-gate-reviewer");
	const reviewPath = path.join(
		topicDir, "changes", "reviews",
		`gate_review_${phaseConfig.phase}.md`,
	);
	const taskPrompt = buildGateReviewTaskPrompt(phaseConfig, topicDir, skillPath);

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
