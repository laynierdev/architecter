import type { ZodType } from "zod";

/** Raised when a provider returns data that does not match the expected schema. */
export class AIResponseError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "AIResponseError";
  }
}

/** Validates provider output. Anything that fails never reaches application state. */
export function validated<T>(schema: ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "value"}: ${i.message}`);
  throw new AIResponseError(`The AI returned an invalid ${what}.`, issues);
}
