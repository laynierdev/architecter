export interface LimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LimiterOptions {
  /** Requests allowed per key inside the window. */
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys, so an attacker cannot grow memory without limit. */
  maxKeys?: number;
  now?: () => number;
}

/**
 * Sliding-window limiter kept in memory. No external service is needed, which keeps the project
 * simple; the trade-off is that each server instance counts on its own (see the README).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(private readonly options: LimiterOptions) {
    this.maxKeys = options.maxKeys ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  /** Records a request for `key` if it is allowed. */
  check(key: string): LimitDecision {
    const now = this.now();
    const cutoff = now - this.options.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (recent.length >= this.options.limit) {
      const oldest = recent[0] ?? now;
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.options.windowMs - now) / 1000)) };
    }

    recent.push(now);
    // Re-inserting moves the key to the end, so the oldest-inserted key is the least recently used.
    this.hits.delete(key);
    this.hits.set(key, recent);
    this.enforceKeyBound(cutoff);
    return { allowed: true, remaining: this.options.limit - recent.length, retryAfterSeconds: 0 };
  }

  private enforceKeyBound(cutoff: number) {
    if (this.hits.size <= this.maxKeys) return;
    for (const [key, times] of this.hits) {
      if ((times[times.length - 1] ?? 0) <= cutoff) this.hits.delete(key);
    }
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

/**
 * Identifies the caller from the proxy headers set by the hosting platform (Vercel overwrites
 * x-forwarded-for, so clients cannot choose their own). Anything that does not look like an IP
 * address shares one "unknown" bucket, which is the safer default.
 */
export function clientKey(headers: Headers): string {
  const candidate = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(candidate) ? candidate : "unknown";
}

/** A global cap on model calls per UTC day, as a hard stop on cost. Zero means unlimited. */
export class DailyBudget {
  private day = "";
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes one unit from today's budget. Returns false when it is used up. */
  tryConsume(): boolean {
    if (this.limit <= 0) return true;
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }
}
