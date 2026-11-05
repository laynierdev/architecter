import { describe, expect, it, vi } from "vitest";
import { MockAIProvider } from "@/ai/mockProvider";
import type { AIProvider } from "@/ai/provider";
import { readAIConfig, type AIConfig } from "@/ai/server/config";
import { AIGuard } from "@/ai/server/guard";
import { handleAiRequest } from "@/ai/server/handler";
import { clientKey, DailyBudget, SlidingWindowLimiter } from "@/ai/server/rateLimit";
import { AIService } from "@/ai/server/service";
import { demoProject } from "@/mock/demoProject";

const request = (ip = "203.0.113.7", body: unknown = { project: { ...demoProject, snapshots: [] } }) =>
  new Request("http://localhost/api/ai/suggest-risks", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) });

const geminiConfig = (overrides: Partial<AIConfig> = {}): AIConfig => ({
  mode: "gemini", apiKey: "k", model: "m", timeoutMs: 1000, maxAttempts: 1, fallbackToMock: true, rateLimitPerMinute: 10, dailyBudget: 300, ...overrides,
});

describe("sliding window limiter", () => {
  it("allows up to the limit, then blocks with a retry time", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: 60_000, now: () => now });
    expect(limiter.check("a")).toMatchObject({ allowed: true, remaining: 2 });
    now += 10_000;
    limiter.check("a");
    limiter.check("a");
    const blocked = limiter.check("a");
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSeconds).toBe(50);
  });

  it("frees capacity as old requests leave the window", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    limiter.check("a");
    now += 30_000;
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    now += 31_000; // the first request is now 61 s old
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("does not count blocked requests against the caller", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 60_000, now: () => now });
    limiter.check("a");
    for (let i = 0; i < 20; i++) limiter.check("a");
    now += 60_001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("bounds its memory so an attacker cannot exhaust it with many fake clients", () => {
    const limiter = new SlidingWindowLimiter({ limit: 5, windowMs: 60_000, maxKeys: 100 });
    for (let i = 0; i < 10_000; i++) limiter.check(`client-${i}`);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });
});

