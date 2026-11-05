import { validateProject } from "@/domain/project";
import type { Project } from "@/domain/types";

/** A stored entry that could not be read. It is kept in storage untouched until the user decides. */
export interface LoadIssue {
  key: string;
  message: string;
  /** The raw stored text, so it can be downloaded for manual recovery. */
  raw: string;
}

export interface StorageUsage {
  /** Characters used by Architecter entries (keys and values). */
  chars: number;
  /** Rough browser limit. Browsers differ, so treat it as an estimate. */
  approxLimitChars: number;
}

export type StorageErrorCode = "quota" | "unavailable" | "unknown";

/** Raised when data could not be written to browser storage. The change is still held in memory. */
export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

/**
 * Storage abstraction. The app uses a localStorage implementation in the browser and an in-memory
 * one as a fallback (and in tests); nothing above this layer knows which one it is talking to.
 */
export interface ProjectRepository {
  list(): Project[];
  get(id: string): Project | undefined;
  /** Validates and stores the project. Throws a DomainError when invalid, a StorageError when the write fails. */
  save(project: Project): void;
  delete(id: string): void;
  /** Notifies on any change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** False when data only lives in memory: nothing survives a page reload. */
  readonly persistent: boolean;
  /** Stored entries that could not be loaded. A stable array between changes. */
  loadIssues(): readonly LoadIssue[];
  /** Permanently removes an unreadable entry. Only called after an explicit user action. */
  discardIssue(key: string): void;
  usage(): StorageUsage | undefined;
}

export class InMemoryProjectRepository implements ProjectRepository {
  readonly persistent = false;
  private projects = new Map<string, Project>();
  private listeners = new Set<() => void>();
  // A stable array reference between changes keeps useSyncExternalStore from looping.
  private cache: Project[] = [];
  private static readonly NO_ISSUES: readonly LoadIssue[] = [];

  constructor(initial: Project[] = []) {
    initial.forEach((p) => this.projects.set(p.id, validateProject(p)));
    this.refresh();
  }

  list(): Project[] {
    return this.cache;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  save(project: Project): void {
    this.projects.set(project.id, validateProject(project));
    this.emit();
  }

  delete(id: string): void {
    this.projects.delete(id);
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  loadIssues(): readonly LoadIssue[] {
    return InMemoryProjectRepository.NO_ISSUES;
  }

  discardIssue(): void {
    /* Nothing is ever unreadable in memory. */
  }

  usage(): StorageUsage | undefined {
    return undefined;
  }

  private refresh() {
    this.cache = [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private emit() {
    this.refresh();
    this.listeners.forEach((l) => l());
  }
}
