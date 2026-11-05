import { checkFile, DOCUMENT_LIMITS, limitText, normalizeText, unwrapLines, type DocumentKind } from "@/domain/documents";
import { MAX_DOCUMENT_TEXT_CHARS } from "@/domain/schemas";

/** A problem with the file itself, written for the person who uploaded it. */
export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface ExtractionInput {
  name: string;
  /** Size reported by the browser, checked before the bytes are touched. */
  size: number;
  bytes: ArrayBuffer;
}

export interface ExtractionResult {
  kind: DocumentKind;
  /** Normalised plain text, cut at the storage limit when needed. */
  text: string;
  truncated: boolean;
  /** Characters in the full extracted text, before any cut. */
  totalChars: number;
  warnings: string[];
  sha256: string;
}

const PARSE_TIMEOUT_MS = 30_000;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DocumentError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => timer && clearTimeout(timer));
}

function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentError("The file is not valid UTF-8 text. Save it as UTF-8 and try again.");
  }
}

async function extractPdf(bytes: ArrayBuffer, warnings: string[]): Promise<string> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let pdf;
  try {
    // A copy: pdf.js takes ownership of the buffer it is given.
    pdf = await getDocumentProxy(new Uint8Array(bytes.slice(0)));
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new DocumentError("This PDF is password protected. Remove the password and try again.");
    throw new DocumentError("This PDF could not be read. It may be damaged.");
  }
  if (pdf.numPages > DOCUMENT_LIMITS.pdfPages) {
    throw new DocumentError(`This PDF has ${pdf.numPages} pages. The limit is ${DOCUMENT_LIMITS.pdfPages}. Split it and upload the relevant part.`);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  if (!text.trim()) {
    throw new DocumentError("No text was found in this PDF. It is probably a scan or images; scanned documents are not supported.");
  }
  if (pdf.numPages > 1) warnings.push(`Extracted from ${pdf.numPages} pages. Tables and columns may appear out of order.`);
  return text;
}

/** Rejects zip bombs before the document is unpacked for real. */
async function assertSafeDocx(bytes: ArrayBuffer): Promise<void> {
  const { default: JSZip } = await import("jszip");
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocumentError("This DOCX could not be read. It may be damaged.");
  }
  let total = 0;
  zip.forEach((_path, entry) => {
    // JSZip exposes the declared uncompressed size only through its internal data record.
    total += (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  });
  if (total > DOCUMENT_LIMITS.docxUncompressedBytes) throw new DocumentError("This DOCX expands to an unreasonable size and was rejected for safety.");
  if (!zip.file("word/document.xml")) throw new DocumentError("This file is not a valid DOCX document (no document content found).");
}

async function extractDocx(bytes: ArrayBuffer, warnings: string[]): Promise<string> {
  await assertSafeDocx(bytes);
  const mammoth = await import("mammoth");
  try {
    // mammoth's browser build reads `arrayBuffer` while its Node build reads `buffer`: provide both.
    const result = await mammoth.extractRawText({ arrayBuffer: bytes, buffer: bytes } as { arrayBuffer: ArrayBuffer });
    if (result.messages.length > 0) warnings.push("Some formatting could not be interpreted; the text itself was extracted.");
    return result.value;
  } catch {
    throw new DocumentError("This DOCX could not be read. It may be damaged.");
  }
}

/**
 * Validates a file and extracts plain text from it, entirely in the browser: the document is never
 * uploaded anywhere. The result is a draft for the user to review, never merged automatically.
 */
export async function extractDocument(input: ExtractionInput): Promise<ExtractionResult> {
  const check = checkFile(input.name, input.size, new Uint8Array(input.bytes, 0, Math.min(8, input.bytes.byteLength)));
  if (!check.ok) throw new DocumentError(check.error);
  // The declared size can lie; check what we actually received too.
  if (input.bytes.byteLength !== input.size) throw new DocumentError("The file changed while it was being read. Try again.");

  const warnings: string[] = [];
  const sha256 = await sha256Hex(input.bytes);

  let raw: string;
  switch (check.kind) {
    case "txt":
    case "md":
      raw = decodeText(input.bytes);
      break;
    case "pdf":
      raw = await withTimeout(extractPdf(input.bytes, warnings), PARSE_TIMEOUT_MS, "Reading this PDF took too long and was cancelled.");
      break;
    case "docx":
      raw = await withTimeout(extractDocx(input.bytes, warnings), PARSE_TIMEOUT_MS, "Reading this DOCX took too long and was cancelled.");
      break;
  }

  // PDF text comes with line breaks that only mark where the page ended: rejoin those sentences.
  const normalized = normalizeText(check.kind === "pdf" ? unwrapLines(normalizeText(raw)) : raw);
  if (!normalized) throw new DocumentError("The file contains no readable text.");
  const { text, truncated } = limitText(normalized);
  if (truncated) {
    warnings.push(`The document has ${normalized.length.toLocaleString("en-US")} characters. Only the first ${MAX_DOCUMENT_TEXT_CHARS.toLocaleString("en-US")} are kept.`);
  }
  return { kind: check.kind, text, truncated, totalChars: normalized.length, warnings, sha256 };
}
