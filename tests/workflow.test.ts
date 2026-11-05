import { describe, expect, it } from "vitest";
import { ApiAIProvider } from "@/ai/clientProvider";
import { AIGuard } from "@/ai/server/guard";
import { handleAiRequest } from "@/ai/server/handler";
import { AIService } from "@/ai/server/service";
import { createAdr } from "@/domain/adr";
import { analyzeImpact, findIssues } from "@/domain/architecture";
import { exportBackupJson, exportProjectJson, toMarkdown, toMermaid } from "@/domain/exchange";
import { parseImportFile, resolveImport } from "@/domain/importer";
import { createProject, duplicateProject, validateProject } from "@/domain/project";
import { applyProposal, approveProposal } from "@/domain/proposals";
import { mergeAnalysis } from "@/domain/requirements";
import { addRisksSkippingDuplicates } from "@/domain/risks";
import { addAlternative } from "@/domain/quality";
import { compareAlternatives } from "@/domain/comparison";
import { restoreSnapshot } from "@/domain/snapshots";
import { LocalStorageProjectRepository } from "@/repositories/localStorageRepository";
import { createHistory, push, undo } from "@/state/history";
import { MemoryStorage } from "./fixtures";

/**
 * The whole product flow with no test doubles between the layers: the browser provider talks to
 * the real API handler (mock AI mode), whose results go through the domain logic into the
 * repository and out again as backups.
 */
const service = new AIService({ mode: "mock", model: "m", timeoutMs: 1000, maxAttempts: 1, fallbackToMock: true, rateLimitPerMinute: 10, dailyBudget: 300 });
const guard = new AIGuard({ perMinute: 10, dailyBudget: 300 });
const ai = new ApiAIProvider(async (input, init) => {
  const url = String(input);
  if (url.endsWith("/api/ai/status")) return Response.json(service.status());
  return handleAiRequest(url.replace("/api/ai/", ""), new Request(`http://localhost${url}`, init), service, guard);
});

const BRIEF = [
  "Members can search the catalog and borrow books online.",
  "Librarians must manage the inventory.",
  "The system should send email reminders before due dates.",
  "The checkout must be highly available, with 99.9% uptime.",
  "We expect 3,000 members and about 20 loans per minute at peak.",
].join(" ");

