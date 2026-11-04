import { ApiAIProvider } from "./clientProvider";

export type { AIProvider } from "./provider";
export { AIResponseError } from "./errors";
export { suggestedQuestions } from "./mockProvider";
export type { AIMode } from "./clientProvider";

/**
 * The AI provider used by the UI. It always goes through the server API: the server decides
 * between Gemini and the mock from environment variables, and keeps the key private.
 */
export function createAIProvider(): ApiAIProvider {
  return new ApiAIProvider();
}
