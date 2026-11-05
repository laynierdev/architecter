"use client";

import { useState } from "react";
import { findIssues } from "@/domain/architecture";
import type { ArchComponent, ChangeProposal, Relationship } from "@/domain/types";
import { useFlowSimulation } from "@/hooks/useFlowSimulation";
import { DiagramCanvas, type Selection } from "@/components/diagram/DiagramCanvas";
import { KIND_META } from "@/services/kindMeta";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useAction } from "@/components/ui/useAction";
import { useProject } from "@/state/ProjectContext";
import { AdvisorPanel } from "./AdvisorPanel";
import { ComponentDetails } from "./ComponentDetails";
import { ComponentFormModal, DeleteComponentModal, DeleteRelationshipModal, ProposalReviewModal, RelationshipFormModal, SnapshotsModal } from "./ArchitectureModals";

type Tab = "details" | "advisor" | "summary";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "advisor", label: "Advisor" },
  { id: "summary", label: "Summary" },
];
const SPEEDS = [0.5, 1, 2];

type ModalState =
  | { type: "component"; initial?: ArchComponent }
  | { type: "relationship"; initial?: Relationship; sourceId?: string }
  | { type: "delete-component"; component: ArchComponent }
  | { type: "delete-relationship"; relationship: Relationship }
  | { type: "snapshots" }
  | { type: "proposal"; proposal: ChangeProposal }
  | null;

