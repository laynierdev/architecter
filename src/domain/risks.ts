import { DomainError, normalize, touch, uniqueId } from "./common";
import type { Level, Project, Risk, RiskDraft } from "./types";

const LEVEL_VALUE: Record<Level, number> = { low: 1, medium: 2, high: 3 };

/** Likelihood × impact, from 1 (negligible) to 9 (critical). */
export const riskScore = (r: Pick<Risk, "likelihood" | "impact">): number => LEVEL_VALUE[r.likelihood] * LEVEL_VALUE[r.impact];

export function riskBand(score: number): "low" | "medium" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export const sortRisksBySeverity = (risks: Risk[]): Risk[] => [...risks].sort((a, b) => riskScore(b) - riskScore(a) || a.title.localeCompare(b.title));

function assertRelated(project: Project, ids: string[]) {
  const known = new Set(project.components.map((c) => c.id));
  const missing = ids.filter((i) => !known.has(i));
  if (missing.length) throw new DomainError(`Unknown component(s): ${missing.join(", ")}`);
}

export function addRisk(project: Project, draft: RiskDraft): Project {
  if (draft.title.trim() === "") throw new DomainError("Risk title is required");
  assertRelated(project, draft.relatedComponentIds);
  const risk: Risk = { ...draft, title: draft.title.trim(), id: uniqueId("risk", project.risks.map((r) => r.id)) };
  return touch({ ...project, risks: [...project.risks, risk] });
}

export function updateRisk(project: Project, id: string, changes: Partial<Omit<Risk, "id">>): Project {
  if (!project.risks.some((r) => r.id === id)) throw new DomainError(`Risk "${id}" not found`);
  if (changes.title !== undefined && changes.title.trim() === "") throw new DomainError("Risk title is required");
  if (changes.relatedComponentIds) assertRelated(project, changes.relatedComponentIds);
  return touch({ ...project, risks: project.risks.map((r) => (r.id === id ? { ...r, ...changes } : r)) });
}

export function removeRisk(project: Project, id: string): Project {
  if (!project.risks.some((r) => r.id === id)) throw new DomainError(`Risk "${id}" not found`);
  return touch({ ...project, risks: project.risks.filter((r) => r.id !== id) });
}

/** Adds only the drafts whose titles are not already tracked. Returns the new project and how many were added. */
export function addRisksSkippingDuplicates(project: Project, drafts: RiskDraft[]): { project: Project; added: number } {
  const titles = new Set(project.risks.map((r) => normalize(r.title)));
  let next = project;
  let added = 0;
  for (const d of drafts) {
    if (titles.has(normalize(d.title))) continue;
    next = addRisk(next, d);
    titles.add(normalize(d.title));
    added++;
  }
  return { project: next, added };
}
