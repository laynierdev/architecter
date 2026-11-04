"use client";

import { useState } from "react";
import type { ArchComponent, Project, Relationship } from "@/domain/types";
import { KIND_META } from "@/services/kindMeta";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import type { Selection } from "@/components/diagram/DiagramCanvas";

interface Props {
  project: Project;
  selection: Selection;
  onSelect: (s: Selection) => void;
}

export function ComponentDetails({ project, selection, onSelect }: Props) {
  if (!selection) {
    return (
      <div className="text-center text-muted-ar py-5">
        <i className="bi bi-hand-index fs-2 d-block mb-2" aria-hidden="true" />
        <p className="mb-1 fw-semibold">Nothing selected</p>
        <p className="fs-xs mb-0">Click a component or a connection in the diagram to inspect it.</p>
      </div>
    );
  }
  if (selection.type === "relationship") {
    const rel = project.relationships.find((r) => r.id === selection.id);
    return rel ? <RelationshipView project={project} rel={rel} onSelect={onSelect} /> : null;
  }
  const component = project.components.find((c) => c.id === selection.id);
  // Keyed by id so the "technical details" toggle resets when another component is selected.
  return component ? <ComponentView key={component.id} project={project} component={component} onSelect={onSelect} /> : null;
}

function nameOf(project: Project, id: string) {
  return project.components.find((c) => c.id === id)?.name ?? id;
}

function ComponentView({ project, component, onSelect }: { project: Project; component: ArchComponent; onSelect: (s: Selection) => void }) {
  const [showTech, setShowTech] = useState(false);
  const meta = KIND_META[component.kind];
  const outgoing = project.relationships.filter((r) => r.source === component.id);
  const incoming = project.relationships.filter((r) => r.target === component.id);
  const risks = project.risks.filter((r) => r.relatedComponentIds.includes(component.id));

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span style={{ color: meta.color }}>
          <i className={`bi ${meta.icon} fs-4`} aria-hidden="true" />
        </span>
        <h2 className="h5 mb-0">{component.name}</h2>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <span className="badge text-bg-light border">{meta.label}</span>
        <span className="badge text-bg-light border">{component.layer}</span>
        <ProvenanceBadge value={component.provenance} />
      </div>
      <p>{component.description}</p>

      <h3 className="h6">Responsibilities</h3>
      <ul className="ps-3">
        {component.responsibilities.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <h3 className="h6">Why this choice</h3>
      <p>{component.rationale}</p>

      <button type="button" className="btn btn-sm btn-outline-secondary mb-3" aria-expanded={showTech} onClick={() => setShowTech((v) => !v)}>
        {showTech ? "Hide" : "Show"} technical details
      </button>
      {showTech && (
        <dl className="ar-card ar-card-body fs-xs">
          <dt>Technology</dt>
          <dd>{component.technology}</dd>
          <dt>If it fails</dt>
          <dd>{component.failureMode}</dd>
          <dt>How it scales</dt>
          <dd className="mb-0">{component.scaling}</dd>
        </dl>
      )}

      <h3 className="h6">Connections</h3>
      <ul className="list-unstyled fs-xs">
        {outgoing.map((r) => (
          <li key={r.id} className="mb-1">
            <button type="button" className="btn btn-link p-0 text-start fs-xs" onClick={() => onSelect({ type: "relationship", id: r.id })}>
              <i className="bi bi-arrow-right" aria-hidden="true" /> {nameOf(project, r.target)}
            </button>{" "}
            <span className="text-muted-ar">· {r.protocol}</span>
          </li>
        ))}
        {incoming.map((r) => (
          <li key={r.id} className="mb-1">
            <button type="button" className="btn btn-link p-0 text-start fs-xs" onClick={() => onSelect({ type: "relationship", id: r.id })}>
              <i className="bi bi-arrow-left" aria-hidden="true" /> {nameOf(project, r.source)}
            </button>{" "}
            <span className="text-muted-ar">· {r.protocol}</span>
          </li>
        ))}
      </ul>

      {risks.length > 0 && (
        <>
          <h3 className="h6">Related risks</h3>
          <ul className="fs-xs ps-3">
            {risks.map((r) => (
              <li key={r.id}>{r.title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RelationshipView({ project, rel, onSelect }: { project: Project; rel: Relationship; onSelect: (s: Selection) => void }) {
  return (
    <div>
      <h2 className="h5">Connection</h2>
      <p className="mb-2">
        <button type="button" className="btn btn-link p-0" onClick={() => onSelect({ type: "component", id: rel.source })}>
          {nameOf(project, rel.source)}
        </button>{" "}
        <i className="bi bi-arrow-right" aria-hidden="true" />{" "}
        <button type="button" className="btn btn-link p-0" onClick={() => onSelect({ type: "component", id: rel.target })}>
          {nameOf(project, rel.target)}
        </button>
      </p>
      <dl>
        <dt>Purpose</dt>
        <dd>{rel.label}</dd>
        <dt>Protocol</dt>
        <dd>{rel.protocol}</dd>
        <dt>Style</dt>
        <dd>
          {rel.async
            ? "Asynchronous: the sender does not wait. Improves resilience, but introduces eventual consistency."
            : "Synchronous: the caller waits for the response. Simple, but couples availability and latency."}
        </dd>
      </dl>
    </div>
  );
}
