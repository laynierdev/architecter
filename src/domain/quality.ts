import { DomainError, normalize, touch, uniqueId } from "./common";
import type { Alternative, Project, QualityAttribute } from "./types";

/** Quality attributes Architecter evaluates. Used as suggestions, never added automatically. */
export const STANDARD_ATTRIBUTES = [
  "Scalability",
  "Availability",
  "Reliability",
  "Security",
  "Performance",
  "Maintainability",
  "Observability",
  "Cost efficiency",
  "Data consistency",
  "Disaster recovery",
] as const;

export function addQualityAttribute(project: Project, input: Omit<QualityAttribute, "id">): Project {
  if (input.name.trim() === "") throw new DomainError("Attribute name is required");
  if (project.qualityAttributes.some((q) => normalize(q.name) === normalize(input.name))) {
    throw new DomainError(`"${input.name.trim()}" is already assessed`);
  }
  const attribute: QualityAttribute = { ...input, name: input.name.trim(), id: uniqueId("qa", project.qualityAttributes.map((q) => q.id)) };
  return touch({ ...project, qualityAttributes: [...project.qualityAttributes, attribute] });
}

export function updateQualityAttribute(project: Project, id: string, changes: Partial<Omit<QualityAttribute, "id">>): Project {
  if (!project.qualityAttributes.some((q) => q.id === id)) throw new DomainError(`Quality attribute "${id}" not found`);
  if (changes.name !== undefined && project.qualityAttributes.some((q) => q.id !== id && normalize(q.name) === normalize(changes.name as string))) {
    throw new DomainError(`"${changes.name.trim()}" is already assessed`);
  }
  return touch({ ...project, qualityAttributes: project.qualityAttributes.map((q) => (q.id === id ? { ...q, ...changes } : q)) });
}

export function removeQualityAttribute(project: Project, id: string): Project {
  if (!project.qualityAttributes.some((q) => q.id === id)) throw new DomainError(`Quality attribute "${id}" not found`);
  return touch({ ...project, qualityAttributes: project.qualityAttributes.filter((q) => q.id !== id) });
}

/** Attributes from the standard list that have not been assessed yet. */
export const unassessedAttributes = (project: Project): string[] =>
  STANDARD_ATTRIBUTES.filter((name) => !project.qualityAttributes.some((q) => normalize(q.name) === normalize(name)));

// Alternatives (used by the comparison feature) --------------------------

export function addAlternative(project: Project, input: Omit<Alternative, "id">): Project {
  if (input.name.trim() === "") throw new DomainError("Alternative name is required");
  const alt: Alternative = { ...input, name: input.name.trim(), id: uniqueId("alt", project.alternatives.map((a) => a.id)) };
  return touch({ ...project, alternatives: withSingleCurrent(project.alternatives, alt) });
}

export function updateAlternative(project: Project, id: string, changes: Partial<Omit<Alternative, "id">>): Project {
  const existing = project.alternatives.find((a) => a.id === id);
  if (!existing) throw new DomainError(`Alternative "${id}" not found`);
  if (changes.name !== undefined && changes.name.trim() === "") throw new DomainError("Alternative name is required");
  const updated = { ...existing, ...changes };
  const others = project.alternatives.filter((a) => a.id !== id);
  const merged = withSingleCurrent(others, updated);
  return touch({ ...project, alternatives: project.alternatives.map((a) => merged.find((m) => m.id === a.id) ?? a) });
}

export function removeAlternative(project: Project, id: string): Project {
  if (!project.alternatives.some((a) => a.id === id)) throw new DomainError(`Alternative "${id}" not found`);
  return touch({ ...project, alternatives: project.alternatives.filter((a) => a.id !== id) });
}

/** At most one alternative can be marked as the current proposal. */
function withSingleCurrent(others: Alternative[], incoming: Alternative): Alternative[] {
  const cleaned = incoming.isCurrent ? others.map((a) => ({ ...a, isCurrent: false })) : others;
  const exists = others.some((a) => a.id === incoming.id);
  return exists ? cleaned : [...cleaned, incoming];
}
