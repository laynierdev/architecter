"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProjectProvider, useProject } from "@/state/ProjectContext";
import { projectRepository } from "@/state/store";
import { ProjectNav } from "./ProjectNav";

export function ProjectShell({ id, children }: { id: string; children: ReactNode }) {
  const project = projectRepository.get(id);

  if (!project) {
    return (
      <main id="main-content" className="ar-main text-center py-5">
        <h1 className="h3">Project not found</h1>
        <p className="text-muted-ar">
          Projects are only kept in memory in this stage, so a project disappears when the page is reloaded. Saving arrives in Stage 4.
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
        <main id="main-content" className="min-w-0">
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
