import { z } from "zod";

/** Current persisted/exported project schema version. Bump when the shape changes. */
export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(100);
const text = (max = 500) => z.string().trim().min(1, "This field cannot be empty").max(max, `Must be at most ${max} characters`);
const optionalText = (max = 2000) => z.string().trim().max(max, `Must be at most ${max} characters`);
const isoDate = z.iso.datetime();

// Enumerations ----------------------------------------------------------
export const ProvenanceSchema = z.enum(["user", "assumption", "recommendation", "question"]);
export const ComponentKindSchema = z.enum(["client", "gateway", "service", "database", "cache", "queue", "external"]);
export const PrioritySchema = z.enum(["must", "should", "could"]);
export const LevelSchema = z.enum(["low", "medium", "high"]);
export const AdrStatusSchema = z.enum(["proposed", "accepted", "superseded", "deprecated"]);
export const CriterionIdSchema = z.enum(["complexity", "scalability", "reliability", "operations", "cost", "fit"]);
export const AssumptionStatusSchema = z.enum(["proposed", "confirmed", "rejected"]);

// Requirements ----------------------------------------------------------
export const RequirementSchema = z.object({
  id,
  text: text(500),
  provenance: ProvenanceSchema,
  priority: PrioritySchema,
  category: optionalText(60).optional(),
});

export const AssumptionSchema = z.object({
  id,
  text: text(500),
  priority: PrioritySchema,
  status: AssumptionStatusSchema,
});

export const TargetMetricSchema = z.object({
  id,
  label: text(100),
  value: text(100),
  provenance: ProvenanceSchema,
});

export const OpenQuestionSchema = z.object({
  id,
  question: text(300),
  why: optionalText(500),
  answer: optionalText(1000).optional(),
});

// Architecture ----------------------------------------------------------
export const ArchComponentSchema = z.object({
  id,
  name: text(80),
  kind: ComponentKindSchema,
  layer: text(60),
  technology: optionalText(120),
  description: optionalText(600),
  responsibilities: z.array(text(200)).max(20),
  provenance: ProvenanceSchema,
  rationale: optionalText(800),
  failureMode: optionalText(800),
  scaling: optionalText(800),
});

export const RelationshipSchema = z.object({
  id,
  source: id,
  target: id,
  protocol: text(60),
  label: text(80),
  async: z.boolean(),
});

export const FlowStepSchema = z.object({
  edgeIds: z.array(id).min(1),
  caption: text(300),
});

export const FlowScenarioSchema = z.object({
  id,
  name: text(80),
  description: optionalText(300),
  steps: z.array(FlowStepSchema),
});

// Decisions, risks, quality ---------------------------------------------
export const AdrSchema = z.object({
  id,
  number: z.number().int().min(1),
  title: text(160),
  status: AdrStatusSchema,
  context: optionalText(2000),
  problem: optionalText(2000),
  decision: optionalText(2000),
  alternatives: z.array(z.object({ name: text(100), reason: optionalText(500) })).max(10),
  consequences: z.object({
    positive: z.array(text(300)).max(10),
    negative: z.array(text(300)).max(10),
  }),
  supersededBy: id.optional(),
});

export const RiskSchema = z.object({
  id,
  title: text(160),
  description: optionalText(1000),
  likelihood: LevelSchema,
  impact: LevelSchema,
  mitigation: optionalText(1000),
  relatedComponentIds: z.array(id),
});

export const QualityAttributeSchema = z.object({
  id,
  name: text(60),
  score: z.number().int().min(1).max(5),
  note: optionalText(500),
});

const rating = z.number().int().min(1).max(5);
export const AlternativeSchema = z.object({
  id,
  name: text(100),
  summary: optionalText(600),
  ratings: z.object({
    complexity: rating,
    scalability: rating,
    reliability: rating,
    operations: rating,
    cost: rating,
    fit: rating,
  }),
  pros: z.array(text(300)).max(10),
  cons: z.array(text(300)).max(10),
  costEstimate: optionalText(100),
  costAssumptions: optionalText(500),
  fitVerdict: optionalText(500),
  isCurrent: z.boolean(),
});

// Snapshots and project -------------------------------------------------
const architectureFields = {
  components: z.array(ArchComponentSchema),
  relationships: z.array(RelationshipSchema),
  flows: z.array(FlowScenarioSchema),
};

