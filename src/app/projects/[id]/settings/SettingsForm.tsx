"use client";

import { useState } from "react";
import { adrsToMarkdown, exportProjectJson, toMarkdown, toMermaid } from "@/domain/exchange";
import { updateProjectInfo } from "@/domain/project";
import { Field, FormError } from "@/components/ui/Fields";
import { downloadText, slug } from "@/components/ui/download";
import { Stage1Notice } from "@/components/ui/Stage1Notice";
import { useProject } from "@/state/ProjectContext";

export function SettingsForm() {
  const { project, run, ai } = useProject();
  const [name, setName] = useState(project.name);
  const [tagline, setTagline] = useState(project.tagline);
  const [description, setDescription] = useState(project.description);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const base = slug(project.name);

  const exports = [
    { label: "JSON backup", file: `${base}.architecter.json`, mime: "application/json", build: () => exportProjectJson(project), icon: "bi-file-earmark-code" },
    { label: "Markdown documentation", file: `${base}.md`, mime: "text/markdown", build: () => toMarkdown(project), icon: "bi-markdown" },
    { label: "Decision records (ADRs)", file: `${base}-adrs.md`, mime: "text/markdown", build: () => adrsToMarkdown(project), icon: "bi-journal-text", disabled: project.adrs.length === 0 },
    { label: "Mermaid diagram", file: `${base}.mmd`, mime: "text/plain", build: () => toMermaid(project), icon: "bi-diagram-3", disabled: project.components.length === 0 },
  ];

  return (
    <div className="d-grid gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const result = run((p) => updateProjectInfo(p, { name, tagline, description }));
          setError(result.ok ? null : result.error);
          setSaved(result.ok);
        }}
      >
        <Stage1Notice>Changes are kept in memory only until Stage 4 adds persistence: a page reload resets them.</Stage1Notice>
        <div className="ar-card ar-card-body mb-3">
          <FormError message={error} />
          <Field label="Project name" value={name} onChange={(v) => { setName(v); setSaved(false); }} required />
          <Field label="Tagline" value={tagline} onChange={(v) => { setTagline(v); setSaved(false); }} />
          <Field label="Description" textarea rows={4} value={description} onChange={(v) => { setDescription(v); setSaved(false); }} />
          <div className="d-flex align-items-center gap-3">
            <button type="submit" className="btn btn-primary">Save changes</button>
            {saved && <span role="status" className="text-success fs-xs"><i className="bi bi-check-circle me-1" aria-hidden="true" />Saved</span>}
          </div>
        </div>
      </form>

      <section className="ar-card ar-card-body" aria-labelledby="export-h">
        <h2 id="export-h" className="h6">Export</h2>
        <p className="fs-xs text-muted-ar">Exports are generated from your project data, never from a separate AI summary. Import and restore arrive in Stage 4.</p>
        <div className="d-flex flex-wrap gap-2">
          {exports.map((x) => (
            <button key={x.label} type="button" className="btn btn-outline-secondary" disabled={x.disabled} onClick={() => downloadText(x.file, x.build(), x.mime)}>
              <i className={`bi ${x.icon} me-1`} aria-hidden="true" />{x.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ar-card ar-card-body" aria-labelledby="ai-h">
        <h2 id="ai-h" className="h6">AI provider</h2>
        <p className="mb-2">Current mode: <span className={`badge ${ai.isMock ? "text-bg-warning" : "text-bg-success"}`}>{ai.name}</span></p>
        <p className="fs-xs text-muted-ar mb-0">
          {ai.isMock
            ? "Responses come from deterministic rules, not a language model. The Gemini provider is configured with a server-side environment variable in Stage 3; keys are never entered or stored in the browser."
            : "Responses come from the configured model."}
        </p>
      </section>
    </div>
  );
}