describe("client identification", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("uses the first address of x-forwarded-for, then x-real-ip", () => {
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientKey(headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("puts anything that does not look like an address in a shared bucket", () => {
    expect(clientKey(headers({}))).toBe("unknown");
    expect(clientKey(headers({ "x-forwarded-for": "<script>alert(1)</script>" }))).toBe("unknown");
    expect(clientKey(headers({ "x-forwarded-for": "a".repeat(500) }))).toBe("unknown");
  });
});

describe("daily budget", () => {
  it("allows the configured number of calls per UTC day and resets the next day", () => {
    let now = Date.parse("2026-11-05T10:00:00Z");
    const budget = new DailyBudget(2, () => now);
    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toEqual([true, true, false]);
    now = Date.parse("2026-11-05T23:59:59Z");
    expect(budget.tryConsume()).toBe(false);
    now = Date.parse("2026-11-06T00:00:01Z");
    expect(budget.tryConsume()).toBe(true);
  });

  it("zero means unlimited", () => {
    const budget = new DailyBudget(0);
    for (let i = 0; i < 1000; i++) expect(budget.tryConsume()).toBe(true);
  });
});

describe("guard decisions", () => {
  it("never limits requests that stay on the free mock", () => {
    const guard = new AIGuard({ perMinute: 1, dailyBudget: 1 });
    for (let i = 0; i < 10; i++) expect(guard.check(request(), false)).toEqual({ kind: "allow" });
  });

  it("limits Gemini requests per client and reports when to retry", () => {
    const guard = new AIGuard({ perMinute: 2, dailyBudget: 0 });
    expect(guard.check(request("1.1.1.1"), true).kind).toBe("allow");
    expect(guard.check(request("1.1.1.1"), true).kind).toBe("allow");
    const third = guard.check(request("1.1.1.1"), true);
    expect(third).toMatchObject({ kind: "limited" });
    expect(guard.check(request("2.2.2.2"), true).kind).toBe("allow");
  });

  it("falls back to the mock when the daily budget is used up", () => {
    const guard = new AIGuard({ perMinute: 0, dailyBudget: 1 });
    expect(guard.check(request(), true).kind).toBe("allow");
    expect(guard.check(request(), true)).toMatchObject({ kind: "mock", reason: expect.stringContaining("daily AI budget") });
  });

  it("fails SAFE: if the limiter breaks, the paid model is not called", () => {
    const broken = { check: () => { throw new Error("limiter storage down"); } };
    const guard = new AIGuard({ perMinute: 5, dailyBudget: 0 }, { limiter: broken });
    expect(guard.check(request(), true)).toMatchObject({ kind: "mock", reason: expect.stringContaining("could not be checked") });
  });

  it("fails SAFE when the budget counter breaks", () => {
    const guard = new AIGuard({ perMinute: 0, dailyBudget: 5 }, { budget: { tryConsume: () => { throw new Error("boom"); } } });
    expect(guard.check(request(), true).kind).toBe("mock");
  });

  it("reads limits from the environment and keeps them bounded", () => {
    expect(readAIConfig({})).toMatchObject({ rateLimitPerMinute: 10, dailyBudget: 300 });
    expect(readAIConfig({ AI_RATE_LIMIT_PER_MINUTE: "0", AI_DAILY_BUDGET: "0" })).toMatchObject({ rateLimitPerMinute: 0, dailyBudget: 0 });
    expect(readAIConfig({ AI_RATE_LIMIT_PER_MINUTE: "999999", AI_DAILY_BUDGET: "-5" })).toMatchObject({ rateLimitPerMinute: 1000, dailyBudget: 0 });
  });
});

describe("HTTP behaviour with the guard", () => {
  /** A provider that records whether the paid model was reached. */
  function recordingProvider() {
    const calls = vi.fn();
    const provider = new Proxy(new MockAIProvider(), {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" && typeof prop === "string" && prop.startsWith("suggest") ? (...args: unknown[]) => (calls(), value.apply(target, args)) : value;
      },
    }) as AIProvider;
    return { provider, calls };
  }

  it("answers 429 with Retry-After when a client is over the limit, without reading the body or calling the model", async () => {
    const { provider, calls } = recordingProvider();
    const service = new AIService(geminiConfig(), { gemini: provider });
    const guard = new AIGuard({ perMinute: 1, dailyBudget: 0 });

    expect((await handleAiRequest("suggest-risks", request("9.9.9.9"), service, guard)).status).toBe(200);
    expect(calls).toHaveBeenCalledTimes(1);

    const limited = await handleAiRequest("suggest-risks", request("9.9.9.9"), service, guard);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await limited.json();
    expect(body.error.code).toBe("too_many_requests");
    expect(body.error.message).toMatch(/Try again in \d+ seconds/);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("serves the mock, flagged, when the daily budget is gone", async () => {
    const { provider, calls } = recordingProvider();
    const service = new AIService(geminiConfig(), { gemini: provider, mock: new MockAIProvider() });
    const guard = new AIGuard({ perMinute: 0, dailyBudget: 1 });

    await handleAiRequest("suggest-risks", request(), service, guard);
    const second = await handleAiRequest("suggest-risks", request(), service, guard);
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.meta).toMatchObject({ provider: "mock", fallback: true });
    expect(body.meta.fallbackReason).toMatch(/daily AI budget/);
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("fails safe end to end when the limiter is broken", async () => {
    const { provider, calls } = recordingProvider();
    const service = new AIService(geminiConfig(), { gemini: provider, mock: new MockAIProvider() });
    const guard = new AIGuard({ perMinute: 5, dailyBudget: 0 }, { limiter: { check: () => { throw new Error("down"); } } });
    const response = await handleAiRequest("suggest-risks", request(), service, guard);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.meta).toMatchObject({ provider: "mock", fallback: true });
    expect(calls).not.toHaveBeenCalled();
  });

  it("does not limit the free mock mode at all", async () => {
    const service = new AIService(geminiConfig({ mode: "mock", apiKey: undefined }));
    const guard = new AIGuard({ perMinute: 1, dailyBudget: 1 });
    for (let i = 0; i < 5; i++) expect((await handleAiRequest("suggest-risks", request(), service, guard)).status).toBe(200);
  });

  it("works without a guard (tests and local use)", async () => {
    const service = new AIService(geminiConfig({ mode: "mock" }));
    expect((await handleAiRequest("suggest-risks", request(), service)).status).toBe(200);
  });

  it("rejects oversized or unknown requests without consuming the limit", async () => {
    const service = new AIService(geminiConfig({ mode: "mock" }));
    const guard = new AIGuard({ perMinute: 1, dailyBudget: 0 });
    expect((await handleAiRequest("nope", request(), service, guard)).status).toBe(404);
  });
});

describe("service forceMock", () => {
  it("never reaches Gemini and says why", async () => {
    const gemini = { name: "gemini", isMock: false } as unknown as AIProvider;
    const service = new AIService(geminiConfig(), { gemini });
    const { meta, data } = await service.execute((p) => p.suggestRisks(demoProject), { forceMock: "because" });
    expect(meta).toEqual({ provider: "mock", fallback: true, fallbackReason: "because" });
    expect(data.length).toBeGreaterThan(0);
  });
});
