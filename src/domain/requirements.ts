import { DomainError, normalize, touch, uniqueId } from "./common";
import type { Priority, Project, Requirement, RequirementsAnalysis } from "./types";

export type RequirementKind = "functional" | "nonFunctional";

const listKey = { functional: "functionalRequirements", nonFunctional: "nonFunctionalRequirements" } as const;

function allIds(p: Project): string[] {
  return [
    ...p.functionalRequirements.map((r) => r.id),
    ...p.nonFunctionalRequirements.map((r) => r.id),
    ...p.assumptions.map((r) => r.id),
    ...p.targets.map((r) => r.id),
    ...p.openQuestions.map((r) => r.id),
  ];
}

function assertText(value: string, what: string) {
  if (value.trim() === "") throw new DomainError(`${what} cannot be empty`);
}

export function addRequirement(
  project: Project,
  kind: RequirementKind,
  input: { text: string; priority: Priority; category?: string },
): Project {
  assertText(input.text, "Requirement text");
  const requirement: Requirement = {
    id: uniqueId(kind === "functional" ? "fr" : "nfr", allIds(project)),
    text: input.text.trim(),
    priority: input.priority,
    provenance: "user",
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
  };
  const key = listKey[kind];
  return touch({ ...project, [key]: [...project[key], requirement] });
}

export function updateRequirement(
  project: Project,
  id: string,
  changes: Partial<Pick<Requirement, "text" | "priority" | "category">>,
): Project {
  if (changes.text !== undefined) assertText(changes.text, "Requirement text");
  let found = false;
  const patch = (list: Requirement[]) =>
    list.map((r) => {
      if (r.id !== id) return r;
      found = true;
      return { ...r, ...changes, provenance: "user" as const };
    });
  const next = {
    ...project,
    functionalRequirements: patch(project.functionalRequirements),
    nonFunctionalRequirements: patch(project.nonFunctionalRequirements),
  };
  if (!found) throw new DomainError(`Requirement "${id}" not found`);
  return touch(next);
}

export function removeRequirement(project: Project, id: string): Project {
  const before = project.functionalRequirements.length + project.nonFunctionalRequirements.length;
  const next = {
    ...project,
    functionalRequirements: project.functionalRequirements.filter((r) => r.id !== id),
    nonFunctionalRequirements: project.nonFunctionalRequirements.filter((r) => r.id !== id),
  };
  if (next.functionalRequirements.length + next.nonFunctionalRequirements.length === before) {
    throw new DomainError(`Requirement "${id}" not found`);
  }
  return touch(next);
}

export function setAssumptionStatus(project: Project, id: string, status: "proposed" | "confirmed" | "rejected"): Project {
  if (!project.assumptions.some((a) => a.id === id)) throw new DomainError(`Assumption "${id}" not found`);
  return touch({ ...project, assumptions: project.assumptions.map((a) => (a.id === id ? { ...a, status } : a)) });
}

export function answerQuestion(project: Project, id: string, answer: string): Project {
  assertText(answer, "Answer");
  if (!project.openQuestions.some((q) => q.id === id)) throw new DomainError(`Question "${id}" not found`);
  return touch({
    ...project,
    openQuestions: project.openQuestions.map((q) => (q.id === id ? { ...q, answer: answer.trim() } : q)),
  });
}

export function clearAnswer(project: Project, id: string): Project {
  return touch({
    ...project,
    openQuestions: project.openQuestions.map((q) => {
      if (q.id !== id) return q;
      const { answer: _answer, ...rest } = q;
      void _answer;
      return rest;
    }),
  });
}

export function unansweredQuestions(project: Project) {
  return project.openQuestions.filter((q) => !q.answer);
}

/**
 * Merges an analysis (already reviewed and filtered by the user) into the project.
 * Items whose text already exists are skipped, so repeating an analysis never duplicates data.
 */
export function mergeAnalysis(project: Project, analysis: RequirementsAnalysis): Project {
  let next = project;
  const known = (list: { text: string }[]) => new Set(list.map((r) => normalize(r.text)));

  const fr = known(next.functionalRequirements);
  analysis.functional.forEach((d) => {
    if (!fr.has(normalize(d.text))) next = addRequirement(next, "functional", d);
  });
  const nfr = known(next.nonFunctionalRequirements);
  analysis.nonFunctional.forEach((d) => {
    if (!nfr.has(normalize(d.text))) next = addRequirement(next, "nonFunctional", d);
  });

  const labels = new Set(next.targets.map((t) => normalize(t.label)));
  analysis.targets.forEach((t) => {
    if (labels.has(normalize(t.label))) return;
    next = { ...next, targets: [...next.targets, { id: uniqueId("tg", allIds(next)), label: t.label, value: t.value, provenance: "user" }] };
  });

  const assumptions = known(next.assumptions);
  analysis.assumptions.forEach((a) => {
    if (assumptions.has(normalize(a.text))) return;
    next = { ...next, assumptions: [...next.assumptions, { id: uniqueId("as", allIds(next)), text: a.text, priority: a.priority, status: "proposed" }] };
  });

  const questions = new Set(next.openQuestions.map((q) => normalize(q.question)));
  analysis.questions.forEach((q) => {
    if (questions.has(normalize(q.question))) return;
    next = { ...next, openQuestions: [...next.openQuestions, { id: uniqueId("q", allIds(next)), question: q.question, why: q.why }] };
  });

  return touch(next);
}

export function upsertTarget(project: Project, label: string, value: string): Project {
  assertText(label, "Target label");
  assertText(value, "Target value");
  const existing = project.targets.find((t) => normalize(t.label) === normalize(label));
  if (existing) {
    return touch({ ...project, targets: project.targets.map((t) => (t.id === existing.id ? { ...t, value: value.trim(), provenance: "user" } : t)) });
  }
  return touch({
    ...project,
    targets: [...project.targets, { id: uniqueId("tg", allIds(project)), label: label.trim(), value: value.trim(), provenance: "user" }],
  });
}

export function removeTarget(project: Project, id: string): Project {
  if (!project.targets.some((t) => t.id === id)) throw new DomainError(`Target "${id}" not found`);
  return touch({ ...project, targets: project.targets.filter((t) => t.id !== id) });
}
