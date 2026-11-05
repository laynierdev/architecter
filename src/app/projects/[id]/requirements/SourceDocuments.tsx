"use client";

import { useState } from "react";
import { formatBytes, removeDocument } from "@/domain/documents";
import type { SourceDocument } from "@/domain/types";
import { FormError } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { downloadBlob } from "@/components/ui/download";
import { useProject } from "@/state/ProjectContext";
import { getDocumentStore } from "@/state/store";

interface Props {
  onAdd: () => void;
  onAnalyze: (doc: SourceDocument) => void;
  busy: boolean;
}

export function SourceDocuments({ onAdd, onAnalyze, busy }: Props) {
  const { project, run } = useProject();
  const [viewing, setViewing] = useState<SourceDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (doc: SourceDocument) => {
    setError(null);
    try {
      const stored = await getDocumentStore().get(project.id, doc.id);
      if (!stored) return setError(`The original file of “${doc.name}” is not available in this browser.`);
      downloadBlob(doc.name, new Blob([stored.bytes], { type: stored.type }));
    } catch {
      setError("The original file could not be read from browser storage.");
    }
  };

  const remove = async (doc: SourceDocument) => {
    setError(null);
    const result = run((p) => removeDocument(p, doc.id));
    if (!result.ok) return setError(result.error);
    await getDocumentStore().delete(project.id, doc.id).catch(() => undefined);
  };

  return (
    <section className="ar-card" aria-label="Source documents">
      <div className="ar-card-header">
        <h2 className="h6 mb-0">Source documents</h2>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={onAdd}>
          <i className="bi bi-file-earmark-arrow-up me-1" aria-hidden="true" />Add document
        </button>
      </div>
      <FormError message={error} />
      {project.documents.length === 0 ? (
        <p className="ar-card-body text-muted-ar mb-0">No documents attached. Add a .txt, .md, .pdf or .docx file to extract requirements from it. The original file is kept untouched.</p>
      ) : (
        <ul className="list-group list-group-flush">
          {project.documents.map((doc) => (
            <li key={doc.id} className="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2">
              <span>
                <i className="bi bi-file-earmark-text me-1" aria-hidden="true" />
                <span className="fw-semibold">{doc.name}</span>
                <span className="d-block fs-xs text-muted-ar">
                  {doc.kind.toUpperCase()} · {formatBytes(doc.size)} · {doc.extractedText.length.toLocaleString("en-US")} characters extracted{doc.truncated ? " (cut at the limit)" : ""} · added {new Date(doc.addedAt).toLocaleDateString()}
                  {!doc.originalStored && " · original file not stored in this browser"}
                </span>
              </span>
              <span className="d-flex flex-wrap gap-1">
                <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => onAnalyze(doc)}>
                  <i className="bi bi-stars me-1" aria-hidden="true" />Analyze
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setViewing(doc)}>
                  View text
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!doc.originalStored} title={doc.originalStored ? "Download the original file" : "The original file is not available"} onClick={() => void download(doc)}>
                  <i className="bi bi-download" aria-hidden="true" />
                  <span className="visually-hidden">Download original {doc.name}</span>
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void remove(doc)}>
                  <i className="bi bi-trash" aria-hidden="true" />
                  <span className="visually-hidden">Remove {doc.name}</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} size="lg">
          <pre className="fs-xs" style={{ whiteSpace: "pre-wrap", maxHeight: "60vh", overflow: "auto" }} tabIndex={0}>
            {viewing.extractedText}
          </pre>
        </Modal>
      )}
    </section>
  );
}
