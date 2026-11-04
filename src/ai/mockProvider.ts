import { analyzeImpact } from "@/domain/architecture";
import { normalize, nowIso, randomId } from "@/domain/common";
import { rankAlternatives } from "@/domain/comparison";
import {
  AdrDraftSchema,
  AdvisorAnswerSchema,
  AlternativeDraftSchema,
  ChangeProposalSchema,
  ImpactReportSchema,
  RequirementsAnalysisSchema,
  RiskDraftSchema,
} from "@/domain/schemas";
import type {
  AdrDraft,
  AdvisorAnswer,
  AlternativeDraft,
  ArchComponent,
  ChangeOperation,
  ChangeProposal,
  ImpactReport,
  Priority,
  Project,
  RequirementsAnalysis,
  RiskDraft,
} from "@/domain/types";
import type { AIProvider } from "./provider";
import { AIUserError, validated } from "./errors";

/**
 * Deterministic, rule-based stand-in for a real model. The same input always yields the same
 * output, which keeps the UI testable. It only uses what is in the text or project: it never
 * invents numbers such as budgets or traffic.
 */

// Requirements analysis -------------------------------------------------

const NFR_RULES: { category: string; test: RegExp }[] = [
  { category: "Availability", test: /availab|uptime|99\.\d|downtime/i },
  { category: "Performance", test: /latenc|fast|instant|response time|performan|slow/i },
  { category: "Security", test: /secur|encrypt|privacy|gdpr|protect|authenticat/i },
  { category: "Scalability", test: /scal|peak|traffic|concurren|growth|spike/i },
  { category: "Reliability", test: /reliab|backup|recover|durab|never lose/i },
  { category: "Consistency", test: /consisten|twice|duplicate|double[- ]charge/i },
];
const FUNCTIONAL_TEST = /\b(can|could|should|must|allow|able to|need|needs|want|wants|support|let|lets|enable|provide)\b/i;

function priorityOf(sentence: string): Priority {
  if (/\b(must|need|needs|require|required|critical)\b/i.test(sentence)) return "must";
  if (/\b(could|may|optional|nice to have)\b/i.test(sentence)) return "could";
  return "should";
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((s) => s.length > 8);
}

function extractTargets(text: string): RequirementsAnalysis["targets"] {
  const targets: RequirementsAnalysis["targets"] = [];
  const volume = /(\d[\d,.]*\s?(?:k|m|million|thousand)?)\s+((?:monthly|daily|active|concurrent)\s+)*(users|customers|orders|requests|visitors|sessions)(\s*(?:per|\/)\s*(?:second|minute|hour|day|month))?/gi;
  for (const m of text.matchAll(volume)) {
    const unit = m[3] ?? "items";
    targets.push({ label: unit.charAt(0).toUpperCase() + unit.slice(1), value: m[0].trim() });
  }
  const availability = text.match(/\d{2}(?:\.\d+)?\s?%/);
  if (availability && /availab|uptime/i.test(text)) targets.push({ label: "Availability target", value: availability[0].replace(/\s/g, "") });
  const budget = text.match(/\$\s?\d[\d,]*(?:k)?(?:\s*(?:per|\/)\s*month)?/i);
  if (budget) targets.push({ label: "Budget", value: budget[0].trim() });
  const seen = new Set<string>();
  return targets.filter((t) => (seen.has(normalize(t.label)) ? false : (seen.add(normalize(t.label)), true)));
}

