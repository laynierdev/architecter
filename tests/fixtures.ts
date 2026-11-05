import JSZip from "jszip";
import type { StorageLike } from "@/repositories/localStorageRepository";

/** In-memory Web Storage stand-in. Set `failWith` to simulate a full or blocked storage. */
export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  failWith: Error | null = null;

  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWith) throw this.failWith;
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

export const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");

const encoder = new TextEncoder();
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
export const textBytes = (text: string): ArrayBuffer => toArrayBuffer(encoder.encode(text));

/** Builds a small but valid PDF (with a correct xref table). Pass an empty text for a PDF without any text. */
export function makePdf(text: string, pages = 1): ArrayBuffer {
  // Real PDFs break text into lines that fit the page; text beyond the page edge is not extracted.
  const lines: string[] = [];
  for (const word of text.split(" ").filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + word.length < 70) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const escape = (s: string) => s.replace(/[()\\]/g, "\\$&");
  const stream = lines.length ? `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${escape(l)}) Tj T*`).join(" ")} ET` : "";
  const kids = Array.from({ length: pages }, (_, i) => `${6 + i} 0 R`).join(" ");
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    `<</Type/Pages/Kids[${kids}]/Count ${pages}>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    "<</Dummy 0>>",
    ...Array.from({ length: pages }, () => "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 3 0 R>>>>>>"),
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (body += `${String(o).padStart(10, "0")} 00000 n \n`));
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF`;
  return textBytes(body);
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Builds a minimal DOCX with one paragraph per entry. `padding` adds a highly compressible file to simulate a zip bomb. */
export async function makeDocx(paragraphs: string[], padding?: { path: string; bytes: number }): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${xmlEscape(p)}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  if (padding) zip.file(padding.path, "0".repeat(padding.bytes));
  return toArrayBuffer(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}
