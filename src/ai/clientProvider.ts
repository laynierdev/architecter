import { z } from "zod";
import type { Project } from "@/domain/types";
import { MockAIProvider } from "./mockProvider";
import type { AIProvider } from "./provider";
import { TASKS, type TaskName } from "./tasks";

/** What the UI needs to show about the AI that produced the latest answer. */
export interface AIMode {
  provider: "mock" | "gemini";
  /** False until the first status or answer arrives. */
  known: boolean;
  /** The mock answered although a real model was wanted. */
  fallback: boolean;
  reason?: string;
  model?: string;
}

const MetaSchema = z.object({
  provider: z.enum(["mock", "gemini"]),
  fallback: z.boolean(),
  fallbackReason: z.string().optional(),
  model: z.string().optional(),
});
const StatusSchema = z.object({ provider: z.enum(["mock", "gemini"]), model: z.string().optional() });
const ErrorEnvelope = z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) });

type Output<N extends TaskName> = z.infer<(typeof TASKS)[N]["output"]>;
type Fetch = typeof fetch;

const REQUEST_TIMEOUT_MS = 65_000;

/**
 * The AI provider used by the browser. It never talks to a model directly: requests go to the
 * server API (where the key lives). Every response is validated again here before it can reach
 * application state. If the service cannot be reached at all, the local mock answers and the
 * UI is told so.
 */
export class ApiAIProvider implements AIProvider {
  private mode: AIMode = { provider: "mock", known: false, fallback: false };
  private readonly listeners = new Set<() => void>();
  private readonly localMock = new MockAIProvider();

  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  // External store contract (useSyncExternalStore) -------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): AIMode => this.mode;

  get name(): string {
    return this.mode.provider;
  }
  get isMock(): boolean {
    return this.mode.known && this.mode.provider === "mock";
  }

  private setMode(mode: AIMode) {
    this.mode = mode;
    this.listeners.forEach((l) => l());
  }

  /** Asks the server which provider is active (without secrets). Failures are ignored. */
  async refreshStatus(): Promise<void> {
    try {
      const response = await this.fetchImpl("/api/ai/status", { cache: "no-store" });
      const status = StatusSchema.parse(await response.json());
      this.setMode({ provider: status.provider, model: status.model, known: true, fallback: false });
    } catch {
      /* The mode stays unknown until the first answer. */
    }
  }

  // Calls ---------------------------------------------------------------------

  private useLocal<T>(local: () => Promise<T>, reason: string): Promise<T> {
    this.setMode({ provider: "mock", known: true, fallback: true, reason });
    return local();
  }

  private async call<N extends TaskName>(task: N, body: unknown, local: () => Promise<Output<N>>): Promise<Output<N>> {
    let payload: unknown;
    try {
      const response = await this.fetchImpl(`/api/ai/${task}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      payload = await response.json();
    } catch {
      // Network failure, timeout or a non-JSON platform error page: the service is unavailable.
      return this.useLocal(local, "The AI service could not be reached.");
    }

    const failed = ErrorEnvelope.safeParse(payload);
    if (failed.success) throw new Error(failed.data.error.message);

    const envelope = z.object({ ok: z.literal(true), data: z.unknown(), meta: MetaSchema }).safeParse(payload);
    if (!envelope.success) throw new Error("The AI service returned an unexpected response.");

    const data = TASKS[task].output.safeParse(envelope.data.data);
    if (!data.success) throw new Error("The AI response did not have the expected format and was discarded.");

    const { meta } = envelope.data;
    this.setMode({ provider: meta.provider, known: true, fallback: meta.fallback, reason: meta.fallbackReason, model: meta.model });
    return data.data as Output<N>;
  }

  // The server only needs what matters for the answer: snapshots can be large and are left out.
  private static slim(project: Project): Project {
    return { ...project, snapshots: [] };
  }

  analyzeRequirements(input: { text: string; context?: string }) {
    return this.call("analyze-requirements", input, () => this.localMock.analyzeRequirements(input));
  }
  suggestQuestions(project: Project) {
    return this.call("suggest-questions", { project: ApiAIProvider.slim(project) }, () => this.localMock.suggestQuestions(project));
  }
  generateArchitecture(project: Project) {
    return this.call("generate-architecture", { project: ApiAIProvider.slim(project) }, () => this.localMock.generateArchitecture(project));
  }
  askAdvisor(project: Project, question: string, focusComponentId?: string) {
    return this.call("advise", { project: ApiAIProvider.slim(project), question, focusComponentId }, () => this.localMock.askAdvisor(project, question, focusComponentId));
  }
  explainComponent(project: Project, componentId: string) {
    return this.call("explain", { project: ApiAIProvider.slim(project), componentId }, () => this.localMock.explainComponent(project, componentId));
  }
  analyzeImpact(project: Project, componentId: string) {
    return this.call("analyze-impact", { project: ApiAIProvider.slim(project), componentId }, () => this.localMock.analyzeImpact(project, componentId));
  }
  suggestAdr(project: Project, input: { topic: string; componentId?: string }) {
    return this.call("suggest-adr", { project: ApiAIProvider.slim(project), ...input }, () => this.localMock.suggestAdr(project, input));
  }
  suggestRisks(project: Project) {
    return this.call("suggest-risks", { project: ApiAIProvider.slim(project) }, () => this.localMock.suggestRisks(project));
  }
  suggestAlternatives(project: Project) {
    return this.call("suggest-alternatives", { project: ApiAIProvider.slim(project) }, () => this.localMock.suggestAlternatives(project));
  }
}
