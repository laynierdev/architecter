"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { unansweredQuestions } from "@/domain/requirements";
import { projectRepository } from "@/state/store";

export function ProjectList() {
  const projects = useSyncExternalStore(
    (listener) => projectRepository.subscribe(listener),
    () => projectRepository.list(),
    () => projectRepository.list(),
  );

  return (
    <div className="row g-3">
      {projects.map((p) => (
        <div className="col-12 col-md-6 col-xl-4" key={p.id}>
          <Link href={`/projects/${p.id}`} className="ar-card ar-card-link d-block h-100 text-reset">
            <div className="ar-card-body">
              <div className="d-flex justify-content-between align-items-start mb-2">
                {p.id === "demo" ? <span className="badge text-bg-primary">Demo project</span> : <span className="badge text-bg-light border">Project</span>}
                <span className="fs-xs text-muted-ar">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
              </div>
              <h2 className="h5 mb-1">{p.name}</h2>
              {p.tagline && <p className="text-muted-ar fs-xs mb-2">{p.tagline}</p>}
              <p className="mb-3">{p.description || <span className="text-muted-ar">No description yet.</span>}</p>
              <div className="d-flex flex-wrap gap-2 fs-xs">
                <span className="badge text-bg-light border">{p.components.length} components</span>
                <span className="badge text-bg-light border">{p.adrs.length} ADRs</span>
                <span className="badge text-bg-light border">{p.risks.length} risks</span>
                {unansweredQuestions(p).length > 0 && <span className="prov-badge prov-question">{unansweredQuestions(p).length} open questions</span>}
              </div>
            </div>
          </Link>
        </div>
      ))}

      <div className="col-12 col-md-6 col-xl-4">
        <Link href="/projects/new" className="ar-card ar-card-link d-flex h-100 text-reset align-items-center justify-content-center text-center" style={{ borderStyle: "dashed", minHeight: 200 }}>
          <div className="ar-card-body">
            <i className="bi bi-plus-circle fs-1 text-muted-ar" aria-hidden="true" />
            <p className="fw-semibold mb-1 mt-2">Start a new project</p>
            <p className="fs-xs text-muted-ar mb-0">Describe your product and requirements.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
