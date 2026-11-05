import type { ZodType } from "zod";

/** Raised when a provider returns data that does not match the expected schema. */
export class AIResponseError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "AIResponseError";
  }
}

/**
 * A request that cannot produce a useful result for reasons the user can act on
 * (for example "nothing new to suggest"). Never retried and never replaced by a fallback.
 */
export class AIUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUserError";
  }
}

export type AIErrorCode = "not_configured" | "timeout" | "rate_limited" | "quota_exceeded" | "unavailable" | "auth" | "bad_request" | "invalid_response" | "unknown";

/** A failure of the AI service itself, already classified. Messages never contain secrets. */
export class AIServiceError extends Error {
  constructor(
    readonly code: AIErrorCode,
    message: string,
    readonly retryable: boolean,
    /** The original error, kept for server-side diagnostics only. It is never sent to clients. */
    cause?: unknown,
    /** How long the provider asked us to wait before retrying, when it said so. */
    readonly retryAfterMs?: number,
  ) {
    super(message, { cause });
    this.name = "AIServiceError";
  }
}

/** Short, user-safe explanations. Raw provider messages are never shown (they can contain request details). */
export const ERROR_MESSAGES: Record<AIErrorCode, string> = {
  not_configured: "The AI provider is not configured.",
  timeout: "The AI provider took too long to respond.",
  rate_limited: "The AI provider is rate limiting requests. Try again in a moment.",
  quota_exceeded: "The AI provider quota is used up (for example the daily free-tier limit). Try again later, use another model, or check your plan.",
  unavailable: "The AI provider is temporarily unavailable.",
  auth: "The AI provider rejected the credentials.",
  bad_request: "The AI provider rejected the request.",
  invalid_response: "The AI returned a response that could not be used.",
  unknown: "The AI request failed unexpectedly.",
};

/** Validates provider output. Anything that fails never reaches application state. */
export function validated<T>(schema: ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "value"}: ${i.message}`);
  throw new AIResponseError(`The AI returned an invalid ${what}.`, issues);
}
