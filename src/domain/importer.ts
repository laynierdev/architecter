import { uniqueId } from "./common";
import { BACKUP_FORMAT_NAME, EXPORT_FORMAT } from "./exchange";
import { MIGRATIONS, migrateProject, type Migration } from "./migrations";
import { ProjectSchema } from "./schemas";
import type { Project } from "./types";

const BACKUP_FORMAT = BACKUP_FORMAT_NAME;
/** Largest import file we are willing to parse. Bigger files are rejected before parsing. */
export const MAX_IMPORT_CHARS = 8_000_000;
export const MAX_PROJECTS_PER_BACKUP = 200;

export interface ImportIssue {
  /** What the message is about: "File" or the name/position of a project inside it. */
  scope: string;
  severity: "error" | "warning";
  message: string;
}

export interface ImportParseResult {
  /** Projects that passed validation. Invalid ones are skipped and reported in `issues`. */
  projects: Project[];
  issues: ImportIssue[];
}

const fileError = (message: string): ImportParseResult => ({ projects: [], issues: [{ scope: "File", severity: "error", message }] });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Builds a short, readable list of validation problems. */
function describeProblems(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const lines = error.issues.slice(0, 4).map((i) => (i.path.length ? `${i.path.map(String).join(" › ")}: ${i.message}` : i.message));
  const more = error.issues.length > 4 ? ` (and ${error.issues.length - 4} more problems)` : "";
  return lines.join("; ") + more;
}

/**
 * Reads a project backup or a whole-workspace backup. Never throws: every problem becomes a
 * readable issue, and valid projects are still returned when only some projects are broken.
 * Nothing here touches storage; the caller decides what to import after the user reviews it.
 */
export function parseImportFile(source: string, registry: Readonly<Record<number, Migration>> = MIGRATIONS): ImportParseResult {
  if (source.length > MAX_IMPORT_CHARS) return fileError(`The file is too large to import (limit ${Math.round(MAX_IMPORT_CHARS / 1_000_000)} MB).`);

  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return fileError("The file is not valid JSON. Was it edited or cut off?");
  }
  if (!isRecord(data)) return fileError("The file does not contain an Architecter backup.");

  const { format, schemaVersion } = data;
  if (format !== EXPORT_FORMAT && format !== BACKUP_FORMAT) return fileError("This is not an Architecter project or workspace backup.");
  if (typeof schemaVersion !== "number") return fileError("The backup has no schema version, so it cannot be checked for compatibility.");

  let rawProjects: unknown[];
  if (format === EXPORT_FORMAT) {
    rawProjects = [data.project];
  } else {
    if (!Array.isArray(data.projects)) return fileError("The backup does not contain a list of projects.");
    if (data.projects.length > MAX_PROJECTS_PER_BACKUP) return fileError(`The backup has more than ${MAX_PROJECTS_PER_BACKUP} projects, which is not supported.`);
    rawProjects = data.projects;
  }

  const projects: Project[] = [];
  const issues: ImportIssue[] = [];
  const total = rawProjects.length;

  rawProjects.forEach((raw, index) => {
    const label = isRecord(raw) && typeof raw.name === "string" && raw.name.trim() ? `“${raw.name.trim().slice(0, 60)}”` : `Project ${index + 1}`;
    const scope = total === 1 ? label : `${label} (#${index + 1})`;
    if (!isRecord(raw)) {
      issues.push({ scope, severity: "error", message: "It is not a valid project object." });
      return;
    }
    const migrated = migrateProject(raw, schemaVersion, registry);
    if (!migrated.ok) {
      issues.push({ scope, severity: "error", message: migrated.error });
      return;
    }
    const parsed = ProjectSchema.safeParse(migrated.data);
    if (!parsed.success) {
      issues.push({ scope, severity: "error", message: `It failed validation. ${describeProblems(parsed.error)}` });
      return;
    }

    let project = parsed.data;
    if (project.documents.length > 0) {
      // Original files are stored per browser and are not part of backups.
      project = { ...project, documents: project.documents.map((d) => ({ ...d, originalStored: false })) };
      issues.push({ scope, severity: "warning", message: `${project.documents.length} source document(s) keep their extracted text, but the original files are not included in backups.` });
    }
    projects.push(project);
  });

  return { projects, issues };
}

// Conflicts -----------------------------------------------------------------

export type ConflictStrategy = "keep-both" | "replace" | "skip";

export interface ImportCandidate {
  project: Project;
  /** True when a project with the same id already exists (or appears earlier in the same file). */
  conflict: boolean;
}

/** Marks which incoming projects collide with existing ones or with each other. */
export function findConflicts(existing: readonly Project[], incoming: readonly Project[]): ImportCandidate[] {
  const seen = new Set(existing.map((p) => p.id));
  return incoming.map((project) => {
    const conflict = seen.has(project.id);
    seen.add(project.id);
    return { project, conflict };
  });
}

export interface ImportOutcome {
  /** Projects to write to storage. */
  save: Project[];
  replaced: number;
  skipped: number;
  /** Imported as new copies because their id was already taken. */
  copied: number;
}

/**
 * Decides what to save. Without a conflict a project is added as is. With a conflict the chosen
 * strategy applies: keep both (new id, "(imported)" suffix), replace the existing one, or skip.
 * Importing never merges two projects into one.
 */
export function resolveImport(
  existing: readonly Project[],
  incoming: readonly Project[],
  strategyFor: (project: Project) => ConflictStrategy,
): ImportOutcome {
  const takenIds = new Set(existing.map((p) => p.id));
  const save: Project[] = [];
  let replaced = 0;
  let skipped = 0;
  let copied = 0;

  for (const candidate of findConflicts(existing, incoming)) {
    const { project } = candidate;
    if (!candidate.conflict) {
      takenIds.add(project.id);
      save.push(project);
      continue;
    }
    const strategy = strategyFor(project);
    if (strategy === "skip") {
      skipped++;
    } else if (strategy === "replace" && existing.some((p) => p.id === project.id)) {
      replaced++;
      save.push(project);
    } else {
      // "keep-both", and also "replace" for a duplicate inside the file itself (nothing to replace).
      const id = uniqueId("proj", takenIds);
      takenIds.add(id);
      copied++;
      save.push({ ...project, id, name: `${project.name} (imported)`.slice(0, 80) });
    }
  }
  return { save, replaced, skipped, copied };
}
