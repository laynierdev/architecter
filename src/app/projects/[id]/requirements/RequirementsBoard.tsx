"use client";

import { useState } from "react";
import { addRequirement, answerQuestion, clearAnswer, mergeAnalysis, removeRequirement, removeTarget, setAssumptionStatus, unansweredQuestions, updateRequirement, upsertTarget, type RequirementKind } from "@/domain/requirements";
import { updateProjectInfo } from "@/domain/project";
import type { Priority, Requirement, RequirementsAnalysis } from "@/domain/types";
import { Field, FormError, SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useAction } from "@/components/ui/useAction";
import { useProject } from "@/state/ProjectContext";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "must", label: "Must" },
  { value: "should", label: "Should" },
  { value: "could", label: "Could" },
];

// Requirement list with add / edit / delete ------------------------------

function RequirementList({ title, kind }: { title: string; kind: RequirementKind }) {
  const { project, run } = useProject();
  const items = kind === "functional" ? project.functionalRequirements : project.nonFunctionalRequirements;
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<Priority>("should");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setText("");
    setCategory("");
    setPriority("should");
    setError(null);
  };
  const startEdit = (r: Requirement) => {
    setEditing(r.id);
    setText(r.text);
    setPriority(r.priority);
    setCategory(r.category ?? "");
    setError(null);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = run((p) => (editing ? updateRequirement(p, editing, { text, priority, category }) : addRequirement(p, kind, { text, priority, category })));
    if (!result.ok) return setError(result.error);
    reset();
  };

  return (
    <section className="ar-card h-100" aria-label={title}>
      <div className="ar-card-header">
        <h2 className="h6 mb-0">{title}</h2>
        <span className="fs-xs text-muted-ar">{items.length}</span>
      </div>
      {items.length === 0 && <p className="ar-card-body text-muted-ar mb-0">None yet. Add one below or analyze your description.</p>}
      <ul className="list-group list-group-flush">
        {items.map((r) => (
          <li key={r.id} className="list-group-item d-flex flex-wrap justify-content-between gap-2">
            <span>
              {r.text}
              {r.category && <span className="badge text-bg-light border ms-2">{r.category}</span>}
            </span>
            <span className="d-flex gap-1 align-items-start">
              <span className="badge text-bg-light border text-uppercase">{r.priority}</span>
              <ProvenanceBadge value={r.provenance} />
              <button type="button" className="btn btn-sm btn-link p-0 ms-1" aria-label={`Edit: ${r.text}`} onClick={() => startEdit(r)}><i className="bi bi-pencil" aria-hidden="true" /></button>
              <button type="button" className="btn btn-sm btn-link text-danger p-0" aria-label={`Delete: ${r.text}`} onClick={() => run((p) => removeRequirement(p, r.id))}><i className="bi bi-trash" aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ul>
      <form className="ar-card-body border-top" onSubmit={submit}>
        <FormError message={error} />
        <div className="row g-2 align-items-end">
          <div className="col-12"><Field label={editing ? "Edit requirement" : "Add requirement"} value={text} onChange={setText} /></div>
          <div className="col-6"><SelectField label="Priority" value={priority} onChange={setPriority} options={PRIORITIES} /></div>
          {kind === "nonFunctional" && <div className="col-6"><Field label="Category" value={category} onChange={setCategory} placeholder="e.g. Security" /></div>}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-primary" type="submit">{editing ? "Save" : "Add"}</button>
          {editing && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={reset}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}

// AI analysis review ----------------------------------------------------

function AnalysisReview({ analysis, onClose }: { analysis: RequirementsAnalysis; onClose: () => void }) {
  const { run, ai } = useProject();
  const groups = [
    { key: "functional", label: "Functional requirements", items: analysis.functional.map((x) => x.text), prov: "user" as const },
    { key: "nonFunctional", label: "Non-functional requirements", items: analysis.nonFunctional.map((x) => `${x.text} (${x.category})`), prov: "user" as const },
    { key: "targets", label: "Targets found in your text", items: analysis.targets.map((x) => `${x.label}: ${x.value}`), prov: "user" as const },
    { key: "assumptions", label: "Assumptions (not stated by you)", items: analysis.assumptions.map((x) => x.text), prov: "assumption" as const },
    { key: "questions", label: "Questions to answer", items: analysis.questions.map((x) => x.question), prov: "question" as const },
  ] as const;

  const [checked, setChecked] = useState<Record<string, Set<number>>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, new Set(g.items.map((_, i) => i))])),
  );
  const total = Object.values(checked).reduce((n, s) => n + s.size, 0);

  const toggle = (key: string, i: number) =>
    setChecked((c) => {
      const next = new Set(c[key]);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return { ...c, [key]: next };
    });

  const accept = () => {
    const pick = <T,>(key: string, list: T[]) => list.filter((_, i) => checked[key]?.has(i));
    const filtered: RequirementsAnalysis = {
      functional: pick("functional", analysis.functional),
      nonFunctional: pick("nonFunctional", analysis.nonFunctional),
      targets: pick("targets", analysis.targets),
      assumptions: pick("assumptions", analysis.assumptions),
      questions: pick("questions", analysis.questions),
    };
    run((p) => mergeAnalysis(p, filtered));
    onClose();
  };

  return (
    <Modal title="Review extracted requirements" onClose={onClose} size="lg">
      {ai.isMock && (
        <div className="alert alert-warning py-2 fs-xs" role="note">
          <i className="bi bi-robot me-1" aria-hidden="true" />
          Extracted by the <strong>mock</strong> AI using keyword rules. Check every item: nothing is added to your project until you accept it.
        </div>
      )}
      {total === 0 && analysis.functional.length + analysis.nonFunctional.length + analysis.targets.length + analysis.assumptions.length + analysis.questions.length === 0 && (
        <p className="text-muted-ar">Nothing could be extracted. Try describing what users can do and any quality goals in full sentences.</p>
      )}
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <section key={g.key} className="mb-3">
            <h3 className="h6 d-flex align-items-center gap-2">{g.label} <ProvenanceBadge value={g.prov} /></h3>
            <ul className="list-group">
              {g.items.map((item, i) => (
                <li key={i} className="list-group-item d-flex gap-2">
                  <input id={`${g.key}-${i}`} type="checkbox" className="form-check-input mt-1" checked={checked[g.key]?.has(i) ?? false} onChange={() => toggle(g.key, i)} />
                  <label htmlFor={`${g.key}-${i}`}>{item}</label>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Discard</button>
        <button type="button" className="btn btn-primary" disabled={total === 0} onClick={accept}>Add {total} selected item{total === 1 ? "" : "s"}</button>
      </div>
    </Modal>
  );
}

// Board -----------------------------------------------------------------

export function RequirementsBoard() {
  const { project, run, ai } = useProject();
  const [brief, setBrief] = useState(project.description);
  const [analysis, setAnalysis] = useState<RequirementsAnalysis | null>(null);
  const analyze = useAction();
  const [targetLabel, setTargetLabel] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionError, setQuestionError] = useState<string | null>(null);

  const runAnalysis = async () => {
    // The description is saved first so the user's input is never silently discarded.
    run((p) => updateProjectInfo(p, { description: brief }));
    const context = [...project.targets.map((t) => `${t.label}: ${t.value}`), ...project.openQuestions.filter((q) => q.answer).map((q) => `${q.question} ${q.answer}`)].join("\n");
    const result = await analyze.run(() => ai.analyzeRequirements({ text: brief, context }));
    if (result) setAnalysis(result);
  };

  const suggestQuestions = async () => {
    const questions = await analyze.run(() => ai.suggestQuestions(project));
    if (questions) setAnalysis({ functional: [], nonFunctional: [], targets: [], assumptions: [], questions });
  };

  return (
    <div className="d-grid gap-4">
      <section className="ar-card" aria-label="Product description">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Product description</h2>
          {ai.isMock && <span className="badge text-bg-warning">Mock AI</span>}
        </div>
        <div className="ar-card-body">
          <Field label="What are you building? Describe users, features and quality goals." textarea rows={5} value={brief} onChange={setBrief} help="Only state what you know. The analysis lists what is missing instead of inventing it." />
          <FormError message={analyze.error} />
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={analyze.busy || brief.trim().length < 20} onClick={runAnalysis}>
              <i className="bi bi-stars me-1" aria-hidden="true" />{analyze.busy ? "Analyzing…" : "Analyze requirements"}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => run((p) => updateProjectInfo(p, { description: brief }))} disabled={brief === project.description}>Save description</button>
            <button type="button" className="btn btn-outline-secondary" disabled={analyze.busy} onClick={suggestQuestions}>Suggest missing questions</button>
          </div>
          {brief.trim().length < 20 && <p className="fs-xs text-muted-ar mt-2 mb-0">Write at least a couple of sentences to enable the analysis.</p>}
        </div>
      </section>

      <div className="row g-3">
        <div className="col-12 col-xl-6"><RequirementList title="Functional requirements" kind="functional" /></div>
        <div className="col-12 col-xl-6"><RequirementList title="Non-functional requirements" kind="nonFunctional" /></div>
      </div>

      <section className="ar-card" aria-label="Targets">
        <div className="ar-card-header"><h2 className="h6 mb-0">Targets and constraints</h2></div>
        {project.targets.length === 0 ? (
          <p className="ar-card-body text-muted-ar mb-0">No targets yet. Unknown values are fine: they appear as open questions.</p>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {project.targets.map((t) => (
                  <tr key={t.id}>
                    <th scope="row" className="fw-normal">{t.label}</th>
                    <td>{t.value}</td>
                    <td><ProvenanceBadge value={t.provenance} /></td>
                    <td className="text-end"><button type="button" className="btn btn-sm btn-link text-danger" aria-label={`Delete target ${t.label}`} onClick={() => run((p) => removeTarget(p, t.id))}><i className="bi bi-trash" aria-hidden="true" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="ar-card-body border-top"
          onSubmit={(e) => {
            e.preventDefault();
            const result = run((p) => upsertTarget(p, targetLabel, targetValue));
            if (!result.ok) return setTargetError(result.error);
            setTargetError(null);
            setTargetLabel("");
            setTargetValue("");
          }}
        >
          <FormError message={targetError} />
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-5"><Field label="Metric" value={targetLabel} onChange={setTargetLabel} placeholder="e.g. Monthly budget" /></div>
            <div className="col-12 col-md-5"><Field label="Value" value={targetValue} onChange={setTargetValue} placeholder="e.g. $2,000" /></div>
            <div className="col-12 col-md-2 mb-3"><button className="btn btn-primary w-100" type="submit">Set</button></div>
          </div>
        </form>
      </section>

      <section className="ar-card" aria-label="Assumptions">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Assumptions to confirm</h2>
          <span className="fs-xs text-muted-ar">{project.assumptions.filter((a) => a.status === "proposed").length} unconfirmed</span>
        </div>
        {project.assumptions.length === 0 && <p className="ar-card-body text-muted-ar mb-0">No assumptions yet.</p>}
        <ul className="list-group list-group-flush">
          {project.assumptions.map((a) => (
            <li key={a.id} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className={a.status === "rejected" ? "text-decoration-line-through text-muted-ar" : ""}>{a.text}</span>
              <span className="d-flex gap-2 align-items-center">
                {a.status === "proposed" ? (
                  <>
                    <ProvenanceBadge value="assumption" />
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => run((p) => setAssumptionStatus(p, a.id, "confirmed"))}>Confirm</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => run((p) => setAssumptionStatus(p, a.id, "rejected"))}>Reject</button>
                  </>
                ) : (
                  <>
                    <span className={`status-badge ${a.status === "confirmed" ? "status-accepted" : "status-deprecated"}`}>{a.status}</span>
                    <button type="button" className="btn btn-sm btn-link" onClick={() => run((p) => setAssumptionStatus(p, a.id, "proposed"))}>Undo</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ar-card" aria-label="Open questions">
        <div className="ar-card-header">
          <h2 className="h6 mb-0">Open questions</h2>
          <span className="fs-xs text-muted-ar">{unansweredQuestions(project).length} unanswered</span>
        </div>
        {project.openQuestions.length === 0 && <p className="ar-card-body text-muted-ar mb-0">No open questions. Use “Suggest missing questions” to check what is still unknown.</p>}
        <FormError message={questionError} />
        <ul className="list-group list-group-flush">
          {project.openQuestions.map((q) => (
            <li key={q.id} className="list-group-item">
              <div className="fw-semibold">{q.question}</div>
              {q.why && <div className="fs-xs text-muted-ar mb-2">Why it matters: {q.why}</div>}
              {q.answer ? (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <ProvenanceBadge value="user" />
                  <span>{q.answer}</span>
                  <button type="button" className="btn btn-sm btn-link" onClick={() => run((p) => clearAnswer(p, q.id))}>Change</button>
                </div>
              ) : (
                <form
                  className="d-flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const result = run((p) => answerQuestion(p, q.id, answers[q.id] ?? ""));
                    setQuestionError(result.ok ? null : result.error);
                    if (result.ok) setAnswers((s) => ({ ...s, [q.id]: "" }));
                  }}
                >
                  <label htmlFor={`ans-${q.id}`} className="visually-hidden">Answer: {q.question}</label>
                  <input id={`ans-${q.id}`} className="form-control form-control-sm" placeholder="Your answer" value={answers[q.id] ?? ""} onChange={(e) => setAnswers((s) => ({ ...s, [q.id]: e.target.value }))} />
                  <button className="btn btn-sm btn-primary" type="submit">Save</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {analysis && <AnalysisReview analysis={analysis} onClose={() => setAnalysis(null)} />}
    </div>
  );
}
