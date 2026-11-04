"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stage1Notice } from "@/components/ui/Stage1Notice";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim().length < 3 ? "Enter a project name of at least 3 characters." : null;
  const descError = touched && description.trim().length < 20 ? "Describe the product in at least 20 characters so the analysis has something to work with." : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim().length < 3 || description.trim().length < 20) return;
    // Stage 1: no persistence yet, continue with the demo project.
    router.push("/projects/demo/requirements?draft=1");
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title="New project" description="Describe what you want to build. You can refine everything later." />
      <Stage1Notice>
        Prototype: projects are not saved yet. Submitting opens the demo project so you can explore the full workflow. Saving arrives in Stage 4.
      </Stage1Notice>

      <div className="ar-card ar-card-body mb-3">
        <div className="mb-3">
          <label htmlFor="p-name" className="form-label fw-semibold">Project name</label>
          <input id="p-name" className={`form-control ${nameError ? "is-invalid" : ""}`} value={name} onChange={(e) => setName(e.target.value)} aria-describedby="p-name-err" />
          <div id="p-name-err" className="invalid-feedback">{nameError}</div>
        </div>
        <div className="mb-3">
          <label htmlFor="p-desc" className="form-label fw-semibold">What are you building?</label>
          <textarea id="p-desc" rows={5} className={`form-control ${descError ? "is-invalid" : ""}`} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="p-desc-err p-desc-help" placeholder="Who are the users? What should the system do?" />
          <div id="p-desc-help" className="form-text">Only state what you know. Missing details will be listed as open questions, not invented.</div>
          <div id="p-desc-err" className="invalid-feedback">{descError}</div>
        </div>
      </div>

      <div className="ar-card ar-card-body mb-4">
        <h2 className="h6">Known targets (optional)</h2>
        <p className="fs-xs text-muted-ar">Leave blank anything you do not know yet.</p>
        <div className="row g-3">
          {[
            ["t-users", "Expected users", "e.g. 100,000 monthly"],
            ["t-avail", "Availability", "e.g. 99.9%"],
            ["t-latency", "Latency", "e.g. p95 < 300 ms"],
            ["t-budget", "Monthly budget", "e.g. $2,000"],
          ].map(([id, label, ph]) => (
            <div className="col-12 col-md-6" key={id}>
              <label htmlFor={id} className="form-label">{label}</label>
              <input id={id} className="form-control" placeholder={ph} />
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary">Continue to requirements</button>
        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push("/")}>Cancel</button>
      </div>
    </form>
  );
}
