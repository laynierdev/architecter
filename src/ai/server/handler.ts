import { DomainError } from "@/domain/common";
import { AIServiceError, AIUserError, type AIErrorCode } from "../errors";
import { classifyError } from "../llm/resilience";
import { isTaskName, MAX_BODY_BYTES, TASKS } from "../tasks";
import type { AIGuard } from "./guard";
import type { AIService } from "./service";

const STATUS_BY_CODE: Record<AIErrorCode, number> = {
  rate_limited: 429,
  quota_exceeded: 429,
  timeout: 504,
  unavailable: 503,
  not_configured: 503,
  auth: 502,
  bad_request: 502,
  invalid_response: 502,
  unknown: 500,
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

/**
 * HTTP handler for POST /api/ai/:task. Kept free of Next.js types so it can be tested directly.
 * Responses never include stack traces, raw provider messages or configuration values.
 */
export async function handleAiRequest(taskName: string, request: Request, service: AIService, guard?: AIGuard): Promise<Response> {
  if (!isTaskName(taskName)) return failure(404, "unknown_task", "Unknown AI task.");
  const task = TASKS[taskName];

  // Usage limits run before the body is read, so a flood is rejected cheaply.
  const decision = guard?.check(request, service.status().provider === "gemini") ?? { kind: "allow" as const };
  if (decision.kind === "limited") {
    return Response.json(
      { ok: false, error: { code: "too_many_requests", message: `Too many AI requests. Try again in ${decision.retryAfterSeconds} seconds.` } },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return failure(413, "too_large", "The request is too large.");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return failure(413, "too_large", "The request is too large.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return failure(400, "invalid_json", "The request body must be valid JSON.");
  }

  const parsed = task.input.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return failure(400, "invalid_request", `Invalid request${issue ? `: ${issue.path.join(".") || "body"} ${issue.message}` : "."}`);
  }

  try {
    // The task registry is heterogeneous, so the input type is erased here; each task validated its own input above.
    const { data, meta } = await service.execute((provider) => (task.run as (p: typeof provider, i: unknown) => Promise<unknown>)(provider, parsed.data), decision.kind === "mock" ? { forceMock: decision.reason } : {});
    return json({ ok: true, data, meta });
  } catch (e) {
    if (e instanceof AIUserError || e instanceof DomainError) return failure(422, "no_result", e.message);
    const error = classifyError(e);
    if (error instanceof AIServiceError) return failure(STATUS_BY_CODE[error.code], error.code, error.message);
    return failure(500, "unknown", "The AI request failed unexpectedly.");
  }
}
