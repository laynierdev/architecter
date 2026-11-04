"use client";

import { useState } from "react";
import type { Project, Requirement } from "@/domain/types";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

type Decision = "accepted" | "rejected";

function RequirementList({ title, items }: { title: string; items: Requirement[] }) {
  return (
    <section className="ar-card" aria-label={title}>
      <div className="ar-card-header">
        <h2 className="h6 mb-0">{title}</h2>
        <span className="fs-xs text-muted-ar">{items.length}</span>
      </div>
      <ul className="list-group list-group-flush">
        {items.map((r) => (
          <li key={r.id} className="list-group-item d-flex flex-wrap justify-content-between gap-2">
            <span>
              {r.text}
              {r.category && <span className="badge text-bg-light border ms-2">{r.category}</span>}
            </span>
            <span className="d-flex gap-2 align-items-start">
              <span className="badge text-bg-light border text-uppercase">{r.priority}</span>
              <ProvenanceBadge value={r.provenance} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RequirementsBoard({ project }: { project: Project }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <div className="d-grid gap-4">
      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <RequirementList title="Functional requirements" items={project.functionalRequirements} />
        </div>
        <div className="col-12 col-xl-6">
          <RequirementList title="Non-functional requirements" items={project.nonFunctionalRequirements} />
        </div>
      </div>

      <section className="ar-card" aria-label="Targets">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Targets and constraints</h2>
        </div>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {project.targets.map((t) => (
                <tr key={t.id}>
                  <th scope="row" className="fw-normal">{t.label}</th>
                  <td>{t.value}</td>
                  <td><ProvenanceBadge value={t.provenance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ar-card" aria-label="Assumptions">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Assumptions to confirm</h2>
          <span className="fs-xs text-muted-ar">Unconfirmed assumptions stay visible in the architecture</span>
        </div>
        <ul className="list-group list-group-flush">
          {project.assumptions.map((a) => {
            const d = decisions[a.id];
            return (
              <li key={a.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span className={d === "rejected" ? "text-decoration-line-through text-muted-ar" : ""}>{a.text}</span>
                <span className="d-flex gap-2 align-items-center">
                  {d ? (
                    <>
                      <span className={`status-badge ${d === "accepted" ? "status-accepted" : "status-deprecated"}`}>{d}</span>
                      <button type="button" className="btn btn-sm btn-link" onClick={() =>
                          setDecisions((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id !== a.id)))
                        }>
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setDecisions((s) => ({ ...s, [a.id]: "accepted" }))}>
                        Accept
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setDecisions((s) => ({ ...s, [a.id]: "rejected" }))}>
                        Reject
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ar-card" aria-label="Open questions">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Open questions</h2>
          <span className="fs-xs text-muted-ar">
            {project.openQuestions.length - Object.keys(answers).length} unanswered
          </span>
        </div>
        <ul className="list-group list-group-flush">
          {project.openQuestions.map((q) => (
            <li key={q.id} className="list-group-item">
              <div className="fw-semibold">{q.question}</div>
              <div className="fs-xs text-muted-ar mb-2">Why it matters: {q.why}</div>
              {answers[q.id] ? (
                <div className="d-flex align-items-center gap-2">
                  <ProvenanceBadge value="user" />
                  <span>{answers[q.id]}</span>
                </div>
              ) : (
                <form
                  className="d-flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = (drafts[q.id] ?? "").trim();
                    if (value) setAnswers((s) => ({ ...s, [q.id]: value }));
                  }}
                >
                  <label htmlFor={`ans-${q.id}`} className="visually-hidden">Answer: {q.question}</label>
                  <input id={`ans-${q.id}`} className="form-control form-control-sm" placeholder="Your answer" value={drafts[q.id] ?? ""} onChange={(e) => setDrafts((s) => ({ ...s, [q.id]: e.target.value }))} />
                  <button className="btn btn-sm btn-primary" type="submit">Save</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
