import { describe, expect, it } from "vitest";
import { createAIProvider, suggestedQuestions } from "@/ai";
import { AIResponseError, validated } from "@/ai/validate";
import { approveProposal, applyProposal } from "@/domain/proposals";
import { mergeAnalysis } from "@/domain/requirements";
import { createProject, validateProject } from "@/domain/project";
import { RequirementsAnalysisSchema, RiskDraftSchema, AdrDraftSchema } from "@/domain/schemas";
import { demoProject } from "@/mock/demoProject";

const ai = createAIProvider();
const BRIEF = `Customers can order food and pay online. Restaurants must be able to manage their menu.
The checkout must be highly available, with 99.9% uptime. We expect 100,000 monthly users and about 50 orders per second at peak.
Couriers should share their live location for real-time tracking. Customers should get push notifications on mobile. Pages should load fast.`;

describe("mock provider", () => {
  it("is clearly identified as a mock", () => {
    expect(ai.isMock).toBe(true);
    expect(ai.name).toBe("mock");
  });

  it("extracts requirements, targets and assumptions from text, deterministically", async () => {
    const a = await ai.analyzeRequirements({ text: BRIEF });
    const b = await ai.analyzeRequirements({ text: BRIEF });
    expect(a).toEqual(b);
    expect(RequirementsAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.functional.length).toBeGreaterThan(2);
    expect(a.nonFunctional.some((r) => r.category === "Availability")).toBe(true);
    expect(a.targets.map((t) => t.value.toLowerCase()).join(" ")).toContain("100,000 monthly users");
    expect(a.assumptions.some((x) => /payment provider/i.test(x.text))).toBe(true);
  });

  it("never invents a budget or traffic: it asks instead", async () => {
    const a = await ai.analyzeRequirements({ text: "Users can sign up and write notes in the app." });
    expect(a.targets).toEqual([]);
    const asked = a.questions.map((q) => q.question).join(" ");
    expect(asked).toMatch(/budget/i);
    expect(asked).toMatch(/users or requests/i);
  });

  it("does not ask for information the project already has", async () => {
    const text = "Users can sign up and write notes in the app.";
    const without = await ai.analyzeRequirements({ text });
    const withContext = await ai.analyzeRequirements({ text, context: "Monthly budget: $1,500\nExpected users: 5,000" });
    expect(without.questions.some((q) => /budget/i.test(q.question))).toBe(true);
    expect(withContext.questions.some((q) => /budget/i.test(q.question))).toBe(false);
    expect(withContext.questions.some((q) => /users or requests/i.test(q.question))).toBe(false);
  });

  it("assigns sensible priorities", async () => {
    const a = await ai.analyzeRequirements({ text: "Customers can order food. Admins must approve refunds. Users could export data." });
    expect(a.functional.map((f) => f.priority)).toEqual(["should", "must", "could"]);
  });

  it("handles empty input gracefully", async () => {
    const a = await ai.analyzeRequirements({ text: "" });
    expect(a.functional).toEqual([]);
    expect(a.questions.length).toBeGreaterThan(0);
  });

  it("suggests only questions that are not already open", async () => {
    const q = await ai.suggestQuestions(demoProject);
    const open = new Set(demoProject.openQuestions.map((x) => x.question));
    expect(q.every((x) => !open.has(x.question))).toBe(true);
  });

  it("generates a valid, applicable architecture proposal that waits for approval", async () => {
    let p = createProject({ name: "Delivery", description: BRIEF });
    p = mergeAnalysis(p, await ai.analyzeRequirements({ text: BRIEF }));
    const proposal = await ai.generateArchitecture(p);
    expect(proposal.status).toBe("proposed");
    expect(proposal.source).toBe("mock");
    expect(() => applyProposal(p, proposal)).toThrow();
    const applied = applyProposal(p, approveProposal(proposal));
    expect(() => validateProject(applied)).not.toThrow();
    const names = applied.components.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Web App", "Application Backend", "Primary Database", "Payment Provider", "Realtime Gateway", "Mobile App"]));
    expect(applied.components.find((c) => c.name === "Payment Provider")?.provenance).toBe("assumption");
    expect(applied.snapshots).toHaveLength(1);
  });

  it("does not propose components that already exist", async () => {
    const p = createProject({ name: "Delivery", description: "Users can read posts." });
    const first = await ai.generateArchitecture(p);
    const applied = applyProposal(p, approveProposal(first));
    await expect(ai.generateArchitecture(applied)).rejects.toThrow(/already contains/);
  });

  it("advisor answers from project data and references what it used", async () => {
    const fail = await ai.askAdvisor(demoProject, "What happens if the Payment Service fails?");
    expect(fail.answer).toContain("Provider downtime");
    expect(fail.references).toContain("Payment Service");
    const why = await ai.askAdvisor(demoProject, "Why was RabbitMQ selected for the Message Broker?");
    expect(why.answer).toContain("managed RabbitMQ");
    const scale = await ai.askAdvisor(demoProject, "How would the system handle ten times the traffic?");
    expect(scale.answer).toMatch(/bottleneck/i);
    const mono = await ai.askAdvisor(demoProject, "Could this be a modular monolith?");
    expect(mono.references).toContain("Modular monolith");
    expect(fail.answer).toContain("Mock advisor");
  });

  it("advisor is honest when there is no architecture or the question is unknown", async () => {
    const empty = createProject({ name: "Empty", description: "" });
    expect((await ai.askAdvisor(empty, "Why?")).answer).toMatch(/no architecture yet/i);
    expect((await ai.askAdvisor(demoProject, "What is the meaning of life?")).answer).toMatch(/I can explain/);
  });

  it("builds suggested questions from the project", () => {
    expect(suggestedQuestions(createProject({ name: "Empty", description: "" }))).toEqual([]);
    const q = suggestedQuestions(demoProject);
    expect(q.length).toBeGreaterThanOrEqual(4);
    expect(q.some((x) => x.includes("API Gateway") || x.includes("fails"))).toBe(true);
  });

  it("suggests valid risks and ADRs", async () => {
    const risks = await ai.suggestRisks(demoProject);
    expect(risks.length).toBeGreaterThan(0);
    expect(RiskDraftSchema.array().safeParse(risks).success).toBe(true);
    const adr = await ai.suggestAdr(demoProject, { topic: "x", componentId: "cache" });
    expect(AdrDraftSchema.safeParse(adr).success).toBe(true);
    expect(adr.title).toContain("Redis");
    const topicOnly = await ai.suggestAdr(demoProject, { topic: "Pick a region" });
    expect(topicOnly.title).toBe("Pick a region");
  });

  it("impact analysis matches the domain logic", async () => {
    const report = await ai.analyzeImpact(demoProject, "orders-db");
    expect(report.dependents).toContain("orders");
  });
});

describe("response validation", () => {
  it("rejects malformed data with readable issues", () => {
    expect(() => validated(RequirementsAnalysisSchema, { functional: "nope" }, "analysis")).toThrow(AIResponseError);
    try {
      validated(RequirementsAnalysisSchema, { functional: "nope" }, "analysis");
    } catch (e) {
      expect(e).toBeInstanceOf(AIResponseError);
      expect((e as AIResponseError).issues.length).toBeGreaterThan(0);
      expect((e as Error).message).toContain("invalid analysis");
    }
  });
});
