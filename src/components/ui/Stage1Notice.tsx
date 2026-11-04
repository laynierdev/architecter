import type { ReactNode } from "react";

/** Honest disclosure for controls that only change in-memory state in the Stage 1 prototype. */
export function Stage1Notice({ children }: { children: ReactNode }) {
  return (
    <div className="alert alert-info d-flex gap-2 py-2 fs-xs mb-3" role="note">
      <i className="bi bi-info-circle" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
