import { readAIConfig } from "./config";
import { AIService } from "./service";

let instance: AIService | undefined;

/** Lazily creates the server-wide AI service from environment variables. */
export function getAIService(): AIService {
  instance ??= new AIService(readAIConfig(process.env));
  return instance;
}

/** Test hook: replaces (or clears) the shared instance. */
export function setAIServiceForTests(service: AIService | undefined): void {
  instance = service;
}