export const SnapshotSchema = z.object({
  id,
  label: text(100),
  createdAt: isoDate,
  ...architectureFields,
});

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  ids.forEach((x) => (seen.has(x) ? dup.add(x) : seen.add(x)));
  return [...dup];
}

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id,
    name: z.string().trim().min(2, "Project name must have at least 2 characters").max(80, "Project name must be at most 80 characters"),
    tagline: optionalText(160),
    description: optionalText(4000),
    architectureStyle: optionalText(160),
    styleJustification: optionalText(2000),
    functionalRequirements: z.array(RequirementSchema),
    nonFunctionalRequirements: z.array(RequirementSchema),
    targets: z.array(TargetMetricSchema),
    assumptions: z.array(AssumptionSchema),
    openQuestions: z.array(OpenQuestionSchema),
    ...architectureFields,
    adrs: z.array(AdrSchema),
    risks: z.array(RiskSchema),
    qualityAttributes: z.array(QualityAttributeSchema),
    alternatives: z.array(AlternativeSchema),
    snapshots: z.array(SnapshotSchema).max(30),
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .superRefine((p, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const componentIds = new Set(p.components.map((c) => c.id));
    const relIds = new Set(p.relationships.map((r) => r.id));

    duplicates(p.components.map((c) => c.id)).forEach((d) => issue(`Duplicate component id "${d}"`, ["components"]));
    duplicates(p.relationships.map((r) => r.id)).forEach((d) => issue(`Duplicate relationship id "${d}"`, ["relationships"]));
    duplicates(p.adrs.map((a) => String(a.number))).forEach((d) => issue(`Duplicate ADR number ${d}`, ["adrs"]));

    p.relationships.forEach((r, i) => {
      if (!componentIds.has(r.source)) issue(`Relationship "${r.id}" references unknown source "${r.source}"`, ["relationships", i, "source"]);
      if (!componentIds.has(r.target)) issue(`Relationship "${r.id}" references unknown target "${r.target}"`, ["relationships", i, "target"]);
    });
    p.flows.forEach((f, i) =>
      f.steps.forEach((s, j) =>
        s.edgeIds.forEach((e) => {
          if (!relIds.has(e)) issue(`Flow "${f.name}" references unknown relationship "${e}"`, ["flows", i, "steps", j]);
        }),
      ),
    );
    p.risks.forEach((r, i) =>
      r.relatedComponentIds.forEach((c) => {
        if (!componentIds.has(c)) issue(`Risk "${r.title}" references unknown component "${c}"`, ["risks", i, "relatedComponentIds"]);
      }),
    );
  });

// AI result schemas -----------------------------------------------------
// Everything an AI provider returns must pass these before entering application state.

export const RequirementsAnalysisSchema = z.object({
  functional: z.array(z.object({ text: text(500), priority: PrioritySchema })),
  nonFunctional: z.array(z.object({ text: text(500), priority: PrioritySchema, category: text(60) })),
  targets: z.array(z.object({ label: text(100), value: text(100) })),
  assumptions: z.array(z.object({ text: text(500), priority: PrioritySchema })),
  questions: z.array(z.object({ question: text(300), why: optionalText(500) })),
});

export const ChangeOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_component"), component: ArchComponentSchema }),
  z.object({ op: z.literal("update_component"), id, changes: ArchComponentSchema.omit({ id: true }).partial() }),
  z.object({ op: z.literal("remove_component"), id }),
  z.object({ op: z.literal("add_relationship"), relationship: RelationshipSchema }),
  z.object({ op: z.literal("remove_relationship"), id }),
]);

export const ProposalStatusSchema = z.enum(["proposed", "approved", "rejected", "applied"]);

export const ChangeProposalSchema = z.object({
  id,
  title: text(160),
  summary: optionalText(1000),
  source: z.enum(["mock", "gemini"]),
  status: ProposalStatusSchema,
  operations: z.array(ChangeOperationSchema).min(1),
  /** Optional style recommendation that is applied together with the operations. */
  architectureStyle: optionalText(160).optional(),
  styleJustification: optionalText(2000).optional(),
  createdAt: isoDate,
});

export const AdrDraftSchema = AdrSchema.omit({ id: true, number: true, supersededBy: true });
export const RiskDraftSchema = RiskSchema.omit({ id: true });

export const ImpactReportSchema = z.object({
  componentId: id,
  /** Components that depend on this one (they call it, directly or transitively). */
  dependents: z.array(id),
  /** Components this one depends on (directly or transitively). */
  dependencies: z.array(id),
  affectedFlows: z.array(id),
  relatedRisks: z.array(id),
  summary: text(1000),
});

export const AdvisorAnswerSchema = z.object({
  answer: text(3000),
  /** Project elements the answer is based on, so users can verify it. */
  references: z.array(text(120)),
});