/** `context` is information the project already has (targets, answers). It is only used to avoid asking for it again. */
function analyze(text: string, context = ""): RequirementsAnalysis {
  const functional: RequirementsAnalysis["functional"] = [];
  const nonFunctional: RequirementsAnalysis["nonFunctional"] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(text)) {
    const key = normalize(sentence);
    if (seen.has(key)) continue;
    seen.add(key);
    const rule = NFR_RULES.find((r) => r.test.test(sentence));
    if (rule) nonFunctional.push({ text: sentence.slice(0, 500), priority: priorityOf(sentence), category: rule.category });
    else if (FUNCTIONAL_TEST.test(sentence)) functional.push({ text: sentence.slice(0, 500), priority: priorityOf(sentence) });
  }

  const targets = extractTargets(text);
  const assumptions: RequirementsAnalysis["assumptions"] = [];
  if (/pay|checkout|billing|subscription/i.test(text) && !/stripe|paypal|adyen|provider/i.test(text)) {
    assumptions.push({ text: "A hosted payment provider is used so the platform never stores card data.", priority: "must" });
  }
  if (!/region|countr|global|international|worldwide/i.test(text)) {
    assumptions.push({ text: "The product launches in a single region, so one cloud region is enough initially.", priority: "should" });
  }

  const known = `${text}\n${context}`;
  return { functional, nonFunctional, targets, assumptions, questions: missingQuestions(known, targets.length > 0 || /\d/.test(context)) };
}

function missingQuestions(text: string, hasTraffic: boolean): RequirementsAnalysis["questions"] {
  const questions: RequirementsAnalysis["questions"] = [];
  if (!/\$|budget|cost/i.test(text)) questions.push({ question: "What is the monthly infrastructure budget?", why: "Determines managed vs. self-hosted choices and how much redundancy is affordable." });
  if (!/team|developer|engineer/i.test(text)) questions.push({ question: "How large is the engineering team?", why: "A small team favors fewer deployable units and managed services." });
  if (!/availab|uptime|99/i.test(text)) questions.push({ question: "What availability do you need (for example 99.9%)?", why: "Drives redundancy, failover and cost." });
  if (!hasTraffic) questions.push({ question: "How many users or requests do you expect, at average and at peak?", why: "Traffic is the main driver of scaling decisions." });
  if (!/gdpr|hipaa|pci|complian|regulat/i.test(text)) questions.push({ question: "Are there compliance or data residency requirements?", why: "They can constrain hosting regions, storage and third-party services." });
  return questions;
}

// Architecture generation ------------------------------------------------

type ComponentSpec = Omit<ArchComponent, "layer" | "responsibilities" | "provenance"> & Partial<Pick<ArchComponent, "layer" | "responsibilities" | "provenance">>;
const comp = (c: ComponentSpec): ArchComponent => ({ layer: "Core services", responsibilities: [], provenance: "recommendation", ...c });

