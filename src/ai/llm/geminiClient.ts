import { GoogleGenAI } from "@google/genai";
import { AIResponseError } from "../errors";
import type { JsonModelClient } from "./geminiProvider";

/**
 * Adapter between our provider and the @google/genai SDK. Server-side only: it receives the API
 * key from configuration and never exposes it. Keep this file free of logging.
 */
export function createGeminiClient({ apiKey, model }: { apiKey: string; model: string }): JsonModelClient {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generateJson({ system, prompt, jsonSchema, signal }) {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: 0.4,
          abortSignal: signal,
        },
      });
      const text = response.text;
      // An empty text usually means the response was blocked or truncated.
      if (!text) throw new AIResponseError("The model returned an empty response.");
      return text;
    },
  };
}
