import { DomainError, nowIso, touch, uniqueId } from "./common";
import type { Project, Snapshot } from "./types";

export const MAX_SNAPSHOTS = 30;

function capture(project: Project, label: string): Snapshot {
  return {
    id: uniqueId("snap", project.snapshots.map((s) => s.id)),
    label: label.trim() || "Untitled snapshot",
    createdAt: nowIso(),
    // Snapshots are immutable copies of the architecture only (never nested snapshots).
    components: structuredClone(project.components),
    relationships: structuredClone(project.relationships),
    flows: structuredClone(project.flows),
  };
}

/** Saves the current architecture. The oldest snapshot is dropped when the limit is reached. */
export function createSnapshot(project: Project, label: string): Project {
  const snapshots = [...project.snapshots, capture(project, label)].slice(-MAX_SNAPSHOTS);
  return touch({ ...project, snapshots });
}

/**
 * Restores a snapshot. The current architecture is saved first, so a restore can itself be undone.
 */
export function restoreSnapshot(project: Project, snapshotId: string): Project {
  const snapshot = project.snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) throw new DomainError(`Snapshot "${snapshotId}" not found`);
  const backedUp = createSnapshot(project, `Before restoring "${snapshot.label}"`);
  const componentIds = new Set(snapshot.components.map((c) => c.id));
  return touch({
    ...backedUp,
    components: structuredClone(snapshot.components),
    relationships: structuredClone(snapshot.relationships),
    flows: structuredClone(snapshot.flows),
    // Risks pointing at components that no longer exist are cleaned, never left dangling.
    risks: backedUp.risks.map((r) => ({ ...r, relatedComponentIds: r.relatedComponentIds.filter((c) => componentIds.has(c)) })),
  });
}

export function deleteSnapshot(project: Project, snapshotId: string): Project {
  if (!project.snapshots.some((s) => s.id === snapshotId)) throw new DomainError(`Snapshot "${snapshotId}" not found`);
  return touch({ ...project, snapshots: project.snapshots.filter((s) => s.id !== snapshotId) });
}
