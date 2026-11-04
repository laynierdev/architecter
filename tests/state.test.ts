import { describe, expect, it, vi } from "vitest";
import { canRedo, canUndo, createHistory, MAX_HISTORY, push, redo, undo } from "@/state/history";
import { InMemoryProjectRepository } from "@/repositories/projectRepository";
import { demoProject } from "@/mock/demoProject";
import { updateProjectInfo } from "@/domain/project";

describe("history", () => {
  it("supports undo and redo", () => {
    let h = createHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
  });

  it("clears redo on a new change and ignores no-ops", () => {
    let h = push(push(createHistory(1), 2), 3);
    h = undo(h);
    h = push(h, 99);
    expect(canRedo(h)).toBe(false);
    expect(push(h, 99)).toBe(h);
    expect(undo(createHistory(1)).present).toBe(1);
    expect(canUndo(createHistory(1))).toBe(false);
  });

  it("bounds memory usage", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 20; i++) h = push(h, i);
    expect(h.past).toHaveLength(MAX_HISTORY);
  });
});

describe("in-memory repository", () => {
  it("stores, lists, updates and deletes projects", () => {
    const repo = new InMemoryProjectRepository([demoProject]);
    expect(repo.list()).toHaveLength(1);
    expect(repo.get("demo")?.name).toBe("QuickBite Delivery");
    repo.save(updateProjectInfo(demoProject, { name: "Renamed" }));
    expect(repo.get("demo")?.name).toBe("Renamed");
    repo.delete("demo");
    expect(repo.list()).toHaveLength(0);
  });

  it("notifies subscribers, returns stable snapshots and supports unsubscribe", () => {
    const repo = new InMemoryProjectRepository([demoProject]);
    const listener = vi.fn();
    const off = repo.subscribe(listener);
    const before = repo.list();
    expect(repo.list()).toBe(before);
    repo.save(updateProjectInfo(demoProject, { name: "Changed" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(repo.list()).not.toBe(before);
    off();
    repo.delete("demo");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refuses to store invalid projects", () => {
    const repo = new InMemoryProjectRepository();
    expect(() => repo.save({ ...demoProject, name: "" })).toThrow();
    expect(repo.list()).toHaveLength(0);
  });
});
