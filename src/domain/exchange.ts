import { riskScore, sortRisksBySeverity } from "./risks";
import { ProjectSchema, SCHEMA_VERSION } from "./schemas";
import type { Adr, Project } from "./types";

export const EXPORT_FORMAT = "architecter-project";

// JSON backup -----------------------------------------------------------

export function exportProjectJson(project: Project, exportedAt: string = new Date().toISOString()): string {
  return JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt, project }, null, 2);
}

export const BACKUP_FORMAT_NAME = "architecter-backup";

/** Whole-workspace backup: every project in one file. */
export function exportBackupJson(projects: readonly Project[], exportedAt: string = new Date().toISOString()): string {
  return JSON.stringify({ format: BACKUP_FORMAT_NAME, schemaVersion: SCHEMA_VERSION, exportedAt, projects }, null, 2);
}

export type ParseResult = { ok: true; project: Project } | { ok: false; errors: string[] };

/**
 * Parses and validates a JSON backup. Never throws: problems are reported as readable messages.
 * Whole-workspace files, version migration and ID conflicts are handled by importer.ts.
 */
export function parseProjectJson(source: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (typeof data !== "object" || data === null) return { ok: false, errors: ["The file does not contain a project backup."] };

  const envelope = data as Record<string, unknown>;
  if (envelope.format !== EXPORT_FORMAT) return { ok: false, errors: ["This is not an Architecter project backup."] };
  if (typeof envelope.schemaVersion !== "number") return { ok: false, errors: ["The backup has no schema version."] };
  if (envelope.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [`This backup uses schema version ${envelope.schemaVersion}, newer than the supported version ${SCHEMA_VERSION}. Update Architecter to import it.`] };
  }
  if (envelope.schemaVersion < SCHEMA_VERSION) {
    return { ok: false, errors: [`Schema version ${envelope.schemaVersion} is not supported (no migration available).`] };
  }

  const result = ProjectSchema.safeParse(envelope.project);
  if (!result.success) {
    const errors = result.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "project"}: ${i.message}`);
    return { ok: false, errors };
  }
  return { ok: true, project: result.data };
}

// Mermaid ---------------------------------------------------------------

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "_");
const safeLabel = (text: string) => text.replace(/"/g, "'").replace(/[\r\n]+/g, " ");

const SHAPES: Record<string, [string, string]> = {
  client: ["([", "])"],
  gateway: ["{{", "}}"],
  service: ["[", "]"],
  database: ["[(", ")]"],
  cache: ["[(", ")]"],
  queue: [">", "]"],
  external: ["[/", "/]"],
};

/** Generates a Mermaid flowchart from the real architecture data, grouped by layer. */
export function toMermaid(project: Project): string {
  const lines = ["flowchart LR"];
  const layers = [...new Set(project.components.map((c) => c.layer))];
  layers.forEach((layer, i) => {
    lines.push(`  subgraph layer_${i}["${safeLabel(layer)}"]`);
    project.components
      .filter((c) => c.layer === layer)
      .forEach((c) => {
        const [open, close] = SHAPES[c.kind] ?? ["[", "]"];
        lines.push(`    ${safeId(c.id)}${open}"${safeLabel(c.name)}"${close}`);
      });
    lines.push("  end");
  });
  project.relationships.forEach((r) => {
    const label = safeLabel(`${r.label} (${r.protocol})`);
    const arrow = r.async ? `-. "${label}" .->` : `-- "${label}" -->`;
    lines.push(`  ${safeId(r.source)} ${arrow} ${safeId(r.target)}`);
  });
  return lines.join("\n");
}

// Markdown --------------------------------------------------------------

const bullets = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "_None_");
const adrId = (n: number) => `ADR-${String(n).padStart(3, "0")}`;

export function adrToMarkdown(adr: Adr): string {
  return [
    `# ${adrId(adr.number)}: ${adr.title}`,
    "",
    `**Status:** ${adr.status}${adr.supersededBy ? ` (superseded by ${adr.supersededBy})` : ""}`,
    "",
    "## Context",
    adr.context || "_Not provided_",
    "",
    "## Problem",
    adr.problem || "_Not provided_",
    "",
    "## Decision",
    adr.decision || "_Not provided_",
    "",
    "## Alternatives considered",
    bullets(adr.alternatives.map((a) => `**${a.name}**${a.reason ? `: ${a.reason}` : ""}`)),
    "",
    "## Consequences",
    "### Positive",
    bullets(adr.consequences.positive),
    "### Negative",
    bullets(adr.consequences.negative),
    "",
  ].join("\n");
}

export function adrsToMarkdown(project: Project): string {
  return project.adrs
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(adrToMarkdown)
    .join("\n---\n\n");
}

/** Full project documentation generated strictly from project data. */
export function toMarkdown(project: Project): string {
  const name = (id: string) => project.components.find((c) => c.id === id)?.name ?? id;
  const out: string[] = [
    `# ${project.name}`,
    "",
    project.tagline ? `_${project.tagline}_\n` : "",
    project.description || "_No description provided._",
    "",
    "## Requirements",
    "### Functional",
    bullets(project.functionalRequirements.map((r) => `${r.text} _(${r.priority}, ${r.provenance})_`)),
    "### Non-functional",
    bullets(project.nonFunctionalRequirements.map((r) => `${r.text} _(${r.category ?? "general"}, ${r.priority}, ${r.provenance})_`)),
    "### Targets",
    bullets(project.targets.map((t) => `${t.label}: ${t.value} _(${t.provenance})_`)),
    "### Assumptions",
    bullets(project.assumptions.map((a) => `${a.text} _(${a.status})_`)),
    "### Open questions",
    bullets(project.openQuestions.map((q) => `${q.question}${q.answer ? ` → **${q.answer}**` : " _(unanswered)_"}`)),
    "",
    "## Architecture",
    project.architectureStyle ? `**Style:** ${project.architectureStyle}\n` : "",
    project.styleJustification,
    "",
    "```mermaid",
    toMermaid(project),
    "```",
    "",
    "### Components",
  ];
  project.components.forEach((c) => {
    out.push(
      `#### ${c.name}`,
      `${c.kind} · ${c.layer} · ${c.technology || "technology not specified"} · _${c.provenance}_`,
      "",
      c.description,
      "",
      "Responsibilities:",
      bullets(c.responsibilities),
      "",
      c.rationale ? `**Why:** ${c.rationale}\n` : "",
      c.failureMode ? `**If it fails:** ${c.failureMode}\n` : "",
    );
  });
  out.push("### Connections", bullets(project.relationships.map((r) => `${name(r.source)} ${r.async ? "⇢" : "→"} ${name(r.target)}: ${r.label} (${r.protocol})`)));

  out.push("", "## Quality attributes", bullets(project.qualityAttributes.map((q) => `${q.name}: ${q.score}/5. ${q.note}`)));
  out.push("", "## Risks", bullets(sortRisksBySeverity(project.risks).map((r) => `**${r.title}** (score ${riskScore(r)}/9). ${r.mitigation}`)));
  out.push("", "## Architecture decisions", project.adrs.length ? adrsToMarkdown(project) : "_None recorded_", "");
  return out.filter((l) => l !== undefined).join("\n");
}
