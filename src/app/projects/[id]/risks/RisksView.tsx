"use client";

import { useState } from "react";
import type { Level, Project } from "@/domain/types";

const FILTERS: { id: "all" | Level; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High impact" },
  { id: "medium", label: "Medium impact" },
  { id: "low", label: "Low impact" },
];

export function RisksView({ project }: { project: Project }) {
  const [filter, setFilter] = useState<"all" | Level>("all");
  const risks = project.risks.filter((r) => filter === "all" || r.impact === filter);
  const nameOf = (id: string) => project.components.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-5">
        <section className="ar-card" aria-labelledby="qa-h">
          <div className="ar-card-header">
            <h2 id="qa-h" className="h6 mb-0">Quality attributes</h2>
            <span className="fs-xs text-muted-ar">Qualitative, out of 5</span>
          </div>
          <ul className="list-group list-group-flush">
            {project.qualityAttributes.map((q) => (
              <li key={q.id} className="list-group-item">
                <div className="d-flex justify-content-between">
                  <span className="fw-semibold">{q.name}</span>
                  <span>{q.score}/5</span>
                </div>
                <div className="score-bar my-1" role="img" aria-label={`${q.name}: ${q.score} out of 5`}>
                  <div style={{ width: `${q.score * 20}%`, background: q.score <= 2 ? "#d6455d" : q.score === 3 ? "#d98a00" : undefined }} />
                </div>
                <div className="fs-xs text-muted-ar">{q.note}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="col-12 col-xl-7">
        <section className="ar-card" aria-labelledby="risk-h">
          <div className="ar-card-header">
            <h2 id="risk-h" className="h6 mb-0">Risks</h2>
            <div className="btn-group btn-group-sm" role="group" aria-label="Filter risks by impact">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className={`btn ${filter === f.id ? "btn-secondary" : "btn-outline-secondary"}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {risks.length === 0 ? (
            <p className="ar-card-body text-muted-ar mb-0">No risks match this filter.</p>
          ) : (
            <ul className="list-group list-group-flush">
              {risks.map((r) => (
                <li key={r.id} className="list-group-item">
                  <div className="d-flex flex-wrap justify-content-between gap-2 mb-1">
                    <span className="fw-semibold">{r.title}</span>
                    <span className="d-flex gap-1 fs-xs">
                      <span className={`level-pill level-${r.likelihood}`}>Likelihood: {r.likelihood}</span>
                      <span className={`level-pill level-${r.impact}`}>Impact: {r.impact}</span>
                    </span>
                  </div>
                  <p className="mb-1">{r.description}</p>
                  <p className="mb-1 fs-xs"><strong>Mitigation:</strong> {r.mitigation}</p>
                  {r.relatedComponentIds.length > 0 && (
                    <p className="mb-0 fs-xs text-muted-ar">Affects: {r.relatedComponentIds.map(nameOf).join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
