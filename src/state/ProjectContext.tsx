"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAIProvider, type AIMode } from "@/ai";
import type { ApiAIProvider } from "@/ai/clientProvider";
import { validateProject } from "@/domain/project";
import type { Project } from "@/domain/types";
import { canRedo, canUndo, createHistory, push, redo, undo, type History } from "./history";
import { projectRepository } from "./store";

export type RunResult = { ok: true } | { ok: false; error: string };

interface ProjectContextValue {
  project: Project;
  /**
   * Applies a pure domain operation. The result is validated, recorded in the undo history and saved.
   * Domain errors are returned (never thrown) so forms can show them inline.
   */
  run: (operation: (project: Project) => Project) => RunResult;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  ai: ApiAIProvider;
  /** Which AI produced the latest answer (mock, fallback or Gemini). Updates after every AI call. */
  aiMode: AIMode;
}

const Context = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ initial, children }: { initial: Project; children: ReactNode }) {
  const [history, setHistory] = useState<History<Project>>(() => createHistory(initial));
  // The ref always holds the latest history so two quick operations never act on stale state.
  const latest = useRef(history);
  const ai = useMemo(() => createAIProvider(), []);
  const aiMode = useSyncExternalStore(ai.subscribe, ai.getSnapshot, ai.getSnapshot);

  useEffect(() => {
    void ai.refreshStatus();
  }, [ai]);

  const commit = useCallback((next: History<Project>) => {
    latest.current = next;
    setHistory(next);
    projectRepository.save(next.present);
  }, []);

  const run = useCallback<ProjectContextValue["run"]>(
    (operation) => {
      try {
        const next = validateProject(operation(latest.current.present));
        commit(push(latest.current, next));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
      }
    },
    [commit],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      project: history.present,
      run,
      undo: () => commit(undo(latest.current)),
      redo: () => commit(redo(latest.current)),
      canUndo: canUndo(history),
      canRedo: canRedo(history),
      ai,
      aiMode,
    }),
    [history, run, commit, ai, aiMode],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useProject must be used inside a ProjectProvider");
  return ctx;
}
