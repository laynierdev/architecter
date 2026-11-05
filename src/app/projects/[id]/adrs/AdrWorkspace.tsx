"use client";

import { useState } from "react";
import { allowedStatuses, changeAdrStatus, createAdr, removeAdr, supersedeAdr, updateAdr } from "@/domain/adr";
import { adrToMarkdown, adrsToMarkdown } from "@/domain/exchange";
import type { Adr, AdrDraft, AdrStatus } from "@/domain/types";
import { cleanLines, Field, FormError, LinesField, SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { downloadText, slug } from "@/components/ui/download";
import { useAction } from "@/components/ui/useAction";
import { useProject } from "@/state/ProjectContext";

const adrCode = (n: number) => `ADR-${String(n).padStart(3, "0")}`;

const toLines = (alts: Adr["alternatives"]) => alts.map((a) => (a.reason ? `${a.name}: ${a.reason}` : a.name));
const fromLines = (lines: string[]): Adr["alternatives"] =>
  cleanLines(lines).map((line) => {
    const i = line.indexOf(":");
    return i === -1 ? { name: line, reason: "" } : { name: line.slice(0, i).trim(), reason: line.slice(i + 1).trim() };
  });

function AdrForm({ initial, onClose, onSaved }: { initial?: Adr; onClose: () => void; onSaved: (id?: string) => void }) {
  const { project, run, ai } = useProject();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [context, setContext] = useState(initial?.context ?? "");
  const [problem, setProblem] = useState(initial?.problem ?? "");
  const [decision, setDecision] = useState(initial?.decision ?? "");
  const [alternatives, setAlternatives] = useState(initial ? toLines(initial.alternatives) : []);
  const [positive, setPositive] = useState(initial?.consequences.positive ?? []);
  const [negative, setNegative] = useState(initial?.consequences.negative ?? []);
  const [componentId, setComponentId] = useState(project.components[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const draft = useAction();

  const fillFromComponent = async () => {
    const d: AdrDraft | undefined = await draft.run(() => ai.suggestAdr(project, { topic: title || "New decision", componentId: componentId || undefined }));
    if (!d) return;
    setTitle(d.title);
    setContext(d.context);
    setProblem(d.problem);
    setDecision(d.decision);
    setAlternatives(toLines(d.alternatives));
    setPositive(d.consequences.positive);
    setNegative(d.consequences.negative);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = { title, context, problem, decision, alternatives: fromLines(alternatives), consequences: { positive: cleanLines(positive), negative: cleanLines(negative) } };
    const result = run((p) => (initial ? updateAdr(p, initial.id, values) : createAdr(p, { ...values, status: "proposed" })));
    if (!result.ok) return setError(result.error);
    onSaved(initial?.id);
    onClose();
  };

  return (
    <Modal title={initial ? `Edit ${adrCode(initial.number)}` : "New decision record"} onClose={onClose} size="lg">
      <form onSubmit={submit}>
        <FormError message={error ?? draft.error} />
        {!initial && project.components.length > 0 && (
          <div className="ar-card ar-card-body bg-light mb-3">
            <div className="d-flex flex-wrap gap-2 align-items-end">
              <div className="flex-grow-1">
                <SelectField label="Draft from a component (optional)" value={componentId} onChange={setComponentId} options={project.components.map((c) => ({ value: c.id, label: c.name }))} />
              </div>
              <button type="button" className="btn btn-outline-primary mb-3" disabled={draft.busy} onClick={fillFromComponent}>
                <i className="bi bi-stars me-1" aria-hidden="true" />{draft.busy ? "Drafting…" : "Fill draft"}
                {ai.isMock && <span className="badge text-bg-warning ms-1">mock</span>}
              </button>
            </div>
            <p className="fs-xs text-muted-ar mb-0">Pre-fills the fields below from the component&apos;s recorded rationale. Review and edit before saving.</p>
          </div>
        )}
        <Field label="Title" value={title} onChange={setTitle} required />
        <Field label="Context" textarea value={context} onChange={setContext} />
        <Field label="Problem" textarea value={problem} onChange={setProblem} />
        <Field label="Decision" textarea value={decision} onChange={setDecision} />
        <LinesField label="Alternatives considered" value={alternatives} onChange={setAlternatives} help="One per line, as “Name: why it was not chosen”." />
        <div className="row">
          <div className="col-md-6"><LinesField label="Positive consequences" value={positive} onChange={setPositive} /></div>
          <div className="col-md-6"><LinesField label="Negative consequences" value={negative} onChange={setNegative} /></div>
        </div>
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? "Save changes" : "Create record"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function AdrWorkspace() {
  const { project, run } = useProject();
  const [selectedChoice, setSelectedId] = useState("");
  const [form, setForm] = useState<{ initial?: Adr } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adrs = [...project.adrs].sort((a, b) => a.number - b.number);
  const adr = adrs.find((a) => a.id === selectedChoice) ?? adrs[0];
  const supersedable = adrs.filter((a) => a.id !== adr?.id && a.status !== "deprecated");

  const act = (operation: Parameters<typeof run>[0]) => {
    const result = run(operation);
    setError(result.ok ? null : result.error);
  };

  const newButton = (
    <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
      <i className="bi bi-plus-lg me-1" aria-hidden="true" />New decision
    </button>
  );

  if (adrs.length === 0 || !adr) {
    return (
      <div className="ar-card ar-card-body text-center py-5">
        <i className="bi bi-journal-text fs-1 text-muted-ar" aria-hidden="true" />
        <h2 className="h5 mt-2">No decisions recorded</h2>
        <p className="text-muted-ar">Record why you chose a technology or approach so the reasoning is never lost.</p>
        <div>{newButton}</div>
        {form && <AdrForm initial={form.initial} onClose={() => setForm(null)} onSaved={() => undefined} />}
      </div>
    );
  }

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-4">
        <div className="d-flex gap-2 mb-3">
          {newButton}
          <button type="button" className="btn btn-outline-secondary" onClick={() => downloadText(`${slug(project.name)}-adrs.md`, adrsToMarkdown(project), "text/markdown")}>
            <i className="bi bi-download me-1" aria-hidden="true" />Export all
          </button>
        </div>
        <div className="ar-card" role="list" aria-label="Decision records">
          {adrs.map((a) => (
            <button key={a.id} type="button" role="listitem" className={`btn text-start w-100 rounded-0 border-0 border-bottom p-3 ${a.id === adr.id ? "bg-primary-subtle" : ""}`} aria-current={a.id === adr.id} onClick={() => setSelectedId(a.id)}>
              <div className="fs-xs text-muted-ar">{adrCode(a.number)}</div>
              <div className="fw-semibold mb-1">{a.title}</div>
              <span className={`status-badge status-${a.status}`}>{a.status}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="col-12 col-lg-8">
        <article className="ar-card" aria-labelledby="adr-title">
          <div className="ar-card-header">
            <h2 id="adr-title" className="h6 mb-0">{adrCode(adr.number)}: {adr.title}</h2>
            <span className="d-flex gap-1">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => downloadText(`${adrCode(adr.number).toLowerCase()}.md`, adrToMarkdown(adr), "text/markdown")}>
                <i className="bi bi-download" aria-hidden="true" /><span className="visually-hidden">Download as Markdown</span>
              </button>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setForm({ initial: adr })}>
                <i className="bi bi-pencil me-1" aria-hidden="true" />Edit
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => act((p) => removeAdr(p, adr.id))}>
                <i className="bi bi-trash me-1" aria-hidden="true" />Delete
              </button>
            </span>
          </div>
          <div className="ar-card-body">
            <FormError message={error} />
            <div className="mb-3 d-flex flex-wrap align-items-center gap-3">
              <div className="d-flex align-items-center gap-2">
                <label htmlFor="adr-status" className="mb-0 fw-semibold">Status</label>
                <select id="adr-status" className="form-select form-select-sm" style={{ width: "auto" }} value={adr.status} onChange={(e) => act((p) => changeAdrStatus(p, adr.id, e.target.value as AdrStatus))}>
                  {allowedStatuses(adr.status).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {adr.status === "accepted" && supersedable.length > 0 && (
                <div className="d-flex align-items-center gap-2 min-w-0 mw-100">
                  <label htmlFor="adr-supersede" className="mb-0 fs-xs">Superseded by</label>
                  <select id="adr-supersede" className="form-select form-select-sm" style={{ width: "auto", maxWidth: "100%", minWidth: 0 }} value="" onChange={(e) => e.target.value && act((p) => supersedeAdr(p, adr.id, e.target.value))}>
                    <option value="">Choose…</option>
                    {supersedable.map((a) => <option key={a.id} value={a.id}>{adrCode(a.number)}: {a.title}</option>)}
                  </select>
                </div>
              )}
              {adr.supersededBy && <span className="fs-xs text-muted-ar">Superseded by {adrCode(project.adrs.find((a) => a.id === adr.supersededBy)?.number ?? 0)}</span>}
            </div>
            <p className="fs-xs text-muted-ar">Statuses follow a lifecycle: proposed → accepted → superseded or deprecated.</p>

            <h3 className="h6">Context</h3><p>{adr.context || <em className="text-muted-ar">Not provided</em>}</p>
            <h3 className="h6">Problem</h3><p>{adr.problem || <em className="text-muted-ar">Not provided</em>}</p>
            <h3 className="h6">Decision</h3><p>{adr.decision || <em className="text-muted-ar">Not provided</em>}</p>
            <h3 className="h6">Alternatives considered</h3>
            {adr.alternatives.length === 0 ? <p className="text-muted-ar">None recorded.</p> : (
              <ul className="ps-3">{adr.alternatives.map((alt) => <li key={alt.name}><strong>{alt.name}</strong>{alt.reason && <>: {alt.reason}</>}</li>)}</ul>
            )}
            <div className="row">
              <div className="col-md-6">
                <h3 className="h6 text-success">Positive consequences</h3>
                <ul className="ps-3">{adr.consequences.positive.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div className="col-md-6">
                <h3 className="h6 text-danger">Negative consequences</h3>
                <ul className="ps-3">{adr.consequences.negative.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            </div>
          </div>
        </article>
      </div>
      {form && <AdrForm initial={form.initial} onClose={() => setForm(null)} onSaved={(id) => id && setSelectedId(id)} />}
    </div>
  );
}
