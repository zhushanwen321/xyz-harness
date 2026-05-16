// Loop Engine — 通用目标驱动迭代引擎
// 管理 Phase 3 的 E2E 测试执行循环

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { LoopConfig, LoopState, LoopItem, EvidenceFile as EvidenceFileType, EvidenceRound, EvidenceItemRecord, EvidenceState, EvidenceVerificationRound } from "./types.js";

// 重导出 EvidenceFile 类型供 gates/common.ts 使用
export type { EvidenceFileType };

// ── Evidence JSON 内部结构（与 types.ts 对齐） ────────────────

type EvidenceFile = EvidenceFileType;

// ── Loop Engine ───────────────────────────────────────────────

export class LoopEngine {
  private config: LoopConfig;
  private projectRoot: string;
  private topicDir: string;
  private _state: LoopState;
  private resolvedEvidenceFile: string;

  constructor(config: LoopConfig, projectRoot: string, topicDir: string) {
  this.config = config;
  this.projectRoot = projectRoot;
  this.topicDir = topicDir;
  this.resolvedEvidenceFile = config.evidenceFile.replace(
    "{topicDir}",
    topicDir,
  );
  this._state = {
    round: 0,
    maxRounds: config.maxRounds,
    items: [],
    verificationRoundCompleted: false,
    phase: "initializing",
  };
  }

  get state(): LoopState {
  return this._state;
  }

  getEvidenceFilePath(): string {
  return this.resolvedEvidenceFile;
  }

  getEvidencePath(): string {
  return this.resolvedEvidenceFile;
  }

  // ── 初始化 ─────────────────────────────────────────

