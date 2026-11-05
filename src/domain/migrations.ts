import { SCHEMA_VERSION } from "./schemas";

/** A step that upgrades raw (unvalidated) project data from version N to N + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registry of migrations, keyed by the version they upgrade FROM. Schema v1 is the first version,
 * so it is empty today. When the schema changes, bump SCHEMA_VERSION and add the step here so that
 * older backups and older saved projects keep loading.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type MigrationResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/** Upgrades raw project data to the current schema version, step by step. */
export function migrateProject(
  raw: Record<string, unknown>,
  from: number,
  registry: Readonly<Record<number, Migration>> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  if (!Number.isInteger(from) || from < 1) return { ok: false, error: "The data has an invalid schema version." };
  if (from > target) {
    return { ok: false, error: `It uses schema version ${from}, which is newer than the supported version ${target}. Update Architecter to open it.` };
  }
  let data = raw;
  for (let version = from; version < target; version++) {
    const step = registry[version];
    if (!step) return { ok: false, error: `Schema version ${from} is too old: there is no upgrade path from version ${version}.` };
    try {
      data = step(data);
    } catch {
      return { ok: false, error: `The upgrade from schema version ${version} failed.` };
    }
  }
  return { ok: true, data };
}
