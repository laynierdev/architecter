import { DomainError, touch, uniqueId } from "./common";
import type { Adr, AdrDraft, AdrStatus, Project } from "./types";

/** Allowed lifecycle transitions. `superseded` and `deprecated` are terminal. */
const TRANSITIONS: Record<AdrStatus, AdrStatus[]> = {
  proposed: ["accepted", "deprecated"],
  accepted: ["superseded", "deprecated"],
  superseded: [],
  deprecated: [],
};

export const canTransition = (from: AdrStatus, to: AdrStatus): boolean => from === to || TRANSITIONS[from].includes(to);
export const allowedStatuses = (from: AdrStatus): AdrStatus[] => [from, ...TRANSITIONS[from]];

export function nextAdrNumber(project: Project): number {
  return project.adrs.reduce((max, a) => Math.max(max, a.number), 0) + 1;
}

export function createAdr(project: Project, draft: AdrDraft): Project {
  if (draft.title.trim() === "") throw new DomainError("ADR title is required");
  const adr: Adr = {
    ...draft,
    title: draft.title.trim(),
    id: uniqueId("adr", project.adrs.map((a) => a.id)),
    number: nextAdrNumber(project),
    status: "proposed",
  };
  return touch({ ...project, adrs: [...project.adrs, adr] });
}

export function updateAdr(project: Project, id: string, changes: Partial<Omit<Adr, "id" | "number" | "status" | "supersededBy">>): Project {
  if (!project.adrs.some((a) => a.id === id)) throw new DomainError(`ADR "${id}" not found`);
  if (changes.title !== undefined && changes.title.trim() === "") throw new DomainError("ADR title is required");
  return touch({ ...project, adrs: project.adrs.map((a) => (a.id === id ? { ...a, ...changes } : a)) });
}

export function changeAdrStatus(project: Project, id: string, status: AdrStatus): Project {
  const adr = project.adrs.find((a) => a.id === id);
  if (!adr) throw new DomainError(`ADR "${id}" not found`);
  if (!canTransition(adr.status, status)) throw new DomainError(`An ADR cannot move from "${adr.status}" to "${status}"`);
  return touch({ ...project, adrs: project.adrs.map((a) => (a.id === id ? { ...a, status } : a)) });
}

/** Marks `oldId` as superseded by `newId`. The older record is kept for history. */
export function supersedeAdr(project: Project, oldId: string, newId: string): Project {
  if (oldId === newId) throw new DomainError("An ADR cannot supersede itself");
  const next = project.adrs.find((a) => a.id === newId);
  if (!next) throw new DomainError(`ADR "${newId}" not found`);
  const withStatus = changeAdrStatus(project, oldId, "superseded");
  return touch({ ...withStatus, adrs: withStatus.adrs.map((a) => (a.id === oldId ? { ...a, supersededBy: newId } : a)) });
}

export function removeAdr(project: Project, id: string): Project {
  if (!project.adrs.some((a) => a.id === id)) throw new DomainError(`ADR "${id}" not found`);
  return touch({
    ...project,
    adrs: project.adrs.filter((a) => a.id !== id).map((a) => (a.supersededBy === id ? { ...a, supersededBy: undefined } : a)),
  });
}
