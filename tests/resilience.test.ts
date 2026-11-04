import { describe, expect, it, vi } from "vitest";
import { AIResponseError, AIServiceError, AIUserError } from "@/ai/errors";
import { classifyError, DEFAULT_RETRY, parseJsonLoose, withRetry, withTimeout } from "@/ai/llm/resilience";

const fastRetry = { ...DEFAULT_RETRY, sleep: async () => undefined, random: () => 0 };
const http = (status: number) => Object.assign(new Error("boom with secret-key-123"), { status });

describe("classifyError", () => {
  it("classifies HTTP statuses", () => {
    expect(classifyError(http(429))).toMatchObject({ code: "rate_limited", retryable: true });
    expect(classifyError(http(503))).toMatchObject({ code: "unavailable", retryable: true });
    expect(classifyError(http(500))).toMatchObject({ code: "unavailable", retryable: true });
    expect(classifyError(http(401))).toMatchObject({ code: "auth", retryable: false });
    expect(classifyError(http(403))).toMatchObject({ code: "auth", retryable: false });
    expect(classifyError(http(400))).toMatchObject({ code: "bad_request", retryable: false });
  });

  it("treats Google's 400 for an invalid API key as an auth problem", () => {
    const invalidKey = Object.assign(new Error('{"error":{"message":"API key not valid. Please pass a valid API key."}}'), { status: 400 });
    expect(classifyError(invalidKey)).toMatchObject({ code: "auth", retryable: false });
    expect(classifyError(invalidKey).message).not.toMatch(/API key not valid/);
  });

  it("classifies network failures, aborts and malformed output", () => {
    expect(classifyError(new TypeError("fetch failed"))).toMatchObject({ code: "unavailable", retryable: true });
    expect(classifyError(Object.assign(new Error("x"), { name: "AbortError" }))).toMatchObject({ code: "timeout", retryable: true });
    expect(classifyError(new AIResponseError("bad json"))).toMatchObject({ code: "invalid_response", retryable: true });
    expect(classifyError(new Error("???"))).toMatchObject({ code: "unknown", retryable: false });
  });

  it("never leaks the raw provider message", () => {
    expect(classifyError(http(500)).message).not.toContain("secret-key-123");
  });

  it("keeps user errors untouched", () => {
    const e = new AIUserError("Nothing to add");
    expect(classifyError(e)).toBe(e);
  });
});

describe("withRetry", () => {
  it("retries transient failures and then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(http(503)).mockRejectedValueOnce(http(429)).mockResolvedValue("ok");
    await expect(withRetry(fn, fastRetry)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("is bounded: gives up after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(http(503));
    await expect(withRetry(fn, { ...fastRetry, maxAttempts: 3 })).rejects.toMatchObject({ code: "unavailable" });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent errors", async () => {
    const fn = vi.fn().mockRejectedValue(http(401));
    await expect(withRetry(fn, fastRetry)).rejects.toMatchObject({ code: "auth" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry user errors", async () => {
    const fn = vi.fn().mockRejectedValue(new AIUserError("nope"));
    await expect(withRetry(fn, fastRetry)).rejects.toBeInstanceOf(AIUserError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(http(503));
    await withRetry(fn, { ...DEFAULT_RETRY, maxAttempts: 4, baseDelayMs: 100, random: () => 0, sleep: async (ms) => void delays.push(ms) }).catch(() => undefined);
    expect(delays).toEqual([100, 200, 400]);
  });

  it("stops retrying when the time budget is exhausted", async () => {
    let clock = 0;
    const fn = vi.fn().mockRejectedValue(http(503));
    await expect(
      withRetry(fn, { ...fastRetry, maxAttempts: 4, budgetMs: 1000, baseDelayMs: 600, now: () => clock, sleep: async (ms) => void (clock += ms) }),
    ).rejects.toBeInstanceOf(AIServiceError);
    expect(fn.mock.calls.length).toBeLessThan(4);
  });
});

describe("withTimeout", () => {
  it("rejects with a timeout error and aborts the signal", async () => {
    let aborted = false;
    const slow = (signal: AbortSignal) =>
      new Promise<string>((resolve) => {
        signal.addEventListener("abort", () => (aborted = true));
        setTimeout(() => resolve("late"), 200);
      });
    await expect(withTimeout(slow, 20)).rejects.toMatchObject({ code: "timeout" });
    expect(aborted).toBe(true);
  });

  it("returns the value when fast enough", async () => {
    await expect(withTimeout(async () => "fast", 500)).resolves.toBe("fast");
  });
});

describe("parseJsonLoose", () => {
  it("parses plain JSON and fenced JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("throws a response error for non-JSON", () => {
    expect(() => parseJsonLoose("Sure! Here is your answer")).toThrow(AIResponseError);
  });
});
