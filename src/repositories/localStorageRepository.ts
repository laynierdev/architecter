import { migrateProject } from "@/domain/migrations";
import { validateProject } from "@/domain/project";
import { ProjectSchema, SCHEMA_VERSION } from "@/domain/schemas";
import type { Project } from "@/domain/types";
import { InMemoryProjectRepository, StorageError, type LoadIssue, type ProjectRepository, type StorageUsage } from "./projectRepository";

/** The part of the Web Storage API we use. Tests pass an in-memory implementation. */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = "architecter:v1:";
export const PROJECT_PREFIX = `${STORAGE_PREFIX}project:`;
export const META_KEY = `${STORAGE_PREFIX}meta`;
export const STORED_FORMAT = "architecter-stored";
const APPROX_LIMIT_CHARS = 5_000_000;

const projectKey = (id: string) => `${PROJECT_PREFIX}${id}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; code?: number } | null;
  return err?.name === "QuotaExceededError" || err?.name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22 || err?.code === 1014;
}

type Entry = { project: Project } | { issue: string };

/**
 * Reads one stored entry. Anything unreadable becomes an issue message; it never throws, and the
 * raw data is never deleted here.
 */
function readEntry(key: string, raw: string): Entry {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { issue: "The stored data is not valid JSON." };
  }
  if (!isRecord(data) || data.format !== STORED_FORMAT || !isRecord(data.project)) return { issue: "The stored data has an unknown format." };
  if (typeof data.schemaVersion !== "number") return { issue: "The stored data has no schema version." };

  const migrated = migrateProject(data.project, data.schemaVersion);
  if (!migrated.ok) return { issue: migrated.error };
  const parsed = ProjectSchema.safeParse(migrated.data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { issue: `The stored project is invalid${first ? `: ${first.path.map(String).join(" › ") || "project"}: ${first.message}` : "."}` };
  }
  if (projectKey(parsed.data.id) !== key) return { issue: "The stored project does not match its storage key." };
  return { project: parsed.data };
}

/**
 * Persists every project under its own key, so one damaged entry can never take the others down.
 * Entries are validated when loaded; unreadable ones are reported (never silently dropped or
 * deleted). Write failures raise StorageError, but the in-memory copy stays current.
 */
export class LocalStorageProjectRepository implements ProjectRepository {
  readonly persistent = true;
  private readonly projects = new Map<string, Project>();
  private readonly issues = new Map<string, LoadIssue>();
  private readonly unsaved = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private listCache: Project[] = [];
  private issuesCache: readonly LoadIssue[] = [];
  private loaded = false;

  constructor(
    private readonly storage: StorageLike,
    private readonly options: { seed?: Project[] } = {},
  ) {}

  // Loading -------------------------------------------------------------------

  private keys(prefix: string): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    for (const key of this.keys(PROJECT_PREFIX)) this.readKey(key);
    this.seedOnce();
    this.refresh();
  }

  private readKey(key: string) {
    const raw = this.storage.getItem(key);
    const id = key.slice(PROJECT_PREFIX.length);
    this.projects.delete(id);
    this.issues.delete(key);
    if (raw === null) return;
    const entry = readEntry(key, raw);
    if ("project" in entry) this.projects.set(entry.project.id, entry.project);
    else this.issues.set(key, { key, message: entry.issue, raw });
  }

  /** The demo project is added only the first time ever, so deleting it sticks. */
  private seedOnce() {
    let seeded = false;
    try {
      seeded = this.storage.getItem(META_KEY) !== null;
    } catch {
      return;
    }
    if (seeded) return;
    try {
      if (this.projects.size === 0 && this.issues.size === 0) {
        for (const project of this.options.seed ?? []) {
          const valid = validateProject(project);
          this.storage.setItem(projectKey(valid.id), this.serialize(valid));
          this.projects.set(valid.id, valid);
        }
      }
      this.storage.setItem(META_KEY, JSON.stringify({ seeded: true, at: new Date().toISOString() }));
    } catch {
      /* Seeding is a convenience: if storage rejects it, the app still works. */
    }
  }

  // Reading -------------------------------------------------------------------

  list(): Project[] {
    this.load();
    return this.listCache;
  }

  get(id: string): Project | undefined {
    this.load();
    return this.projects.get(id);
  }

  loadIssues(): readonly LoadIssue[] {
    this.load();
    return this.issuesCache;
  }

  /** Ids of projects whose latest changes could not be written to storage. */
  unsavedIds(): ReadonlySet<string> {
    return this.unsaved;
  }

  usage(): StorageUsage {
    let chars = 0;
    for (const key of this.keys(STORAGE_PREFIX)) chars += key.length + (this.storage.getItem(key)?.length ?? 0);
    return { chars, approxLimitChars: APPROX_LIMIT_CHARS };
  }

  // Writing -------------------------------------------------------------------

  private serialize(project: Project): string {
    return JSON.stringify({ format: STORED_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), project });
  }

  save(project: Project): void {
    this.load();
    const valid = validateProject(project);
    this.projects.set(valid.id, valid);
    this.refresh();
    try {
      this.storage.setItem(projectKey(valid.id), this.serialize(valid));
      this.unsaved.delete(valid.id);
      this.emit();
    } catch (e) {
      this.unsaved.add(valid.id);
      this.emit();
      throw isQuotaError(e)
        ? new StorageError("quota", "Browser storage is full. Export a backup and delete projects or documents you no longer need.")
        : new StorageError("unavailable", "Browser storage is not available, so the project could not be saved.");
    }
  }

  delete(id: string): void {
    this.load();
    this.projects.delete(id);
    this.unsaved.delete(id);
    this.refresh();
    this.emit();
    try {
      this.storage.removeItem(projectKey(id));
    } catch {
      throw new StorageError("unavailable", "The project was removed from this session, but browser storage could not be updated.");
    }
  }

  discardIssue(key: string): void {
    this.load();
    this.issues.delete(key);
    try {
      this.storage.removeItem(key);
    } finally {
      this.refresh();
      this.emit();
    }
  }

  // Synchronisation -----------------------------------------------------------

  /** Called when another tab changed storage. `key` is null when storage was cleared. */
  reloadKey(key: string | null): void {
    this.load();
    if (key === null) {
      this.projects.clear();
      this.issues.clear();
      for (const k of this.keys(PROJECT_PREFIX)) this.readKey(k);
    } else if (key.startsWith(PROJECT_PREFIX)) {
      this.readKey(key);
    } else {
      return;
    }
    this.refresh();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private refresh() {
    this.listCache = [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
    this.issuesCache = [...this.issues.values()];
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

/**
 * Picks the repository for the current environment: localStorage in a browser that allows it,
 * otherwise memory only (private mode, blocked storage, server rendering).
 */
export function createBrowserRepository(seed: Project[]): ProjectRepository {
  if (typeof window === "undefined") return new InMemoryProjectRepository();
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    const repository = new LocalStorageProjectRepository(storage, { seed });
    window.addEventListener("storage", (event) => {
      if (event.storageArea === storage) repository.reloadKey(event.key);
    });
    return repository;
  } catch {
    return new InMemoryProjectRepository(seed);
  }
}