function generate(project: Project): ChangeProposal {
  const corpus = [project.description, ...project.functionalRequirements.map((r) => r.text), ...project.nonFunctionalRequirements.map((r) => r.text)].join(" \n ");
  const has = (re: RegExp) => re.test(corpus);

  const parts: ArchComponent[] = [
    comp({ id: "web-app", name: "Web App", kind: "client", layer: "Clients", technology: "React / Next.js", description: "Browser-based user interface.", responsibilities: ["Render the UI", "Call the backend API"], rationale: "A web client reaches every user without installation.", failureMode: "A client failure affects only that user session.", scaling: "Static assets served from a CDN." }),
    comp({ id: "backend", name: "Application Backend", kind: "service", technology: "Modular monolith (TypeScript)", description: "A single deployable application with clear internal modules for the business logic.", responsibilities: ["Expose the API", "Implement business rules", "Coordinate data access"], rationale: "Starts simple: one deployable keeps operations light and can be split later if a module needs to scale independently.", failureMode: "Run at least two instances behind a load balancer so one failure does not cause downtime.", scaling: "Stateless instances scale horizontally." }),
    comp({ id: "primary-db", name: "Primary Database", kind: "database", layer: "Data", technology: "PostgreSQL", description: "Relational storage for the core data.", responsibilities: ["Persist business data", "Provide transactions"], rationale: "Relational integrity and mature tooling fit most business applications.", failureMode: "Managed high availability with automated backups and point-in-time recovery.", scaling: "Vertical scaling first, then read replicas." }),
  ];
  const links: [string, string, string, string, boolean][] = [
    ["web-app", "backend", "HTTPS / REST", "API calls", false],
    ["backend", "primary-db", "SQL", "Read / write data", false],
  ];

  if (has(/mobile|ios|android/i)) {
    parts.push(comp({ id: "mobile-app", name: "Mobile App", kind: "client", layer: "Clients", technology: "React Native", description: "Mobile client for iOS and Android.", responsibilities: ["Mobile user experience"], rationale: "Requirements mention mobile users; one cross-platform codebase limits effort.", failureMode: "Affects only the device.", scaling: "Scales with devices." }));
    links.push(["mobile-app", "backend", "HTTPS / REST", "API calls", false]);
  }
  if (has(/login|account|sign|user|customer|auth/i)) {
    parts.push(comp({ id: "auth-provider", name: "Identity Provider", kind: "external", layer: "External", technology: "Managed OIDC provider", description: "Handles sign-up, login and tokens.", responsibilities: ["Authenticate users", "Issue tokens"], rationale: "Identity is security-critical; a managed provider is safer than a custom implementation.", failureMode: "Cached token validation keeps existing sessions alive during short outages.", scaling: "Provider-managed." }));
    links.push(["backend", "auth-provider", "OIDC / HTTPS", "Validate identity", false]);
  }
  if (has(/fast|latenc|instant|cache|peak|spike/i)) {
    parts.push(comp({ id: "cache", name: "Cache", kind: "cache", layer: "Data", technology: "Redis", description: "In-memory cache for hot reads.", responsibilities: ["Cache frequently read data"], rationale: "Performance or peak-load requirements suggest absorbing reads before the database.", failureMode: "Cache loss only slows requests; the database remains the source of truth.", scaling: "Scale with memory or cluster mode." }));
    links.push(["backend", "cache", "Redis protocol", "Cache reads", false]);
  }
  if (has(/notif|email|async|background|queue|event|report/i)) {
    parts.push(
      comp({ id: "queue", name: "Message Queue", kind: "queue", layer: "Messaging", technology: "Managed queue (e.g. RabbitMQ / SQS)", description: "Buffers background work and events.", responsibilities: ["Durable delivery of jobs"], rationale: "Background work should not slow down user requests.", failureMode: "Persistent queues with dead-letter handling.", scaling: "Scale consumers with queue depth." }),
      comp({ id: "worker", name: "Background Worker", kind: "service", description: "Processes queued jobs such as notifications and reports.", responsibilities: ["Consume jobs", "Retry failures"], technology: "TypeScript worker", rationale: "Isolates slow or retry-prone work.", failureMode: "Jobs stay queued and are retried.", scaling: "Add workers as the queue grows." }),
    );
    links.push(["backend", "queue", "AMQP", "Enqueue jobs", true], ["queue", "worker", "AMQP", "Deliver jobs", true]);
  }
  if (has(/notif|email|sms|push/i)) {
    parts.push(comp({ id: "messaging-provider", name: "Email / Push Provider", kind: "external", layer: "External", technology: "Managed provider", description: "Delivers emails and push notifications.", responsibilities: ["Deliver messages"], rationale: "Buying delivery is cheaper than building it.", failureMode: "Best effort with retries from the worker.", scaling: "Provider-managed." }));
    links.push(["worker", "messaging-provider", "HTTPS", "Send messages", false]);
  }
  if (has(/pay|checkout|billing|subscription/i)) {
    parts.push(comp({ id: "payment-provider", name: "Payment Provider", kind: "external", layer: "External", technology: "Hosted provider (e.g. Stripe)", description: "Third-party payment processing.", responsibilities: ["Charge and refund"], provenance: "assumption", rationale: "Assumption: a hosted provider keeps card data out of the platform. Not confirmed in the requirements.", failureMode: "Show a clear retry message; never charge twice (idempotency keys).", scaling: "Provider-managed." }));
    links.push(["backend", "payment-provider", "HTTPS", "Charge payments", false]);
  }
  if (has(/real-?time|live|tracking|chat|websocket/i)) {
    parts.push(comp({ id: "realtime", name: "Realtime Gateway", kind: "service", technology: "WebSocket server", description: "Pushes live updates to connected clients.", responsibilities: ["Maintain WebSocket connections", "Broadcast updates"], rationale: "Live updates need persistent connections that differ from request/response traffic.", failureMode: "Clients fall back to polling.", scaling: "Scale by connection count." }));
    links.push(["web-app", "realtime", "WebSocket", "Live updates", false], ["backend", "realtime", "Internal events", "Publish updates", true]);
  }

  const existing = new Set(project.components.map((c) => normalize(c.name)));
  const existingIds = new Set(project.components.map((c) => c.id));
  const fresh = parts.filter((c) => !existing.has(normalize(c.name)) && !existingIds.has(c.id));
  if (fresh.length === 0) throw new AIUserError("The architecture already contains every component this analysis would suggest.");

  const allIds = new Set([...existingIds, ...fresh.map((c) => c.id)]);
  const knownLinks = new Set(project.relationships.map((r) => `${r.source}|${r.target}|${r.protocol}`));
  const operations: ChangeOperation[] = fresh.map((component) => ({ op: "add_component", component }));
  links
    .filter(([s, t, p]) => allIds.has(s) && allIds.has(t) && !knownLinks.has(`${s}|${t}|${p}`))
    .forEach(([source, target, protocol, label, async], i) => {
      operations.push({ op: "add_relationship", relationship: { id: `rel-${source}-${target}-${i}`, source, target, protocol, label, async } });
    });

  return {
    id: randomId("prop"),
    title: "Starter architecture from your requirements",
    summary: `Adds ${fresh.length} component(s) inferred from keywords in your requirements. Review each change: components marked as assumptions are not confirmed by your input.`,
    source: "mock",
    status: "proposed",
    operations,
    architectureStyle: "Modular monolith with managed services",
    styleJustification: "No requirement so far demands independently scaled services, so one deployable application plus managed infrastructure is the simplest design that fits. Revisit if modules develop very different load profiles.",
    createdAt: nowIso(),
  };
}

