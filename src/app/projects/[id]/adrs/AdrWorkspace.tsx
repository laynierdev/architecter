"use client";

import { useState } from "react";
import type { Adr, AdrStatus } from "@/domain/types";
import { Stage1Notice } from "@/components/ui/Stage1Notice";

const STATUSES: AdrStatus[] = ["proposed", "accepted", "superseded", "deprecated"];

export function AdrWorkspace({ adrs }: { adrs: Adr[] }) {
  const [selectedId, setSelectedId] = useState(adrs[0]?.id ?? "");
  const [statuses, setStatuses] = useState<Record<string, AdrStatus>>(() => Object.fromEntries(adrs.map((a) => [a.id, a.status])));
  const adr = adrs.find((a) => a.id === selectedId);

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-4">
        <div className="ar-card" role="list" aria-label="Decision records">
          {adrs.map((a) => (
            <button
              key={a.id}
              type="button"
              role="listitem"
              className={`btn text-start w-100 rounded-0 border-0 border-bottom p-3 ${a.id === selectedId ? "bg-primary-subtle" : ""}`}
              aria-current={a.id === selectedId}
              onClick={() => setSelectedId(a.id)}
            >
              <div className="fs-xs text-muted-ar">ADR-{String(a.number).padStart(3, "0")}</div>
              <div className="fw-semibold mb-1">{a.title}</div>
              <span className={`status-badge status-${statuses[a.id]}`}>{statuses[a.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="col-12 col-lg-8">
        {adr && (
          <article className="ar-card" aria-labelledby="adr-title">
            <div className="ar-card-header">
              <h2 id="adr-title" className="h6 mb-0">
                ADR-{String(adr.number).padStart(3, "0")}: {adr.title}
              </h2>
            </div>
            <div className="ar-card-body">
              <Stage1Notice>Status changes are kept in memory only. Full ADR editing and storage arrive in Stages 2 and 4.</Stage1Notice>
              <div className="mb-3 d-flex align-items-center gap-2">
                <label htmlFor="adr-status" className="mb-0 fw-semibold">Status</label>
                <select id="adr-status" className="form-select form-select-sm" style={{ width: "auto" }} value={statuses[adr.id]} onChange={(e) => setStatuses((s) => ({ ...s, [adr.id]: e.target.value as AdrStatus }))}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <h3 className="h6">Context</h3>
              <p>{adr.context}</p>
              <h3 className="h6">Problem</h3>
              <p>{adr.problem}</p>
              <h3 className="h6">Decision</h3>
              <p>{adr.decision}</p>
              <h3 className="h6">Alternatives considered</h3>
              <ul className="ps-3">
                {adr.alternatives.map((alt) => (
                  <li key={alt.name}><strong>{alt.name}:</strong> {alt.reason}</li>
                ))}
              </ul>
              <div className="row">
                <div className="col-md-6">
                  <h3 className="h6 text-success">Positive consequences</h3>
                  <ul className="ps-3">{adr.consequences.positive.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
                <div className="col-md-6">
                  <h3 className="h6 text-danger">Negative consequences</h3>
                  <ul className="ps-3">{adr.consequences.negative.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