  init(): void {
  // 创建证据 JSON
  const absPath = join(this.projectRoot, this.resolvedEvidenceFile);
  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });

  // 尝试读取 plan 阶段生成的 template JSON 获取预期目标列表
  const templatePath = join(this.projectRoot, 
  `.xyz-harness/${this.topicDir}/changes/evidence/e2e-evidence-template.json`);
  let totalItems = 0;
  let initialItems: Array<{item_id: string; plan_ref: string; completed: boolean; firstCompletedRound: null}> = [];
  try {
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  if (Array.isArray(template.expected_cases)) {
    totalItems = template.expected_cases.length;
    initialItems = template.expected_cases.map((tc: any) => ({
    item_id: tc.case_id || tc.item_id || `case-${Math.random().toString(36).slice(2,6)}`,
    plan_ref: tc.group || tc.name || "",
    completed: false,
    firstCompletedRound: null,
    }));
  }
  } catch { /* 无 template 时保持空 evidence */ }

  const initialEvidence: EvidenceFile = {
  loop: this.config.name.toLowerCase().replace(/\s+/g, "-"),
  state: {
  totalItems,
  completedItems: 0,
  currentRound: 0,
  maxRounds: this.config.maxRounds,
  phase: "initializing",
  verificationRoundCompleted: false,
  },
  rounds: [],
  verification_round: {
  completed: false,
  startedAt: null,
  items: [],
    },
  };

  writeFileSync(
    absPath,
    JSON.stringify(initialEvidence, null, 2),
    "utf8",
  );
  this._state.phase = "initializing";
  }

  // ── 轮次管理 ───────────────────────────────────────

  startRound(): void {
  this.readEvidenceFromDisk();
  this._state.round++;
  this._state.phase = "in_round";
  }

  onRoundComplete(): "next_round" | "verification" | "gate_check" | "failed" {
  const evidence = this.readEvidenceFromDisk();
  // 从 evidence 同步 verificationRoundCompleted
  if (evidence) {
  this._state.verificationRoundCompleted = evidence.verification_round?.completed ?? false;
  }

  // 统计 completedItems
  const completedStatus = this.config.completedStatus;
  const completedItemIds = new Set<string>();

  for (const round of this.getEvidenceRounds()) {
  for (const item of round.items) {
  if (item.status === completedStatus) {
    completedItemIds.add(item.item_id);
  }
  }
  }

  this._state.items = Array.from(completedItemIds).map((id) => ({
  item_id: id,
  plan_ref: "",
  completed: true,
  firstCompletedRound: null,
  }));

  const totalItems = this.getEvidenceState().totalItems;
  const completedCount = completedItemIds.size;

  if (completedCount >= totalItems && totalItems > 0) {
  // 全部完成 → 检查 verification round
  if (this._state.verificationRoundCompleted) {
  this._state.phase = "gate_check";
  return "gate_check";
  } else {
  this._state.phase = "verification";
  return "verification";
  }
  } else if (this._state.round >= this.config.maxRounds) {
  // 达到上限但未全部完成
  this._state.phase = "failed";
  return "failed";
  } else {
  // 有未完成项，继续下一轮
  this._state.phase = "in_round";
  return "next_round";
  }
  }

  // ── Prompt 生成 ─────────────────────────────────────

  getPrompt(): string {
  const evidenceState = this.getEvidenceState();
  const incomplete = this.getIncompleteItems();
  const evidencePath = join(this.projectRoot, this.resolvedEvidenceFile);

  // 读取 prompt 模板
  const templateDir = join(
    dirname(new URL(import.meta.url).pathname),
    "loop-prompts",
  );
  const templateFile = join(
    templateDir,
    `${this.config.roundPrompt}.md`,
  );

  let template: string;
  try {
    template = readFileSync(templateFile, "utf8");
  } catch {
    // 模板文件不存在时，使用 roundPrompt 字段作为字面 prompt
    template = this.config.roundPrompt;
  }

  // 替换变量
  const totalItems =
    evidenceState.totalItems || this._state.items.length || 0;
  return template
    .replace(/\{phaseName\}/g, this.config.name)
    .replace(/\{currentRound\}/g, String(this._state.round))
    .replace(/\{maxRounds\}/g, String(this.config.maxRounds))
    .replace(
    /\{remainingRounds\}/g,
    String(Math.max(0, this.config.maxRounds - this._state.round)),
    )
    .replace(/\{totalItems\}/g, String(totalItems))
    .replace(/\{incompleteItems\}/g, JSON.stringify(incomplete))
    .replace(/\{batchSize\}/g, String(this.config.batchSize))
    .replace(/\{evidenceFilePath\}/g, evidencePath)
    .replace(/\{completedStatus\}/g, this.config.completedStatus)
    .replace(
    /\{allowedStatuses\}/g,
    this.config.allowedStatuses.join(", "),
    );
  }

  getIncompleteItems(): Array<{ item_id: string; plan_ref: string }> {
  const evidence = this.readEvidenceFromDisk();
  if (!evidence) return [];

  const completedStatus = this.config.completedStatus;
  const completedIds = new Set<string>();
  for (const round of evidence.rounds) {
    for (const item of round.items) {
    if (item.status === completedStatus) {
      completedIds.add(item.item_id);
    }
    }
  }

  // verification 阶段返回全部 items（全量重跑）
  if (this._state.phase === "verification") {
    const allIds = new Set<string>();
    for (const round of evidence.rounds) {
    for (const item of round.items) {
      allIds.add(item.item_id);
    }
    }
    return Array.from(allIds).map((id) => ({ item_id: id, plan_ref: "" }));
  }

  // 从 verification_round 中也收集已完成项
  for (const item of evidence.verification_round.items) {
    if (item.status === completedStatus) {
    completedIds.add(item.item_id);
    }
  }

  // 收集所有已见过的 item_id，筛出未完成项
  const allSeenIds = new Set<string>();
  for (const round of evidence.rounds) {
    for (const item of round.items) {
    allSeenIds.add(item.item_id);
    }
  }

  const incomplete: Array<{ item_id: string; plan_ref: string }> = [];
  for (const id of allSeenIds) {
    if (!completedIds.has(id)) {
    incomplete.push({ item_id: id, plan_ref: "" });
    }
  }
  return incomplete;
  }

  // ── Gate 执行 ───────────────────────────────────────
  // ── Gate 执行（委托给 gatePhase3，消除重复逻辑）──────────

  async runGate(
  signal?: AbortSignal,
  ): Promise<{ passed: boolean; output: string }> {
  const evidencePath = join(this.projectRoot, this.resolvedEvidenceFile);
  const { gatePhase3 } = await import("./gates/gate_phase3.js");
  return gatePhase3(this.projectRoot, this.config, evidencePath, signal);
  }

  // ── 内部方法 ─────────────────────────────────────────

  private readEvidenceFromDisk(): EvidenceFile | null {
  const absPath = join(this.projectRoot, this.resolvedEvidenceFile);
  if (!existsSync(absPath)) return null;
  return JSON.parse(readFileSync(absPath, "utf8")) as EvidenceFile;
  }

  private getEvidenceState(): EvidenceState {
  const evidence = this.readEvidenceFromDisk();
  return evidence?.state ?? {
    totalItems: 0,
    completedItems: 0,
    currentRound: 0,
    maxRounds: this.config.maxRounds,
    phase: "initializing",
    verificationRoundCompleted: false,
  };
  }

  private getEvidenceRounds(): EvidenceRound[] {
  const evidence = this.readEvidenceFromDisk();
  return evidence?.rounds ?? [];
  }
}

function emptyEvidence(): EvidenceFile {
  return {
  loop: "",
  state: {
    totalItems: 0,
    completedItems: 0,
    currentRound: 0,
    maxRounds: 0,
    phase: "initializing",
    verificationRoundCompleted: false,
  },
  rounds: [],
  verification_round: {
    completed: false,
    startedAt: null,
    items: [],
  },
  };
}
