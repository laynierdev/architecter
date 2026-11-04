import { describe, expect, it } from "vitest";
import { addAlternative, addQualityAttribute, removeAlternative, removeQualityAttribute, STANDARD_ATTRIBUTES, unassessedAttributes, updateAlternative, updateQualityAttribute } from "@/domain/quality";
import { validateProject } from "@/domain/project";
import { demoProject } from "@/mock/demoProject";
import { smallProject } from "./helpers";

const alt = (name: string, isCurrent = false) => ({
  name, summary: "", pros: [], cons: [], costEstimate: "", costAssumptions: "", fitVerdict: "", isCurrent,
  ratings: { complexity: 3, scalability: 3, reliability: 3, operations: 3, cost: 3, fit: 3 },
});

describe("quality attributes", () => {
  it("adds, updates and removes attributes and rejects duplicates", () => {
    let p = addQualityAttribute(smallProject(), { name: "Security", score: 4, note: "ok" });
    expect(() => addQualityAttribute(p, { name: " security ", score: 2, note: "" })).toThrow(/already assessed/);
    const id = p.qualityAttributes[0]?.id as string;
    p = updateQualityAttribute(p, id, { score: 2 });
    expect(p.qualityAttributes[0]?.score).toBe(2);
    expect(removeQualityAttribute(p, id).qualityAttributes).toHaveLength(0);
    expect(() => validateProject(updateQualityAttribute(p, id, { score: 9 }))).toThrow();
  });

  it("lists attributes that are still unassessed", () => {
    expect(unassessedAttributes(smallProject())).toHaveLength(STANDARD_ATTRIBUTES.length);
    expect(unassessedAttributes(demoProject)).toEqual([]);
  });
});

describe("alternatives", () => {
  it("keeps at most one current alternative", () => {
    let p = addAlternative(smallProject(), alt("A", true));
    p = addAlternative(p, alt("B", true));
    expect(p.alternatives.filter((a) => a.isCurrent).map((a) => a.name)).toEqual(["B"]);
    const aId = p.alternatives.find((a) => a.name === "A")?.id as string;
    p = updateAlternative(p, aId, { isCurrent: true });
    expect(p.alternatives.filter((a) => a.isCurrent).map((a) => a.name)).toEqual(["A"]);
    expect(p.alternatives).toHaveLength(2);
  });

  it("validates names and removes alternatives", () => {
    const p = addAlternative(smallProject(), alt("A"));
    expect(() => addAlternative(p, alt(" "))).toThrow();
    expect(() => updateAlternative(p, "nope", {})).toThrow(/not found/);
    expect(removeAlternative(p, p.alternatives[0]?.id as string).alternatives).toHaveLength(0);
  });
});
