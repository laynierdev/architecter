/**
 * Keeps the ORIGINAL bytes of uploaded documents, so the file the user gave us is never replaced
 * by our extraction of it. Bytes live outside the project (IndexedDB), because localStorage is tiny.
 */
export interface StoredDocument {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export interface DocumentStore {
  put(projectId: string, docId: string, doc: StoredDocument): Promise<void>;
  get(projectId: string, docId: string): Promise<StoredDocument | undefined>;
  delete(projectId: string, docId: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}

const keyOf = (projectId: string, docId: string) => `${projectId}/${docId}`;

export class MemoryDocumentStore implements DocumentStore {
  private readonly items = new Map<string, StoredDocument>();

  async put(projectId: string, docId: string, doc: StoredDocument) {
    this.items.set(keyOf(projectId, docId), { ...doc, bytes: doc.bytes.slice(0) });
  }
  async get(projectId: string, docId: string) {
    return this.items.get(keyOf(projectId, docId));
  }
  async delete(projectId: string, docId: string) {
    this.items.delete(keyOf(projectId, docId));
  }
  async deleteProject(projectId: string) {
    for (const key of [...this.items.keys()]) if (key.startsWith(`${projectId}/`)) this.items.delete(key);
  }
}

/** Used when IndexedDB is blocked. Reads find nothing; writes fail so callers can say "original not kept". */
class UnavailableDocumentStore implements DocumentStore {
  async put(): Promise<void> {
    throw new Error("Document storage is not available in this browser.");
  }
  async get() {
    return undefined;
  }
  async delete() {
    /* nothing stored */
  }
  async deleteProject() {
    /* nothing stored */
  }
}

const DB_NAME = "architecter";
const STORE = "documents";

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });

export class IndexedDbDocumentStore implements DocumentStore {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly factory: IDBFactory) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = this.factory.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("Could not open IndexedDB"));
      open.onblocked = () => reject(new Error("IndexedDB is blocked"));
    });
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(STORE, mode).objectStore(STORE);
  }

  async put(projectId: string, docId: string, doc: StoredDocument) {
    await request((await this.store("readwrite")).put(doc, keyOf(projectId, docId)));
  }

  async get(projectId: string, docId: string) {
    return (await request((await this.store("readonly")).get(keyOf(projectId, docId)))) as StoredDocument | undefined;
  }

  async delete(projectId: string, docId: string) {
    await request((await this.store("readwrite")).delete(keyOf(projectId, docId)));
  }

  async deleteProject(projectId: string) {
    const range = IDBKeyRange.bound(`${projectId}/`, `${projectId}/￿`);
    await request((await this.store("readwrite")).delete(range));
  }
}

export function createDocumentStore(): DocumentStore {
  if (typeof indexedDB === "undefined") return new UnavailableDocumentStore();
  return new IndexedDbDocumentStore(indexedDB);
}

/** Copies the original files of a project to another project id (used when duplicating). Returns the ids that were copied. */
export async function copyProjectDocuments(store: DocumentStore, fromId: string, toId: string, docIds: string[]): Promise<string[]> {
  const copied: string[] = [];
  for (const docId of docIds) {
    try {
      const doc = await store.get(fromId, docId);
      if (!doc) continue;
      await store.put(toId, docId, doc);
      copied.push(docId);
    } catch {
      /* A missing original is not fatal: the extracted text is in the project. */
    }
  }
  return copied;
}
