import type { z } from "zod";
import type * as S from "./schemas";

/** All domain types are inferred from the Zod schemas: one source of truth. */
export type Provenance = z.infer<typeof S.ProvenanceSchema>;
export type ComponentKind = z.infer<typeof S.ComponentKindSchema>;
export type Priority = z.infer<typeof S.PrioritySchema>;
export type Level = z.infer<typeof S.LevelSchema>;
export type AdrStatus = z.infer<typeof S.AdrStatusSchema>;
export type CriterionId = z.infer<typeof S.CriterionIdSchema>;
export type AssumptionStatus = z.infer<typeof S.AssumptionStatusSchema>;

export type Requirement = z.infer<typeof S.RequirementSchema>;
export type Assumption = z.infer<typeof S.AssumptionSchema>;
export type TargetMetric = z.infer<typeof S.TargetMetricSchema>;
export type OpenQuestion = z.infer<typeof S.OpenQuestionSchema>;

export type ArchComponent = z.infer<typeof S.ArchComponentSchema>;
export type Relationship = z.infer<typeof S.RelationshipSchema>;
export type FlowStep = z.infer<typeof S.FlowStepSchema>;
export type FlowScenario = z.infer<typeof S.FlowScenarioSchema>;

export type Adr = z.infer<typeof S.AdrSchema>;
export type Risk = z.infer<typeof S.RiskSchema>;
export type QualityAttribute = z.infer<typeof S.QualityAttributeSchema>;
export type Alternative = z.infer<typeof S.AlternativeSchema>;

export type Snapshot = z.infer<typeof S.SnapshotSchema>;
export type SourceDocument = z.infer<typeof S.SourceDocumentSchema>;
export type Project = z.infer<typeof S.ProjectSchema>;

export type RequirementsAnalysis = z.infer<typeof S.RequirementsAnalysisSchema>;
export type ChangeOperation = z.infer<typeof S.ChangeOperationSchema>;
export type ChangeProposal = z.infer<typeof S.ChangeProposalSchema>;
export type AdrDraft = z.infer<typeof S.AdrDraftSchema>;
export type RiskDraft = z.infer<typeof S.RiskDraftSchema>;
export type ImpactReport = z.infer<typeof S.ImpactReportSchema>;
export type AdvisorAnswer = z.infer<typeof S.AdvisorAnswerSchema>;
export type AlternativeDraft = z.infer<typeof S.AlternativeDraftSchema>;

/** The part of a project that snapshots capture and proposals modify. */
export type ArchitectureState = Pick<Project, "components" | "relationships" | "flows">;

export type CriterionWeights = Record<CriterionId, number>;
