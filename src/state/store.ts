import { demoProject } from "@/mock/demoProject";
import { createBrowserRepository } from "@/repositories/localStorageRepository";
import { createDocumentStore, type DocumentStore } from "@/repositories/documentStore";
import type { ProjectRepository } from "@/repositories/projectRepository";

let repository: ProjectRepository | undefined;
let documents: DocumentStore | undefined;

/**
 * The single repository used by the app, created on first use. In the browser it persists to
 * localStorage (the demo project is added the very first time); on the server it is an empty
 * in-memory stand-in, because pages only read project data after hydration.
 */
export function getProjectRepository(): ProjectRepository {
  repository ??= createBrowserRepository([demoProject]);
  return repository;
}

/** Original uploaded files (IndexedDB in the browser). */
export function getDocumentStore(): DocumentStore {
  documents ??= createDocumentStore();
  return documents;
}
