import { DomainError, touch, uniqueId } from "./common";
import type { ArchComponent, ImpactReport, Project, Relationship } from "./types";

export type ComponentInput = Omit<ArchComponent, "id" | "provenance"> & { provenance?: ArchComponent["provenance"] };
export type RelationshipInput = Omit<Relationship, "id">;

// Components ------------------------------------------------------------

export function addComponent(project: Project, input: ComponentInput, id?: string): Project {
  if (input.name.trim() === "") throw new DomainError("Component name is required");
  const newId = id ?? uniqueId("cmp", project.components.map((c) => c.id));
  if (project.components.some((c) => c.id === newId)) throw new DomainError(`Component id "${newId}" already exists`);
  if (project.components.some((c) => c.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
    throw new DomainError(`A component named "${input.name.trim()}" already exists`);
  }
  const component: ArchComponent = { provenance: "user", ...input, name: input.name.trim(), id: newId };
  return touch({ ...project, components: [...project.components, component] });
}

export function updateComponent(project: Project, id: string, changes: Partial<Omit<ArchComponent, "id">>): Project {
  if (!project.components.some((c) => c.id === id)) throw new DomainError(`Component "${id}" not found`);
  if (changes.name !== undefined) {
    const name = changes.name.trim().toLowerCase();
    if (name === "") throw new DomainError("Component name is required");
    if (project.components.some((c) => c.id !== id && c.name.trim().toLowerCase() === name)) {
      throw new DomainError(`A component named "${changes.name.trim()}" already exists`);
    }
  }
  return touch({ ...project, components: project.components.map((c) => (c.id === id ? { ...c, ...changes } : c)) });
}

/** Removes a component and cleans every reference to it (connections, flows, risks). */
export function removeComponent(project: Project, id: string): Project {
  if (!project.components.some((c) => c.id === id)) throw new DomainError(`Component "${id}" not found`);
  const removedRelIds = new Set(project.relationships.filter((r) => r.source === id || r.target === id).map((r) => r.id));
  return touch({
    ...project,
    components: project.components.filter((c) => c.id !== id),
    relationships: project.relationships.filter((r) => !removedRelIds.has(r.id)),
    flows: cleanFlows(project.flows, removedRelIds),
    risks: project.risks.map((r) => ({ ...r, relatedComponentIds: r.relatedComponentIds.filter((c) => c !== id) })),
  });
}

/** User confirms an AI recommendation or assumption: it becomes a user-owned decision. */
export function confirmComponent(project: Project, id: string): Project {
  return updateComponent(project, id, { provenance: "user" });
}

// Relationships ---------------------------------------------------------

export function addRelationship(project: Project, input: RelationshipInput, id?: string): Project {
  if (input.source === input.target) throw new DomainError("A component cannot connect to itself");
  if (!project.components.some((c) => c.id === input.source)) throw new DomainError(`Unknown source component "${input.source}"`);
  if (!project.components.some((c) => c.id === input.target)) throw new DomainError(`Unknown target component "${input.target}"`);
  if (project.relationships.some((r) => r.source === input.source && r.target === input.target && r.protocol === input.protocol)) {
    throw new DomainError("This connection already exists");
  }
  const newId = id ?? uniqueId("rel", project.relationships.map((r) => r.id));
  if (project.relationships.some((r) => r.id === newId)) throw new DomainError(`Relationship id "${newId}" already exists`);
  return touch({ ...project, relationships: [...project.relationships, { ...input, id: newId }] });
}

export function updateRelationship(project: Project, id: string, changes: Partial<Pick<Relationship, "protocol" | "label" | "async">>): Project {
  if (!project.relationships.some((r) => r.id === id)) throw new DomainError(`Relationship "${id}" not found`);
  return touch({ ...project, relationships: project.relationships.map((r) => (r.id === id ? { ...r, ...changes } : r)) });
}

export function removeRelationship(project: Project, id: string): Project {
  if (!project.relationships.some((r) => r.id === id)) throw new DomainError(`Relationship "${id}" not found`);
  return touch({
    ...project,
    relationships: project.relationships.filter((r) => r.id !== id),
    flows: cleanFlows(project.flows, new Set([id])),
  });
}

function cleanFlows(flows: Project["flows"], removed: Set<string>): Project["flows"] {
  return flows.map((f) => ({
    ...f,
    steps: f.steps
      .map((s) => ({ ...s, edgeIds: s.edgeIds.filter((e) => !removed.has(e)) }))
      .filter((s) => s.edgeIds.length > 0),
  }));
}

// Analysis --------------------------------------------------------------

function reachable(start: string, edges: Relationship[], direction: "forward" | "backward"): string[] {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const e of edges) {
      const [from, to] = direction === "forward" ? [e.source, e.target] : [e.target, e.source];
      if (from === current && !seen.has(to) && to !== start) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return [...seen];
}

/** What is affected if a component changes or fails. Purely structural and deterministic. */
export function analyzeImpact(project: Project, componentId: string): ImpactReport {
  const component = project.components.find((c) => c.id === componentId);
  if (!component) throw new DomainError(`Component "${componentId}" not found`);

  const dependents = reachable(componentId, project.relationships, "backward");
  const dependencies = reachable(componentId, project.relationships, "forward");
  const incident = new Set(project.relationships.filter((r) => r.source === componentId || r.target === componentId).map((r) => r.id));
  const affectedFlows = project.flows.filter((f) => f.steps.some((s) => s.edgeIds.some((e) => incident.has(e)))).map((f) => f.id);
  const relatedRisks = project.risks.filter((r) => r.relatedComponentIds.includes(componentId)).map((r) => r.id);

  const name = (id: string) => project.components.find((c) => c.id === id)?.name ?? id;
  const parts = [
    dependents.length
      ? `${dependents.length} component(s) depend on ${component.name}: ${dependents.map(name).join(", ")}.`
      : `No other component depends on ${component.name}.`,
    dependencies.length ? `It relies on ${dependencies.length} component(s): ${dependencies.map(name).join(", ")}.` : `It has no downstream dependencies.`,
    affectedFlows.length ? `${affectedFlows.length} simulated flow(s) pass through it.` : "",
  ];
  return { componentId, dependents, dependencies, affectedFlows, relatedRisks, summary: parts.filter(Boolean).join(" ") };
}

export interface ArchitectureIssue {
  id: string;
  severity: "warning" | "info";
  message: string;
  componentIds: string[];
}

/** Simple structural checks that catch common design smells. */
export function findIssues(project: Project): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const byId = new Map(project.components.map((c) => [c.id, c]));

  project.components.forEach((c) => {
    const connected = project.relationships.some((r) => r.source === c.id || r.target === c.id);
    if (!connected && project.components.length > 1) {
      issues.push({ id: `orphan-${c.id}`, severity: "warning", message: `${c.name} is not connected to anything.`, componentIds: [c.id] });
    }
  });

  project.components
    .filter((c) => c.kind === "database")
    .forEach((db) => {
      const writers = project.relationships.filter((r) => r.target === db.id && byId.get(r.source)?.kind !== "client");
      if (writers.length > 1) {
        issues.push({
          id: `shared-db-${db.id}`,
          severity: "warning",
          message: `${db.name} is accessed by ${writers.length} components. Shared databases couple their schemas and deployments.`,
          componentIds: [db.id, ...writers.map((w) => w.source)],
        });
      }
    });

  project.relationships.forEach((r) => {
    const source = byId.get(r.source);
    const target = byId.get(r.target);
    if (source?.kind === "client" && target && ["database", "cache", "queue"].includes(target.kind)) {
      issues.push({
        id: `client-direct-${r.id}`,
        severity: "warning",
        message: `${source.name} talks directly to ${target.name}. Clients should go through an API.`,
        componentIds: [source.id, target.id],
      });
    }
  });

  const assumptionBased = project.components.filter((c) => c.provenance === "assumption");
  if (assumptionBased.length) {
    issues.push({
      id: "assumptions",
      severity: "info",
      message: `${assumptionBased.length} component(s) rest on unconfirmed assumptions.`,
      componentIds: assumptionBased.map((c) => c.id),
    });
  }
  return issues;
}
