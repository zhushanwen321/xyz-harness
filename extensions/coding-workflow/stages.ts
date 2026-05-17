import type { PhaseId, StageConfig } from "./types.js";

/** Phase configuration */
export interface PhaseConfig {
  id: PhaseId;
  name: string;
  stages: StageConfig[];
  /** Index of the first stage to loop back to on gate failure */
  loopStartIndex: number;
}

/** All 5 phase definitions */
export const PHASES: PhaseConfig[] = [
  {
    id: 1,
    name: "spec",
    stages: [
      {
        name: "brainstorming",
        description:
          "与用户讨论需求、澄清问题、提出方案。产出：需求理解。",
        runOnce: true,
      },
      {
        name: "写 spec",
        description:
          "产出 spec.md。包含背景、需求、约束、AC（验收标准）、复杂度评估基准。",
        runOnce: false,
      },
      {
        name: "review spec",
        description:
          "评审 spec.md。AI 可自主决定是否 dispatch subagent 做评审。产出 spec_review_v{N}.md，YAML frontmatter 含 must_fix 和 verdict。",
        runOnce: false,
      },
    ],
    loopStartIndex: 1,
  },
  {
    id: 2,
    name: "plan",
    stages: [
      {
        name: "写 plan",
        description:
          "产出 plan.md + e2e-test-plan.md + test_cases_template.json。L2 复杂度时还产出 plan-backend.md、plan-frontend.md、plan-api-contract.md。",
        runOnce: false,
      },
      {
        name: "review plan",
        description:
          "评审所有 plan 交付物。产出 plan_review_v{N}.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0,
  },
  {
    id: 3,
    name: "dev",
    stages: [
      {
        name: "TDD",
        description:
          "先写失败的单元测试。后续循环可增量补测试。AI 自主判断增量还是全量。",
        runOnce: false,
      },
      {
        name: "编码",
        description:
          "实现代码使测试通过。产出源代码修改。",
        runOnce: false,
      },
      {
        name: "code review",
        description:
          "评审代码。产出 code_review_v{N}.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0,
  },
  {
    id: 4,
    name: "test",
    stages: [
      {
        name: "执行测试",
        description:
          "基于 test_cases_template.json 执行集成/功能测试。产出 test_execution.json 更新。AI 自主决定本轮执行哪些 case。",
        runOnce: false,
      },
      {
        name: "修复问题",
        description:
          "修复失败的测试。AI 自主决定修复策略。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0,
  },
  {
    id: 5,
    name: "pr",
    stages: [
      {
        name: "推送+CI+PR",
        description:
          "git push、等待 CI、创建 PR。产出 pr_evidence.md + ci_results.md。",
        runOnce: false,
      },
    ],
    loopStartIndex: 0,
  },
];

/** Get PhaseConfig by id */
export function getPhaseConfig(id: PhaseId): PhaseConfig {
  const c = PHASES.find((p) => p.id === id);
  if (!c) throw new Error(`Phase ${id} not found`);
  return c;
}

/** Get the display-friendly stage list for a phase */
export function getStageList(phaseId: PhaseId, loopCount: number): StageConfig[] {
  const phase = getPhaseConfig(phaseId);
  if (loopCount === 0) return phase.stages;
  return phase.stages.filter((s) => !s.runOnce);
}

/** Check if current stage is the last one (triggers gate) */
export function isLastStage(phaseId: PhaseId, stageIndex: number, loopCount: number): boolean {
  const stages = getStageList(phaseId, loopCount);
  return stageIndex === stages.length - 1;
}
