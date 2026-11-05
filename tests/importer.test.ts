import { describe, expect, it } from "vitest";
import { exportBackupJson, exportProjectJson } from "@/domain/exchange";
import { findConflicts, MAX_IMPORT_CHARS, MAX_PROJECTS_PER_BACKUP, parseImportFile, resolveImport } from "@/domain/importer";
import { MIGRATIONS, migrateProject, type Migration } from "@/domain/migrations";
import { duplicateProject, validateProject } from "@/domain/project";
import { demoProject } from "@/mock/demoProject";
import { smallProject } from "./helpers";

const A = { ...smallProject(), id: "proj-a", name: "Alpha" };
const B = { ...smallProject(), id: "proj-b", name: "Beta" };
const errors = (r: ReturnType<typeof parseImportFile>) => r.issues.filter((i) => i.severity === "error");

describe("importing files", () => {
  it("reads a single project backup", () => {
    const r = parseImportFile(exportProjectJson(demoProject));
    expect(r.issues).toEqual([]);
    expect(r.projects).toEqual([demoProject]);
  });

  it("reads a workspace backup with several projects", () => {
    const r = parseImportFile(exportBackupJson([A, B]));
    expect(r.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    expect(r.issues).toEqual([]);
  });

  it("imports the valid projects of a backup and reports the broken ones", () => {
    const file = JSON.parse(exportBackupJson([A, B, demoProject]));
    file.projects[1].components[0].kind = "banana";
    file.projects[2] = "not a project";
    const r = parseImportFile(JSON.stringify(file));
    expect(r.projects.map((p) => p.name)).toEqual(["Alpha"]);
    expect(errors(r)).toHaveLength(2);
    expect(r.issues[0]?.scope).toContain("Beta");
    expect(r.issues[0]?.message).toMatch(/components › 0 › kind/);
  });

  it("reports malformed JSON, foreign files and truncated files with clear messages", () => {
    expect(parseImportFile("{ nope").issues[0]?.message).toMatch(/not valid JSON/);
    expect(parseImportFile(exportProjectJson(A).slice(0, 300)).issues[0]?.message).toMatch(/not valid JSON/);
    expect(parseImportFile('{"hello":1}').issues[0]?.message).toMatch(/not an Architecter/);
    expect(parseImportFile("42").issues[0]?.message).toMatch(/does not contain/);
    expect(parseImportFile("null").projects).toEqual([]);
    expect(parseImportFile('{"format":"architecter-project"}').issues[0]?.message).toMatch(/schema version/);
  });

  it("rejects oversized files before parsing and absurd backups", () => {
    expect(parseImportFile("x".repeat(MAX_IMPORT_CHARS + 1)).issues[0]?.message).toMatch(/too large/);
    const many = JSON.stringify({ format: "architecter-backup", schemaVersion: 1, projects: Array.from({ length: MAX_PROJECTS_PER_BACKUP + 1 }, () => ({})) });
    expect(parseImportFile(many).issues[0]?.message).toMatch(/more than/);
    expect(parseImportFile('{"format":"architecter-backup","schemaVersion":1,"projects":"nope"}').issues[0]?.message).toMatch(/list of projects/);
  });

  it("is safe against prototype pollution payloads", () => {
    const evil = exportProjectJson(A).replace('"project": {', '"__proto__": {"polluted": true}, "project": {');
    const r = parseImportFile(evil);
    expect(r.projects).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(r.projects[0] as object)).not.toContain("__proto__");
  });

  it("imports old v1 backups made before the documents field existed", () => {
    const file = JSON.parse(exportProjectJson(A));
    delete file.project.documents;
    const r = parseImportFile(JSON.stringify(file));
    expect(r.issues).toEqual([]);
    expect(r.projects[0]?.documents).toEqual([]);
  });

  it("marks source documents as having no stored original and warns about it", () => {
    const withDoc = {
      ...A,
      documents: [{ id: "d1", name: "spec.pdf", kind: "pdf" as const, size: 10, sha256: "a".repeat(64), addedAt: "2026-01-01T00:00:00.000Z", extractedText: "text", truncated: false, originalStored: true }],
    };
    const r = parseImportFile(exportProjectJson(withDoc));
    expect(r.projects[0]?.documents[0]?.originalStored).toBe(false);
    expect(r.projects[0]?.documents[0]?.extractedText).toBe("text");
    expect(r.issues).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringContaining("original files are not included") })]);
  });
});

