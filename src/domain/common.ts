import type { Project } from "./types";

/** Thrown when a domain operation would produce an invalid or inconsistent project. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Generates an id that does not collide with any of the existing ones. */
export function uniqueId(prefix: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  let candidate = randomId(prefix);
  while (taken.has(candidate)) candidate = randomId(prefix);
  return candidate;
}

export const nowIso = (): string => new Date().toISOString();

/** Returns the project with a refreshed `updatedAt`. */
export function touch(project: Project): Project {
  return { ...project, updatedAt: nowIso() };
}

export function normalize(textValue: string): string {
  return textValue.trim().toLowerCase().replace(/\s+/g, " ");
}
