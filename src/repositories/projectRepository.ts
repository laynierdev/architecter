import { validateProject } from "@/domain/project";
import type { Project } from "@/domain/types";

/**
 * Storage abstraction. Stage 2 ships an in-memory implementation; Stage 4 adds localStorage
 * behind the same interface, so nothing above this layer changes.
 */
export interface ProjectRepository {
  list(): Project[];
  get(id: string): Project | undefined;
  /** Validates and stores the project. Throws a DomainError when it is invalid. */
  save(project: Project): void;
  delete(id: string): void;
  /** Notifies on any change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export class InMemoryProjectRepository implements ProjectRepository {
  private projects = new Map<string, Project>();
  private listeners = new Set<() => void>();
  // A stable array reference between changes keeps useSyncExternalStore from looping.
  private cache: Project[] = [];

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

  private refresh() {
    this.cache = [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private emit() {
    this.refresh();
    this.listeners.forEach((l) => l());
  }
}
