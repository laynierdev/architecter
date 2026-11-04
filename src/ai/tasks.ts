import { z, type ZodType } from "zod";
import {
  AdrDraftSchema,
  AdvisorAnswerSchema,
  AlternativeDraftSchema,
  ChangeProposalSchema,
  ImpactReportSchema,
  ProjectSchema,
  RequirementsAnalysisSchema,
  RiskDraftSchema,
} from "@/domain/schemas";
import type { AIProvider } from "./provider";

/**
 * The AI tasks exposed over HTTP: the request DTO, the response schema and how each maps onto an
 * AIProvider method. Shared by the API route (validates requests) and the browser client
 * (validates responses), so both sides agree on one contract.
 */

export interface TaskDefinition<I = unknown, O = unknown> {
  input: ZodType<I>;
  output: ZodType<O>;
  run: (provider: AIProvider, input: I) => Promise<O>;
}

const defineTask = <I, O>(task: TaskDefinition<I, O>): TaskDefinition<I, O> => task;

const project = z.object({ project: ProjectSchema });
const componentId = z.string().min(1).max(100);

export const TASKS = {
  "analyze-requirements": defineTask({
    input: z.object({ text: z.string().trim().min(1).max(12_000), context: z.string().max(6_000).optional() }),
    output: RequirementsAnalysisSchema,
    run: (p, i) => p.analyzeRequirements(i),
  }),
  "suggest-questions": defineTask({
    input: project,
    output: RequirementsAnalysisSchema.shape.questions,
    run: (p, i) => p.suggestQuestions(i.project),
  }),
  "generate-architecture": defineTask({
    input: project,
    output: ChangeProposalSchema,
    run: (p, i) => p.generateArchitecture(i.project),
  }),
  advise: defineTask({
    input: project.extend({ question: z.string().trim().min(1).max(1_000), focusComponentId: componentId.optional() }),
    output: AdvisorAnswerSchema,
    run: (p, i) => p.askAdvisor(i.project, i.question, i.focusComponentId),
  }),
  explain: defineTask({
    input: project.extend({ componentId }),
    output: AdvisorAnswerSchema,
    run: (p, i) => p.explainComponent(i.project, i.componentId),
  }),
  "analyze-impact": defineTask({
    input: project.extend({ componentId }),
    output: ImpactReportSchema,
    run: (p, i) => p.analyzeImpact(i.project, i.componentId),
  }),
  "suggest-adr": defineTask({
    input: project.extend({ topic: z.string().trim().min(1).max(200), componentId: componentId.optional() }),
    output: AdrDraftSchema,
    run: (p, i) => p.suggestAdr(i.project, { topic: i.topic, componentId: i.componentId }),
  }),
  "suggest-risks": defineTask({
    input: project,
    output: RiskDraftSchema.array(),
    run: (p, i) => p.suggestRisks(i.project),
  }),
  "suggest-alternatives": defineTask({
    input: project,
    output: AlternativeDraftSchema.array(),
    run: (p, i) => p.suggestAlternatives(i.project),
  }),
} as const;

export type TaskName = keyof typeof TASKS;
export const isTaskName = (name: string): name is TaskName => Object.hasOwn(TASKS, name);

/** Largest accepted request body (a whole project without snapshots is far below this). */
export const MAX_BODY_BYTES = 1_500_000;
