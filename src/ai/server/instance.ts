import { readAIConfig } from "./config";
import { AIGuard } from "./guard";
import { AIService } from "./service";

let instance: AIService | undefined;
let guard: AIGuard | undefined;

/** Lazily creates the server-wide AI service from environment variables. */
export function getAIService(): AIService {
  instance ??= new AIService(readAIConfig(process.env));
  return instance;
}

/** Lazily creates the usage guard from the same environment variables. */
export function getAIGuard(): AIGuard {
  const config = readAIConfig(process.env);
  guard ??= new AIGuard({ perMinute: config.rateLimitPerMinute, dailyBudget: config.dailyBudget });
  return guard;
}

/** Test hook: replaces (or clears) the shared instance. */
export function setAIServiceForTests(service: AIService | undefined, testGuard?: AIGuard): void {
  instance = service;
  guard = testGuard;
}
