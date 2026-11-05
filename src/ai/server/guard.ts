import { clientKey, DailyBudget, SlidingWindowLimiter } from "./rateLimit";

export interface GuardConfig {
  /** Gemini requests per minute and per client. Zero disables the per-client limit. */
  perMinute: number;
  /** Gemini requests per UTC day for the whole deployment. Zero means unlimited. */
  dailyBudget: number;
}

export type GuardDecision =
  | { kind: "allow" }
  /** The client sent too many requests: answer with 429. */
  | { kind: "limited"; retryAfterSeconds: number }
  /** Do not call the paid model, but still answer with the free built-in mock. */
  | { kind: "mock"; reason: string };

export interface GuardDeps {
  limiter?: Pick<SlidingWindowLimiter, "check">;
  budget?: Pick<DailyBudget, "tryConsume">;
}

/**
 * Decides whether a request may reach the paid model. Only requests that would call Gemini are
 * counted: the mock costs nothing. If the limiting machinery itself fails, the guard fails SAFE:
 * the request is answered by the mock instead of reaching the paid model unchecked.
 */
export class AIGuard {
  private readonly limiter?: Pick<SlidingWindowLimiter, "check">;
  private readonly budget?: Pick<DailyBudget, "tryConsume">;

  constructor(config: GuardConfig, deps: GuardDeps = {}) {
    this.limiter = deps.limiter ?? (config.perMinute > 0 ? new SlidingWindowLimiter({ limit: config.perMinute, windowMs: 60_000 }) : undefined);
    this.budget = deps.budget ?? (config.dailyBudget > 0 ? new DailyBudget(config.dailyBudget) : undefined);
  }

  check(request: Request, geminiWanted: boolean): GuardDecision {
    if (!geminiWanted) return { kind: "allow" };
    try {
      if (this.limiter) {
        const decision = this.limiter.check(clientKey(request.headers));
        if (!decision.allowed) return { kind: "limited", retryAfterSeconds: decision.retryAfterSeconds };
      }
      if (this.budget && !this.budget.tryConsume()) {
        return { kind: "mock", reason: "This deployment has used up its daily AI budget. The built-in mock answered instead." };
      }
      return { kind: "allow" };
    } catch {
      return { kind: "mock", reason: "AI usage limits could not be checked, so the built-in mock answered instead." };
    }
  }
}