describe("version compatibility", () => {
  it("rejects backups from a newer version with an actionable message", () => {
    const file = JSON.parse(exportProjectJson(A));
    file.schemaVersion = 99;
    const r = parseImportFile(JSON.stringify(file));
    expect(r.projects).toEqual([]);
    expect(r.issues[0]?.message).toMatch(/newer than the supported version.*Update Architecter/);
  });

  it("rejects invalid version numbers", () => {
    for (const v of [0, -1, 1.5]) {
      const file = JSON.parse(exportProjectJson(A));
      file.schemaVersion = v;
      expect(errors(parseImportFile(JSON.stringify(file)))).toHaveLength(1);
    }
  });

  it("upgrades old data through the migration chain", () => {
    const registry: Record<number, Migration> = {
      1: (raw) => ({ ...raw, name: `${String(raw.name)} v2` }),
      2: (raw) => ({ ...raw, tagline: "migrated" }),
    };
    const result = migrateProject({ ...A }, 1, registry, 3);
    expect(result.ok && result.data.name).toBe("Alpha v2");
    expect(result.ok && result.data.tagline).toBe("migrated");
  });

  it("fails clearly when a migration step is missing or throws", () => {
    expect(migrateProject({ ...A }, 1, {}, 3)).toMatchObject({ ok: false, error: expect.stringContaining("no upgrade path") });
    const broken = migrateProject({ ...A }, 1, { 1: () => { throw new Error("boom"); } }, 2);
    expect(broken).toMatchObject({ ok: false, error: expect.stringContaining("failed") });
  });

  it("current registry accepts the current version unchanged", () => {
    expect(MIGRATIONS).toEqual({});
    expect(migrateProject({ ...A }, 1).ok).toBe(true);
  });
});

describe("conflict resolution", () => {
  it("detects id collisions with existing projects and inside the file", () => {
    const flags = findConflicts([A], [A, B, B]).map((c) => c.conflict);
    expect(flags).toEqual([true, false, true]);
  });

  it("adds non-conflicting projects untouched", () => {
    const out = resolveImport([A], [B], () => "skip");
    expect(out.save).toEqual([B]);
    expect(out).toMatchObject({ replaced: 0, skipped: 0, copied: 0 });
  });

  it("keep-both imports a copy with a new id and a clear name, never merging", () => {
    const changed = { ...A, name: "Alpha edited" };
    const out = resolveImport([A], [changed], () => "keep-both");
    expect(out.copied).toBe(1);
    expect(out.save[0]?.id).not.toBe(A.id);
    expect(out.save[0]?.name).toBe("Alpha edited (imported)");
    expect(() => validateProject(out.save[0])).not.toThrow();
  });

  it("replace overwrites the existing project, skip leaves it alone", () => {
    const changed = { ...A, name: "Alpha edited" };
    const replaced = resolveImport([A], [changed], () => "replace");
    expect(replaced.save).toEqual([changed]);
    expect(replaced.replaced).toBe(1);
    const skipped = resolveImport([A], [changed], () => "skip");
    expect(skipped.save).toEqual([]);
    expect(skipped.skipped).toBe(1);
  });

  it("assigns unique ids when the same project appears twice in one file", () => {
    const out = resolveImport([], [A, A, A], () => "replace");
    const ids = out.save.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
    expect(out.save.map((p) => p.name)).toEqual(["Alpha", "Alpha (imported)", "Alpha (imported)"]);
  });

  it("lets each project choose its own strategy", () => {
    const out = resolveImport([A, B], [A, B], (p) => (p.id === A.id ? "skip" : "replace"));
    expect(out).toMatchObject({ skipped: 1, replaced: 1 });
    expect(out.save.map((p) => p.id)).toEqual([B.id]);
  });
});

describe("duplicating projects", () => {
  it("creates an independent valid copy", () => {
    const copy = duplicateProject(demoProject, [demoProject.name]);
    expect(copy.id).not.toBe(demoProject.id);
    expect(copy.name).toBe("Copy of QuickBite Delivery");
    expect(copy.components).toEqual(demoProject.components);
    expect(copy.components).not.toBe(demoProject.components);
    expect(copy.createdAt).not.toBe(demoProject.createdAt);
    copy.components[0]!.name = "Changed";
    expect(demoProject.components[0]?.name).not.toBe("Changed");
  });

  it("numbers copies of copies", () => {
    const first = duplicateProject(A, ["Alpha"]);
    const second = duplicateProject(A, ["Alpha", first.name]);
    expect(second.name).toBe("Copy of Alpha (2)");
  });

  it("keeps names within the allowed length", () => {
    const long = { ...A, name: "x".repeat(80) };
    expect(() => duplicateProject(long)).not.toThrow();
    expect(duplicateProject(long).name.length).toBeLessThanOrEqual(80);
  });
});
