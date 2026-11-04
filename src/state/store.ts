import { InMemoryProjectRepository, type ProjectRepository } from "@/repositories/projectRepository";
import { demoProject } from "@/mock/demoProject";

/**
 * The single repository used by the app. Stage 2 keeps projects in memory (they survive client-side
 * navigation but not a page reload). Stage 4 replaces this with a localStorage implementation.
 */
export const projectRepository: ProjectRepository = new InMemoryProjectRepository([demoProject]);
