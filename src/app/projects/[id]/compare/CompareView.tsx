"use client";

import { useState } from "react";
import type { Alternative, CriterionId } from "@/domain/types";

const CRITERIA: { id: CriterionId; label: string; hint: string }[] = [
  { id: "complexity", label: "Simplicity", hint: "Higher = easier to build and reason about" },
  { id: "scalability", label: "Scalability", hint: "Ability to grow with load" },
  { id: "reliability", label: "Reliability", hint: "Fault isolation and recoverability" },
  { id: "operations", label: "Operational ease", hint: "Higher = less operational overhead" },
  { id: "cost", label: "Cost efficiency", hint: "Higher = cheaper to run" },
  { id: "fit", label: "Fit for requirements", hint: "Match with the stated requirements" },
];

function Dots({ value }: { value: number }) {
  return (
    <span className="rating-dots" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "on" : ""} />
      ))}
    </span>
  );
}

export function CompareView({ alternatives }: { alternatives: Alternative[] }) {
  const [aId, setAId] = useState(alternatives[0]?.id ?? "");
  const [bId, setBId] = useState(alternatives[1]?.id ?? "");
  const a = alternatives.find((x) => x.id === aId);
  const b = alternatives.find((x) => x.id === bId);

  if (!a || !b) return null;

  return (
    <div className="d-grid gap-4">
      <div className="row g-3">
        {[
          { label: "Alternative A", value: aId, set: setAId, id: "alt-a" },
          { label: "Alternative B", value: bId, set: setBId, id: "alt-b" },
        ].map((s) => (
          <div className="col-12 col-md-6" key={s.id}>
            <label htmlFor={s.id} className="form-label fw-semibold">{s.label}</label>
            <select id={s.id} className="form-select" value={s.value} onChange={(e) => s.set(e.target.value)}>
              {alternatives.map((alt) => (
                <option key={alt.id} value={alt.id}>
                  {alt.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {aId === bId && (
        <div className="alert alert-warning mb-0" role="status">
          You selected the same alternative twice. Choose a different one to compare.
        </div>
      )}

      <section className="ar-card" aria-label="Ratings comparison">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">{a.name}</th>
                <th scope="col">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="fw-normal">
                    {c.label}
                    <div className="fs-xs text-muted-ar">{c.hint}</div>
                  </th>
                  <td><Dots value={a.ratings[c.id]} /></td>
                  <td><Dots value={b.ratings[c.id]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="row g-3">
        {[a, b].map((alt, i) => (
          <div className="col-12 col-xl-6" key={`${alt.id}-${i}`}>
            <section className="ar-card h-100" aria-label={alt.name}>
              <div className="ar-card-header">
                <h2 className="h6 mb-0">{alt.name}</h2>
                {alt.isCurrent && <span className="status-badge status-proposed">Current proposal</span>}
              </div>
              <div className="ar-card-body">
                <p>{alt.summary}</p>
                <h3 className="h6 text-success"><i className="bi bi-plus-circle me-1" aria-hidden="true" />Advantages</h3>
                <ul className="ps-3">{alt.pros.map((p) => <li key={p}>{p}</li>)}</ul>
                <h3 className="h6 text-danger"><i className="bi bi-dash-circle me-1" aria-hidden="true" />Disadvantages</h3>
                <ul className="ps-3">{alt.cons.map((p) => <li key={p}>{p}</li>)}</ul>
                <div className="ar-card ar-card-body bg-light mb-3">
                  <div className="fw-semibold">{alt.costEstimate} <span className="badge text-bg-warning ms-1">Estimate</span></div>
                  <div className="fs-xs text-muted-ar">{alt.costAssumptions}</div>
                </div>
                <h3 className="h6">Suitability</h3>
                <p className="mb-0">{alt.fitVerdict}</p>
              </div>
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}