// Advisor ---------------------------------------------------------------

function findMentioned(project: Project, question: string): ArchComponent | undefined {
  const q = normalize(question);
  return [...project.components].sort((a, b) => b.name.length - a.name.length).find((c) => q.includes(normalize(c.name)));
}

function mostConnected(project: Project): ArchComponent | undefined {
  const degree = (id: string) => project.relationships.filter((r) => r.source === id || r.target === id).length;
  return [...project.components].sort((a, b) => degree(b.id) - degree(a.id))[0];
}

export function suggestedQuestions(project: Project): string[] {
  if (project.components.length === 0) return [];
  const hub = mostConnected(project);
  const db = project.components.find((c) => c.kind === "database");
  const questions = [];
  if (db) questions.push(`Why was ${db.technology || db.name} selected for ${db.name}?`);
  if (hub) questions.push(`What happens if ${hub.name} fails?`);
  questions.push("How would the system handle ten times the traffic?", "Could this system be implemented as a modular monolith?", "What are the security implications?");
  return questions;
}

function advise(project: Project, question: string, focusId?: string): AdvisorAnswer {
  const q = question.toLowerCase();
  const mentioned = findMentioned(project, question) ?? project.components.find((c) => c.id === focusId);
  const refs: string[] = [];
  const note = "\n\n(Mock advisor: composed from your project data, not generated by a model.)";

  if (project.components.length === 0) {
    return { answer: "There is no architecture yet. Generate or add components first, then I can explain and evaluate them." + note, references: [] };
  }

  if (/\bfail|\bdown\b|outage|crash|break/.test(q) && mentioned) {
    const impact = analyzeImpact(project, mentioned.id);
    refs.push(mentioned.name);
    return { answer: `${mentioned.name}: ${mentioned.failureMode || "no failure behaviour has been documented yet."}\n\nStructural impact: ${impact.summary}` + note, references: refs };
  }
  if (/\bwhy\b|chosen|selected|instead of/.test(q) && mentioned) {
    refs.push(mentioned.name);
    const status = mentioned.provenance === "assumption" ? " This rests on an assumption you have not confirmed." : mentioned.provenance === "recommendation" ? " This is a recommendation, not a confirmed decision." : "";
    return { answer: `${mentioned.name} (${mentioned.technology || "technology not specified"}): ${mentioned.rationale || "no rationale has been recorded yet."}${status}` + note, references: refs };
  }
  if (/traffic|scale|load|grow|bottleneck|\b10x\b|ten times/.test(q)) {
    const dbs = project.components.filter((c) => c.kind === "database");
    const busiest = [...dbs].sort((a, b) => project.relationships.filter((r) => r.target === b.id).length - project.relationships.filter((r) => r.target === a.id).length)[0];
    const hasCache = project.components.some((c) => c.kind === "cache");
    refs.push(...(busiest ? [busiest.name] : []));
    const lines = [
      hasCache ? "A cache is present, so read traffic should scale first." : "There is no cache, so every read currently reaches the database.",
      busiest ? `The likely first bottleneck is ${busiest.name}. ${busiest.scaling || "No scaling notes recorded."}` : "No database is modelled, so the bottleneck cannot be identified.",
      "Treat this as a hypothesis to confirm with load tests.",
    ];
    return { answer: lines.join(" ") + note, references: refs };
  }
  if (/monolith|microservice/.test(q)) {
    const ranked = rankAlternatives(project.alternatives);
    if (ranked.length) {
      const lines = ranked.map((r) => `${r.alternative.name}: ${r.score}/5. ${r.alternative.fitVerdict}`);
      return { answer: `Based on the alternatives in this project:\n${lines.join("\n")}` + note, references: ranked.map((r) => r.alternative.name) };
    }
    const services = project.components.filter((c) => c.kind === "service").length;
    return { answer: `The design has ${services} service(s). With so few, a modular monolith is feasible: merge them into one deployable with strict module boundaries. No alternatives are recorded yet, so open Compare to document the trade-offs.` + note, references: [] };
  }
  if (/secur|auth|encrypt|privacy|permission/.test(q)) {
    const sec = project.components.filter((c) => c.kind === "gateway" || /auth|identity/i.test(c.name));
    const qa = project.qualityAttributes.find((a) => /security/i.test(a.name));
    refs.push(...sec.map((c) => c.name));
    return { answer: [sec.length ? `Authentication and access control are handled by: ${sec.map((c) => c.name).join(", ")}.` : "No gateway or identity component exists, so authentication is not yet designed.", qa ? `Security attribute: ${qa.score}/5. ${qa.note}` : "Security has not been assessed yet.", "Still to define: secrets management, rate limiting and a threat model."].join(" ") + note, references: refs };
  }
  if (/cach/.test(q)) {
    const cache = project.components.find((c) => c.kind === "cache");
    if (cache) return { answer: `${cache.name} already exists: ${cache.rationale} ${cache.failureMode}` + note, references: [cache.name] };
    return { answer: "There is no cache. Adding one reduces read latency and database load but introduces invalidation complexity and stale reads. It pays off for read-heavy, rarely changing data." + note, references: [] };
  }
  return { answer: "I can explain why a component was chosen, what happens if it fails, how the design scales, monolith vs. services, security and caching. Try mentioning a component by name." + note, references: [] };
}

