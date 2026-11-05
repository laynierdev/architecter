import { describe, expect, it } from "vitest";
import { addDocument, checkFile, detectKind, DOCUMENT_LIMITS, limitText, normalizeText, precheckFile, removeDocument, unwrapLines } from "@/domain/documents";
import { MAX_DOCUMENTS_PER_PROJECT, MAX_DOCUMENT_TEXT_CHARS } from "@/domain/schemas";
import type { SourceDocument } from "@/domain/types";
import { DocumentError, extractDocument } from "@/services/documentExtraction";
import { makeDocx, makePdf, textBytes } from "./fixtures";
import { smallProject } from "./helpers";

const header = (bytes: ArrayBuffer) => new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
const input = (name: string, bytes: ArrayBuffer, size = bytes.byteLength) => ({ name, size, bytes });
const doc = (n: number, extra: Partial<SourceDocument> = {}): SourceDocument => ({
  id: `d${n}`, name: `file${n}.txt`, kind: "txt", size: 5, sha256: String(n).padStart(64, "0"), addedAt: "2026-01-01T00:00:00.000Z", extractedText: "hello", truncated: false, originalStored: true, ...extra,
});

describe("file validation (before any parsing)", () => {
  it("detects supported types by extension, case-insensitively", () => {
    expect(detectKind("Spec.PDF")).toBe("pdf");
    expect(detectKind("notes.markdown")).toBe("md");
    expect(detectKind("a.b.docx")).toBe("docx");
    expect(detectKind("readme")).toBeUndefined();
    expect(detectKind("virus.exe")).toBeUndefined();
    expect(detectKind("old.doc")).toBeUndefined();
  });

  it("rejects unsupported types, empty files and oversized files", () => {
    expect(checkFile("a.exe", 10, new Uint8Array(8))).toMatchObject({ ok: false, error: expect.stringContaining("Unsupported") });
    expect(checkFile("a.txt", 0, new Uint8Array(0))).toMatchObject({ ok: false, error: expect.stringContaining("empty") });
    expect(checkFile("a.txt", DOCUMENT_LIMITS.textBytes + 1, new Uint8Array(8))).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
    expect(checkFile("a.pdf", DOCUMENT_LIMITS.binaryBytes + 1, new Uint8Array(8))).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
  });

  it("does not trust the extension: binary formats need the right signature", () => {
    expect(checkFile("fake.pdf", 100, textBytes("MZ\u0090 not a pdf") as unknown as Uint8Array)).toMatchObject({ ok: false });
    expect(checkFile("fake.pdf", 100, header(textBytes("%PDF-1.7")))).toEqual({ ok: true, kind: "pdf" });
    expect(checkFile("fake.docx", 100, header(textBytes("hello world")))).toMatchObject({ ok: false });
    expect(checkFile("ok.docx", 100, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toEqual({ ok: true, kind: "docx" });
  });

  it("rejects binary content disguised as text", () => {
    expect(checkFile("data.txt", 100, new Uint8Array([72, 105, 0, 1, 2]))).toMatchObject({ ok: false, error: expect.stringContaining("binary") });
  });
});

describe("pre-check before reading a file into memory", () => {
  it("refuses wrong types, empty and oversized files by name and size alone", () => {
    expect(precheckFile("a.exe", 10)).toMatchObject({ ok: false });
    expect(precheckFile("a.pdf", 0)).toMatchObject({ ok: false });
    expect(precheckFile("a.pdf", DOCUMENT_LIMITS.binaryBytes + 1)).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
    expect(precheckFile("a.txt", 5_000_000)).toMatchObject({ ok: false });
  });

  it("lets acceptable files through (signatures are checked after reading)", () => {
    expect(precheckFile("a.pdf", 1000)).toEqual({ ok: true, kind: "pdf" });
    expect(precheckFile("a.docx", 1000)).toEqual({ ok: true, kind: "docx" });
    expect(precheckFile("a.md", 1000)).toEqual({ ok: true, kind: "md" });
  });
});

describe("text normalisation", () => {
  it("unifies line endings, strips control characters and collapses blank runs", () => {
    expect(normalizeText("﻿a\r\nb\r\r\n\n\n\n\nc\u0000\u001b[31m  \nd")).toBe("a\nb\n\nc[31m\nd");
    expect(normalizeText("  \n\n  hello  \n\n")).toBe("hello");
    expect(normalizeText("tab\tkept")).toBe("tab\tkept");
  });

  it("limits text without cutting a surrogate pair", () => {
    expect(limitText("abc", 10)).toEqual({ text: "abc", truncated: false });
    const cut = limitText("ab😀cd", 3);
    expect(cut.truncated).toBe(true);
    expect(cut.text).toBe("ab");
    expect(limitText("x".repeat(100), 10).text).toHaveLength(10);
  });
});

describe("rejoining wrapped lines", () => {
  it("joins lines broken only to fit the page", () => {
    const wrapped = ["Customers can order pizza and pay by card. The", "checkout must be available 99.9% of the", "time. We expect 20,000 users."].join("\n");
    expect(unwrapLines(wrapped)).toBe("Customers can order pizza and pay by card. The checkout must be available 99.9% of the time. We expect 20,000 users.");
  });

  it("keeps headings, bullets and sentence ends on their own lines", () => {
    const text = ["Goals", "Users can sign in.", "Users can pay.", "- first item", "- second item", "Non-functional", "1. Fast pages", "2. Secure data"].join("\n");
    expect(unwrapLines(text)).toBe(text);
  });

  it("keeps paragraph breaks", () => {
    const text = ["First paragraph ends here.", "", "second paragraph starts lower"].join("\n");
    expect(unwrapLines(text)).toBe(text);
  });
});

describe("attaching documents to a project", () => {
  it("adds and removes documents", () => {
    const p = addDocument(smallProject(), doc(1));
    expect(p.documents).toHaveLength(1);
    expect(removeDocument(p, "d1").documents).toHaveLength(0);
    expect(() => removeDocument(p, "zzz")).toThrow(/not found/);
  });

  it("refuses the same file twice and enforces the document limit", () => {
    const p = addDocument(smallProject(), doc(1));
    expect(() => addDocument(p, doc(2, { sha256: doc(1).sha256 }))).toThrow(/already attached/);
    let full = smallProject();
    for (let i = 0; i < MAX_DOCUMENTS_PER_PROJECT; i++) full = addDocument(full, doc(i + 10));
    expect(() => addDocument(full, doc(99))).toThrow(/at most/);
  });
});

describe("text extraction", () => {
  it("reads TXT and Markdown, keeping the original content", async () => {
    const r = await extractDocument(input("req.md", textBytes("# Goals\r\n\r\nUsers can sign in.\r\n")));
    expect(r).toMatchObject({ kind: "md", truncated: false, text: "# Goals\n\nUsers can sign in." });
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    const same = await extractDocument(input("copy.txt", textBytes("# Goals\r\n\r\nUsers can sign in.\r\n")));
    expect(same.sha256).toBe(r.sha256);
  });

  it("handles non-ASCII text", async () => {
    const r = await extractDocument(input("es.txt", textBytes("Los usuarios pueden iniciar sesión. 日本語 😀")));
    expect(r.text).toContain("sesión");
    expect(r.text).toContain("😀");
  });

  it("rejects text that is not UTF-8 with an actionable message", async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer as ArrayBuffer; // "café" in Latin-1
    await expect(extractDocument(input("old.txt", latin1))).rejects.toThrow(/UTF-8/);
  });

  it("rejects files with no readable text", async () => {
    await expect(extractDocument(input("blank.txt", textBytes("   \n\n  ")))).rejects.toThrow(/no readable text/);
  });

  it("cuts very long documents at the limit and says so", async () => {
    const big = "word ".repeat(MAX_DOCUMENT_TEXT_CHARS);
    const r = await extractDocument(input("long.txt", textBytes(big)));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_TEXT_CHARS);
    expect(r.totalChars).toBeGreaterThan(MAX_DOCUMENT_TEXT_CHARS);
    expect(r.warnings.join(" ")).toMatch(/Only the first/);
  });

  it("rejects a file whose bytes do not match the declared size", async () => {
    await expect(extractDocument(input("a.txt", textBytes("hello"), 999))).rejects.toThrow(/changed while/);
  });

  it("reports validation errors as DocumentError", async () => {
    await expect(extractDocument(input("malware.exe", textBytes("MZ")))).rejects.toBeInstanceOf(DocumentError);
    await expect(extractDocument(input("fake.pdf", textBytes("this is not a pdf at all")))).rejects.toThrow(/not a valid PDF/);
  });

  describe("PDF", () => {
    it("extracts text from a PDF", async () => {
      const r = await extractDocument(input("spec.pdf", makePdf("Customers can order food online")));
      expect(r.kind).toBe("pdf");
      expect(r.text).toContain("Customers can order food online");
    });

    it("extracts a whole multi-line PDF and rejoins its wrapped sentences", async () => {
      const sentence = "Customers can order pizza online and pay by card. The checkout must be available 99.9% of the time. We expect 20,000 monthly users.";
      const r = await extractDocument(input("wrapped.pdf", makePdf(sentence)));
      expect(r.text).toBe(sentence);
    });

    it("explains that scanned PDFs are not supported", async () => {
      await expect(extractDocument(input("scan.pdf", makePdf("")))).rejects.toThrow(/scan|images/);
    });

    it("rejects PDFs with too many pages", async () => {
      await expect(extractDocument(input("huge.pdf", makePdf("x", DOCUMENT_LIMITS.pdfPages + 1)))).rejects.toThrow(/pages/);
    });

    it("reports damaged PDFs without crashing", async () => {
      const damaged = textBytes("%PDF-1.4\n1 0 obj\n<<garbage\n%%EOF");
      await expect(extractDocument(input("broken.pdf", damaged))).rejects.toBeInstanceOf(DocumentError);
    });
  });

  describe("DOCX", () => {
    it("extracts paragraphs from a DOCX", async () => {
      const r = await extractDocument(input("req.docx", await makeDocx(["Users can sign in.", "Checkout must be available 99.9% of the time & fast <b>"])));
      expect(r.kind).toBe("docx");
      expect(r.text).toContain("Users can sign in.");
      expect(r.text).toContain("99.9% of the time & fast <b>");
    });

    it("reports damaged DOCX files", async () => {
      const notZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]).buffer as ArrayBuffer;
      await expect(extractDocument(input("broken.docx", notZip))).rejects.toThrow(/could not be read/);
    });

    it("rejects a zip that is not a Word document", async () => {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("hello.txt", "hi");
      const bytes = (await zip.generateAsync({ type: "uint8array" })).slice().buffer as ArrayBuffer;
      await expect(extractDocument(input("other.docx", bytes))).rejects.toThrow(/no document content/);
    });

    it("rejects zip bombs before unpacking them", async () => {
      const bomb = await makeDocx(["x"], { path: "word/padding.bin", bytes: DOCUMENT_LIMITS.docxUncompressedBytes + 5_000_000 });
      expect(bomb.byteLength).toBeLessThan(DOCUMENT_LIMITS.binaryBytes);
      await expect(extractDocument(input("bomb.docx", bomb))).rejects.toThrow(/unreasonable size/);
    }, 30_000);
  });
});
