import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();

  const unconfirmed = project.components.filter((c) => c.provenance === "assumption").length;
  const highRisks = project.risks.filter((r) => r.impact === "high").length;

  const stats = [
    { label: "Components", value: project.components.length },
    { label: "Connections", value: project.relationships.length },
    { label: "Decisions (ADRs)", value: project.adrs.length },
    { label: "High-impact risks", value: highRisks },
  ];

  const nextSteps = [
    { href: "requirements", icon: "bi-chat-left-dots", text: `Answer ${project.openQuestions.length} open questions`, why: "Budget and team size could change the recommended architecture." },
    { href: "requirements", icon: "bi-question-diamond", text: `Confirm ${project.assumptions.length} assumptions`, why: `${unconfirmed} components rest on assumptions you have not confirmed.` },
    { href: "compare", icon: "bi-columns-gap", text: "Compare the modular monolith alternative", why: "A simpler first release may fit a small team better." },
    { href: "risks", icon: "bi-activity", text: "Define observability", why: "Observability is the weakest quality attribute (2/5)." },
  ];

  return (
    <div className="ar-main">
      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          <Link className="btn btn-primary" href={`/projects/${project.id}/architecture`}>
            <i className="bi bi-diagram-3 me-1" aria-hidden="true" />
            Open architecture
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
              <ProvenanceBadge value="recommendation" />
            </div>
            <div className="ar-card-body">
              <h3 className="h5">{project.architectureStyle}</h3>
              <p>{project.styleJustification}</p>
              <p className="fs-xs text-muted-ar mb-0">Generated from mock data. It is a proposal to review, not a confirmed design.</p>
            </div>
          </section>
        </div>
        <div className="col-12 col-xl-5">
          <section className="ar-card h-100" aria-labelledby="next-h">
            <div className="ar-card-header">
              <h2 id="next-h" className="h6 mb-0">What to do next</h2>
            </div>
            <ul className="list-group list-group-flush">
              {nextSteps.map((s) => (
                <li key={s.text} className="list-group-item">
                  <Link href={`/projects/${project.id}/${s.href}`} className="d-flex gap-3 text-reset">
                    <i className={`bi ${s.icon} fs-5 text-primary`} aria-hidden="true" />
                    <span>
                      <span className="fw-semibold d-block">{s.text}</span>
                      <span className="fs-xs text-muted-ar">{s.why}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
