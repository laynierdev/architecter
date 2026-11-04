"use client";

import { useState } from "react";
import { Stage1Notice } from "@/components/ui/Stage1Notice";

export function SettingsForm({ name: initialName, description: initialDescription }: { name: string; description: string }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(true);
      }}
    >
      <Stage1Notice>Changes apply only until you leave this page. Persistence arrives in Stage 4.</Stage1Notice>

      <div className="ar-card ar-card-body mb-3">
        <div className="mb-3">
          <label htmlFor="s-name" className="form-label fw-semibold">Project name</label>
          <input id="s-name" className="form-control" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </div>
        <div>
          <label htmlFor="s-desc" className="form-label fw-semibold">Description</label>
          <textarea id="s-desc" rows={4} className="form-control" value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} />
        </div>
      </div>

      <div className="ar-card ar-card-body mb-3">
        <h2 className="h6">AI provider</h2>
        <p className="mb-2">
          Current mode: <span className="badge text-bg-warning">Mock</span>
        </p>
        <p className="fs-xs text-muted-ar mb-0">
          Responses are pre-written. The Gemini provider is configured with a server-side environment variable in Stage 3; keys are never entered or stored in the browser.
        </p>
      </div>

      <div className="d-flex align-items-center gap-3">
        <button type="submit" className="btn btn-primary">Save changes</button>
        {saved && <span role="status" className="text-success fs-xs"><i className="bi bi-check-circle me-1" aria-hidden="true" />Applied for this session only</span>}
      </div>
    </form>
  );
}
