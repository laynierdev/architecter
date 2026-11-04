import { analyzeImpact } from "@/domain/architecture";
import { DomainError } from "@/domain/common";
import { ImpactReportSchema, RequirementsAnalysisSchema } from "@/domain/schemas";
import type { AdrDraft, AdvisorAnswer, AlternativeDraft, ChangeProposal, ImpactReport, Project, RequirementsAnalysis, RiskDraft } from "@/domain/types";
import type { ZodType } from "zod";
import { AIUserError, validated } from "../errors";
import type { AIProvider } from "../provider";
import { buildProposal, sanitizeAdr, sanitizeAlternatives, sanitizeRisks } from "./convert";
import {
  LlmAdrSchema,
  LlmAlternativesSchema,
  LlmAnswerSchema,
  LlmArchitectureSchema,
  LlmNarrativeSchema,
  LlmQuestionsSchema,
  LlmRequirementsSchema,
  LlmRisksSchema,
  toJsonSchema,
} from "./llmSchemas";
import { prompts, SYSTEM_PROMPT } from "./prompts";
import { DEFAULT_RETRY, parseJsonLoose, withRetry, withTimeout, type RetryOptions } from "./resilience";

/** The only thing the provider needs from an LLM SDK. Tests inject a fake. */
export interface JsonModelClient {
  generateJson(request: { system: string; prompt: string; jsonSchema: Record<string, unknown>; signal: AbortSignal }): Promise<string>;
}

export interface GeminiProviderOptions {
  model: string;
  timeoutMs: number;
  retry?: Partial<RetryOptions>;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly isMock = false;
  private readonly retry: RetryOptions;

  constructor(
    private readonly client: JsonModelClient,
    private readonly options: GeminiProviderOptions,
  ) {
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
  }

  /**
   * One model call with a timeout, JSON parsing and schema validation. Transient failures and
   * malformed responses are retried a bounded number of times.
   */
  private generate<T>(what: string, schema: ZodType<T>, prompt: string): Promise<T> {
    const jsonSchema = toJsonSchema(schema);
    return withRetry(async () => {
      const raw = await withTimeout((signal) => this.client.generateJson({ system: SYSTEM_PROMPT, prompt, jsonSchema, signal }), this.options.timeoutMs);
      return validated(schema, parseJsonLoose(raw), what);
    }, this.retry);
  }

  async analyzeRequirements({ text, context }: { text: string; context?: string }): Promise<RequirementsAnalysis> {
    const result = await this.generate("requirements analysis", LlmRequirementsSchema, prompts.analyzeRequirements(text, context));
    return validated(RequirementsAnalysisSchema, result, "requirements analysis");
  }

  async suggestQuestions(project: Project) {
    const { questions } = await this.generate("question list", LlmQuestionsSchema, prompts.suggestQuestions(project));
    const known = new Set(project.openQuestions.map((q) => q.question.trim().toLowerCase()));
    return questions.filter((q) => !known.has(q.question.trim().toLowerCase()));
  }

  async generateArchitecture(project: Project): Promise<ChangeProposal> {
    const llm = await this.generate("architecture proposal", LlmArchitectureSchema, prompts.generateArchitecture(project));
    return buildProposal(project, llm);
  }

  async askAdvisor(project: Project, question: string, focusComponentId?: string): Promise<AdvisorAnswer> {
    if (project.components.length === 0) {
      return { answer: "There is no architecture yet. Generate or add components first, then I can explain and evaluate them.", references: [] };
    }
    return this.generate("advisor answer", LlmAnswerSchema, prompts.advise(project, question, focusComponentId));
  }

  async explainComponent(project: Project, componentId: string): Promise<AdvisorAnswer> {
    if (!project.components.some((c) => c.id === componentId)) throw new DomainError(`Component "${componentId}" not found`);
    return this.generate("explanation", LlmAnswerSchema, prompts.explain(project, componentId));
  }

  /**
   * Dependencies and dependents come from the graph itself, never from the model, so the
   * structural facts cannot be hallucinated. The model only writes the narrative summary.
   */
  async analyzeImpact(project: Project, componentId: string): Promise<ImpactReport> {
    const structural = analyzeImpact(project, componentId);
    const { summary } = await this.generate("impact summary", LlmNarrativeSchema, prompts.impactNarrative(project, componentId, structural.summary));
    return validated(ImpactReportSchema, { ...structural, summary }, "impact report");
  }

  async suggestAdr(project: Project, input: { topic: string; componentId?: string }): Promise<AdrDraft> {
    const llm = await this.generate("ADR draft", LlmAdrSchema, prompts.suggestAdr(project, input.topic, input.componentId));
    return sanitizeAdr(llm);
  }

  async suggestRisks(project: Project): Promise<RiskDraft[]> {
    if (project.components.length === 0) throw new AIUserError("Add components to the architecture before asking for risks.");
    return sanitizeRisks(project, await this.generate("risk list", LlmRisksSchema, prompts.suggestRisks(project)));
  }

  async suggestAlternatives(project: Project): Promise<AlternativeDraft[]> {
    return sanitizeAlternatives(await this.generate("alternatives", LlmAlternativesSchema, prompts.suggestAlternatives(project)));
  }
}