// Risks and ADRs --------------------------------------------------------

function risks(project: Project): RiskDraft[] {
  const drafts: RiskDraft[] = [];
  const incoming = (id: string) => project.relationships.filter((r) => r.target === id).length;

  project.components.filter((c) => c.kind === "external").forEach((c) =>
    drafts.push({ title: `Dependency on ${c.name}`, description: `${c.name} is outside your control; its outage or pricing change affects the system.`, likelihood: "medium", impact: incoming(c.id) > 1 ? "high" : "medium", mitigation: "Timeouts, retries with backoff and a degraded-mode fallback. Monitor provider status and costs.", relatedComponentIds: [c.id] }),
  );
  project.components.filter((c) => c.kind === "database").forEach((c) =>
    drafts.push({ title: `${c.name} is a single point of failure`, description: "All data access depends on this store.", likelihood: "low", impact: "high", mitigation: "Managed high availability, automated backups, point-in-time recovery and a tested restore procedure.", relatedComponentIds: [c.id] }),
  );
  const gateways = project.components.filter((c) => c.kind === "gateway");
  if (gateways.length === 1 && gateways[0]) {
    drafts.push({ title: `${gateways[0].name} is a single point of failure`, description: "All client traffic passes through it.", likelihood: "low", impact: "high", mitigation: "Run multiple instances across availability zones with health checks.", relatedComponentIds: [gateways[0].id] });
  }
  project.components.filter((c) => c.kind === "queue").forEach((c) =>
    drafts.push({ title: `Lost or duplicated messages in ${c.name}`, description: "Network failures can drop or repeat messages.", likelihood: "medium", impact: "medium", mitigation: "Idempotent consumers, dead-letter queue and the transactional outbox pattern.", relatedComponentIds: [c.id] }),
  );
  if (project.components.filter((c) => c.kind === "service").length > 5) {
    drafts.push({ title: "Operational overhead of many services", description: "Each deployable adds pipelines, monitoring and on-call surface.", likelihood: "medium", impact: "medium", mitigation: "Use managed services and shared tooling; consider merging low-traffic services.", relatedComponentIds: [] });
  }
  return drafts;
}

