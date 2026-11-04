export type AIMode = "mock" | "gemini" | "auto";

export interface AIConfig {
  mode: AIMode;
  /** Server-only secret. Never serialized, logged or sent to the browser. */
  apiKey?: string;
  model: string;
  /** Timeout of a single model call. */
  timeoutMs: number;
  /** Total attempts for transient failures, including the first. */
  maxAttempts: number;
  /** When the model fails, answer with the mock provider (clearly flagged) instead of an error. */
  fallbackToMock: boolean;
}

type Env = Record<string, string | undefined>;

const clampInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Reads AI configuration from environment variables. Pure: pass `process.env` or a test object. */
export function readAIConfig(env: Env): AIConfig {
  const rawMode = (env.AI_PROVIDER ?? "auto").trim().toLowerCase();
  const mode: AIMode = rawMode === "mock" || rawMode === "gemini" ? rawMode : "auto";
  return {
    mode,
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: clampInt(env.AI_TIMEOUT_MS, 20_000, 1_000, 55_000),
    maxAttempts: clampInt(env.AI_MAX_ATTEMPTS, 3, 1, 4),
    fallbackToMock: (env.AI_FALLBACK_TO_MOCK ?? "true").trim().toLowerCase() !== "false",
  };
}

/** Which provider is wanted. `auto` uses Gemini only when a key is present. */
export function wantedProvider(config: AIConfig): "mock" | "gemini" {
  if (config.mode === "mock") return "mock";
  if (config.mode === "gemini") return "gemini";
  return config.apiKey ? "gemini" : "mock";
}