describe("end-to-end product workflow", () => {
  it("goes from a description to a documented, persisted and restorable architecture", async () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageProjectRepository(storage);
    let history = createHistory(createProject({ name: "Library Loans", description: BRIEF, targets: [{ label: "Monthly budget", value: "$800" }, { label: "Latency target", value: "" }] }));

    // 1. Requirements: analyze, review, accept. Known targets are kept; blank ones are never invented.
    const analysis = await ai.analyzeRequirements({ text: BRIEF, context: "Monthly budget: $800" });
    expect(analysis.functional.length).toBeGreaterThan(1);
    expect(analysis.questions.some((q) => /budget/i.test(q.question))).toBe(false);
    history = push(history, mergeAnalysis(history.present, analysis));
    expect(history.present.targets.map((t) => t.label)).toContain("Monthly budget");
    expect(history.present.targets.some((t) => t.label === "Latency target")).toBe(false);
    expect(history.present.functionalRequirements.every((r) => r.provenance === "user")).toBe(true);

    // 2. Architecture: the AI only proposes; nothing changes until the proposal is approved and applied.
    const proposal = await ai.generateArchitecture(history.present);
    expect(proposal.status).toBe("proposed");
    expect(history.present.components).toHaveLength(0);
    expect(() => applyProposal(history.present, proposal)).toThrow(/approved/);
    history = push(history, applyProposal(history.present, approveProposal(proposal)));
    expect(history.present.components.length).toBeGreaterThan(3);
    expect(history.present.snapshots).toHaveLength(1);
    expect(findIssues(history.present).filter((i) => i.severity === "warning")).toEqual([]);

    // 3. Understanding: impact, explanation, advice
    const backend = history.present.components.find((c) => c.name === "Application Backend");
    expect(backend).toBeDefined();
    const impact = await ai.analyzeImpact(history.present, backend?.id ?? "");
    expect(impact.dependents.length).toBeGreaterThan(0);
    expect(impact).toMatchObject({ componentId: backend?.id, summary: analyzeImpact(history.present, backend?.id ?? "").summary });
    expect((await ai.explainComponent(history.present, backend?.id ?? "")).references).toContain("Application Backend");
    expect((await ai.askAdvisor(history.present, "What happens if the Application Backend fails?")).answer).toContain("Structural impact");

    // 4. Risks, decisions and alternatives
    const risks = await ai.suggestRisks(history.present);
    const withRisks = addRisksSkippingDuplicates(history.present, risks);
    expect(withRisks.added).toBeGreaterThan(0);
    expect(addRisksSkippingDuplicates(withRisks.project, risks).added).toBe(0);
    history = push(history, withRisks.project);

    const adr = await ai.suggestAdr(history.present, { topic: "Primary store", componentId: history.present.components.find((c) => c.kind === "database")?.id });
    history = push(history, createAdr(history.present, adr));
    expect(history.present.adrs[0]).toMatchObject({ number: 1, status: "proposed" });

    for (const alt of await ai.suggestAlternatives(history.present)) history = push(history, addAlternative(history.present, alt));
    const [a, b] = history.present.alternatives;
    expect(compareAlternatives(a!, b!).rows).toHaveLength(6);

    // 5. Undo is reversible: going back restores the previous state exactly.
    const before = history.present;
    const undone = undo(push(history, { ...before, name: "Typo" }));
    expect(undone.present).toBe(before);

    // 6. Persistence across "sessions"
    const project = validateProject(history.present);
    repo.save(project);
    const reopened = new LocalStorageProjectRepository(storage);
    expect(reopened.get(project.id)).toEqual(project);

    // 7. Documentation is generated from the real project data
    const markdown = toMarkdown(project);
    const mermaid = toMermaid(project);
    for (const c of project.components) {
      expect(markdown).toContain(`#### ${c.name}`);
      expect(mermaid).toContain(c.name);
    }
    expect(markdown).toContain("ADR-001");
    expect(markdown).toContain("Monthly budget: $800");

    // 8. Backups restore everything, including into another browser profile
    const single = parseImportFile(exportProjectJson(project));
    expect(single.issues).toEqual([]);
    expect(single.projects[0]).toEqual(project);

    const otherBrowser = new LocalStorageProjectRepository(new MemoryStorage(), { seed: [] });
    const restored = resolveImport(otherBrowser.list(), parseImportFile(exportBackupJson([project])).projects, () => "keep-both");
    restored.save.forEach((p) => otherBrowser.save(p));
    expect(otherBrowser.list()).toEqual([project]);

    // 9. Snapshots let the user return to an earlier architecture
    const emptied = { ...project, components: [], relationships: [], flows: [] };
    expect(restoreSnapshot(emptied, project.snapshots[0]?.id ?? "").components).toHaveLength(0);

    // 10. Duplicates are independent
    const copy = duplicateProject(project, [project.name]);
    repo.save(copy);
    expect(repo.list().map((p) => p.name).sort()).toEqual(["Copy of Library Loans", "Library Loans"]);
    repo.delete(copy.id);
    expect(reopened.get(project.id)).toBeDefined();
  });

  it("reports the provider that answered, so the UI can label mock answers", async () => {
    await ai.suggestRisks({ ...validateProject(createProject({ name: "Empty", description: "" })) }).catch(() => undefined);
    expect(ai.getSnapshot()).toMatchObject({ provider: "mock", known: true, fallback: false });
    await ai.refreshStatus();
    expect(ai.isMock).toBe(true);
  });

  it("surfaces user-actionable problems as readable errors instead of crashing", async () => {
    const empty = validateProject(createProject({ name: "Empty", description: "" }));
    await expect(ai.explainComponent(empty, "ghost")).rejects.toThrow(/does not exist/);
    const first = await ai.generateArchitecture(createProject({ name: "App", description: "Users can read posts." }));
    const applied = applyProposal(createProject({ name: "App", description: "Users can read posts." }), approveProposal(first));
    await expect(ai.generateArchitecture(applied)).rejects.toThrow(/already contains/);
  });
});
