"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/domain/project";
import { Field, FormError } from "@/components/ui/Fields";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stage1Notice } from "@/components/ui/Stage1Notice";
import { projectRepository } from "@/state/store";

const TARGETS = [
  { id: "users", label: "Expected users", placeholder: "e.g. 100,000 monthly" },
  { id: "availability", label: "Availability target", placeholder: "e.g. 99.9%" },
  { id: "latency", label: "Latency target", placeholder: "e.g. p95 < 300 ms" },
  { id: "budget", label: "Monthly budget", placeholder: "e.g. $2,000" },
];

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const project = createProject({
        name,
        description,
        targets: TARGETS.map((t) => ({ label: t.label, value: targets[t.id] ?? "" })),
      });
      projectRepository.save(project);
      router.push(`/projects/${project.id}/requirements`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader title="New project" description="Describe what you want to build. You can refine everything later." />
      <Stage1Notice>The project is kept in memory until Stage 4 adds persistence: reloading the page removes it.</Stage1Notice>
      <FormError message={error} />

      <div className="ar-card ar-card-body mb-3">
        <Field label="Project name" value={name} onChange={setName} required />
        <Field
          label="What are you building?"
          textarea
          rows={5}
          value={description}
          onChange={setDescription}
          placeholder="Who are the users? What should the system do?"
          help="Only state what you know. You can analyze this text on the next screen; missing details become open questions, not inventions."
        />
      </div>

      <div className="ar-card ar-card-body mb-4">
        <h2 className="h6">Known targets (optional)</h2>
        <p className="fs-xs text-muted-ar">Leave blank anything you do not know yet. Blank values are never filled in for you.</p>
        <div className="row g-3">
          {TARGETS.map((t) => (
            <div className="col-12 col-md-6" key={t.id}>
              <Field label={t.label} value={targets[t.id] ?? ""} onChange={(v) => setTargets((s) => ({ ...s, [t.id]: v }))} placeholder={t.placeholder} />
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary">Create project</button>
        <button type="button" className="btn btn-outline-secondary" onClick={() => router.push("/")}>Cancel</button>
      </div>
    </form>
  );
}
