"use client";

import { useState } from "react";
import { analyzeImpact, confirmComponent } from "@/domain/architecture";
import type { ArchComponent, Project, Relationship } from "@/domain/types";
import { KIND_META } from "@/services/kindMeta";
import { AiNotice } from "@/components/ui/AiNotice";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useAction } from "@/components/ui/useAction";
import type { Selection } from "@/components/diagram/DiagramCanvas";
import { useProject } from "@/state/ProjectContext";

export interface DetailsActions {
  onSelect: (s: Selection) => void;
  onEditComponent: (c: ArchComponent) => void;
  onDeleteComponent: (c: ArchComponent) => void;
  onAddConnection: (sourceId: string) => void;
  onEditRelationship: (r: Relationship) => void;
  onDeleteRelationship: (r: Relationship) => void;
}

export function ComponentDetails({ selection, actions }: { selection: Selection; actions: DetailsActions }) {
  const { project } = useProject();

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
    return rel ? <RelationshipView project={project} rel={rel} actions={actions} /> : null;
  }
  const component = project.components.find((c) => c.id === selection.id);
  // Keyed by id so the "technical details" toggle resets when another component is selected.
  return component ? <ComponentView key={component.id} project={project} component={component} actions={actions} /> : null;
}

function nameOf(project: Project, id: string) {
  return project.components.find((c) => c.id === id)?.name ?? id;
}

