import { DomainError, nowIso, randomId, touch } from "./common";
import { ProjectSchema, SCHEMA_VERSION } from "./schemas";
import type { Project, TargetMetric } from "./types";

export interface NewProjectInput {
  name: string;
  description: string;
  /** Targets the user already knows. Blank values are ignored, never invented. */
  targets?: { label: string; value: string }[];
}

export function createProject(input: NewProjectInput): Project {
  const now = nowIso();
  const targets: TargetMetric[] = (input.targets ?? [])
    .filter((t) => t.value.trim() !== "")
    .map((t) => ({ id: randomId("tg"), label: t.label, value: t.value.trim(), provenance: "user" as const }));

  const result = ProjectSchema.safeParse({
    schemaVersion: SCHEMA_VERSION,
    id: randomId("proj"),
    name: input.name,
    tagline: "",
    description: input.description,
    architectureStyle: "",
    styleJustification: "",
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    targets,
    assumptions: [],
    openQuestions: [],
    components: [],
    relationships: [],
    flows: [],
    adrs: [],
    risks: [],
    qualityAttributes: [],
    alternatives: [],
    snapshots: [],
    documents: [],
    createdAt: now,
    updatedAt: now,
  });
  if (!result.success) throw new DomainError(result.error.issues[0]?.message ?? "Invalid project");
  return result.data;
}

export function updateProjectInfo(
  project: Project,
  changes: Partial<Pick<Project, "name" | "tagline" | "description" | "architectureStyle" | "styleJustification">>,
): Project {
  return touch({ ...project, ...changes });
}

/** Validates a project and returns the parsed (trimmed) result, or throws a readable error. */
export function validateProject(project: unknown): Project {
  const result = ProjectSchema.safeParse(project);
  if (!result.success) {
    const first = result.error.issues[0];
    // The path helps find the problem in imported data; the message itself stays human readable.
    throw new DomainError(first ? (first.path.length ? `${first.path.join(" › ")}: ${first.message}` : first.message) : "Invalid project");
  }
  return result.data;
}

/**
 * Creates an independent copy of a project: new id, fresh timestamps, a name that says it is a copy.
 * Snapshots are kept (they are part of the history); source documents keep their extracted text but
 * the caller must copy the original files separately.
 */
export function duplicateProject(project: Project, existingNames: readonly string[] = []): Project {
  const now = nowIso();
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const base = `Copy of ${project.name}`.slice(0, 74);
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  return validateProject({ ...structuredClone(project), id: randomId("proj"), name, createdAt: now, updatedAt: now });
}
