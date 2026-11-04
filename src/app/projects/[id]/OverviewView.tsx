"use client";

import Link from "next/link";
import { findIssues } from "@/domain/architecture";
import { unansweredQuestions } from "@/domain/requirements";
import { riskBand, riskScore } from "@/domain/risks";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useProject } from "@/state/ProjectContext";

export function OverviewView() {
  const { project } = useProject();
  const base = `/projects/${project.id}`;

  const unconfirmedAssumptions = project.assumptions.filter((a) => a.status === "proposed").length;
  const openQuestions = unansweredQuestions(project).length;
  const highRisks = project.risks.filter((r) => riskBand(riskScore(r)) === "high").length;
  const warnings = findIssues(project).filter((i) => i.severity === "warning").length;
  const weakest = [...project.qualityAttributes].sort((a, b) => a.score - b.score)[0];
  const hasRequirements = project.functionalRequirements.length + project.nonFunctionalRequirements.length > 0;

  const stats = [
    { label: "Components", value: project.components.length },
    { label: "Connections", value: project.relationships.length },
    { label: "Decisions (ADRs)", value: project.adrs.length },
    { label: "High-severity risks", value: highRisks },
  ];

  // Next steps are derived from the real state of the project.
  const next: { href: string; icon: string; text: string; why: string }[] = [];
  if (!hasRequirements) next.push({ href: "requirements", icon: "bi-list-check", text: "Describe and analyze your requirements", why: "Everything else builds on them." });
  if (openQuestions > 0) next.push({ href: "requirements", icon: "bi-chat-left-dots", text: `Answer ${openQuestions} open question${openQuestions === 1 ? "" : "s"}`, why: "Missing information may change the recommended architecture." });
  if (unconfirmedAssumptions > 0) next.push({ href: "requirements", icon: "bi-question-diamond", text: `Confirm ${unconfirmedAssumptions} assumption${unconfirmedAssumptions === 1 ? "" : "s"}`, why: "Unconfirmed assumptions are not facts." });
  if (project.components.length === 0 && hasRequirements) next.push({ href: "architecture", icon: "bi-diagram-3", text: "Generate a starting architecture", why: "You will review every change before it is applied." });
  if (warnings > 0) next.push({ href: "architecture", icon: "bi-exclamation-triangle", text: `Review ${warnings} architecture warning${warnings === 1 ? "" : "s"}`, why: "Structural checks found possible design smells." });
  if (project.components.length > 0 && project.alternatives.length === 0) next.push({ href: "compare", icon: "bi-columns-gap", text: "Document an alternative to compare", why: "Seeing trade-offs is how you validate the proposal." });
  if (project.components.length > 0 && project.risks.length === 0) next.push({ href: "risks", icon: "bi-shield-exclamation", text: "Identify risks", why: "Ask for suggestions based on your architecture." });
  if (weakest && weakest.score <= 2) next.push({ href: "risks", icon: "bi-activity", text: `Improve ${weakest.name.toLowerCase()}`, why: `It is the weakest quality attribute (${weakest.score}/5).` });
  if (project.components.length > 0 && project.adrs.length === 0) next.push({ href: "adrs", icon: "bi-journal-text", text: "Record your first decision", why: "Keep the reasoning next to the design." });

  return (
    <div className="ar-main">
      <PageHeader
        title={project.name}
        description={project.description || "No description yet."}
        actions={
          <Link className="btn btn-primary" href={`${base}/architecture`}>
            <i className="bi bi-diagram-3 me-1" aria-hidden="true" />Open architecture
          </Link>
        }
      />

      <div className="row g-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="col-6 col-lg-3">
            <div className="ar-card ar-card-body stat-tile">
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-7">
          <section className="ar-card h-100" aria-labelledby="proposal-h">
            <div className="ar-card-header">
              <h2 id="proposal-h" className="h6 mb-0">Current architecture proposal</h2>
              {project.architectureStyle && <ProvenanceBadge value="recommendation" />}
            </div>
            <div className="ar-card-body">
              {project.architectureStyle ? (
                <>
                  <h3 className="h5">{project.architectureStyle}</h3>
                  <p>{project.styleJustification}</p>
                  <p className="fs-xs text-muted-ar mb-0">A proposal to review, not a confirmed design.</p>
                </>
              ) : (
                <p className="text-muted-ar mb-0">No architecture proposed yet.</p>
              )}
            </div>
          </section>
        </div>
        <div className="col-12 col-xl-5">
          <section className="ar-card h-100" aria-labelledby="next-h">
            <div className="ar-card-header"><h2 id="next-h" className="h6 mb-0">What to do next</h2></div>
            {next.length === 0 ? (
              <p className="ar-card-body text-success mb-0"><i className="bi bi-check-circle me-1" aria-hidden="true" />Nothing pending. Keep refining the design or export it from Settings.</p>
            ) : (
              <ul className="list-group list-group-flush">
                {next.map((s) => (
                  <li key={s.text} className="list-group-item">
                    <Link href={`${base}/${s.href}`} className="d-flex gap-3 text-reset">
                      <i className={`bi ${s.icon} fs-5 text-primary`} aria-hidden="true" />
                      <span><span className="fw-semibold d-block">{s.text}</span><span className="fs-xs text-muted-ar">{s.why}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