function ComponentView({ project, component, actions }: { project: Project; component: ArchComponent; actions: DetailsActions }) {
  const { run, ai } = useProject();
  const [showTech, setShowTech] = useState(false);
  const [insight, setInsight] = useState<{ title: string; text: string } | null>(null);
  const insightAction = useAction();
  const meta = KIND_META[component.kind];
  const outgoing = project.relationships.filter((r) => r.source === component.id);
  const incoming = project.relationships.filter((r) => r.target === component.id);
  const risks = project.risks.filter((r) => r.relatedComponentIds.includes(component.id));
  const impact = analyzeImpact(project, component.id);

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span style={{ color: meta.color }}>
          <i className={`bi ${meta.icon} fs-4`} aria-hidden="true" />
        </span>
        <h2 className="h5 mb-0">{component.name}</h2>
      </div>
      <div className="d-flex flex-wrap gap-2 mb-2">
        <span className="badge text-bg-light border">{meta.label}</span>
        <span className="badge text-bg-light border">{component.layer}</span>
        <ProvenanceBadge value={component.provenance} />
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => actions.onEditComponent(component)}>
          <i className="bi bi-pencil me-1" aria-hidden="true" />Edit
        </button>
        {component.provenance !== "user" && (
          <button type="button" className="btn btn-sm btn-outline-success" onClick={() => run((p) => confirmComponent(p, component.id))} title="Mark this suggestion as your own decision">
            <i className="bi bi-check2-circle me-1" aria-hidden="true" />Confirm
          </button>
        )}
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => actions.onDeleteComponent(component)}>
          <i className="bi bi-trash me-1" aria-hidden="true" />Delete
        </button>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={insightAction.busy}
          onClick={async () => {
            const r = await insightAction.run(() => ai.explainComponent(project, component.id));
            if (r) setInsight({ title: "Explanation", text: r.answer });
          }}
        >
          <i className="bi bi-lightbulb me-1" aria-hidden="true" />Explain
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={insightAction.busy}
          onClick={async () => {
            const r = await insightAction.run(() => ai.analyzeImpact(project, component.id));
            if (r) setInsight({ title: "Impact if it changes or fails", text: r.summary });
          }}
        >
          <i className="bi bi-bullseye me-1" aria-hidden="true" />Analyze impact
        </button>
      </div>
      {insightAction.busy && <p className="fs-xs text-muted-ar">Thinking…</p>}
      {insightAction.error && (
        <div className="alert alert-danger py-2 fs-xs" role="alert">
          {insightAction.error}
        </div>
      )}
      {insight && !insightAction.busy && (
        <div className="ar-card ar-card-body mb-3">
          <AiNotice what="explanation" />
          <h3 className="h6">{insight.title}</h3>
          <div style={{ whiteSpace: "pre-line" }}>{insight.text}</div>
          <button type="button" className="btn btn-sm btn-link p-0 mt-2" onClick={() => setInsight(null)}>
            Dismiss
          </button>
        </div>
      )}

      <p>{component.description || <span className="text-muted-ar">No description yet.</span>}</p>

      {component.responsibilities.length > 0 && (
        <>
          <h3 className="h6">Responsibilities</h3>
          <ul className="ps-3">{component.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
        </>
      )}

      <h3 className="h6">Why this choice</h3>
      <p>{component.rationale || <span className="text-muted-ar">No rationale recorded.</span>}</p>

      <button type="button" className="btn btn-sm btn-outline-secondary mb-3" aria-expanded={showTech} onClick={() => setShowTech((v) => !v)}>
        {showTech ? "Hide" : "Show"} technical details
      </button>
      {showTech && (
        <dl className="ar-card ar-card-body fs-xs">
          <dt>Technology</dt>
          <dd>{component.technology || "Not specified"}</dd>
          <dt>If it fails</dt>
          <dd>{component.failureMode || "Not documented"}</dd>
          <dt>How it scales</dt>
          <dd>{component.scaling || "Not documented"}</dd>
          <dt>Structural impact</dt>
          <dd className="mb-0">{impact.summary}</dd>
        </dl>
      )}

      <div className="d-flex justify-content-between align-items-center">
        <h3 className="h6 mb-0">Connections</h3>
        <button type="button" className="btn btn-sm btn-link" disabled={project.components.length < 2} onClick={() => actions.onAddConnection(component.id)}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />Add
        </button>
      </div>
      {outgoing.length + incoming.length === 0 && <p className="fs-xs text-muted-ar mt-2">Not connected to anything yet.</p>}
      <ul className="list-unstyled fs-xs mt-2">
        {outgoing.map((r) => (
          <li key={r.id} className="mb-1">
            <button type="button" className="btn btn-link p-0 text-start fs-xs" onClick={() => actions.onSelect({ type: "relationship", id: r.id })}>
              <i className="bi bi-arrow-right" aria-hidden="true" /> {nameOf(project, r.target)}
            </button>{" "}
            <span className="text-muted-ar">· {r.protocol}</span>
          </li>
        ))}
        {incoming.map((r) => (
          <li key={r.id} className="mb-1">
            <button type="button" className="btn btn-link p-0 text-start fs-xs" onClick={() => actions.onSelect({ type: "relationship", id: r.id })}>
              <i className="bi bi-arrow-left" aria-hidden="true" /> {nameOf(project, r.source)}
            </button>{" "}
            <span className="text-muted-ar">· {r.protocol}</span>
          </li>
        ))}
      </ul>

      {risks.length > 0 && (
        <>
          <h3 className="h6">Related risks</h3>
          <ul className="fs-xs ps-3">{risks.map((r) => <li key={r.id}>{r.title}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function RelationshipView({ project, rel, actions }: { project: Project; rel: Relationship; actions: DetailsActions }) {
  return (
    <div>
      <h2 className="h5">Connection</h2>
      <p className="mb-2">
        <button type="button" className="btn btn-link p-0" onClick={() => actions.onSelect({ type: "component", id: rel.source })}>
          {nameOf(project, rel.source)}
        </button>{" "}
        <i className="bi bi-arrow-right" aria-hidden="true" />{" "}
        <button type="button" className="btn btn-link p-0" onClick={() => actions.onSelect({ type: "component", id: rel.target })}>
          {nameOf(project, rel.target)}
        </button>
      </p>
      <div className="d-flex gap-2 mb-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => actions.onEditRelationship(rel)}>
          <i className="bi bi-pencil me-1" aria-hidden="true" />Edit
        </button>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => actions.onDeleteRelationship(rel)}>
          <i className="bi bi-trash me-1" aria-hidden="true" />Delete
        </button>
      </div>
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
