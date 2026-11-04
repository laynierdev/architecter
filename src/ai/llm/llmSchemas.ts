import { z } from "zod";
import {
  AdrDraftSchema,
  AdvisorAnswerSchema,
  AlternativeDraftSchema,
  ComponentKindSchema,
  RequirementsAnalysisSchema,
  RiskDraftSchema,
} from "@/domain/schemas";

/**
 * Schemas for what the model is asked to return. They are deliberately flatter than the domain
 * schemas (no ids, no timestamps, no status): ids and workflow state are assigned by our code,
 * never by the model. Everything is still validated again against the domain schemas afterwards.
 */

export const LlmRequirementsSchema = RequirementsAnalysisSchema;

export const LlmQuestionsSchema = z.object({ questions: RequirementsAnalysisSchema.shape.questions });

export const LlmArchitectureSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().max(1000),
  architectureStyle: z.string().min(1).max(160),
  styleJustification: z.string().max(2000),
  components: z
    .array(
      z.object({
        key: z.string().min(1).max(60).describe("Short unique identifier used by connections, such as web-app"),
        name: z.string().min(1).max(80),
        kind: ComponentKindSchema,
        layer: z.string().min(1).max(60),
        technology: z.string().max(120),
        description: z.string().max(600),
        responsibilities: z.array(z.string().min(1).max(200)).max(8),
        provenance: z.enum(["recommendation", "assumption"]).describe("Use assumption when the choice depends on information the user did not provide"),
        rationale: z.string().max(800),
        failureMode: z.string().max(800),
        scaling: z.string().max(800),
      }),
    )
    .min(1)
    .max(25),
  connections: z
    .array(
      z.object({
        from: z.string().min(1).describe("Key of a new component, or id/name of an existing one"),
        to: z.string().min(1),
        protocol: z.string().min(1).max(60),
        label: z.string().min(1).max(80),
        async: z.boolean(),
      }),
    )
    .max(60),
});

export const LlmAnswerSchema = AdvisorAnswerSchema;
export const LlmNarrativeSchema = z.object({ summary: z.string().min(1).max(1000) });
export const LlmAdrSchema = AdrDraftSchema;
export const LlmRisksSchema = z.object({ risks: z.array(RiskDraftSchema).max(12) });
export const LlmAlternativesSchema = z.object({ alternatives: z.array(AlternativeDraftSchema).min(2).max(4) });

/** JSON Schema for the Gemini `responseJsonSchema` option. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _ignored;
  return rest;
}
