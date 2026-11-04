import { describe, expect, it } from "vitest";
import { adrToMarkdown, exportProjectJson, parseProjectJson, toMarkdown, toMermaid } from "@/domain/exchange";
import { demoProject } from "@/mock/demoProject";

describe("JSON export / import", () => {
  it("round-trips the full project", () => {
    const result = parseProjectJson(exportProjectJson(demoProject));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project).toEqual(demoProject);
  });

  it("reports malformed JSON and foreign files", () => {
    expect(parseProjectJson("{ nope")).toEqual({ ok: false, errors: ["The file is not valid JSON."] });
    expect(parseProjectJson('{"hello":1}')).toMatchObject({ ok: false });
    expect(parseProjectJson("42")).toMatchObject({ ok: false });
  });

  it("checks schema version compatibility", () => {
    const newer = JSON.parse(exportProjectJson(demoProject));
    newer.schemaVersion = 99;
    const result = parseProjectJson(JSON.stringify(newer));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/newer/);
    newer.schemaVersion = 0;
    expect(parseProjectJson(JSON.stringify(newer)).ok).toBe(false);
  });

  it("reports validation errors with their location", () => {
    const data = JSON.parse(exportProjectJson(demoProject));
    data.project.components[0].kind = "banana";
    data.project.relationships[0].source = "ghost";
    const result = parseProjectJson(JSON.stringify(data));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("components.0.kind");
  });
});

describe("Mermaid and Markdown", () => {
  it("generates a Mermaid flowchart from real project data", () => {
    const m = toMermaid(demoProject);
    expect(m.startsWith("flowchart LR")).toBe(true);
    expect(m).toContain('subgraph layer_0["Clients"]');
    demoProject.components.forEach((c) => expect(m).toContain(c.name));
    expect(m.match(/-->/g)?.length).toBe(demoProject.relationships.filter((r) => !r.async).length);
    expect(m.match(/\.->/g)?.length).toBe(demoProject.relationships.filter((r) => r.async).length);
  });

  it("sanitizes ids and quotes in Mermaid", () => {
    const m = toMermaid({ ...demoProject, components: demoProject.components.map((c, i) => (i === 0 ? { ...c, name: 'Say "hi"' } : c)) });
    expect(m).toContain("Say 'hi'");
    expect(m).not.toMatch(/orders-db\[/);
  });

  it("documents requirements, components, decisions and unanswered questions", () => {
    const md = toMarkdown(demoProject);
    expect(md).toContain("# QuickBite Delivery");
    expect(md).toContain("```mermaid");
    expect(md).toContain("(unanswered)");
    expect(md).toContain("ADR-001");
    demoProject.components.forEach((c) => expect(md).toContain(`#### ${c.name}`));
  });

  it("formats a single ADR", () => {
    const adr = demoProject.adrs[0];
    if (!adr) throw new Error("demo has no ADRs");
    const md = adrToMarkdown(adr);
    expect(md).toContain("# ADR-001");
    expect(md).toContain("**Status:** accepted");
    expect(md).toContain("## Alternatives considered");
  });
});
