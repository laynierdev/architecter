"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { exportBackupJson, exportProjectJson } from "@/domain/exchange";
import { MAX_IMPORT_CHARS, parseImportFile, type ImportParseResult } from "@/domain/importer";
import { duplicateProject } from "@/domain/project";
import { unansweredQuestions } from "@/domain/requirements";
import type { Project } from "@/domain/types";
import { demoProject } from "@/mock/demoProject";
import { copyProjectDocuments } from "@/repositories/documentStore";
import { DeleteProjectModal } from "@/components/projects/DeleteProjectModal";
import { ImportModal } from "@/components/projects/ImportModal";
import { downloadText, slug } from "@/components/ui/download";
import { useHydrated, useLoadIssues, useProjects } from "@/state/hooks";
import { getDocumentStore, getProjectRepository } from "@/state/store";

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function ProjectList() {
  const hydrated = useHydrated();
  const projects = useProjects();
  const issues = useLoadIssues();
  const fileInput = useRef<HTMLInputElement>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; result: ImportParseResult } | null>(null);

  if (!hydrated) {
    return (
      <p className="text-muted-ar" aria-busy="true">
        Loading your projects…
      </p>
    );
  }

  const repository = getProjectRepository();
  const usage = repository.usage();
  const usedPercent = usage ? Math.min(100, Math.round((usage.chars / usage.approxLimitChars) * 100)) : 0;
  const hasDemo = projects.some((p) => p.id === demoProject.id);

  const duplicate = async (project: Project) => {
    setError(null);
    try {
      const copy = duplicateProject(project, projects.map((p) => p.name));
      const copiedIds = await copyProjectDocuments(getDocumentStore(), project.id, copy.id, project.documents.map((d) => d.id));
      // Documents whose original could not be copied must not claim to have one.
      const fixed = { ...copy, documents: copy.documents.map((d) => ({ ...d, originalStored: d.originalStored && copiedIds.includes(d.id) })) };
      repository.save(fixed);
      setNotice(`Created “${fixed.name}”.`);
    } catch (e) {
      setError(message(e, "The project could not be duplicated."));
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    if (file.size > MAX_IMPORT_CHARS) {
      setError(`“${file.name}” is too large to import (limit ${Math.round(MAX_IMPORT_CHARS / 1_000_000)} MB).`);
      return;
    }
    try {
      setImporting({ fileName: file.name, result: parseImportFile(await file.text()) });
    } catch {
      setError(`“${file.name}” could not be read.`);
    }
  };

  const addDemo = () => {
    try {
      repository.save(demoProject);
      setNotice("The demo project was added.");
    } catch (e) {
      setError(message(e, "The demo project could not be added."));
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Choose a backup file to import"
          onChange={(e) => {
            void chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-outline-secondary" onClick={() => fileInput.current?.click()}>
          <i className="bi bi-upload me-1" aria-hidden="true" />Import backup
        </button>
        <button type="button" className="btn btn-outline-secondary" disabled={projects.length === 0} onClick={() => downloadText("architecter-backup.json", exportBackupJson(projects), "application/json")}>
          <i className="bi bi-download me-1" aria-hidden="true" />Back up all projects
        </button>
        {!hasDemo && (
          <button type="button" className="btn btn-outline-secondary" onClick={addDemo}>
            <i className="bi bi-plus-square me-1" aria-hidden="true" />Add demo project
          </button>
        )}
      </div>

      {!repository.persistent && (
        <div className="alert alert-warning py-2 fs-xs" role="alert">
          <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
          Your browser is blocking local storage (private window?). Projects will be lost when you close or reload this page. Use “Back up all projects” to keep them.
        </div>
      )}
      {notice && (
        <div className="alert alert-success py-2 d-flex justify-content-between align-items-center" role="status">
          {notice}
          <button type="button" className="btn-close" aria-label="Dismiss message" onClick={() => setNotice(null)} />
        </div>
      )}
      {error && (
        <div className="alert alert-danger py-2 d-flex justify-content-between align-items-center" role="alert">
          {error}
          <button type="button" className="btn-close" aria-label="Dismiss error" onClick={() => setError(null)} />
        </div>
      )}

      {issues.length > 0 && (
        <section className="alert alert-warning" aria-label="Unreadable saved data">
          <p className="fw-semibold mb-1">
            {issues.length} saved {issues.length === 1 ? "entry" : "entries"} could not be loaded
          </p>
          <p className="fs-xs">Nothing was deleted. The data may be damaged or come from a newer version of Architecter. You can download it for recovery, or remove it.</p>
          <ul className="mb-0 list-unstyled">
            {issues.map((issue) => (
              <li key={issue.key} className="d-flex flex-wrap align-items-center gap-2 py-1 border-top">
                <span className="flex-grow-1 fs-xs">
                  <code>{issue.key.slice(issue.key.lastIndexOf(":") + 1)}</code>: {issue.message}
                </span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => downloadText(`unreadable-${slug(issue.key.slice(issue.key.lastIndexOf(":") + 1))}.json`, issue.raw, "application/json")}>
                  Download
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => repository.discardIssue(issue.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="row g-3">
        {projects.map((p) => (
          <div className="col-12 col-md-6 col-xl-4" key={p.id}>
            <div className="ar-card h-100 d-flex flex-column">
              <Link href={`/projects/${p.id}`} className="ar-card-link ar-card-body d-block flex-grow-1 text-reset rounded-top">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  {p.id === demoProject.id ? <span className="badge text-bg-primary">Demo project</span> : <span className="badge text-bg-light border">Project</span>}
                  <span className="fs-xs text-muted-ar">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                </div>
                <h2 className="h5 mb-1">{p.name}</h2>
                {p.tagline && <p className="text-muted-ar fs-xs mb-2">{p.tagline}</p>}
                <p className="mb-3">{p.description ? (p.description.length > 180 ? `${p.description.slice(0, 180)}…` : p.description) : <span className="text-muted-ar">No description yet.</span>}</p>
                <div className="d-flex flex-wrap gap-2 fs-xs">
                  <span className="badge text-bg-light border">{p.components.length} components</span>
                  <span className="badge text-bg-light border">{p.adrs.length} ADRs</span>
                  <span className="badge text-bg-light border">{p.risks.length} risks</span>
                  {unansweredQuestions(p).length > 0 && <span className="prov-badge prov-question">{unansweredQuestions(p).length} open questions</span>}
                </div>
              </Link>
              <div className="ar-card-footer">
                <button type="button" className="btn btn-sm btn-link" onClick={() => void duplicate(p)}>
                  <i className="bi bi-copy me-1" aria-hidden="true" />Duplicate<span className="visually-hidden"> {p.name}</span>
                </button>
                <button type="button" className="btn btn-sm btn-link" onClick={() => downloadText(`${slug(p.name)}.architecter.json`, exportProjectJson(p), "application/json")}>
                  <i className="bi bi-download me-1" aria-hidden="true" />Export<span className="visually-hidden"> {p.name}</span>
                </button>
                <button type="button" className="btn btn-sm btn-link text-danger ms-auto" onClick={() => setToDelete(p)}>
                  <i className="bi bi-trash me-1" aria-hidden="true" />Delete<span className="visually-hidden"> {p.name}</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="col-12 col-md-6 col-xl-4">
          <Link href="/projects/new" className="ar-card ar-card-link d-flex h-100 text-reset align-items-center justify-content-center text-center" style={{ borderStyle: "dashed", minHeight: 200 }}>
            <div className="ar-card-body">
              <i className="bi bi-plus-circle fs-1 text-muted-ar" aria-hidden="true" />
              <p className="fw-semibold mb-1 mt-2">Start a new project</p>
              <p className="fs-xs text-muted-ar mb-0">Describe your product and requirements.</p>
            </div>
          </Link>
        </div>
      </div>

      {usage && (
        <p className="fs-xs text-muted-ar mt-3 mb-0">
          Stored in this browser: about {(usage.chars / 1000).toFixed(0)}k of ~{(usage.approxLimitChars / 1_000_000).toFixed(0)}M characters ({usedPercent}%).
          {usedPercent >= 70 && <strong className="text-danger"> Storage is almost full: back up and delete projects you no longer need.</strong>}
        </p>
      )}

      {toDelete && <DeleteProjectModal project={toDelete} onClose={() => setToDelete(null)} onDeleted={(m) => setNotice(m)} />}
      {importing && <ImportModal fileName={importing.fileName} result={importing.result} onClose={() => setImporting(null)} onImported={(m) => setNotice(m)} />}
    </>
  );
}

