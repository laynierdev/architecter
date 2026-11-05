"use client";

import { useSyncExternalStore } from "react";
import type { Project } from "@/domain/types";
import type { LoadIssue } from "@/repositories/projectRepository";
import { getProjectRepository } from "./store";

/**
 * Stored data only exists in the browser, so the server (and the first client render, which must
 * match it) sees an empty placeholder. `useSyncExternalStore` swaps in the real data right after
 * hydration, without a mismatch.
 */
const subscribe = (listener: () => void) => getProjectRepository().subscribe(listener);
const noSubscription = () => () => undefined;

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_ISSUES: readonly LoadIssue[] = [];

/** False while rendering on the server and during hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

export function useProjects(): Project[] {
  return useSyncExternalStore(
    subscribe,
    () => getProjectRepository().list(),
    () => EMPTY_PROJECTS,
  );
}

export function useProjectById(id: string): Project | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getProjectRepository().get(id),
    () => undefined,
  );
}

export function useLoadIssues(): readonly LoadIssue[] {
  return useSyncExternalStore(
    subscribe,
    () => getProjectRepository().loadIssues(),
    () => EMPTY_ISSUES,
  );
}
