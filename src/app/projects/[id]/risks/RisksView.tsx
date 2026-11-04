"use client";

import { useState } from "react";
import { addRisk, addRisksSkippingDuplicates, removeRisk, riskBand, riskScore, sortRisksBySeverity, updateRisk } from "@/domain/risks";
import { addQualityAttribute, removeQualityAttribute, unassessedAttributes, updateQualityAttribute } from "@/domain/quality";
import type { Level, Risk, RiskDraft } from "@/domain/types";
import { AiNotice } from "@/components/ui/AiNotice";
import { Field, FormError, SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/useAction";
import { useProject } from "@/state/ProjectContext";

const LEVELS: { value: Level; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const FILTERS: { id: "all" | Level; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

function RiskForm({ initial, onClose }: { initial?: Risk; onClose: () => void }) {
  const { project, run } = useProject();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [likelihood, setLikelihood] = useState<Level>(initial?.likelihood ?? "medium");
  const [impact, setImpact] = useState<Level>(initial?.impact ?? "medium");
  const [mitigation, setMitigation] = useState(initial?.mitigation ?? "");
  const [related, setRelated] = useState<string[]>(initial?.relatedComponentIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = { title, description, likelihood, impact, mitigation, relatedComponentIds: related };
    const result = run((p) => (initial ? updateRisk(p, initial.id, values) : addRisk(p, values)));
    if (!result.ok) return setError(result.error);
    onClose();
  };

  return (
    <Modal title={initial ? "Edit risk" : "Add risk"} onClose={onClose}>
      <form onSubmit={submit}>
        <FormError message={error} />
        <Field label="Title" value={title} onChange={setTitle} required />
        <Field label="Description" textarea value={description} onChange={setDescription} />
        <div className="row">
          <div className="col-6"><SelectField label="Likelihood" value={likelihood} onChange={setLikelihood} options={LEVELS} /></div>
          <div className="col-6"><SelectField label="Impact" value={impact} onChange={setImpact} options={LEVELS} /></div>
        </div>
        <Field label="Mitigation" textarea value={mitigation} onChange={setMitigation} />
        {project.components.length > 0 && (
          <fieldset className="mb-3">
            <legend className="form-label fw-semibold fs-6">Affected components</legend>
            <div className="d-flex flex-wrap gap-3">
              {project.components.map((c) => (
                <div className="form-check" key={c.id}>
                  <input id={`rel-${c.id}`} type="checkbox" className="form-check-input" checked={related.includes(c.id)} onChange={(e) => setRelated((r) => (e.target.checked ? [...r, c.id] : r.filter((x) => x !== c.id)))} />
                  <label htmlFor={`rel-${c.id}`} className="form-check-label">{c.name}</label>
                </div>
              ))}
            </div>
          </fieldset>
        )}
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? "Save changes" : "Add risk"}</button>
        </div>
      </form>
    </Modal>
  );
}

function SuggestionsReview({ drafts, onClose }: { drafts: RiskDraft[]; onClose: () => void }) {
  const { project, run } = useProject();
  const known = new Set(project.risks.map((r) => r.title.trim().toLowerCase()));
  const fresh = drafts.filter((d) => !known.has(d.title.trim().toLowerCase()));
  const [selected, setSelected] = useState<Set<number>>(() => new Set(fresh.map((_, i) => i)));

  return (
    <Modal title="Suggested risks" onClose={onClose} size="lg">
      <AiNotice what="list of risks" />
      {fresh.length === 0 ? (
        <p className="text-muted-ar">No new risks to suggest: everything the checks found is already tracked.</p>
      ) : (
        <ul className="list-group mb-3">
          {fresh.map((d, i) => (
            <li key={d.title} className="list-group-item d-flex gap-2">
              <input id={`sug-${i}`} type="checkbox" className="form-check-input mt-1" checked={selected.has(i)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
              <label htmlFor={`sug-${i}`}>
                <span className="fw-semibold d-block">{d.title}</span>
                <span className="fs-xs text-muted-ar">Likelihood {d.likelihood}, impact {d.impact}. {d.mitigation}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Close</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected.size === 0}
          onClick={() => {
            run((p) => addRisksSkippingDuplicates(p, fresh.filter((_, i) => selected.has(i))).project);
            onClose();
          }}
        >
          Add {selected.size} selected
        </button>
      </div>
    </Modal>
  );
}

export function RisksView() {
  const { project, run, ai } = useProject();
  const [filter, setFilter] = useState<"all" | Level>("all");
  const [form, setForm] = useState<{ initial?: Risk } | null>(null);
  const [drafts, setDrafts] = useState<RiskDraft[] | null>(null);
  const suggest = useAction();
  const [attrName, setAttrName] = useState("");
  const [attrScore, setAttrScore] = useState(3);
  const [attrError, setAttrError] = useState<string | null>(null);

  const risks = sortRisksBySeverity(project.risks).filter((r) => filter === "all" || riskBand(riskScore(r)) === filter);
  const nameOf = (id: string) => project.components.find((c) => c.id === id)?.name ?? id;
  const missingAttributes = unassessedAttributes(project);

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-5">
        <section className="ar-card" aria-labelledby="qa-h">
          <div className="ar-card-header">
            <h2 id="qa-h" className="h6 mb-0">Quality attributes</h2>
            <span className="fs-xs text-muted-ar">Qualitative, out of 5</span>
          </div>
          {project.qualityAttributes.length === 0 && <p className="ar-card-body text-muted-ar mb-0">Nothing assessed yet. Add attributes below.</p>}
          <ul className="list-group list-group-flush">
            {project.qualityAttributes.map((q) => (
              <li key={q.id} className="list-group-item">
                <div className="d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">{q.name}</span>
                  <span className="d-flex align-items-center gap-2">
                    <label htmlFor={`score-${q.id}`} className="visually-hidden">Score for {q.name}</label>
                    <select id={`score-${q.id}`} className="form-select form-select-sm" style={{ width: "auto" }} value={q.score} onChange={(e) => run((p) => updateQualityAttribute(p, q.id, { score: Number(e.target.value) }))}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
                    </select>
                    <button type="button" className="btn btn-sm btn-link text-danger p-0" aria-label={`Remove ${q.name}`} onClick={() => run((p) => removeQualityAttribute(p, q.id))}><i className="bi bi-trash" aria-hidden="true" /></button>
                  </span>
                </div>
                <div className="score-bar my-1" role="img" aria-label={`${q.name}: ${q.score} out of 5`}>
                  <div style={{ width: `${q.score * 20}%`, background: q.score <= 2 ? "#d6455d" : q.score === 3 ? "#d98a00" : undefined }} />
                </div>
                <div className="fs-xs text-muted-ar">{q.note}</div>
              </li>
            ))}
          </ul>
          <form
            className="ar-card-body border-top"
            onSubmit={(e) => {
              e.preventDefault();
              const result = run((p) => addQualityAttribute(p, { name: attrName, score: attrScore, note: "" }));
              if (!result.ok) return setAttrError(result.error);
              setAttrError(null);
              setAttrName("");
            }}
          >
            <FormError message={attrError} />
            <div className="row g-2 align-items-end">
              <div className="col-7">
                <label htmlFor="attr-name" className="form-label fw-semibold">Add attribute</label>
                <input id="attr-name" className="form-control" list="attr-options" value={attrName} onChange={(e) => setAttrName(e.target.value)} placeholder={missingAttributes[0] ?? "Attribute"} />
                <datalist id="attr-options">{missingAttributes.map((a) => <option key={a} value={a} />)}</datalist>
              </div>
              <div className="col-3">
                <label htmlFor="attr-score" className="form-label fw-semibold">Score</label>
                <select id="attr-score" className="form-select" value={attrScore} onChange={(e) => setAttrScore(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
              </div>
              <div className="col-2 mb-3"><button className="btn btn-primary w-100" type="submit" aria-label="Add attribute"><i className="bi bi-plus-lg" aria-hidden="true" /></button></div>
            </div>
            {missingAttributes.length > 0 && <p className="fs-xs text-muted-ar mb-0">Not assessed yet: {missingAttributes.join(", ")}.</p>}
          </form>
        </section>
      </div>

      <div className="col-12 col-xl-7">
        <section className="ar-card" aria-labelledby="risk-h">
          <div className="ar-card-header">
            <h2 id="risk-h" className="h6 mb-0">Risks</h2>
            <div className="d-flex flex-wrap gap-2">
              <div className="btn-group btn-group-sm" role="group" aria-label="Filter risks by severity">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" className={`btn ${filter === f.id ? "btn-secondary" : "btn-outline-secondary"}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-outline-primary" disabled={suggest.busy || project.components.length === 0} onClick={async () => { const r = await suggest.run(() => ai.suggestRisks(project)); if (r) setDrafts(r); }}>
                <i className="bi bi-stars me-1" aria-hidden="true" />Suggest{ai.isMock && <span className="badge text-bg-warning ms-1">mock</span>}
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm({})}><i className="bi bi-plus-lg me-1" aria-hidden="true" />Add</button>
            </div>
          </div>
          <FormError message={suggest.error} />
          {risks.length === 0 ? (
            <p className="ar-card-body text-muted-ar mb-0">{project.risks.length === 0 ? "No risks tracked yet. Add one or ask for suggestions based on your architecture." : "No risks match this filter."}</p>
          ) : (
            <ul className="list-group list-group-flush">
              {risks.map((r) => (
                <li key={r.id} className="list-group-item">
                  <div className="d-flex flex-wrap justify-content-between gap-2 mb-1">
                    <span className="fw-semibold">{r.title}</span>
                    <span className="d-flex gap-1 align-items-center fs-xs">
                      <span className={`level-pill level-${riskBand(riskScore(r))}`} title="Likelihood × impact, out of 9">Score {riskScore(r)}/9</span>
                      <span className={`level-pill level-${r.likelihood}`}>L: {r.likelihood}</span>
                      <span className={`level-pill level-${r.impact}`}>I: {r.impact}</span>
                      <button type="button" className="btn btn-sm btn-link p-0 ms-1" aria-label={`Edit risk ${r.title}`} onClick={() => setForm({ initial: r })}><i className="bi bi-pencil" aria-hidden="true" /></button>
                      <button type="button" className="btn btn-sm btn-link text-danger p-0" aria-label={`Delete risk ${r.title}`} onClick={() => run((p) => removeRisk(p, r.id))}><i className="bi bi-trash" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <p className="mb-1">{r.description}</p>
                  {r.mitigation && <p className="mb-1 fs-xs"><strong>Mitigation:</strong> {r.mitigation}</p>}
                  {r.relatedComponentIds.length > 0 && <p className="mb-0 fs-xs text-muted-ar">Affects: {r.relatedComponentIds.map(nameOf).join(", ")}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {form && <RiskForm initial={form.initial} onClose={() => setForm(null)} />}
      {drafts && <SuggestionsReview drafts={drafts} onClose={() => setDrafts(null)} />}
    </div>
  );
}
