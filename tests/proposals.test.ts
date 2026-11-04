import { describe, expect, it } from "vitest";
import { applyProposal, approveProposal, rejectProposal, selectOperations } from "@/domain/proposals";
import { createSnapshot, deleteSnapshot, MAX_SNAPSHOTS, restoreSnapshot } from "@/domain/snapshots";
import { addComponent, removeComponent } from "@/domain/architecture";
import { validateProject } from "@/domain/project";
import type { ChangeProposal } from "@/domain/types";
import { component, smallProject } from "./helpers";

const proposal = (): ChangeProposal => ({
  id: "p1",
  title: "Add queue",
  summary: "",
  source: "mock",
  status: "proposed",
  createdAt: new Date().toISOString(),
  architectureStyle: "Modular monolith",
  styleJustification: "Simple.",
  operations: [
    { op: "add_component", component: { id: "queue", name: "Queue", kind: "queue", layer: "Messaging", technology: "", description: "", responsibilities: [], provenance: "recommendation", rationale: "", failureMode: "", scaling: "" } },
    { op: "add_relationship", relationship: { id: "rq", source: "api", target: "queue", protocol: "AMQP", label: "jobs", async: true } },
  ],
});

describe("proposals", () => {
  it("refuses to apply a proposal that was not approved", () => {
    expect(() => applyProposal(smallProject(), proposal())).toThrow(/approved/);
    expect(() => applyProposal(smallProject(), rejectProposal(proposal()))).toThrow(/approved/);
  });

  it("applies an approved proposal, saves a snapshot first and sets the style", () => {
    const before = smallProject();
    const after = applyProposal(before, approveProposal(proposal()));
    expect(after.components.map((c) => c.id)).toContain("queue");
    expect(after.relationships.map((r) => r.id)).toContain("rq");
    expect(after.snapshots).toHaveLength(1);
    expect(after.snapshots[0]?.components).toHaveLength(before.components.length);
    expect(after.architectureStyle).toBe("Modular monolith");
    expect(before.components.map((c) => c.id)).not.toContain("queue");
    expect(() => validateProject(after)).not.toThrow();
  });

  it("is atomic: a failing operation leaves the original project untouched", () => {
    const bad = approveProposal({ ...proposal(), operations: [...proposal().operations, { op: "remove_component", id: "ghost" }] });
    const before = smallProject();
    expect(() => applyProposal(before, bad)).toThrow(/not found/);
    expect(before.components).toHaveLength(4);
  });

  it("rejects malformed proposals", () => {
    const malformed = { ...approveProposal(proposal()), operations: [] };
    expect(() => applyProposal(smallProject(), malformed)).toThrow(/malformed/);
  });

  it("lets users deselect operations", () => {
    expect(selectOperations(proposal(), [0]).operations).toHaveLength(1);
    expect(() => selectOperations(proposal(), [])).toThrow();
  });
});

describe("snapshots", () => {
  it("captures and restores the architecture, keeping a backup of the current one", () => {
    let p = createSnapshot(smallProject(), "v1");
    const snapId = p.snapshots[0]?.id as string;
    p = removeComponent(p, "cache");
    p = addComponent(p, component("Search"), "search");
    const restored = restoreSnapshot(p, snapId);
    expect(restored.components.map((c) => c.id).sort()).toEqual(["api", "cache", "db", "web"]);
    expect(restored.snapshots).toHaveLength(2);
    expect(restored.snapshots[1]?.label).toContain("Before restoring");
    expect(() => validateProject(restored)).not.toThrow();
  });

  it("snapshots are independent copies", () => {
    const p = createSnapshot(smallProject(), "v1");
    const changed = removeComponent(p, "web");
    expect(changed.snapshots[0]?.components.map((c) => c.id)).toContain("web");
  });

  it("limits the number of snapshots and can delete them", () => {
    let p = smallProject();
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) p = createSnapshot(p, `s${i}`);
    expect(p.snapshots).toHaveLength(MAX_SNAPSHOTS);
    expect(p.snapshots[MAX_SNAPSHOTS - 1]?.label).toBe(`s${MAX_SNAPSHOTS + 4}`);
    expect(deleteSnapshot(p, p.snapshots[0]?.id as string).snapshots).toHaveLength(MAX_SNAPSHOTS - 1);
    expect(() => restoreSnapshot(p, "nope")).toThrow();
  });
});
