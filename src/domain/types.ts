/**
 * Stage 1 domain types (plain TypeScript, mock data only).
 * Stage 2 replaces these with Zod schemas and inferred types.
 */

/** Where a piece of information comes from. Never silently invent requirements. */
export type Provenance = "user" | "assumption" | "recommendation" | "question";

export type ComponentKind =
  | "client"
  | "gateway"
  | "service"
  | "database"
  | "cache"
  | "queue"
  | "external";

export interface ArchComponent {
  id: string;
  name: string;
  kind: ComponentKind;
  /** Logical boundary / layer the component belongs to. */
  layer: string;
  technology: string;
  description: string;
  responsibilities: string[];
  provenance: Provenance;
  /** Why this component / technology was chosen. */
  rationale: string;
  /** What happens when this component fails and how the design mitigates it. */
  failureMode: string;
  /** How the component scales. */
  scaling: string;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  protocol: string;
  label: string;
  /** Asynchronous (event / message based) communication. */
  async: boolean;
}

export interface FlowStep {
  /** Edges that "fire" together in this step. */
  edgeIds: string[];
  caption: string;
}

export interface FlowScenario {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
}

export type Priority = "must" | "should" | "could";

export interface Requirement {
  id: string;
  text: string;
  provenance: Provenance;
  priority: Priority;
  category?: string;
}

export interface TargetMetric {
  id: string;
  label: string;
  value: string;
  provenance: Provenance;
}

export interface OpenQuestion {
  id: string;
  question: string;
  why: string;
}

export type AdrStatus = "proposed" | "accepted" | "superseded" | "deprecated";

export interface Adr {
  id: string;
  number: number;
  title: string;
  status: AdrStatus;
  context: string;
  problem: string;
  decision: string;
  alternatives: { name: string; reason: string }[];
  consequences: { positive: string[]; negative: string[] };
}

export type Level = "low" | "medium" | "high";

export interface Risk {
  id: string;
  title: string;
  description: string;
  likelihood: Level;
  impact: Level;
  mitigation: string;
  relatedComponentIds: string[];
}

export interface QualityAttribute {
  id: string;
  name: string;
  /** 1 (weak) to 5 (strong) */
  score: number;
  note: string;
}

export type CriterionId =
  | "complexity"
  | "scalability"
  | "reliability"
  | "operations"
  | "cost"
  | "fit";

export interface Alternative {
  id: string;
  name: string;
  summary: string;
  /** 1 (poor) to 5 (excellent). For complexity/operations/cost, 5 means "low burden". */
  ratings: Record<CriterionId, number>;
  pros: string[];
  cons: string[];
  costEstimate: string;
  costAssumptions: string;
  fitVerdict: string;
  isCurrent: boolean;
}

export interface AdvisorExchange {
  question: string;
  answer: string;
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  architectureStyle: string;
  styleJustification: string;
  functionalRequirements: Requirement[];
  nonFunctionalRequirements: Requirement[];
  targets: TargetMetric[];
  assumptions: Requirement[];
  openQuestions: OpenQuestion[];
  components: ArchComponent[];
  relationships: Relationship[];
  flows: FlowScenario[];
  adrs: Adr[];
  risks: Risk[];
  qualityAttributes: QualityAttribute[];
  alternatives: Alternative[];
  advisorScript: AdvisorExchange[];
  updatedAt: string;
}
