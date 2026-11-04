import { normalize, nowIso, uniqueId } from "@/domain/common";
import { ChangeProposalSchema } from "@/domain/schemas";
import type { AdrDraft, AlternativeDraft, ChangeOperation, ChangeProposal, Project, RiskDraft } from "@/domain/types";
import { AIUserError, validated } from "../errors";
import type { z } from "zod";
import type { LlmAdrSchema, LlmAlternativesSchema, LlmArchitectureSchema, LlmRisksSchema } from "./llmSchemas";

/**
 * Converts raw model output into domain objects. The model never chooses ids, status or
 * timestamps, and every reference it makes is checked against the real project: whatever cannot
 * be verified is dropped rather than trusted.
 */

export function buildProposal(project: Project, llm: z.infer<typeof LlmArchitectureSchema>): ChangeProposal {
  const existingNames = new Map(project.components.map((c) => [normalize(c.name), c.id]));
  const taken = new Set(project.components.map((c) => c.id));
  const keyToId = new Map<string, string>();
  const operations: ChangeOperation[] = [];
  const seenNames = new Set<string>();

  for (const c of llm.components) {
    const name = normalize(c.name);
    if (existingNames.has(name) || seenNames.has(name)) {
      // Already in the design (or duplicated by the model): reuse instead of adding it again.
      const existingId = existingNames.get(name);
      if (existingId) keyToId.set(normalize(c.key), existingId);
      continue;
    }
    seenNames.add(name);
    const id = uniqueId("cmp", taken);
    taken.add(id);
    keyToId.set(normalize(c.key), id);
    existingNames.set(name, id);
    operations.push({
      op: "add_component",
      component: {
        id,
        name: c.name.trim(),
        kind: c.kind,
        layer: c.layer.trim(),
        technology: c.technology,
        description: c.description,
        responsibilities: c.responsibilities,
        provenance: c.provenance,
        rationale: c.rationale,
        failureMode: c.failureMode,
        scaling: c.scaling,
      },
    });
  }

  const resolve = (ref: string): string | undefined => {
    const key = normalize(ref);
    return keyToId.get(key) ?? project.components.find((c) => c.id === ref)?.id ?? existingNames.get(key);
  };
  const knownLinks = new Set(project.relationships.map((r) => `${r.source}|${r.target}|${normalize(r.protocol)}`));
  const relIds = new Set(project.relationships.map((r) => r.id));
  let dropped = 0;

  for (const conn of llm.connections) {
    const source = resolve(conn.from);
    const target = resolve(conn.to);
    const signature = `${source}|${target}|${normalize(conn.protocol)}`;
    if (!source || !target || source === target || knownLinks.has(signature)) {
      dropped++;
      continue;
    }
    knownLinks.add(signature);
    const id = uniqueId("rel", relIds);
    relIds.add(id);
    operations.push({ op: "add_relationship", relationship: { id, source, target, protocol: conn.protocol.trim(), label: conn.label.trim(), async: conn.async } });
  }

  if (operations.length === 0) throw new AIUserError("The AI had nothing new to add: the architecture already covers what it would suggest.");

  const added = operations.filter((o) => o.op === "add_component").length;
  const note = dropped ? ` ${dropped} suggested connection(s) were ignored because they referenced unknown or duplicate components.` : "";

  return validated(
    ChangeProposalSchema,
    {
      id: uniqueId("prop", []),
      title: llm.title,
      summary: `${llm.summary}${llm.summary.endsWith(".") ? "" : "."} Adds ${added} component(s). Items marked as assumptions are not confirmed by your input.${note}`.trim(),
      source: "gemini",
      status: "proposed",
      operations,
      architectureStyle: llm.architectureStyle,
      styleJustification: llm.styleJustification,
      createdAt: nowIso(),
    },
    "architecture proposal",
  );
}

export function sanitizeRisks(project: Project, llm: z.infer<typeof LlmRisksSchema>): RiskDraft[] {
  const ids = new Set(project.components.map((c) => c.id));
  const titles = new Set(project.risks.map((r) => normalize(r.title)));
  const out: RiskDraft[] = [];
  for (const risk of llm.risks) {
    if (titles.has(normalize(risk.title))) continue;
    titles.add(normalize(risk.title));
    out.push({ ...risk, relatedComponentIds: risk.relatedComponentIds.filter((id) => ids.has(id)) });
  }
  return out;
}

export function sanitizeAdr(llm: z.infer<typeof LlmAdrSchema>): AdrDraft {
  return { ...llm, status: "proposed" };
}

export function sanitizeAlternatives(llm: z.infer<typeof LlmAlternativesSchema>): AlternativeDraft[] {
  // At most one alternative can be "current", and only the user decides which one.
  return llm.alternatives.map((a) => ({ ...a, isCurrent: false }));
}
