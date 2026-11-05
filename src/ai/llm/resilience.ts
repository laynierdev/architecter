import { AIResponseError, AIServiceError, AIUserError, ERROR_MESSAGES, type AIErrorCode } from "../errors";

/** Turns anything thrown by the SDK, the network or our own validation into a classified error. */
export function classifyError(error: unknown): AIServiceError | AIUserError {
  if (error instanceof AIUserError || error instanceof AIServiceError) return error;
  if (error instanceof AIResponseError) return new AIServiceError("invalid_response", ERROR_MESSAGES.invalid_response, true, error);

  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
  const name = (error as { name?: string })?.name ?? "";
  const code = (error as { code?: string })?.code ?? "";

  const make = (c: AIErrorCode, retryable: boolean, retryAfterMs?: number) => new AIServiceError(c, ERROR_MESSAGES[c], retryable, error, retryAfterMs);
  if (status === 429) {
    const message = (error as Error).message ?? "";
    const wait = parseRetryDelayMs(message);
    // A daily limit, or a wait longer than we are willing to hold a request open, cannot be fixed by
    // retrying. Retrying would only burn more quota, so fail fast and let the fallback answer.
    if (/per day|daily/i.test(message) || (wait !== undefined && wait > MAX_HONORED_RETRY_MS)) return make("quota_exceeded", false);
    return make("rate_limited", true, wait);
  }
  if (status !== undefined && status >= 500) return make("unavailable", true);
  if (status === 401 || status === 403) return make("auth", false);
  // Google answers 400 (not 401) for an invalid API key. The raw message is only inspected, never shown.
  if (status === 400 && /api key|api_key/i.test((error as Error).message ?? "")) return make("auth", false);
  if (status !== undefined && status >= 400) return make("bad_request", false);
  if (name === "AbortError" || name === "TimeoutError" || code === "ETIMEDOUT") return make("timeout", true);
  if (error instanceof TypeError || ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET"].includes(code)) return make("unavailable", true);
  return make("unknown", false);
}

/** Longest "retry in Ns" hint we will wait for. Beyond this the request fails fast. */
export const MAX_HONORED_RETRY_MS = 35_000;

/** Reads hints such as "Please retry in 29.4s", "1m5s" or "10h38m33s" from a provider message. */
export function parseRetryDelayMs(message: string): number | undefined {
  const match = message.match(/retry in\s+((?:\d+(?:\.\d+)?\s*[hms]\s*)+)/i);
  if (!match?.[1]) return undefined;
  const unitMs: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1_000 };
  let ms = 0;
  for (const [, value, unit] of match[1].matchAll(/(\d+(?:\.\d+)?)\s*([hms])/gi)) {
    ms += Number(value) * (unitMs[(unit ?? "s").toLowerCase()] ?? 0);
  }
  return Math.round(ms);
}

export interface RetryOptions {
  /** Total attempts, including the first one. Retries are always bounded. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Overall time budget: no new attempt starts if it cannot finish inside it. */
  budgetMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export const DEFAULT_RETRY: RetryOptions = { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 4000, budgetMs: 50_000 };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying only transient failures with exponential backoff and jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = DEFAULT_RETRY): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, budgetMs, sleep = defaultSleep, random = Math.random, now = Date.now } = options;
  const started = now();
  let lastError: AIServiceError | AIUserError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      const error = classifyError(e);
      lastError = error;
      if (error instanceof AIUserError || !error.retryable || attempt === maxAttempts) throw error;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + Math.floor(random() * 150);
      // When the provider says how long to wait, honour it (plus a small margin) instead of guessing.
      const delay = error.retryAfterMs !== undefined ? Math.max(backoff, error.retryAfterMs + 500) : backoff;
      if (now() - started + delay > budgetMs) throw error;
      await sleep(delay);
    }
  }
  throw lastError ?? new AIServiceError("unknown", ERROR_MESSAGES.unknown, false);
}

/** Runs `fn` with an AbortSignal that fires after `ms`. The call rejects with a timeout error. */
export async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AIServiceError("timeout", ERROR_MESSAGES.timeout, true));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Models sometimes wrap JSON in markdown fences. Extracts and parses it, or throws a response error. */
export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new AIResponseError("The AI returned text that is not valid JSON.");
  }
}
