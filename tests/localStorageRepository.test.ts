import { describe, expect, it, vi } from "vitest";
import { updateProjectInfo } from "@/domain/project";
import { exportProjectJson } from "@/domain/exchange";
import { LocalStorageProjectRepository, META_KEY, PROJECT_PREFIX, STORED_FORMAT } from "@/repositories/localStorageRepository";
import { StorageError } from "@/repositories/projectRepository";
import { demoProject } from "@/mock/demoProject";
import { MemoryStorage, quotaError } from "./fixtures";
import { smallProject } from "./helpers";

// One fixed project: smallProject() generates a new random id on every call.
const P = smallProject();

const open = (storage: MemoryStorage, seed = [demoProject]) => new LocalStorageProjectRepository(storage, { seed });
const keyOf = (id: string) => `${PROJECT_PREFIX}${id}`;

describe("persistence across sessions", () => {
  it("survives a reload: a new repository over the same storage sees the saved projects", () => {
    const storage = new MemoryStorage();
    const first = open(storage, []);
    first.save(P);
    first.save(updateProjectInfo(P, { name: "Renamed project" }));

    const reopened = open(storage, []);
    expect(reopened.list().map((x) => x.name)).toEqual(["Renamed project"]);
    expect(reopened.get(P.id)?.components).toHaveLength(4);
  });

  it("stores every project under its own key", () => {
    const storage = new MemoryStorage();
    const repo = open(storage, []);
    repo.save(P);
    repo.save({ ...P, id: "second", name: "Second project" });
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(keys.filter((k) => k?.startsWith(PROJECT_PREFIX))).toHaveLength(2);
  });

  it("supports multiple projects, deletion and listing by most recently updated", async () => {
    const repo = open(new MemoryStorage(), []);
    const a = { ...P, id: "a", name: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z" };
    const b = { ...P, id: "b", name: "Beta", updatedAt: "2026-02-01T00:00:00.000Z" };
    repo.save(a);
    repo.save(b);
    expect(repo.list().map((p) => p.id)).toEqual(["b", "a"]);
    repo.delete("b");
    expect(repo.list().map((p) => p.id)).toEqual(["a"]);
    expect(repo.get("b")).toBeUndefined();
    expect(open(repo["storage" as never] as MemoryStorage, []).get("b")).toBeUndefined();
  });

  it("returns stable references between changes (required by useSyncExternalStore)", () => {
    const repo = open(new MemoryStorage());
    expect(repo.list()).toBe(repo.list());
    expect(repo.loadIssues()).toBe(repo.loadIssues());
    const before = repo.list();
    repo.save({ ...P, id: "x" });
    expect(repo.list()).not.toBe(before);
  });

  it("notifies subscribers on save and delete, and stops after unsubscribe", () => {
    const repo = open(new MemoryStorage(), []);
    const listener = vi.fn();
    const off = repo.subscribe(listener);
    repo.save(P);
    repo.delete(P.id);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    repo.save(P);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("refuses to store invalid projects and does not touch storage", () => {
    const storage = new MemoryStorage();
    const repo = open(storage, []);
    expect(() => repo.save({ ...P, name: "" })).toThrow();
    expect(repo.list()).toHaveLength(0);
    const projectKeys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith(PROJECT_PREFIX));
    expect(projectKeys).toHaveLength(0);
  });
});

describe("first run seeding", () => {
  it("adds the demo project once and does not bring it back after deletion", () => {
    const storage = new MemoryStorage();
    const first = open(storage);
    expect(first.list().map((p) => p.id)).toEqual(["demo"]);
    first.delete("demo");

    const second = open(storage);
    expect(second.list()).toHaveLength(0);
    expect(storage.getItem(META_KEY)).not.toBeNull();
  });

  it("does not seed over existing projects", () => {
    const storage = new MemoryStorage();
    open(storage, []).save(P);
    storage.removeItem(META_KEY);
    expect(open(storage).list().map((p) => p.id)).toEqual([P.id]);
  });

  it("still works when storage rejects the seed", () => {
    const storage = new MemoryStorage();
    storage.failWith = quotaError();
    expect(open(storage).list()).toEqual([]);
  });
});

describe("protection against damaged or incompatible data", () => {
  const stored = (project: unknown, schemaVersion = 1) => JSON.stringify({ format: STORED_FORMAT, schemaVersion, project });

  it("loads valid projects and reports the broken ones without deleting them", () => {
    const storage = new MemoryStorage();
    storage.setItem(keyOf("good"), stored({ ...P, id: "good" }));
    storage.setItem(keyOf("junk"), "{ not json");
    storage.setItem(keyOf("shape"), stored({ id: "shape", name: "x" }));
    storage.setItem(keyOf("future"), stored({ ...P, id: "future" }, 99));
    storage.setItem(keyOf("alien"), JSON.stringify({ hello: "world" }));
    storage.setItem(keyOf("mismatch"), stored({ ...P, id: "other" }));
    storage.setItem(META_KEY, "{}");

    const repo = open(storage, []);
    expect(repo.list().map((p) => p.id)).toEqual(["good"]);
    const issues = repo.loadIssues();
    expect(issues.map((i) => i.key).sort()).toEqual(["junk", "shape", "future", "alien", "mismatch"].map(keyOf).sort());
    expect(issues.find((i) => i.key === keyOf("junk"))?.message).toMatch(/not valid JSON/);
    expect(issues.find((i) => i.key === keyOf("future"))?.message).toMatch(/newer/);
    expect(issues.find((i) => i.key === keyOf("mismatch"))?.message).toMatch(/does not match/);
    // Nothing was deleted: the raw data is still there for recovery.
    expect(storage.getItem(keyOf("junk"))).toBe("{ not json");
    expect(issues.find((i) => i.key === keyOf("junk"))?.raw).toBe("{ not json");
  });

  it("removes an unreadable entry only when explicitly asked", () => {
    const storage = new MemoryStorage();
    storage.setItem(keyOf("junk"), "garbage");
    storage.setItem(META_KEY, "{}");
    const repo = open(storage, []);
    expect(repo.loadIssues()).toHaveLength(1);
    repo.discardIssue(keyOf("junk"));
    expect(repo.loadIssues()).toHaveLength(0);
    expect(storage.getItem(keyOf("junk"))).toBeNull();
  });

  it("loads old v1 projects saved before the documents field existed", () => {
    const { documents: _ignored, ...legacy } = P;
    void _ignored;
    const storage = new MemoryStorage();
    storage.setItem(keyOf(legacy.id), stored(legacy));
    storage.setItem(META_KEY, "{}");
    const repo = open(storage, []);
    expect(repo.get(legacy.id)?.documents).toEqual([]);
    expect(repo.loadIssues()).toHaveLength(0);
  });

  it("ignores unrelated keys in the same storage", () => {
    const storage = new MemoryStorage();
    storage.setItem("another-app:data", "whatever");
    storage.setItem(META_KEY, "{}");
    const repo = open(storage, []);
    expect(repo.list()).toEqual([]);
    expect(repo.loadIssues()).toEqual([]);
  });
});

describe("write failures", () => {
  it("raises a clear StorageError when storage is full, keeps the change in memory and tracks it as unsaved", () => {
    const storage = new MemoryStorage();
    const repo = open(storage, []);
    repo.save(P);
    storage.failWith = quotaError();
    const changed = updateProjectInfo(P, { name: "Changed while full" });
    expect(() => repo.save(changed)).toThrow(StorageError);
    try {
      repo.save(changed);
    } catch (e) {
      expect((e as StorageError).code).toBe("quota");
      expect((e as StorageError).message).toMatch(/storage is full/i);
    }
    expect(repo.get(changed.id)?.name).toBe("Changed while full");
    expect(repo.unsavedIds().has(changed.id)).toBe(true);
    // The previous version is still safely on disk.
    expect(open(storage, []).get(changed.id)?.name).not.toBe("Changed while full");

    storage.failWith = null;
    repo.save(changed);
    expect(repo.unsavedIds().has(changed.id)).toBe(false);
    expect(open(storage, []).get(changed.id)?.name).toBe("Changed while full");
  });

  it("reports blocked storage as unavailable", () => {
    const storage = new MemoryStorage();
    storage.failWith = new Error("SecurityError");
    const repo = open(storage, []);
    expect(() => repo.save(P)).toThrow(/not available/);
  });
});

describe("other tabs and usage", () => {
  it("reloads a project changed by another tab and notifies", () => {
    const storage = new MemoryStorage();
    const tabA = open(storage, []);
    const tabB = open(storage, []);
    tabB.list(); // tab B has already loaded its view of storage
    tabA.save(P);
    expect(tabB.get(P.id)).toBeUndefined();
    const listener = vi.fn();
    tabB.subscribe(listener);
    tabB.reloadKey(keyOf(P.id));
    expect(tabB.get(P.id)?.name).toBe("Test project");
    expect(listener).toHaveBeenCalled();

    tabA.delete(P.id);
    tabB.reloadKey(keyOf(P.id));
    expect(tabB.get(P.id)).toBeUndefined();
  });

  it("handles a storage clear from another tab and ignores unrelated keys", () => {
    const storage = new MemoryStorage();
    const repo = open(storage, []);
    repo.save(P);
    const listener = vi.fn();
    repo.subscribe(listener);
    repo.reloadKey("another-app:key");
    expect(listener).not.toHaveBeenCalled();
    storage.removeItem(keyOf(P.id));
    repo.reloadKey(null);
    expect(repo.list()).toHaveLength(0);
  });

  it("reports storage usage", () => {
    const storage = new MemoryStorage();
    const repo = open(storage, []);
    const empty = repo.usage().chars;
    repo.save(P);
    expect(repo.usage().chars).toBeGreaterThan(empty);
    expect(repo.usage().approxLimitChars).toBeGreaterThan(1_000_000);
  });

  it("a saved project can also be exported and is identical after reload", () => {
    const storage = new MemoryStorage();
    open(storage, []).save(demoProject);
    const reloaded = open(storage, []).get("demo");
    expect(reloaded).toEqual(demoProject);
    expect(exportProjectJson(reloaded ?? demoProject, "2026-01-01T00:00:00.000Z")).toBe(exportProjectJson(demoProject, "2026-01-01T00:00:00.000Z"));
  });
});