function adr(project: Project, input: { topic: string; componentId?: string }): AdrDraft {
  const component = project.components.find((c) => c.id === input.componentId);
  if (!component) {
    return { title: input.topic.trim(), status: "proposed", context: project.description, problem: "To be described.", decision: "To be decided.", alternatives: [], consequences: { positive: [], negative: [] } };
  }
  return {
    title: `Use ${component.technology || component.name} for ${component.name}`,
    status: "proposed",
    context: project.description,
    problem: `Decide how to implement ${component.name}: ${component.description}`,
    decision: `${component.name} is implemented with ${component.technology || "the technology described in its details"}. ${component.rationale}`.trim(),
    alternatives: [],
    consequences: {
      positive: component.rationale ? [component.rationale] : [],
      negative: [component.failureMode, component.scaling].filter((s) => s.length > 0),
    },
  };
}

// Explanations and alternatives ----------------------------------------

function explain(project: Project, componentId: string): AdvisorAnswer {
  const c = project.components.find((x) => x.id === componentId);
  if (!c) throw new AIUserError("That component does not exist in the project.");
  const nameOf = (id: string) => project.components.find((x) => x.id === id)?.name ?? id;
  const callers = project.relationships.filter((r) => r.target === c.id).map((r) => nameOf(r.source));
  const callees = project.relationships.filter((r) => r.source === c.id).map((r) => nameOf(r.target));
  const parts = [
    `${c.name} is a ${c.kind} in the ${c.layer} layer${c.technology ? `, built with ${c.technology}` : ""}. ${c.description}`.trim(),
    c.rationale ? `Why it is here: ${c.rationale}` : "No rationale has been recorded for it yet.",
    callers.length ? `It is used by: ${callers.join(", ")}.` : "Nothing calls it yet.",
    callees.length ? `It depends on: ${callees.join(", ")}.` : "",
    c.failureMode ? `If it fails: ${c.failureMode}` : "",
    "(Mock explanation: composed from your project data, not generated by a model.)",
  ];
  return { answer: parts.filter(Boolean).join("\n\n"), references: [c.name, ...callers, ...callees] };
}

