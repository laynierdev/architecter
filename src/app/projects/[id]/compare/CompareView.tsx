"use client";

import { useState } from "react";
import { compareAlternatives, CRITERIA, DEFAULT_WEIGHTS, rankAlternatives } from "@/domain/comparison";
import { addAlternative, removeAlternative, updateAlternative } from "@/domain/quality";
import type { Alternative, CriterionId, CriterionWeights } from "@/domain/types";
import { cleanLines, Field, FormError, LinesField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { useProject } from "@/state/ProjectContext";

const LABELS: Record<CriterionId, { label: string; hint: string }> = {
  complexity: { label: "Simplicity", hint: "Higher = easier to build and reason about" },
  scalability: { label: "Scalability", hint: "Ability to grow with load" },
  reliability: { label: "Reliability", hint: "Fault isolation and recoverability" },
  operations: { label: "Operational ease", hint: "Higher = less operational overhead" },
  cost: { label: "Cost efficiency", hint: "Higher = cheaper to run" },
  fit: { label: "Fit for requirements", hint: "Match with the stated requirements" },
};

function Dots({ value }: { value: number }) {
  return (
    <span className="rating-dots" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= value ? "on" : ""} />)}
    </span>
  );
}

function AlternativeForm({ initial, onClose }: { initial?: Alternative; onClose: () => void }) {
  const { run } = useProject();
  const [name, setName] = useState(initial?.name ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [ratings, setRatings] = useState(initial?.ratings ?? { complexity: 3, scalability: 3, reliability: 3, operations: 3, cost: 3, fit: 3 });
  const [pros, setPros] = useState(initial?.pros ?? []);
  const [cons, setCons] = useState(initial?.cons ?? []);
  const [costEstimate, setCostEstimate] = useState(initial?.costEstimate ?? "");
  const [costAssumptions, setCostAssumptions] = useState(initial?.costAssumptions ?? "");
  const [fitVerdict, setFitVerdict] = useState(initial?.fitVerdict ?? "");
  const [isCurrent, setCurrent] = useState(initial?.isCurrent ?? false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = { name, summary, ratings, pros: cleanLines(pros), cons: cleanLines(cons), costEstimate, costAssumptions, fitVerdict, isCurrent };
    const result = run((p) => (initial ? updateAlternative(p, initial.id, values) : addAlternative(p, values)));
    if (!result.ok) return setError(result.error);
    onClose();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add alternative"} onClose={onClose} size="lg">
      <form onSubmit={submit}>
        <FormError message={error} />
        <Field label="Name" value={name} onChange={setName} required />
        <Field label="Summary" textarea value={summary} onChange={setSummary} />
        <fieldset className="mb-3">
          <legend className="form-label fw-semibold fs-6">Ratings (1 = poor, 5 = excellent)</legend>
          <div className="row g-2">
            {CRITERIA.map((c) => (
              <div className="col-6 col-md-4" key={c}>
                <label htmlFor={`rate-${c}`} className="form-label fs-xs mb-1">{LABELS[c].label}: {ratings[c]}</label>
                <input id={`rate-${c}`} type="range" min={1} max={5} className="form-range" value={ratings[c]} onChange={(e) => setRatings((r) => ({ ...r, [c]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <div className="col-md-6"><LinesField label="Advantages" value={pros} onChange={setPros} /></div>
          <div className="col-md-6"><LinesField label="Disadvantages" value={cons} onChange={setCons} /></div>
          <div className="col-md-6"><Field label="Cost estimate" value={costEstimate} onChange={setCostEstimate} placeholder="e.g. Roughly $500–900 / month" /></div>
          <div className="col-md-6"><Field label="Cost assumptions" value={costAssumptions} onChange={setCostAssumptions} help="Cost figures are estimates. State what they assume." /></div>
        </div>
        <Field label="Suitability for the requirements" textarea value={fitVerdict} onChange={setFitVerdict} />
        <div className="form-check mb-3">
          <input id="alt-current" type="checkbox" className="form-check-input" checked={isCurrent} onChange={(e) => setCurrent(e.target.checked)} />
          <label htmlFor="alt-current" className="form-check-label">This is the current architecture proposal</label>
        </div>
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? "Save changes" : "Add alternative"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function CompareView() {
  const { project, run } = useProject();
  const { alternatives } = project;
  const [aChoice, setAId] = useState("");
  const [bChoice, setBId] = useState("");
  const [weights, setWeights] = useState<CriterionWeights>(DEFAULT_WEIGHTS);
  const [form, setForm] = useState<{ initial?: Alternative } | null>(null);

  const aId = alternatives.some((x) => x.id === aChoice) ? aChoice : (alternatives[0]?.id ?? "");
  const bId = alternatives.some((x) => x.id === bChoice) ? bChoice : (alternatives[1]?.id ?? alternatives[0]?.id ?? "");
  const a = alternatives.find((x) => x.id === aId);
  const b = alternatives.find((x) => x.id === bId);
  const allZero = CRITERIA.every((c) => weights[c] === 0);

  const addButton = (
    <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
      <i className="bi bi-plus-lg me-1" aria-hidden="true" />Add alternative
    </button>
  );

  if (alternatives.length === 0) {
    return (
      <div className="ar-card ar-card-body text-center py-5">
        <i className="bi bi-columns-gap fs-1 text-muted-ar" aria-hidden="true" />
        <h2 className="h5 mt-2">No alternatives recorded</h2>
        <p className="text-muted-ar">Document the options you are considering (for example monolith vs. services) to compare their trade-offs.</p>
        <div>{addButton}</div>
        {form && <AlternativeForm initial={form.initial} onClose={() => setForm(null)} />}
      </div>
    );
  }

  const result = a && b && !allZero ? compareAlternatives(a, b, weights) : null;
  const ranking = allZero ? [] : rankAlternatives(alternatives, weights);

  return (
    <div className="d-grid gap-4">
      <div className="d-flex justify-content-end">{addButton}</div>

      <section className="ar-card" aria-label="Importance of each criterion">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">What matters most to you?</h2>
          <button type="button" className="btn btn-sm btn-link" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset</button>
        </div>
        <div className="ar-card-body">
          <div className="row g-3">
            {CRITERIA.map((c) => (
              <div className="col-6 col-lg-4" key={c}>
                <label htmlFor={`w-${c}`} className="form-label fs-xs mb-1">{LABELS[c].label}: weight {weights[c]}</label>
                <input id={`w-${c}`} type="range" min={0} max={5} className="form-range" value={weights[c]} onChange={(e) => setWeights((w) => ({ ...w, [c]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
          {allZero ? (
            <div className="alert alert-warning mb-0 mt-2" role="alert">Give at least one criterion a weight above zero.</div>
          ) : (
            <p className="fs-xs text-muted-ar mb-0">Overall scores below are weighted averages of qualitative ratings (1–5). They guide a discussion; they are not measurements.</p>
          )}
        </div>
      </section>

      {ranking.length > 0 && (
        <section className="ar-card" aria-label="Ranking">
          <div className="ar-card-header"><h2 className="h6 mb-0">Ranking for your priorities</h2></div>
          <ol className="list-group list-group-flush list-group-numbered">
            {ranking.map((r) => (
              <li key={r.alternative.id} className="list-group-item d-flex justify-content-between">
                <span>{r.alternative.name}{r.alternative.isCurrent && <span className="status-badge status-proposed ms-2">Current proposal</span>}</span>
                <strong>{r.score} / 5</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      {a && b && (
        <>
          <div className="row g-3">
            {[{ label: "Alternative A", value: aId, set: setAId, id: "alt-a" }, { label: "Alternative B", value: bId, set: setBId, id: "alt-b" }].map((s) => (
              <div className="col-12 col-md-6" key={s.id}>
                <label htmlFor={s.id} className="form-label fw-semibold">{s.label}</label>
                <select id={s.id} className="form-select" value={s.value} onChange={(e) => s.set(e.target.value)}>
                  {alternatives.map((alt) => <option key={alt.id} value={alt.id}>{alt.name}</option>)}
                </select>
              </div>
            ))}
          </div>

          {aId === bId && <div className="alert alert-warning mb-0" role="status">You selected the same alternative twice. Choose a different one to compare.</div>}

          <section className="ar-card" aria-label="Ratings comparison">
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr><th scope="col">Criterion</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr>
                </thead>
                <tbody>
                  {(result?.rows ?? CRITERIA.map((c) => ({ criterion: c, a: a.ratings[c], b: b.ratings[c], winner: "tie" as const }))).map((row) => (
                    <tr key={row.criterion}>
                      <th scope="row" className="fw-normal">{LABELS[row.criterion].label}<div className="fs-xs text-muted-ar">{LABELS[row.criterion].hint}</div></th>
                      <td><Dots value={row.a} />{row.winner === "a" && <span className="ms-2 fs-xs text-success">better</span>}</td>
                      <td><Dots value={row.b} />{row.winner === "b" && <span className="ms-2 fs-xs text-success">better</span>}</td>
                    </tr>
                  ))}
                  {result && (
                    <tr className="table-light">
                      <th scope="row">Weighted score</th>
                      <td><strong>{result.scoreA}</strong></td>
                      <td><strong>{result.scoreB}</strong></td>
                    </tr>
                  )}
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
                    <span className="d-flex gap-2 align-items-center">
                      {alt.isCurrent && <span className="status-badge status-proposed">Current proposal</span>}
                      <button type="button" className="btn btn-sm btn-link p-0" aria-label={`Edit ${alt.name}`} onClick={() => setForm({ initial: alt })}><i className="bi bi-pencil" aria-hidden="true" /></button>
                      <button type="button" className="btn btn-sm btn-link text-danger p-0" aria-label={`Delete ${alt.name}`} onClick={() => run((p) => removeAlternative(p, alt.id))}><i className="bi bi-trash" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <div className="ar-card-body">
                    <p>{alt.summary}</p>
                    <h3 className="h6 text-success"><i className="bi bi-plus-circle me-1" aria-hidden="true" />Advantages</h3>
                    <ul className="ps-3">{alt.pros.map((p) => <li key={p}>{p}</li>)}</ul>
                    <h3 className="h6 text-danger"><i className="bi bi-dash-circle me-1" aria-hidden="true" />Disadvantages</h3>
                    <ul className="ps-3">{alt.cons.map((p) => <li key={p}>{p}</li>)}</ul>
                    {alt.costEstimate && (
                      <div className="ar-card ar-card-body bg-light mb-3">
                        <div className="fw-semibold">{alt.costEstimate} <span className="badge text-bg-warning ms-1">Estimate</span></div>
                        <div className="fs-xs text-muted-ar">{alt.costAssumptions || "No assumptions recorded."}</div>
                      </div>
                    )}
                    <h3 className="h6">Suitability</h3>
                    <p className="mb-0">{alt.fitVerdict || "Not assessed."}</p>
                  </div>
                </section>
              </div>
            ))}
          </div>
        </>
      )}
      {form && <AlternativeForm initial={form.initial} onClose={() => setForm(null)} />}
    </div>
  );
}
