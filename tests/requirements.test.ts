import { describe, expect, it } from "vitest";
import { addRequirement, answerQuestion, clearAnswer, mergeAnalysis, removeRequirement, setAssumptionStatus, unansweredQuestions, updateRequirement, upsertTarget } from "@/domain/requirements";
import { createProject } from "@/domain/project";
import { demoProject } from "@/mock/demoProject";

const empty = () => createProject({ name: "Shop", description: "An online shop." });

describe("requirements", () => {
  it("adds user requirements with provenance 'user' and validates text", () => {
    const p = addRequirement(empty(), "functional", { text: " Users can log in ", priority: "must" });
    expect(p.functionalRequirements[0]).toMatchObject({ text: "Users can log in", provenance: "user", priority: "must" });
    expect(() => addRequirement(p, "functional", { text: "  ", priority: "must" })).toThrow();
  });

  it("updates and removes requirements", () => {
    let p = addRequirement(empty(), "nonFunctional", { text: "Fast pages", priority: "should", category: "Performance" });
    const id = p.nonFunctionalRequirements[0]?.id as string;
    p = updateRequirement(p, id, { priority: "must" });
    expect(p.nonFunctionalRequirements[0]?.priority).toBe("must");
    expect(removeRequirement(p, id).nonFunctionalRequirements).toHaveLength(0);
    expect(() => removeRequirement(p, "x")).toThrow(/not found/);
  });

  it("confirms or rejects assumptions without deleting them", () => {
    const p = setAssumptionStatus(demoProject, "as1", "confirmed");
    expect(p.assumptions.find((a) => a.id === "as1")?.status).toBe("confirmed");
    expect(p.assumptions).toHaveLength(demoProject.assumptions.length);
    expect(() => setAssumptionStatus(p, "zzz", "confirmed")).toThrow();
  });

  it("stores and clears answers to open questions", () => {
    let p = answerQuestion(demoProject, "q1", " $2,000 ");
    expect(p.openQuestions.find((q) => q.id === "q1")?.answer).toBe("$2,000");
    expect(unansweredQuestions(p)).toHaveLength(demoProject.openQuestions.length - 1);
    p = clearAnswer(p, "q1");
    expect(unansweredQuestions(p)).toHaveLength(demoProject.openQuestions.length);
    expect(() => answerQuestion(p, "q1", " ")).toThrow();
  });

  it("upserts targets by label", () => {
    let p = upsertTarget(empty(), "Budget", "$1,000");
    p = upsertTarget(p, "budget", "$2,000");
    expect(p.targets).toHaveLength(1);
    expect(p.targets[0]?.value).toBe("$2,000");
  });

  it("merging an analysis never duplicates existing items and marks provenance correctly", () => {
    const analysis = {
      functional: [{ text: "Users can pay online.", priority: "must" as const }],
      nonFunctional: [{ text: "Pages load fast.", priority: "should" as const, category: "Performance" }],
      targets: [{ label: "Users", value: "5k users" }],
      assumptions: [{ text: "Single region.", priority: "should" as const }],
      questions: [{ question: "What is the budget?", why: "Cost." }],
    };
    const once = mergeAnalysis(empty(), analysis);
    const twice = mergeAnalysis(once, analysis);
    expect(twice.functionalRequirements).toHaveLength(1);
    expect(twice.nonFunctionalRequirements).toHaveLength(1);
    expect(twice.targets).toHaveLength(1);
    expect(twice.assumptions).toHaveLength(1);
    expect(twice.openQuestions).toHaveLength(1);
    expect(once.functionalRequirements[0]?.provenance).toBe("user");
    expect(once.assumptions[0]?.status).toBe("proposed");
  });
});
