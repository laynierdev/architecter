"use client";

import { useState } from "react";
import { findConflicts, resolveImport, type ConflictStrategy, type ImportParseResult } from "@/domain/importer";
import { FormError } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { StorageError } from "@/repositories/projectRepository";
import { getDocumentStore, getProjectRepository } from "@/state/store";

const STRATEGIES: { value: ConflictStrategy; label: string }[] = [
  { value: "keep-both", label: "Keep both (import as a copy)" },
  { value: "replace", label: "Replace the existing project" },
  { value: "skip", label: "Skip this project" },
];

interface Props {
  fileName: string;
  result: ImportParseResult;
  onClose: () => void;
  onImported: (message: string) => void;
}

/**
 * Shows what a file contains and every problem found BEFORE anything is saved. Imported projects
 * are always added as separate projects; they are never merged into an existing one.
 */
export function ImportModal({ fileName, result, onClose, onImported }: Props) {
  const repository = getProjectRepository();
  const existing = repository.list();
  const candidates = findConflicts(existing, result.projects);
  const [choices, setChoices] = useState<Record<string, ConflictStrategy>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const choiceFor = (id: string): ConflictStrategy => choices[id] ?? "keep-both";

  const runImport = async () => {
    setBusy(true);
    setError(null);
    const outcome = resolveImport(existing, result.projects, (p) => choiceFor(p.id));
    const replacedIds = outcome.save.filter((p) => existing.some((e) => e.id === p.id)).map((p) => p.id);
    let saved = 0;
    try {
      for (const project of outcome.save) {
        repository.save(project);
        saved++;
      }
      // A replaced project no longer has the original files its old version had.
      await Promise.all(replacedIds.map((id) => getDocumentStore().deleteProject(id).catch(() => undefined)));
    } catch (e) {
      setBusy(false);
      setError(`${e instanceof StorageError ? e.message : "The import failed."} ${saved} of ${outcome.save.length} project(s) were imported before the problem.`);
      return;
    }
    const details = [outcome.copied ? `${outcome.copied} as a copy` : "", outcome.replaced ? `${outcome.replaced} replaced an existing project` : ""].filter(Boolean);
    const summary = `${saved} project${saved === 1 ? "" : "s"} imported${details.length ? ` (${details.join(", ")})` : ""}`;
    onImported(`${summary}${outcome.skipped ? `, ${outcome.skipped} skipped` : ""}.`);
    onClose();
  };

  const toImport = candidates.filter((c) => !c.conflict || choiceFor(c.project.id) !== "skip").length;

  return (
    <Modal title="Review import" onClose={onClose} size="lg">
      <p className="text-muted-ar fs-xs">
        File: <strong>{fileName}</strong>. Nothing is saved until you press Import.
      </p>
      <FormError message={error} />

      {errors.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <strong>{result.projects.length === 0 ? "This file cannot be imported." : "Some projects in this file cannot be imported."}</strong>
          <ul className="mb-0 mt-1 ps-3">
            {errors.map((i, n) => (
              <li key={n}>
                <strong>{i.scope}:</strong> {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert alert-warning" role="status">
          <ul className="mb-0 ps-3">
            {warnings.map((i, n) => (
              <li key={n}>
                <strong>{i.scope}:</strong> {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="list-group mb-3">
          {candidates.map(({ project, conflict }, index) => (
            <li key={`${project.id}-${index}`} className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span>
                <span className="fw-semibold d-block">{project.name}</span>
                <span className="fs-xs text-muted-ar">
                  {project.components.length} components · {project.adrs.length} ADRs · {project.risks.length} risks
                </span>
              </span>
              {conflict ? (
                <span className="d-flex align-items-center gap-2">
                  <span className="badge text-bg-warning">Already exists</span>
                  <label htmlFor={`strategy-${index}`} className="visually-hidden">
                    What to do with {project.name}
                  </label>
                  <select id={`strategy-${index}`} className="form-select form-select-sm" style={{ width: "auto" }} value={choiceFor(project.id)} onChange={(e) => setChoices((c) => ({ ...c, [project.id]: e.target.value as ConflictStrategy }))}>
                    {STRATEGIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </span>
              ) : (
                <span className="badge text-bg-success">New</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Cancel
        </button>
        {candidates.length > 0 && (
          <button type="button" className="btn btn-primary" disabled={busy || toImport === 0} onClick={runImport}>
            Import {toImport} project{toImport === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </Modal>
  );
}
