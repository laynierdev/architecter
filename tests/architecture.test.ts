import { describe, expect, it } from "vitest";
import { addComponent, addRelationship, analyzeImpact, confirmComponent, findIssues, removeComponent, removeRelationship, updateComponent } from "@/domain/architecture";
import { addRisk } from "@/domain/risks";
import { validateProject } from "@/domain/project";
import { demoProject } from "@/mock/demoProject";
import { component, smallProject } from "./helpers";

describe("components", () => {
  it("adds components with unique ids and names", () => {
    const p = smallProject();
    expect(p.components).toHaveLength(4);
    expect(() => addComponent(p, component("api"))).toThrow(/already exists/);
    expect(() => addComponent(p, component("   "))).toThrow(/required/);
    const next = addComponent(p, component("Worker"));
    expect(new Set(next.components.map((c) => c.id)).size).toBe(5);
  });

  it("updates a component and protects name uniqueness", () => {
    const p = smallProject();
    expect(updateComponent(p, "api", { technology: "Go" }).components.find((c) => c.id === "api")?.technology).toBe("Go");
    expect(() => updateComponent(p, "api", { name: "DB" })).toThrow(/already exists/);
    expect(() => updateComponent(p, "missing", {})).toThrow(/not found/);
  });

  it("removing a component cascades to relationships, flows and risks", () => {
    let p = smallProject();
    p = { ...p, flows: [{ id: "f1", name: "Flow", description: "", steps: [{ edgeIds: ["r2"], caption: "a" }, { edgeIds: ["r1"], caption: "b" }] }] };
    p = addRisk(p, { title: "DB risk", description: "", likelihood: "low", impact: "high", mitigation: "", relatedComponentIds: ["db"] });
    const next = removeComponent(p, "db");
    expect(next.components.map((c) => c.id)).not.toContain("db");
    expect(next.relationships.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(next.flows[0]?.steps).toHaveLength(1);
    expect(next.risks[0]?.relatedComponentIds).toEqual([]);
    expect(() => validateProject(next)).not.toThrow();
  });

  it("confirming turns a recommendation into a user decision", () => {
    const p = addComponent(smallProject(), component("Queue", "queue", { provenance: "recommendation" }), "q");
    expect(confirmComponent(p, "q").components.find((c) => c.id === "q")?.provenance).toBe("user");
  });
});

describe("relationships", () => {
  it("rejects self loops, unknown endpoints and duplicates", () => {
    const p = smallProject();
    const base = { protocol: "HTTPS", label: "x", async: false };
    expect(() => addRelationship(p, { ...base, source: "api", target: "api" })).toThrow(/itself/);
    expect(() => addRelationship(p, { ...base, source: "api", target: "ghost" })).toThrow(/Unknown target/);
    expect(() => addRelationship(p, { ...base, source: "ghost", target: "api" })).toThrow(/Unknown source/);
    expect(() => addRelationship(p, { ...base, source: "web", target: "api" })).toThrow(/already exists/);
  });

  it("removes a relationship and cleans flows", () => {
    let p = smallProject();
    p = { ...p, flows: [{ id: "f", name: "F", description: "", steps: [{ edgeIds: ["r1"], caption: "x" }] }] };
    const next = removeRelationship(p, "r1");
    expect(next.relationships.map((r) => r.id)).not.toContain("r1");
    expect(next.flows[0]?.steps).toEqual([]);
  });
});

describe("impact analysis and checks", () => {
  it("finds transitive dependents and dependencies", () => {
    const p = smallProject();
    const impact = analyzeImpact(p, "db");
    expect(impact.dependents.sort()).toEqual(["api", "web"]);
    expect(impact.dependencies).toEqual([]);
    expect(analyzeImpact(p, "api").dependencies.sort()).toEqual(["cache", "db"]);
    expect(() => analyzeImpact(p, "nope")).toThrow();
  });

  it("works on the demo project and does not loop on cycles", () => {
    expect(analyzeImpact(demoProject, "orders-db").dependents).toContain("customer-app");
    let p = smallProject();
    p = addRelationship(p, { source: "db", target: "web", protocol: "x", label: "cycle", async: false });
    expect(analyzeImpact(p, "api").dependents).toContain("web");
  });

  it("flags orphans, shared databases and clients bypassing the API", () => {
    let p = smallProject();
    p = addComponent(p, component("Lonely"), "lonely");
    p = addComponent(p, component("Other", "service"), "other");
    p = addRelationship(p, { source: "other", target: "db", protocol: "SQL", label: "x", async: false });
    p = addRelationship(p, { source: "web", target: "cache", protocol: "Redis", label: "x", async: false });
    const ids = findIssues(p).map((i) => i.id);
    expect(ids).toContain("orphan-lonely");
    expect(ids).toContain("shared-db-db");
    expect(ids.some((i) => i.startsWith("client-direct"))).toBe(true);
  });
});
