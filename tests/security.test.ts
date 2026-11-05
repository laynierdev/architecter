import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/config/securityHeaders";

const SRC = path.resolve(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("security headers", () => {
  const asMap = (production: boolean) => Object.fromEntries(securityHeaders(production).map((h) => [h.key, h.value]));

  it("always sends the basic hardening headers", () => {
    for (const production of [true, false]) {
      const h = asMap(production);
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
      expect(h["X-Frame-Options"]).toBe("DENY");
      expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["Permissions-Policy"]).toContain("camera=()");
    }
  });

  it("adds CSP and HSTS only in production (the dev server needs eval)", () => {
    expect(asMap(false)["Content-Security-Policy"]).toBeUndefined();
    expect(asMap(true)["Content-Security-Policy"]).toBe(contentSecurityPolicy());
    expect(asMap(true)["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("restricts the CSP to this origin and forbids framing, plugins and eval", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).not.toContain(" *");
  });
});

describe("source code safety checks", () => {
  const files = sourceFiles(SRC).map((file) => ({ file: path.relative(SRC, file), text: readFileSync(file, "utf8") }));

  it("never renders raw HTML or evaluates strings", () => {
    const banned = [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /\beval\s*\(/, /new Function\s*\(/, /document\.write\s*\(/];
    const offenders = files.flatMap(({ file, text }) => banned.filter((re) => re.test(text)).map((re) => `${file}: ${re}`));
    expect(offenders).toEqual([]);
  });

  it("keeps the Gemini SDK and API key reading out of browser code", () => {
    const clientFiles = files.filter(({ text }) => /^\s*["']use client["']/.test(text));
    const offenders = clientFiles.filter(({ text }) => /@google\/genai|GEMINI_API_KEY|process\.env\.GEMINI/.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("only the server modules read secrets from the environment", () => {
    const readers = files.filter(({ text }) => /process\.env\.(GEMINI|AI_)/.test(text)).map(({ file }) => file.replaceAll("\\", "/"));
    expect(readers.every((f) => f.startsWith("ai/server/") || f.startsWith("app/api/"))).toBe(true);
  });

  it("does not log request bodies, projects or keys", () => {
    const logging = files.flatMap(({ file, text }) => (text.match(/console\.(log|info|debug|warn|error)\([^)]*\)/g) ?? []).map((call) => `${file}: ${call}`));
    // The only logging allowed is the error category and the dev-only redacted diagnostics.
    expect(logging.filter((l) => /apiKey|body|project|prompt/i.test(l) && !l.includes("[redacted]"))).toEqual([]);
  });
});
