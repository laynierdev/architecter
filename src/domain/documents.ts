import { DomainError, touch } from "./common";
import { MAX_DOCUMENTS_PER_PROJECT, MAX_DOCUMENT_TEXT_CHARS } from "./schemas";
import type { Project, SourceDocument } from "./types";

export type DocumentKind = SourceDocument["kind"];

/** Limits applied before a file is read or parsed. */
export const DOCUMENT_LIMITS = {
  textBytes: 1_048_576,
  binaryBytes: 5_242_880,
  pdfPages: 150,
  /** Upper bound for what a .docx may expand to when unzipped (guards against zip bombs). */
  docxUncompressedBytes: 50_000_000,
} as const;

const EXTENSIONS: Record<string, DocumentKind> = { txt: "txt", md: "md", markdown: "md", pdf: "pdf", docx: "docx" };

export const ACCEPTED_EXTENSIONS = ".txt,.md,.markdown,.pdf,.docx";

export function detectKind(fileName: string): DocumentKind | undefined {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXTENSIONS[fileName.slice(dot + 1).toLowerCase()];
}

export type FileCheck = { ok: true; kind: DocumentKind } | { ok: false; error: string };

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/**
 * Cheap check on name and size alone. It runs BEFORE the file is read into memory, so a huge or
 * unsupported file is refused without loading it.
 */
export function precheckFile(name: string, size: number): FileCheck {
  const kind = detectKind(name);
  if (!kind) return { ok: false, error: "Unsupported file type. Use .txt, .md, .pdf or .docx." };
  if (size === 0) return { ok: false, error: "The file is empty." };
  const limit = kind === "txt" || kind === "md" ? DOCUMENT_LIMITS.textBytes : DOCUMENT_LIMITS.binaryBytes;
  if (size > limit) return { ok: false, error: `The file is too large (${formatBytes(size)}). The limit for ${kind.toUpperCase()} files is ${formatBytes(limit)}.` };
  return { ok: true, kind };
}

/**
 * Full validation from name, size and first bytes, before any parsing. The extension is not
 * trusted on its own: binary formats must also carry the right signature.
 */
export function checkFile(name: string, size: number, header: Uint8Array): FileCheck {
  const pre = precheckFile(name, size);
  if (!pre.ok) return pre;
  const { kind } = pre;
  if (kind === "pdf" && !startsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: false, error: "This file is not a valid PDF (wrong file signature)." };
  if (kind === "docx" && !startsWith(header, [0x50, 0x4b, 0x03, 0x04])) return { ok: false, error: "This file is not a valid DOCX document (wrong file signature)." };
  if ((kind === "txt" || kind === "md") && header.includes(0)) return { ok: false, error: "This looks like a binary file, not text." };
  return { ok: true, kind };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cleans extracted text: unified line endings, no control characters, no runs of blank lines.
 * The result is always rendered as plain text, never as HTML.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    // Control characters except tab and newline (also removes NUL and escape sequences).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Joins lines that were only broken to fit a PDF page, so sentences stay in one piece. A line break
 * is removed only when the line does not end a sentence AND the next line continues in lower case,
 * so headings, bullets and list items keep their own lines.
 */
export function unwrapLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    // Only a lower-case start is treated as a continuation: digits and brackets usually begin list items.
    const startsContinuation = /^[a-z]/.test(line.trimStart());
    const prevOpen = prev !== undefined && prev.trim() !== "" && !/[.!?:;]$/.test(prev.trimEnd());
    if (prev !== undefined && line.trim() !== "" && prevOpen && startsContinuation) out[out.length - 1] = `${prev.trimEnd()} ${line.trimStart()}`;
    else out.push(line);
  }
  return out.join("\n");
}

export function limitText(text: string, max: number = MAX_DOCUMENT_TEXT_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  // Do not cut a surrogate pair in half.
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return { text: text.slice(0, end), truncated: true };
}

// Project operations --------------------------------------------------------

export function addDocument(project: Project, doc: SourceDocument): Project {
  if (project.documents.length >= MAX_DOCUMENTS_PER_PROJECT) {
    throw new DomainError(`A project can have at most ${MAX_DOCUMENTS_PER_PROJECT} documents. Remove one first.`);
  }
  if (project.documents.some((d) => d.sha256 === doc.sha256)) {
    throw new DomainError("This document is already attached to the project.");
  }
  return touch({ ...project, documents: [...project.documents, doc] });
}

export function removeDocument(project: Project, id: string): Project {
  if (!project.documents.some((d) => d.id === id)) throw new DomainError(`Document "${id}" not found`);
  return touch({ ...project, documents: project.documents.filter((d) => d.id !== id) });
}
