import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiAIProvider } from "@/ai/clientProvider";
import { AIServiceError, AIUserError } from "@/ai/errors";
import { MockAIProvider } from "@/ai/mockProvider";
import type { AIProvider } from "@/ai/provider";
import { readAIConfig, wantedProvider, type AIConfig } from "@/ai/server/config";
import { handleAiRequest } from "@/ai/server/handler";
import { AIService } from "@/ai/server/service";
import { demoProject } from "@/mock/demoProject";

const config = (overrides: Partial<AIConfig> = {}): AIConfig => ({ mode: "auto", model: "m", timeoutMs: 1000, maxAttempts: 3, fallbackToMock: true, ...overrides });

/** A Gemini stand-in whose every method fails with the given error. */
function failingProvider(error: Error): AIProvider {
  return new Proxy(new MockAIProvider(), {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop !== "name" && prop !== "isMock" && typeof Reflect.get(target, prop) === "function") return () => Promise.reject(error);
      return Reflect.get(target, prop, receiver);
    },
  });
}

describe("configuration", () => {
  it("defaults to auto, and auto uses Gemini only when a key exists", () => {
    expect(wantedProvider(readAIConfig({}))).toBe("mock");
    expect(wantedProvider(readAIConfig({ GEMINI_API_KEY: "k" }))).toBe("gemini");
    expect(wantedProvider(readAIConfig({ AI_PROVIDER: "mock", GEMINI_API_KEY: "k" }))).toBe("mock");
    expect(wantedProvider(readAIConfig({ AI_PROVIDER: "gemini" }))).toBe("gemini");
    expect(readAIConfig({ AI_PROVIDER: "banana" }).mode).toBe("auto");
  });

  it("parses and bounds numeric and boolean settings", () => {
    const c = readAIConfig({ AI_TIMEOUT_MS: "999999", AI_MAX_ATTEMPTS: "99", AI_FALLBACK_TO_MOCK: "false", GEMINI_API_KEY: "  " });
    expect(c).toMatchObject({ timeoutMs: 55_000, maxAttempts: 4, fallbackToMock: false, apiKey: undefined });
    expect(readAIConfig({ AI_TIMEOUT_MS: "abc" }).timeoutMs).toBe(20_000);
    expect(readAIConfig({}).fallbackToMock).toBe(true);
    expect(readAIConfig({}).model).toMatch(/^gemini/);
  });
});

describe("AIService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the mock without flags when configured for mock", async () => {
    const service = new AIService(config({ mode: "mock" }));
    const { meta } = await service.execute((p) => p.suggestRisks(demoProject));
    expect(meta).toEqual({ provider: "mock", fallback: false });
    expect(service.status()).toMatchObject({ provider: "mock", configured: true });
  });

  it("uses Gemini when it works", async () => {
    const service = new AIService(config({ apiKey: "k" }), { gemini: new MockAIProvider() });
    const { meta } = await service.execute((p) => p.suggestRisks(demoProject));
    expect(meta).toMatchObject({ provider: "gemini", fallback: false, model: "m" });
  });

  it("falls back to the mock when Gemini fails, and says why without leaking details", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const secretError = Object.assign(new Error("request failed for key AIzaSECRET"), { status: 503 });
    const service = new AIService(config({ apiKey: "AIzaSECRET" }), { gemini: failingProvider(secretError) });
    const { data, meta } = await service.execute((p) => p.suggestRisks(demoProject));
    expect(data.length).toBeGreaterThan(0);
    expect(meta.provider).toBe("mock");
    expect(meta.fallback).toBe(true);
    expect(meta.fallbackReason).toMatch(/temporarily unavailable/);
    expect(JSON.stringify(meta)).not.toContain("AIzaSECRET");
  });

  it("falls back when the key is missing but Gemini was requested", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new AIService(config({ mode: "gemini" }));
    const { meta } = await service.execute((p) => p.suggestRisks(demoProject));
    expect(meta).toMatchObject({ provider: "mock", fallback: true });
    expect(meta.fallbackReason).toMatch(/not configured/);
    expect(service.status()).toMatchObject({ provider: "gemini", configured: false });
  });

  it("returns the error when fallback is disabled", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new AIService(config({ apiKey: "k", fallbackToMock: false }), { gemini: failingProvider(Object.assign(new Error("x"), { status: 429 })) });
    await expect(service.execute((p) => p.suggestRisks(demoProject))).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("does not hide user-actionable errors behind the mock", async () => {
    const service = new AIService(config({ apiKey: "k" }), { gemini: failingProvider(new AIUserError("Nothing new to add")) });
    await expect(service.execute((p) => p.suggestRisks(demoProject))).rejects.toBeInstanceOf(AIUserError);
  });

  it("never exposes the key in status", () => {
    const status = new AIService(config({ apiKey: "AIzaSECRET" })).status();
    expect(JSON.stringify(status)).not.toContain("AIzaSECRET");
  });
});

