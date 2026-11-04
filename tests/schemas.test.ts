import { describe, expect, it } from "vitest";
import { createProject, updateProjectInfo, validateProject } from "@/domain/project";
import { ProjectSchema } from "@/domain/schemas";
import { demoProject } from "@/mock/demoProject";

describe("project schema", () => {
  it("accepts the demo project", () => {
    const result = ProjectSchema.safeParse(demoProject);
    expect(result.success).toBe(true);
  });

  it("rejects relationships that point to unknown components", () => {
    const broken = { ...demoProject, relationships: [...demoProject.relationships, { id: "x", source: "ghost", target: "auth", protocol: "HTTP", label: "bad", async: false }] };
    const result = ProjectSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("unknown source");
  });

  it("rejects flows that reference missing relationships and duplicate ids", () => {
    const flows = [{ id: "f", name: "F", description: "", steps: [{ edgeIds: ["nope"], caption: "x" }] }];
    expect(ProjectSchema.safeParse({ ...demoProject, flows }).success).toBe(false);
    const dup = { ...demoProject, components: [...demoProject.components, demoProject.components[0]] };
    expect(ProjectSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects out-of-range scores and invalid enums", () => {
    const qa = [{ id: "q", name: "X", score: 9, note: "" }];
    expect(ProjectSchema.safeParse({ ...demoProject, qualityAttributes: qa }).success).toBe(false);
    const risks = [{ ...demoProject.risks[0], impact: "extreme" }];
    expect(ProjectSchema.safeParse({ ...demoProject, risks }).success).toBe(false);
  });
});

describe("project creation", () => {
  it("creates an empty valid project and ignores blank targets", () => {
    const p = createProject({ name: "  Shop  ", description: "An online shop.", targets: [{ label: "Budget", value: "  " }, { label: "Users", value: "5k" }] });
    expect(p.name).toBe("Shop");
    expect(p.targets).toHaveLength(1);
    expect(p.targets[0]?.provenance).toBe("user");
    expect(p.components).toEqual([]);
  });

  it("rejects too-short names", () => {
    expect(() => createProject({ name: "A", description: "" })).toThrow();
  });

  it("updates info and validates", () => {
    const p = createProject({ name: "Shop", description: "" });
    expect(updateProjectInfo(p, { name: "Store" }).name).toBe("Store");
    expect(() => validateProject({ ...p, name: "" })).toThrow();
  });
});