function alternatives(project: Project): AlternativeDraft[] {
  const services = project.components.filter((c) => c.kind === "service").length;
  const hasQueue = project.components.some((c) => c.kind === "queue");
  const small = services <= 3;
  const note = "Rough estimate from generic assumptions (a few instances, one managed database); validate against real pricing.";
  return [
    {
      name: "Modular monolith",
      summary: "One deployable application with strict internal module boundaries and a single database.",
      ratings: { complexity: 5, scalability: 3, reliability: 3, operations: 5, cost: 5, fit: small ? 5 : 3 },
      pros: ["Fastest to build and operate", "Simple transactions across modules", "Lowest infrastructure cost"],
      cons: ["Scales as one unit", "Needs discipline to keep module boundaries clean"],
      costEstimate: "Roughly $300–900 / month",
      costAssumptions: note,
      fitVerdict: small ? "Usually the best starting point at this size." : "Feasible, but the number of services suggests some parts may want independent scaling later.",
      isCurrent: false,
    },
    {
      name: "Service-oriented with messaging",
      summary: "Several independently deployed services communicating through an API gateway and a message broker.",
      ratings: { complexity: 2, scalability: 4, reliability: 4, operations: 2, cost: 3, fit: small ? 2 : 4 },
      pros: ["Independent scaling and failure isolation", "Teams can own services"],
      cons: ["Distributed-system complexity", "Higher infrastructure and operations cost"],
      costEstimate: "Roughly $1,200–3,000 / month",
      costAssumptions: note,
      fitVerdict: hasQueue || !small ? "Reasonable if the team can operate it." : "Probably more than the requirements need today.",
      isCurrent: false,
    },
  ];
}

// Provider --------------------------------------------------------------

export class MockAIProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly isMock = true;

  async analyzeRequirements({ text, context }: { text: string; context?: string }) {
    return validated(RequirementsAnalysisSchema, analyze(text, context), "requirements analysis");
  }

  async suggestQuestions(project: Project) {
    const corpus = [project.description, ...project.functionalRequirements.map((r) => r.text), ...project.nonFunctionalRequirements.map((r) => r.text), ...project.targets.map((t) => `${t.label} ${t.value}`)].join(" ");
    const known = new Set(project.openQuestions.map((q) => normalize(q.question)));
    const questions = missingQuestions(corpus, project.targets.length > 0).filter((q) => !known.has(normalize(q.question)));
    return validated(RequirementsAnalysisSchema.shape.questions, questions, "question list");
  }

  async generateArchitecture(project: Project): Promise<ChangeProposal> {
    return validated(ChangeProposalSchema, generate(project), "architecture proposal");
  }

  async askAdvisor(project: Project, question: string, focusComponentId?: string) {
    return validated(AdvisorAnswerSchema, advise(project, question, focusComponentId), "advisor answer");
  }

  async analyzeImpact(project: Project, componentId: string): Promise<ImpactReport> {
    return validated(ImpactReportSchema, analyzeImpact(project, componentId), "impact report");
  }

  async suggestAdr(project: Project, input: { topic: string; componentId?: string }) {
    return validated(AdrDraftSchema, adr(project, input), "ADR draft");
  }

  async explainComponent(project: Project, componentId: string) {
    return validated(AdvisorAnswerSchema, explain(project, componentId), "explanation");
  }

  async suggestAlternatives(project: Project) {
    return validated(AlternativeDraftSchema.array(), alternatives(project), "alternatives");
  }

  async suggestRisks(project: Project) {
    return validated(RiskDraftSchema.array(), risks(project), "risk list");
  }
}
