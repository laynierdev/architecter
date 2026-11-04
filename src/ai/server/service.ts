import { AIServiceError, AIUserError, ERROR_MESSAGES } from "../errors";
import { createGeminiClient } from "../llm/geminiClient";
import { GeminiProvider } from "../llm/geminiProvider";
import { classifyError } from "../llm/resilience";
import { MockAIProvider } from "../mockProvider";
import type { AIProvider } from "../provider";
import { wantedProvider, type AIConfig } from "./config";

export interface AIRunMeta {
  /** Who actually produced the answer. */
  provider: "mock" | "gemini";
  /** True when Gemini was wanted but the mock answered instead. */
  fallback: boolean;
  /** A user-safe explanation of why the fallback happened. */
  fallbackReason?: string;
  model?: string;
}

export interface AIStatus {
  /** The provider that will be tried first. */
  provider: "mock" | "gemini";
  configured: boolean;
  model?: string;
  fallbackToMock: boolean;
}

export interface AIServiceDeps {
  gemini?: AIProvider;
  mock?: AIProvider;
}

/**
 * Chooses the provider for each request and applies the fallback policy. This is the single
 * place that decides between Gemini and the mock, so routes and UI never need to.
 */
export class AIService {
  private readonly mock: AIProvider;
  private gemini: AIProvider | undefined;

  constructor(
    private readonly config: AIConfig,
    deps: AIServiceDeps = {},
  ) {
    this.mock = deps.mock ?? new MockAIProvider();
    this.gemini = deps.gemini;
  }

  status(): AIStatus {
    const provider = wantedProvider(this.config);
    return {
      provider,
      configured: provider === "mock" || Boolean(this.config.apiKey) || Boolean(this.gemini),
      model: provider === "gemini" ? this.config.model : undefined,
      fallbackToMock: this.config.fallbackToMock,
    };
  }

  private getGemini(): AIProvider {
    if (this.gemini) return this.gemini;
    if (!this.config.apiKey) throw new AIServiceError("not_configured", "GEMINI_API_KEY is not set on the server.", false);
    this.gemini = new GeminiProvider(createGeminiClient({ apiKey: this.config.apiKey, model: this.config.model }), {
      model: this.config.model,
      timeoutMs: this.config.timeoutMs,
      retry: { maxAttempts: this.config.maxAttempts },
    });
    return this.gemini;
  }

  async execute<T>(call: (provider: AIProvider) => Promise<T>): Promise<{ data: T; meta: AIRunMeta }> {
    if (wantedProvider(this.config) === "mock") {
      return { data: await call(this.mock), meta: { provider: "mock", fallback: false } };
    }

    try {
      const data = await call(this.getGemini());
      return { data, meta: { provider: "gemini", fallback: false, model: this.config.model } };
    } catch (e) {
      const error = classifyError(e);
      // Problems the user can act on (nothing to add, unknown component) are not provider failures.
      if (error instanceof AIUserError) throw error;
      // Only the error category is logged: raw messages can contain request details.
      console.warn(`[ai] gemini request failed (${error.code})`);
      if (!this.config.fallbackToMock) throw error;
      return {
        data: await call(this.mock),
        meta: { provider: "mock", fallback: true, fallbackReason: ERROR_MESSAGES[error.code] },
      };
    }
  }
}
