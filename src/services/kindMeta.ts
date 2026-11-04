import type { ComponentKind, Provenance } from "@/domain/types";

export const KIND_META: Record<ComponentKind, { label: string; icon: string; color: string }> = {
  client: { label: "Client", icon: "bi-phone", color: "var(--kind-client)" },
  gateway: { label: "Gateway", icon: "bi-signpost-split", color: "var(--kind-gateway)" },
  service: { label: "Service", icon: "bi-box", color: "var(--kind-service)" },
  database: { label: "Database", icon: "bi-database", color: "var(--kind-database)" },
  cache: { label: "Cache", icon: "bi-lightning-charge", color: "var(--kind-cache)" },
  queue: { label: "Message queue", icon: "bi-arrow-left-right", color: "var(--kind-queue)" },
  external: { label: "External service", icon: "bi-cloud", color: "var(--kind-external)" },
};

export const PROVENANCE_META: Record<Provenance, { label: string; icon: string; hint: string }> = {
  user: { label: "Provided by you", icon: "bi-person-check", hint: "Stated explicitly in your requirements." },
  assumption: { label: "Assumption", icon: "bi-question-diamond", hint: "Not provided; assumed to move forward. Please confirm." },
  recommendation: { label: "Recommendation", icon: "bi-stars", hint: "A suggestion based on your requirements. Not a confirmed decision." },
  question: { label: "Open question", icon: "bi-chat-left-dots", hint: "Missing information needed to decide." },
};
