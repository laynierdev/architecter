"use client";

import { useState } from "react";
import { addComponent, addRelationship, analyzeImpact, removeComponent, removeRelationship, updateComponent, updateRelationship } from "@/domain/architecture";
import { applyProposal, approveProposal, selectOperations } from "@/domain/proposals";
import { createSnapshot, deleteSnapshot, restoreSnapshot } from "@/domain/snapshots";
import type { ArchComponent, ChangeOperation, ChangeProposal, ComponentKind, Relationship } from "@/domain/types";
import { KIND_META } from "@/services/kindMeta";
import { cleanLines, Field, FormError, LinesField, SelectField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useProject } from "@/state/ProjectContext";

const KIND_OPTIONS = (Object.keys(KIND_META) as ComponentKind[]).map((k) => ({ value: k, label: KIND_META[k].label }));

// Component form --------------------------------------------------------

export function ComponentFormModal({ initial, onClose, onSaved }: { initial?: ArchComponent; onClose: () => void; onSaved?: (id: string) => void }) {
  const { project, run } = useProject();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<ComponentKind>(initial?.kind ?? "service");
  const [layer, setLayer] = useState(initial?.layer ?? "Core services");
  const [technology, setTechnology] = useState(initial?.technology ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [responsibilities, setResponsibilities] = useState(initial?.responsibilities ?? []);
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [failureMode, setFailureMode] = useState(initial?.failureMode ?? "");
  const [scaling, setScaling] = useState(initial?.scaling ?? "");
  const [error, setError] = useState<string | null>(null);
  const layers = [...new Set(project.components.map((c) => c.layer))];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = { name, kind, layer: layer.trim() || "Core services", technology, description, responsibilities: cleanLines(responsibilities), rationale, failureMode, scaling };
    const newId = initial?.id;
    const result = run((p) => (initial ? updateComponent(p, initial.id, values) : addComponent(p, { ...values, provenance: "user" })));
    if (!result.ok) return setError(result.error);
    onSaved?.(newId ?? "");
    onClose();
  };

  return (
    <Modal title={initial ? `Edit ${initial.name}` : "Add component"} onClose={onClose} size="lg">
      <form onSubmit={submit}>
        <FormError message={error} />
        <div className="row">
          <div className="col-md-6"><Field label="Name" value={name} onChange={setName} required /></div>
          <div className="col-md-6"><SelectField label="Type" value={kind} onChange={setKind} options={KIND_OPTIONS} /></div>
          <div className="col-md-6">
            <Field label="Layer / boundary" value={layer} onChange={setLayer} help="For example Clients, Core services, Data, External." />
          </div>
          <div className="col-md-6"><Field label="Technology" value={technology} onChange={setTechnology} placeholder="e.g. PostgreSQL" /></div>
        </div>
        <Field label="Description" textarea value={description} onChange={setDescription} />
        <LinesField label="Responsibilities" value={responsibilities} onChange={setResponsibilities} />
        <Field label="Why this choice" textarea value={rationale} onChange={setRationale} />
        <div className="row">
          <div className="col-md-6"><Field label="If it fails" textarea value={failureMode} onChange={setFailureMode} /></div>
          <div className="col-md-6"><Field label="How it scales" textarea value={scaling} onChange={setScaling} /></div>
        </div>
        {layers.length > 0 && <p className="fs-xs text-muted-ar">Existing layers: {layers.join(", ")}</p>}
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? "Save changes" : "Add component"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Relationship form -----------------------------------------------------

export function RelationshipFormModal({ initial, sourceId, onClose }: { initial?: Relationship; sourceId?: string; onClose: () => void }) {
  const { project, run } = useProject();
  const options = project.components.map((c) => ({ value: c.id, label: c.name }));
  const [source, setSource] = useState(initial?.source ?? sourceId ?? options[0]?.value ?? "");
  const [target, setTarget] = useState(initial?.target ?? options.find((o) => o.value !== (sourceId ?? ""))?.value ?? "");
  const [protocol, setProtocol] = useState(initial?.protocol ?? "HTTPS / REST");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [isAsync, setAsync] = useState(initial?.async ?? false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (protocol.trim() === "" || label.trim() === "") return setError("Protocol and purpose are required.");
    const result = run((p) =>
      initial
        ? updateRelationship(p, initial.id, { protocol: protocol.trim(), label: label.trim(), async: isAsync })
        : addRelationship(p, { source, target, protocol: protocol.trim(), label: label.trim(), async: isAsync }),
    );
    if (!result.ok) return setError(result.error);
    onClose();
  };

  return (
    <Modal title={initial ? "Edit connection" : "Add connection"} onClose={onClose}>
      <form onSubmit={submit}>
        <FormError message={error} />
        {!initial && (
          <div className="row">
            <div className="col-6"><SelectField label="From" value={source} onChange={setSource} options={options} /></div>
            <div className="col-6"><SelectField label="To" value={target} onChange={setTarget} options={options} /></div>
          </div>
        )}
        <Field label="Purpose" value={label} onChange={setLabel} placeholder="e.g. Create orders" required />
        <Field label="Protocol" value={protocol} onChange={setProtocol} placeholder="e.g. gRPC, AMQP, SQL" required />
        <div className="form-check mb-3">
          <input id="rel-async" type="checkbox" className="form-check-input" checked={isAsync} onChange={(e) => setAsync(e.target.checked)} />
          <label htmlFor="rel-async" className="form-check-label">Asynchronous (message or event based)</label>
        </div>
        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? "Save changes" : "Add connection"}</button>
        </div>
      </form>
    </Modal>
  );
}

// Deleting with impact preview -----------------------------------------

export function DeleteComponentModal({ component, onClose, onDeleted }: { component: ArchComponent; onClose: () => void; onDeleted: () => void }) {
  const { project, run } = useProject();
  const impact = analyzeImpact(project, component.id);
  const connections = project.relationships.filter((r) => r.source === component.id || r.target === component.id).length;
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Delete ${component.name}?`} onClose={onClose}>
      <FormError message={error} />
      <p>{impact.summary}</p>
      <ul className="fs-xs">
        <li>{connections} connection(s) will be removed.</li>
        {impact.affectedFlows.length > 0 && <li>{impact.affectedFlows.length} simulated flow(s) will lose steps.</li>}
        {impact.relatedRisks.length > 0 && <li>{impact.relatedRisks.length} risk(s) reference this component and will be unlinked.</li>}
      </ul>
      <p className="fs-xs text-muted-ar">You can undo this with the Undo button.</p>
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            const result = run((p) => removeComponent(p, component.id));
            if (!result.ok) return setError(result.error);
            onDeleted();
            onClose();
          }}
        >
          Delete component
        </button>
      </div>
    </Modal>
  );
}

export function DeleteRelationshipModal({ relationship, onClose, onDeleted }: { relationship: Relationship; onClose: () => void; onDeleted: () => void }) {
  const { run } = useProject();
  return (
    <Modal title="Delete this connection?" onClose={onClose}>
      <p>{relationship.label} ({relationship.protocol}) will be removed from the diagram and from any simulated flow. You can undo this.</p>
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            run((p) => removeRelationship(p, relationship.id));
            onDeleted();
            onClose();
          }}
        >
          Delete connection
        </button>
      </div>
    </Modal>
  );
}

// AI proposal review ----------------------------------------------------

function describeOperation(op: ChangeOperation, names: Map<string, string>): { icon: string; text: string; provenance?: ArchComponent["provenance"] } {
  const n = (id: string) => names.get(id) ?? id;
  switch (op.op) {
    case "add_component":
      return { icon: "bi-plus-square", text: `Add ${KIND_META[op.component.kind].label.toLowerCase()} "${op.component.name}" (${op.component.technology || "no technology"})`, provenance: op.component.provenance };
    case "update_component":
      return { icon: "bi-pencil-square", text: `Update ${n(op.id)}: ${Object.keys(op.changes).join(", ")}` };
    case "remove_component":
      return { icon: "bi-trash", text: `Remove ${n(op.id)}` };
    case "add_relationship":
      return { icon: "bi-arrow-right", text: `Connect ${n(op.relationship.source)} → ${n(op.relationship.target)}: ${op.relationship.label} (${op.relationship.protocol})` };
    case "remove_relationship":
      return { icon: "bi-scissors", text: `Remove connection ${op.id}` };
  }
}

export function ProposalReviewModal({ proposal, onClose, onApplied }: { proposal: ChangeProposal; onClose: () => void; onApplied: () => void }) {
  const { project, run, ai } = useProject();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(proposal.operations.map((_, i) => i)));
  const [error, setError] = useState<string | null>(null);

  const names = new Map(project.components.map((c) => [c.id, c.name]));
  proposal.operations.forEach((op) => op.op === "add_component" && names.set(op.component.id, op.component.name));

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const apply = () => {
    const result = run((p) => applyProposal(p, approveProposal(selectOperations(proposal, [...selected]))));
    if (!result.ok) return setError(result.error);
    onApplied();
    onClose();
  };

  return (
    <Modal title={proposal.title} onClose={onClose} size="lg">
      <FormError message={error} />
      {ai.isMock && (
        <div className="alert alert-warning py-2 fs-xs" role="note">
          <i className="bi bi-robot me-1" aria-hidden="true" />
          This proposal comes from the <strong>mock</strong> AI: rule-based on keywords in your requirements, not generated by a model.
        </div>
      )}
      <p>{proposal.summary}</p>
      {proposal.architectureStyle && (
        <p className="fs-xs">
          <strong>Suggested style:</strong> {proposal.architectureStyle}. {proposal.styleJustification}
        </p>
      )}
      <p className="fw-semibold mb-1">Select the changes to apply</p>
      <ul className="list-group mb-3">
        {proposal.operations.map((op, i) => {
          const d = describeOperation(op, names);
          return (
            <li key={i} className="list-group-item d-flex gap-2 align-items-start">
              <input id={`op-${i}`} className="form-check-input mt-1" type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
              <label htmlFor={`op-${i}`} className="flex-grow-1">
                <i className={`bi ${d.icon} me-1`} aria-hidden="true" />
                {d.text}
              </label>
              {d.provenance && <ProvenanceBadge value={d.provenance} />}
            </li>
          );
        })}
      </ul>
      <p className="fs-xs text-muted-ar">Nothing changes until you apply. A snapshot of the current architecture is saved first, and you can also undo.</p>
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Discard proposal</button>
        <button type="button" className="btn btn-primary" disabled={selected.size === 0} onClick={apply}>
          Approve and apply {selected.size} change{selected.size === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}

// Snapshots -------------------------------------------------------------

export function SnapshotsModal({ onClose }: { onClose: () => void }) {
  const { project, run } = useProject();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const act = (operation: Parameters<typeof run>[0]) => {
    const result = run(operation);
    setError(result.ok ? null : result.error);
    return result.ok;
  };

  return (
    <Modal title="Snapshots" onClose={onClose}>
      <FormError message={error} />
      <form
        className="d-flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && act((p) => createSnapshot(p, label))) setLabel("");
        }}
      >
        <label htmlFor="snap-label" className="visually-hidden">Snapshot name</label>
        <input id="snap-label" className="form-control" placeholder="Name this version, e.g. Before adding cache" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-primary text-nowrap" type="submit" disabled={!label.trim()}>Save snapshot</button>
      </form>
      {project.snapshots.length === 0 ? (
        <p className="text-muted-ar">No snapshots yet. Snapshots save the diagram so you can return to it later.</p>
      ) : (
        <ul className="list-group">
          {[...project.snapshots].reverse().map((s) => (
            <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center gap-2">
              <span>
                <span className="fw-semibold d-block">{s.label}</span>
                <span className="fs-xs text-muted-ar">{new Date(s.createdAt).toLocaleString()} · {s.components.length} components</span>
              </span>
              <span className="d-flex gap-1">
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => act((p) => restoreSnapshot(p, s.id))}>Restore</button>
                <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Delete snapshot ${s.label}`} onClick={() => act((p) => deleteSnapshot(p, s.id))}>
                  <i className="bi bi-trash" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="fs-xs text-muted-ar mt-3 mb-0">Restoring saves the current architecture first, so a restore can be reverted.</p>
    </Modal>
  );
}
