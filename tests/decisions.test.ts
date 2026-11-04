import { describe, expect, it } from "vitest";
import { allowedStatuses, canTransition, changeAdrStatus, createAdr, nextAdrNumber, removeAdr, supersedeAdr, updateAdr } from "@/domain/adr";
import { CRITERIA, compareAlternatives, DEFAULT_WEIGHTS, rankAlternatives, validateWeights, weightedScore } from "@/domain/comparison";
import { addRisk, addRisksSkippingDuplicates, removeRisk, riskBand, riskScore, sortRisksBySeverity, updateRisk } from "@/domain/risks";
import { demoProject } from "@/mock/demoProject";
import { smallProject } from "./helpers";

const draft = { title: "Use Postgres", status: "proposed" as const, context: "c", problem: "p", decision: "d", alternatives: [], consequences: { positive: [], negative: [] } };

describe("ADRs", () => {
  it("numbers ADRs sequentially and starts as proposed", () => {
    let p = createAdr(smallProject(), draft);
    p = createAdr(p, { ...draft, title: "Second" });
    expect(p.adrs.map((a) => a.number)).toEqual([1, 2]);
    expect(nextAdrNumber(p)).toBe(3);
    expect(p.adrs.every((a) => a.status === "proposed")).toBe(true);
    expect(() => createAdr(p, { ...draft, title: " " })).toThrow();
  });

  it("enforces lifecycle transitions", () => {
    expect(canTransition("proposed", "accepted")).toBe(true);
    expect(canTransition("accepted", "proposed")).toBe(false);
    expect(allowedStatuses("superseded")).toEqual(["superseded"]);
    const p = createAdr(smallProject(), draft);
    const id = p.adrs[0]?.id as string;
    expect(changeAdrStatus(p, id, "accepted").adrs[0]?.status).toBe("accepted");
    expect(() => changeAdrStatus(changeAdrStatus(p, id, "deprecated"), id, "accepted")).toThrow(/cannot move/);
  });

  it("supersedes an accepted ADR and keeps the history", () => {
    let p = createAdr(createAdr(smallProject(), draft), { ...draft, title: "New" });
    const [a, b] = p.adrs.map((x) => x.id) as [string, string];
    p = changeAdrStatus(p, a, "accepted");
    p = supersedeAdr(p, a, b);
    expect(p.adrs.find((x) => x.id === a)).toMatchObject({ status: "superseded", supersededBy: b });
    expect(removeAdr(p, b).adrs.find((x) => x.id === a)?.supersededBy).toBeUndefined();
    expect(() => supersedeAdr(p, a, a)).toThrow();
  });

  it("edits fields but not number or status", () => {
    const p = createAdr(smallProject(), draft);
    const id = p.adrs[0]?.id as string;
    const next = updateAdr(p, id, { decision: "new decision" });
    expect(next.adrs[0]).toMatchObject({ decision: "new decision", number: 1, status: "proposed" });
  });
});

describe("risks", () => {
  it("computes scores and bands", () => {
    expect(riskScore({ likelihood: "high", impact: "high" })).toBe(9);
    expect(riskScore({ likelihood: "low", impact: "low" })).toBe(1);
    expect(riskBand(9)).toBe("high");
    expect(riskBand(4)).toBe("medium");
    expect(riskBand(2)).toBe("low");
  });

  it("sorts by severity", () => {
    const sorted = sortRisksBySeverity(demoProject.risks);
    const scores = sorted.map(riskScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("adds, updates and removes risks; validates component references", () => {
    const p = smallProject();
    const base = { title: "R", description: "", likelihood: "low" as const, impact: "low" as const, mitigation: "", relatedComponentIds: ["db"] };
    let next = addRisk(p, base);
    const id = next.risks[0]?.id as string;
    expect(() => addRisk(p, { ...base, relatedComponentIds: ["ghost"] })).toThrow(/Unknown component/);
    next = updateRisk(next, id, { impact: "high" });
    expect(next.risks[0]?.impact).toBe("high");
    expect(removeRisk(next, id).risks).toHaveLength(0);
  });

  it("skips duplicate risk titles when adding suggestions", () => {
    const base = { title: "Same", description: "", likelihood: "low" as const, impact: "low" as const, mitigation: "", relatedComponentIds: [] };
    const { project, added } = addRisksSkippingDuplicates(smallProject(), [base, { ...base, title: "same " }, { ...base, title: "Other" }]);
    expect(added).toBe(2);
    expect(project.risks).toHaveLength(2);
  });
});

describe("comparison", () => {
  const [monolith, services, hybrid] = demoProject.alternatives as [typeof demoProject.alternatives[number], typeof demoProject.alternatives[number], typeof demoProject.alternatives[number]];

  it("computes rows, winners and weighted totals", () => {
    const result = compareAlternatives(monolith, services);
    expect(result.rows).toHaveLength(CRITERIA.length);
    expect(result.rows.find((r) => r.criterion === "complexity")?.winner).toBe("a");
    expect(result.rows.find((r) => r.criterion === "fit")?.winner).toBe("tie");
    expect(result.winner).toBe("a");
  });

  it("weights change the outcome", () => {
    const scalabilityOnly = { complexity: 0, scalability: 1, reliability: 0, operations: 0, cost: 0, fit: 0 };
    expect(compareAlternatives(monolith, services, scalabilityOnly).winner).toBe("b");
    expect(weightedScore(monolith, scalabilityOnly)).toBe(3);
  });

  it("validates weights", () => {
    expect(() => validateWeights({ ...DEFAULT_WEIGHTS, cost: -1 })).toThrow();
    expect(() => validateWeights({ complexity: 0, scalability: 0, reliability: 0, operations: 0, cost: 0, fit: 0 })).toThrow();
  });

  it("ranks alternatives", () => {
    const ranked = rankAlternatives([monolith, services, hybrid]);
    expect(ranked[2]?.alternative.id).toBe("alt-services");
    // Ties are broken alphabetically so the order is deterministic.
    expect(ranked[0]?.score).toBe(ranked[1]?.score);
    expect(ranked.map((r) => r.score)).toEqual([...ranked.map((r) => r.score)].sort((a, b) => b - a));
  });
});
