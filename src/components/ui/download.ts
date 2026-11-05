/** Triggers a browser download for generated text content. */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

export const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

/** Triggers a browser download for binary content (for example an original uploaded file). */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
