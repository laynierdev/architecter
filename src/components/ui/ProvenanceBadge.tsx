import type { Provenance } from "@/domain/types";
import { PROVENANCE_META } from "@/services/kindMeta";

export function ProvenanceBadge({ value }: { value: Provenance }) {
  const meta = PROVENANCE_META[value];
  return (
    <span className={`prov-badge prov-${value}`} title={meta.hint}>
      <i className={`bi ${meta.icon}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