export function ArchitectureWorkspace() {
  const { project, undo, redo, canUndo, canRedo, ai } = useProject();
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [modal, setModal] = useState<ModalState>(null);
  const [flowChoice, setFlowId] = useState("");
  const [speed, setSpeed] = useState(1);
  const { state, play, stop } = useFlowSimulation(speed);
  const generate = useAction();

  // The selection can point at something that was undone or deleted: ignore it then.
  const validSelection: Selection =
    selection && (selection.type === "component" ? project.components.some((c) => c.id === selection.id) : project.relationships.some((r) => r.id === selection.id)) ? selection : null;

  const flowId = project.flows.some((f) => f.id === flowChoice) ? flowChoice : (project.flows[0]?.id ?? "");
  const flow = project.flows.find((f) => f.id === flowId);
  const simulating = state.runningFlowId !== null;
  const isEmpty = project.components.length === 0;

  const handleSelect = (s: Selection) => {
    setSelection(s);
    if (s) setTab("details");
  };

  const generateArchitecture = async () => {
    const proposal = await generate.run(() => ai.generateArchitecture(project));
    if (proposal) setModal({ type: "proposal", proposal });
  };

  const actions = {
    onSelect: handleSelect,
    onEditComponent: (c: ArchComponent) => setModal({ type: "component", initial: c }),
    onDeleteComponent: (c: ArchComponent) => setModal({ type: "delete-component", component: c }),
    onAddConnection: (sourceId: string) => setModal({ type: "relationship", sourceId }),
    onEditRelationship: (r: Relationship) => setModal({ type: "relationship", initial: r }),
    onDeleteRelationship: (r: Relationship) => setModal({ type: "delete-relationship", relationship: r }),
  };

  const closeModal = () => setModal(null);
  // Remounting the canvas when the graph structure changes re-fits the view to the new diagram.
  const structureKey = `${project.components.map((c) => c.id).join(",")}|${project.relationships.map((r) => r.id).join(",")}`;

  return (
    <div className="workspace">
      <h1 className="visually-hidden">Architecture workspace</h1>
      <div className="workspace-toolbar" role="toolbar" aria-label="Architecture controls">
        <div className="btn-group btn-group-sm" role="group" aria-label="History">
          <button type="button" className="btn btn-outline-secondary" onClick={undo} disabled={!canUndo} aria-label="Undo">
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={redo} disabled={!canRedo} aria-label="Redo">
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setModal({ type: "component" })}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />Component
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={project.components.length < 2} onClick={() => setModal({ type: "relationship" })}>
          <i className="bi bi-link-45deg me-1" aria-hidden="true" />Connection
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={generateArchitecture} disabled={generate.busy}>
          <i className="bi bi-stars me-1" aria-hidden="true" />{generate.busy ? "Generating…" : "Suggest architecture"}
          {ai.isMock && <span className="badge text-bg-warning ms-1">mock</span>}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setModal({ type: "snapshots" })}>
          <i className="bi bi-clock-history me-1" aria-hidden="true" />Snapshots ({project.snapshots.length})
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <div className="d-flex align-items-center gap-2">
          <label htmlFor="flow-select" className="fs-xs text-muted-ar mb-0">Flow</label>
          <select id="flow-select" className="form-select form-select-sm" style={{ width: "auto", maxWidth: 150 }} value={flowId} disabled={simulating || project.flows.length === 0} onChange={(e) => setFlowId(e.target.value)}>
            {project.flows.length === 0 && <option>No flows</option>}
            {project.flows.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        {simulating ? (
          <button type="button" className="btn btn-sm btn-danger sim-btn" onClick={stop}>
            <i className="bi bi-stop-fill me-1" aria-hidden="true" />Stop
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary sim-btn" disabled={!flow || flow.steps.length === 0} onClick={() => flow && play(flow)}>
            <i className="bi bi-play-fill me-1" aria-hidden="true" />Simulate flow
          </button>
        )}
        <div className="btn-group btn-group-sm" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`btn ${speed === s ? "btn-secondary" : "btn-outline-secondary"}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
          ))}
        </div>
        {generate.error && <span className="text-danger fs-xs" role="alert">{generate.error}</span>}
      </div>

      <div className="workspace-canvas">
        {isEmpty ? (
          <div className="h-100 d-flex align-items-center justify-content-center text-center p-4">
            <div style={{ maxWidth: 420 }}>
              <i className="bi bi-diagram-3 fs-1 text-muted-ar" aria-hidden="true" />
              <h2 className="h5 mt-2">No architecture yet</h2>
              <p className="text-muted-ar">Let the assistant propose a starting point from your requirements, or add components yourself. Nothing is applied until you approve it.</p>
              <div className="d-flex gap-2 justify-content-center">
                <button type="button" className="btn btn-primary" onClick={generateArchitecture} disabled={generate.busy}>Suggest architecture</button>
                <button type="button" className="btn btn-outline-primary" onClick={() => setModal({ type: "component" })}>Add component</button>
              </div>
              {generate.error && <div className="alert alert-danger mt-3 fs-xs" role="alert">{generate.error}</div>}
            </div>
          </div>
        ) : (
          <>
            <DiagramLegend />
            <DiagramCanvas
              key={structureKey}
              components={project.components}
              relationships={project.relationships}
              selection={validSelection}
              onSelect={handleSelect}
              activeEdgeIds={state.activeEdgeIds}
              runId={state.runId}
              stepMs={state.stepMs}
              simulating={simulating}
            />
          </>
        )}
        {simulating && state.caption && (
          <div className="sim-caption" role="status" aria-live="polite">
            <span className="step-no">{state.stepIndex + 1}</span>
            <span>{state.caption}</span>
          </div>
        )}
      </div>

      <aside className="workspace-side" aria-label="Inspector">
        <div className="side-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="side-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "details" && <ComponentDetails selection={validSelection} actions={actions} />}
          {tab === "advisor" && <AdvisorPanel focusComponentId={validSelection?.type === "component" ? validSelection.id : undefined} />}
          {tab === "summary" && <Summary onSelect={handleSelect} />}
        </div>
      </aside>

      {modal?.type === "component" && (
        <ComponentFormModal initial={modal.initial} onClose={closeModal} onSaved={(id) => id && setSelection({ type: "component", id })} />
      )}
      {modal?.type === "relationship" && <RelationshipFormModal initial={modal.initial} sourceId={modal.sourceId} onClose={closeModal} />}
      {modal?.type === "delete-component" && <DeleteComponentModal component={modal.component} onClose={closeModal} onDeleted={() => setSelection(null)} />}
      {modal?.type === "delete-relationship" && <DeleteRelationshipModal relationship={modal.relationship} onClose={closeModal} onDeleted={() => setSelection(null)} />}
      {modal?.type === "snapshots" && <SnapshotsModal onClose={closeModal} />}
      {modal?.type === "proposal" && <ProposalReviewModal proposal={modal.proposal} onClose={closeModal} onApplied={() => setSelection(null)} />}
    </div>
  );
}

/** Collapsed by default so it never hides diagram nodes; it opens on demand. */
function DiagramLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend" aria-label="Diagram legend">
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <i className={`bi ${open ? "bi-chevron-down" : "bi-chevron-right"}`} aria-hidden="true" /> Legend
      </button>
      {open && (
        <div className="legend-body">
          {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
            <span key={k}>
              <span className="dot" style={{ background: KIND_META[k].color }} />
              {KIND_META[k].label}
            </span>
          ))}
          <span className="mt-1 text-muted-ar">Dashed line: asynchronous</span>
          <span className="text-muted-ar">Dashed border: assumption</span>
        </div>
      )}
    </div>
  );
}

function Summary({ onSelect }: { onSelect: (s: Selection) => void }) {
  const { project } = useProject();
  const issues = findIssues(project);

  return (
    <div>
      <h2 className="h5 mb-2">{project.architectureStyle || "No architecture style yet"}</h2>
      {project.architectureStyle && <ProvenanceBadge value="recommendation" />}
      {project.styleJustification && <p className="mt-3">{project.styleJustification}</p>}
      <p className="fs-xs text-muted-ar">This is a proposal, not a confirmed decision. Review the assumptions in Requirements and the trade-offs in Compare before committing.</p>

      <h3 className="h6">At a glance</h3>
      <ul className="fs-xs ps-3">
        <li>{project.components.length} components, {project.relationships.length} connections</li>
        <li>{project.relationships.filter((r) => r.async).length} asynchronous connections</li>
        <li>{project.risks.length} risks tracked, {project.adrs.length} decisions recorded</li>
      </ul>

      <h3 className="h6">Architecture checks</h3>
      {issues.length === 0 ? (
        <p className="fs-xs text-success"><i className="bi bi-check-circle me-1" aria-hidden="true" />No structural issues found.</p>
      ) : (
        <ul className="list-unstyled fs-xs">
          {issues.map((i) => (
            <li key={i.id} className="mb-2 d-flex gap-2">
              <i className={`bi ${i.severity === "warning" ? "bi-exclamation-triangle text-warning" : "bi-info-circle text-primary"}`} aria-hidden="true" />
              <span>
                {i.message}{" "}
                {i.componentIds[0] && (
                  <button type="button" className="btn btn-link p-0 fs-xs" onClick={() => onSelect({ type: "component", id: i.componentIds[0] as string })}>Show</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
