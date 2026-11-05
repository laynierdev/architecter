/**
 * HTTP security headers for every response.
 *
 * The Content-Security-Policy is applied in production only: the development server needs eval and
 * WebSockets for hot reload. `'unsafe-inline'` is required because Next.js injects small inline
 * bootstrap scripts and React sets inline styles; every other source is restricted to this origin.
 * Documents are processed in the browser (no network), the only API is same-origin, and fonts are
 * self-hosted by next/font, so no third-party origin is ever contacted.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets pdf.js use WebAssembly decoders; it does not allow evaluating strings as code.
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export interface HeaderEntry {
  key: string;
  value: string;
}

export function securityHeaders(production: boolean): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (production) {
    headers.push(
      { key: "Content-Security-Policy", value: contentSecurityPolicy() },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    );
  }
  return headers;
}
