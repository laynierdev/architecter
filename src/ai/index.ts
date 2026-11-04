import { MockAIProvider } from "./mockProvider";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";
export { AIResponseError } from "./validate";
export { suggestedQuestions } from "./mockProvider";

/**
 * Provider selection. Stage 3 adds the Gemini provider (server-side only) chosen through
 * configuration; until then the deterministic mock is always used.
 */
export function createAIProvider(): AIProvider {
  return new MockAIProvider();
}
