"use client";

import { useState } from "react";
import { exportProjectJson } from "@/domain/exchange";
import type { Project } from "@/domain/types";
import { FormError } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { downloadText, slug } from "@/components/ui/download";
import { getDocumentStore, getProjectRepository } from "@/state/store";

export function DeleteProjectModal({ project, onClose, onDeleted }: { project: Project; onClose: () => void; onDeleted: (message: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      getProjectRepository().delete(project.id);
      await getDocumentStore().deleteProject(project.id).catch(() => undefined);
      onDeleted(`“${project.name}” was deleted.`);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "The project could not be deleted.");
    }
  };

  return (
    <Modal title={`Delete “${project.name}”?`} onClose={onClose}>
      <FormError message={error} />
      <p>
        This permanently deletes the project from this browser, including its {project.components.length} components, {project.adrs.length} decisions, {project.risks.length} risks, snapshots and attached documents. It cannot be undone.
      </p>
      <p className="fs-xs text-muted-ar">Download a backup first if you might need it again.</p>
      <div className="d-flex flex-wrap gap-2 justify-content-between">
        <button type="button" className="btn btn-outline-secondary" onClick={() => downloadText(`${slug(project.name)}.architecter.json`, exportProjectJson(project), "application/json")}>
          <i className="bi bi-download me-1" aria-hidden="true" />Download backup
        </button>
        <span className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
            Delete permanently
          </button>
        </span>
      </div>
    </Modal>
  );
}
