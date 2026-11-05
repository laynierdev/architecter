"use client";

import { useRef, useState } from "react";
import { MAX_ANALYSIS_TEXT_CHARS } from "@/ai/tasks";
import { ACCEPTED_EXTENSIONS, addDocument, formatBytes, precheckFile } from "@/domain/documents";
import { uniqueId } from "@/domain/common";
import { MAX_DOCUMENTS_PER_PROJECT } from "@/domain/schemas";
import type { SourceDocument } from "@/domain/types";
import { DocumentError, extractDocument, type ExtractionResult } from "@/services/documentExtraction";
import { FormError } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { useProject } from "@/state/ProjectContext";
import { getDocumentStore } from "@/state/store";

interface Draft {
  name: string;
  size: number;
  type: string;
  bytes: ArrayBuffer;
  result: ExtractionResult;
}

interface Props {
  onClose: () => void;
  /** Called after the document was attached. `analyze` asks the caller to start the analysis on its text. */
  onAttached: (doc: SourceDocument, analyze: boolean) => void;
}

/**
 * Upload flow: pick a file, see exactly what was extracted, then decide. The file is processed in
 * the browser and never uploaded. Nothing is added to the requirements here: analysis results go
 * through their own review step.
 */
export function DocumentUploadModal({ onClose, onAttached }: Props) {
  const { project, run } = useProject();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "reading" | "review">("pick");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const full = project.documents.length >= MAX_DOCUMENTS_PER_PROJECT;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const pre = precheckFile(file.name, file.size);
    if (!pre.ok) return setError(pre.error);
    setPhase("reading");
    try {
      const bytes = await file.arrayBuffer();
      const result = await extractDocument({ name: file.name, size: file.size, bytes });
      if (project.documents.some((d) => d.sha256 === result.sha256)) {
        setPhase("pick");
        return setError("This document is already attached to the project.");
      }
      setDraft({ name: file.name, size: file.size, type: file.type || "application/octet-stream", bytes, result });
      setPhase("review");
    } catch (e) {
      setPhase("pick");
      setError(e instanceof DocumentError ? e.message : "The file could not be read.");
    }
  };

  const attach = async (analyze: boolean) => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const id = uniqueId("doc", project.documents.map((d) => d.id));
    const store = getDocumentStore();

    // Keep the original file. If that is not possible the document is still attached, honestly flagged.
    let originalStored = false;
    try {
      await store.put(project.id, id, { name: draft.name, type: draft.type, bytes: draft.bytes });
      originalStored = true;
    } catch {
      originalStored = false;
    }

    const doc: SourceDocument = {
      id,
      name: draft.name.slice(0, 200),
      kind: draft.result.kind,
      size: draft.size,
      sha256: draft.result.sha256,
      addedAt: new Date().toISOString(),
      extractedText: draft.result.text,
      truncated: draft.result.truncated,
      originalStored,
    };
    const result = run((p) => addDocument(p, doc));
    if (!result.ok) {
      if (originalStored) await store.delete(project.id, id).catch(() => undefined);
      setBusy(false);
      return setError(result.error);
    }
    onAttached(doc, analyze);
    onClose();
  };

  const text = draft?.result.text ?? "";

  return (
    <Modal title="Add a requirements document" onClose={onClose} size="lg">
      <FormError message={error} />

      {phase !== "review" && (
        <>
          <p>
            Upload a document that describes what you want to build. Supported: <strong>.txt, .md, .pdf, .docx</strong> (PDF and Word up to 5 MB, text up to 1 MB).
          </p>
          <p className="fs-xs text-muted-ar">The file is read in your browser and is not sent to any server. Scanned PDFs (images) are not supported.</p>
          {full ? (
            <div className="alert alert-warning">A project can have at most {MAX_DOCUMENTS_PER_PROJECT} documents. Remove one first.</div>
          ) : (
            <div className="mb-3">
              <label htmlFor="doc-file" className="form-label fw-semibold">
                Choose a file
              </label>
              <input id="doc-file" ref={input} type="file" accept={ACCEPTED_EXTENSIONS} className="form-control" disabled={phase === "reading"} onChange={(e) => void readFile(e.target.files?.[0])} />
            </div>
          )}
          {phase === "reading" && (
            <p role="status" className="text-muted-ar">
              Reading the document…
            </p>
          )}
          <div className="d-flex justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}

      {phase === "review" && draft && (
        <>
          <p className="mb-1">
            <i className="bi bi-file-earmark-text me-1" aria-hidden="true" />
            <strong>{draft.name}</strong> <span className="text-muted-ar">· {draft.result.kind.toUpperCase()} · {formatBytes(draft.size)} · {draft.result.totalChars.toLocaleString("en-US")} characters of text</span>
          </p>
          {draft.result.warnings.map((w) => (
            <div key={w} className="alert alert-warning py-2 fs-xs mb-2" role="status">
              {w}
            </div>
          ))}
          {text.length > MAX_ANALYSIS_TEXT_CHARS && (
            <div className="alert alert-warning py-2 fs-xs mb-2" role="status">
              The analysis reads at most {MAX_ANALYSIS_TEXT_CHARS.toLocaleString("en-US")} characters, so only the beginning of this document will be analyzed. The whole text stays attached to the project.
            </div>
          )}

          <p className="fw-semibold mb-1">Extracted text</p>
          <pre className="ar-card ar-card-body fs-xs" style={{ maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }} tabIndex={0} aria-label="Extracted text preview">
            {text.length > 4000 ? `${text.slice(0, 4000)}\n\n… (${(text.length - 4000).toLocaleString("en-US")} more characters)` : text}
          </pre>
          <p className="fs-xs text-muted-ar">
            Check that this is what your document says. The original file is kept as it is. Nothing is added to your requirements until you review the analysis and accept it.
          </p>

          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => { setDraft(null); setPhase("pick"); if (input.current) input.current.value = ""; }}>
              Choose another file
            </button>
            <button type="button" className="btn btn-outline-primary" disabled={busy} onClick={() => void attach(false)}>
              Attach only
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void attach(true)}>
              <i className="bi bi-stars me-1" aria-hidden="true" />Attach and analyze
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
