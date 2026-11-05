"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { exportProjectJson } from "@/domain/exchange";
import { downloadText, slug } from "@/components/ui/download";
import { useHydrated, useProjectById } from "@/state/hooks";
import { ProjectProvider, useProject } from "@/state/ProjectContext";
import { ProjectNav } from "./ProjectNav";

export function ProjectShell({ id, children }: { id: string; children: ReactNode }) {
  const hydrated = useHydrated();
  const project = useProjectById(id);

  if (!hydrated) {
    return (
      <main id="main-content" tabIndex={-1} className="ar-main" aria-busy="true">
        <p className="text-muted-ar">Loading project…</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main id="main-content" tabIndex={-1} className="ar-main text-center py-5">
        <h1 className="h3">Project not found</h1>
        <p className="text-muted-ar">
          This project does not exist in this browser. It may have been deleted, or it was created in another browser or profile. You can restore it from a backup file on the dashboard.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <ProjectProvider key={id} initial={project}>
      <div className="ar-shell">
        <ProjectNavConnected />
        <main id="main-content" tabIndex={-1} className="min-w-0">
          <StorageBanners />
          {children}
        </main>
      </div>
    </ProjectProvider>
  );
}

function ProjectNavConnected() {
  const { project } = useProject();
  return <ProjectNav projectId={project.id} projectName={project.name} tagline={project.tagline} />;
}

/** Tells the user when their work is not being saved, and how to protect it. */
function StorageBanners() {
  const { project, saveError, retrySave, persistent } = useProject();
  if (!saveError && persistent) return null;

  return (
    <div className="px-3 pt-3">
      {!persistent && (
        <div className="alert alert-warning py-2 fs-xs mb-2" role="alert">
          <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
          Your browser is blocking local storage (private window?). This project will be lost when you close or reload the page. Export a backup from Settings to keep it.
        </div>
      )}
      {saveError && (
        <div className="alert alert-danger py-2 fs-xs mb-2 d-flex flex-wrap align-items-center gap-2" role="alert">
          <span>
            <i className="bi bi-x-octagon me-1" aria-hidden="true" />
            <strong>Not saved.</strong> {saveError} Your latest changes exist only on this page.
          </span>
          <span className="ms-auto d-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={retrySave}>
              Try again
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => downloadText(`${slug(project.name)}.architecter.json`, exportProjectJson(project), "application/json")}>
              <i className="bi bi-download me-1" aria-hidden="true" />Download backup
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
