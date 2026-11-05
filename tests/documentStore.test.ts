import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { copyProjectDocuments, IndexedDbDocumentStore, MemoryDocumentStore, type DocumentStore } from "@/repositories/documentStore";
import { textBytes } from "./fixtures";

const file = (text: string) => ({ name: "spec.pdf", type: "application/pdf", bytes: textBytes(text) });
const read = async (store: DocumentStore, p: string, d: string) => {
  const doc = await store.get(p, d);
  return doc ? new TextDecoder().decode(doc.bytes) : undefined;
};

describe.each([
  ["memory store", () => new MemoryDocumentStore() as DocumentStore],
  ["IndexedDB store", () => new IndexedDbDocumentStore(new IDBFactory()) as DocumentStore],
])("%s", (_name, create) => {
  it("keeps the original bytes and metadata exactly", async () => {
    const store = create();
    await store.put("p1", "d1", file("%PDF-original-bytes"));
    const back = await store.get("p1", "d1");
    expect(back?.name).toBe("spec.pdf");
    expect(back?.type).toBe("application/pdf");
    expect(await read(store, "p1", "d1")).toBe("%PDF-original-bytes");
  });

  it("returns undefined for unknown documents", async () => {
    expect(await create().get("p1", "nope")).toBeUndefined();
  });

  it("keeps projects separate and deletes one document or a whole project", async () => {
    const store = create();
    await store.put("p1", "d1", file("one"));
    await store.put("p1", "d2", file("two"));
    await store.put("p10", "d1", file("other project with similar id"));
    await store.delete("p1", "d1");
    expect(await read(store, "p1", "d1")).toBeUndefined();
    expect(await read(store, "p1", "d2")).toBe("two");
    await store.deleteProject("p1");
    expect(await read(store, "p1", "d2")).toBeUndefined();
    expect(await read(store, "p10", "d1")).toBe("other project with similar id");
  });

  it("overwrites a document stored again", async () => {
    const store = create();
    await store.put("p", "d", file("v1"));
    await store.put("p", "d", file("v2"));
    expect(await read(store, "p", "d")).toBe("v2");
  });

  it("copies originals to another project, skipping the missing ones", async () => {
    const store = create();
    await store.put("src", "d1", file("original"));
    const copied = await copyProjectDocuments(store, "src", "dst", ["d1", "missing"]);
    expect(copied).toEqual(["d1"]);
    expect(await read(store, "dst", "d1")).toBe("original");
    expect(await read(store, "src", "d1")).toBe("original");
  });
});

describe("IndexedDB persistence", () => {
  it("survives reopening the database", async () => {
    const factory = new IDBFactory();
    await new IndexedDbDocumentStore(factory).put("p", "d", file("persisted"));
    expect(await read(new IndexedDbDocumentStore(factory), "p", "d")).toBe("persisted");
  });
});
