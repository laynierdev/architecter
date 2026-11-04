import { createProject } from "@/domain/project";
import { addComponent, addRelationship, type ComponentInput } from "@/domain/architecture";
import type { Project } from "@/domain/types";

export const component = (name: string, kind: ComponentInput["kind"] = "service", extra: Partial<ComponentInput> = {}): ComponentInput => ({
  name,
  kind,
  layer: "Core",
  technology: "",
  description: "",
  responsibilities: [],
  rationale: "",
  failureMode: "",
  scaling: "",
  ...extra,
});

/** web -> api -> db, api -> cache */
export function smallProject(): Project {
  let p = createProject({ name: "Test project", description: "A test project for unit tests." });
  p = addComponent(p, component("Web", "client"), "web");
  p = addComponent(p, component("API", "service"), "api");
  p = addComponent(p, component("DB", "database"), "db");
  p = addComponent(p, component("Cache", "cache"), "cache");
  p = addRelationship(p, { source: "web", target: "api", protocol: "HTTPS", label: "calls", async: false }, "r1");
  p = addRelationship(p, { source: "api", target: "db", protocol: "SQL", label: "reads", async: false }, "r2");
  p = addRelationship(p, { source: "api", target: "cache", protocol: "Redis", label: "caches", async: false }, "r3");
  return p;
}
