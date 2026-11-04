"use client";

import { useState } from "react";
import type { Project } from "@/domain/types";
import { useFlowSimulation } from "@/hooks/useFlowSimulation";
import { DiagramCanvas, type Selection } from "@/components/diagram/DiagramCanvas";
import { KIND_META } from "@/services/kindMeta";
import { ComponentDetails } from "./ComponentDetails";
import { AdvisorPanel } from "./AdvisorPanel";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

type Tab = "details" | "advisor" | "summary";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "advisor", label: "Advisor" },
  { id: "summary", label: "Summary" },
];
const SPEEDS = [0.5, 1, 2];

export function ArchitectureWorkspace({ project }: { project: Project }) {
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [flowId, setFlowId] = useState(project.flows[0]?.id ?? "");
  const [speed, setSpeed] = useState(1);
  const { state, play, stop } = useFlowSimulation(speed);

  const flow = project.flows.find((f) => f.id === flowId);
  const simulating = state.runningFlowId !== null;

  const handleSelect = (s: Selection) => {
    setSelection(s);
    if (s) setTab("details");
  };

  return (
    <div className="workspace">
      <div className="workspace-toolbar" role="toolbar" aria-label="Diagram and flow simulation controls">
        <div className="d-flex align-items-center gap-2">
          <label htmlFor="flow-select" className="fs-xs text-muted-ar mb-0">
            Flow
          </label>
          <select id="flow-select" className="form-select form-select-sm" style={{ width: "auto" }} value={flowId} disabled={simulating} onChange={(e) => setFlowId(e.target.value)}>
            {project.flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {simulating ? (
          <button type="button" className="btn btn-sm btn-danger" onClick={stop}>
            <i className="bi bi-stop-fill me-1" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" disabled={!flow} onClick={() => flow && play(flow)}>
            <i className="bi bi-play-fill me-1" aria-hidden="true" />
            Simulate flow
          </button>
        )}

        <div className="btn-group btn-group-sm" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`btn ${speed === s ? "btn-secondary" : "btn-outline-secondary"}`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>

        <span className="fs-xs text-muted-ar ms-auto d-none d-md-inline">{flow?.description}</span>
      </div>

      <div className="workspace-canvas">
        <div className="legend" aria-label="Diagram legend">
          {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
            <span key={k}>
              <span className="dot" style={{ background: KIND_META[k].color }} />
              {KIND_META[k].label}
            </span>
          ))}
          <span className="mt-1 text-muted-ar">Dashed line: asynchronous</span>
          <span className="text-muted-ar">Dashed border: assumption</span>
        </div>

        <DiagramCanvas
          components={project.components}
          relationships={project.relationships}
          selection={selection}
          onSelect={handleSelect}
          activeEdgeIds={state.activeEdgeIds}
          runId={state.runId}
          stepMs={state.stepMs}
          simulating={simulating}
        />

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
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="side-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "details" && <ComponentDetails project={project} selection={selection} onSelect={handleSelect} />}
          {tab === "advisor" && <AdvisorPanel project={project} />}
          {tab === "summary" && <Summary project={project} />}
        </div>
      </aside>
    </div>
  );
}

function Summary({ project }: { project: Project }) {
  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2">
        <h2 className="h5 mb-0">{project.architectureStyle}</h2>
      </div>
      <ProvenanceBadge value="recommendation" />
      <p className="mt-3">{project.styleJustification}</p>
      <p className="fs-xs text-muted-ar">
        This is a proposal, not a confirmed decision. Review the assumptions in Requirements and the trade-offs in Compare before committing.
      </p>
      <h3 className="h6">At a glance</h3>
      <ul className="fs-xs ps-3">
        <li>{project.components.length} components, {project.relationships.length} connections</li>
        <li>{project.relationships.filter((r) => r.async).length} asynchronous connections</li>
        <li>{project.components.filter((c) => c.provenance === "assumption").length} components rest on unconfirmed assumptions</li>
        <li>{project.risks.length} risks tracked, {project.adrs.length} decisions recorded</li>
      </ul>
    </div>
  );
}