describe("HTTP handler", () => {
  const service = new AIService(config({ mode: "mock" }));
  const post = (task: string, body: unknown, raw?: string) =>
    handleAiRequest(task, new Request("http://localhost/api/ai/" + task, { method: "POST", body: raw ?? JSON.stringify(body) }), service);
  const slim = { ...demoProject, snapshots: [] };

  it("returns a validated envelope with metadata", async () => {
    const response = await post("suggest-risks", { project: slim });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.meta).toEqual({ provider: "mock", fallback: false });
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("rejects unknown tasks, malformed JSON and invalid payloads", async () => {
    expect((await post("delete-everything", {})).status).toBe(404);
    expect((await post("__proto__", {})).status).toBe(404);
    expect((await post("advise", null, "{ not json")).status).toBe(400);
    const invalid = await post("advise", { project: slim, question: "" });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("invalid_request");
    expect((await post("suggest-risks", { project: { ...slim, components: "nope" } })).status).toBe(400);
  });

  it("limits input sizes", async () => {
    expect((await post("analyze-requirements", { text: "x".repeat(12_001) })).status).toBe(400);
    expect((await post("analyze-requirements", null, "x".repeat(1_600_000))).status).toBe(413);
  });

  it("maps user-actionable errors to 422 and service errors to proper statuses", async () => {
    const empty = { ...slim, components: [], relationships: [], flows: [], risks: [] };
    const noResult = await post("explain", { project: empty, componentId: "ghost" });
    expect(noResult.status).toBe(422);

    const rateLimited = new AIService(config({ apiKey: "k", fallbackToMock: false }), { gemini: failingProvider(Object.assign(new Error("secret-detail"), { status: 429 })) });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await handleAiRequest("suggest-risks", new Request("http://x", { method: "POST", body: JSON.stringify({ project: slim }) }), rateLimited);
    expect(response.status).toBe(429);
    const text = await response.text();
    expect(text).not.toContain("secret-detail");
    expect(JSON.parse(text).error.code).toBe("rate_limited");
    vi.restoreAllMocks();
  });

  it("answers an unexpected crash with a generic 500", async () => {
    const crashing = new AIService(config({ mode: "mock" }), { mock: failingProvider(new Error("internal path /srv/secret")) });
    const response = await handleAiRequest("suggest-risks", new Request("http://x", { method: "POST", body: JSON.stringify({ project: slim }) }), crashing);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("/srv/secret");
  });

  it("uses the AIServiceError message, never the raw one", () => {
    expect(new AIServiceError("auth", "safe", false).message).toBe("safe");
  });
});

describe("browser client provider", () => {
  const slim = { ...demoProject, snapshots: [] };
  const okEnvelope = (data: unknown, meta: object) => new Response(JSON.stringify({ ok: true, data, meta }));

  it("sends only what the server needs (no snapshots) and records the provider that answered", async () => {
    const fetchMock = vi.fn(async () => okEnvelope([], { provider: "gemini", fallback: false, model: "gemini-x" }));
    const client = new ApiAIProvider(fetchMock as unknown as typeof fetch);
    await client.suggestRisks({ ...demoProject, snapshots: [{ id: "s", label: "L", createdAt: new Date().toISOString(), components: [], relationships: [], flows: [] }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ai/suggest-risks");
    expect(JSON.parse(init.body as string).project.snapshots).toEqual([]);
    expect(JSON.parse(init.body as string).project.documents).toEqual([]);
    expect(client.getSnapshot()).toMatchObject({ provider: "gemini", known: true, fallback: false, model: "gemini-x" });
    expect(client.isMock).toBe(false);
  });

  it("flags fallback answers", async () => {
    const fetchMock = vi.fn(async () => okEnvelope([], { provider: "mock", fallback: true, fallbackReason: "The AI provider took too long to respond." }));
    const client = new ApiAIProvider(fetchMock as unknown as typeof fetch);
    await client.suggestRisks(slim);
    expect(client.getSnapshot()).toMatchObject({ provider: "mock", fallback: true, reason: "The AI provider took too long to respond." });
    expect(client.isMock).toBe(true);
  });

  it("falls back to the local mock, flagged, when the service is unreachable", async () => {
    const client = new ApiAIProvider((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    const risks = await client.suggestRisks(slim);
    expect(risks.length).toBeGreaterThan(0);
    expect(client.getSnapshot()).toMatchObject({ provider: "mock", fallback: true });
    expect(client.getSnapshot().reason).toMatch(/could not be reached/);
  });

  it("falls back when the platform returns a non-JSON error page", async () => {
    const client = new ApiAIProvider((async () => new Response("<html>Bad gateway</html>", { status: 502 })) as unknown as typeof fetch);
    await expect(client.suggestRisks(slim)).resolves.toBeDefined();
    expect(client.getSnapshot().fallback).toBe(true);
  });

  it("surfaces server-side errors instead of hiding them", async () => {
    const client = new ApiAIProvider((async () => new Response(JSON.stringify({ ok: false, error: { code: "rate_limited", message: "The AI provider is rate limiting requests. Try again in a moment." } }), { status: 429 })) as unknown as typeof fetch);
    await expect(client.suggestRisks(slim)).rejects.toThrow(/rate limiting/);
  });

  it("discards data that does not match the schema", async () => {
    const client = new ApiAIProvider((async () => okEnvelope([{ title: 123 }], { provider: "gemini", fallback: false })) as unknown as typeof fetch);
    await expect(client.suggestRisks(slim)).rejects.toThrow(/expected format/);
  });

  it("rejects malformed envelopes", async () => {
    const client = new ApiAIProvider((async () => new Response(JSON.stringify({ hello: "world" }))) as unknown as typeof fetch);
    await expect(client.suggestRisks(slim)).rejects.toThrow(/unexpected response/);
  });

  it("reads the active provider from the status endpoint and notifies subscribers", async () => {
    const client = new ApiAIProvider((async () => new Response(JSON.stringify({ provider: "gemini", model: "gemini-x", configured: true, fallbackToMock: true }))) as unknown as typeof fetch);
    const listener = vi.fn();
    client.subscribe(listener);
    expect(client.isMock).toBe(false);
    await client.refreshStatus();
    expect(client.getSnapshot()).toMatchObject({ provider: "gemini", known: true });
    expect(listener).toHaveBeenCalled();
  });

  it("ignores status failures", async () => {
    const client = new ApiAIProvider((async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    await expect(client.refreshStatus()).resolves.toBeUndefined();
    expect(client.getSnapshot().known).toBe(false);
  });
});
