import Link from "next/link";
import { demoProject as p } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";

export default function DashboardPage() {
  const open = p.openQuestions.length;
  const assumptions = p.assumptions.length;

  return (
    <main id="main-content" className="ar-main container-xl">
      <PageHeader title="Projects" description="Design systems from requirements, explore trade-offs and keep decisions documented." actions={
        <Link href="/projects/new" className="btn btn-primary">
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          New project
        </Link>
      } />

      <div className="row g-3">
        <div className="col-12 col-md-6 col-xl-4">
          <Link href={`/projects/${p.id}`} className="ar-card ar-card-link d-block h-100 text-reset">
            <div className="ar-card-body">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <span className="badge text-bg-primary">Demo project</span>
                <span className="fs-xs text-muted-ar">Updated {p.updatedAt}</span>
              </div>
              <h2 className="h5 mb-1">{p.name}</h2>
              <p className="text-muted-ar fs-xs mb-3">{p.tagline}</p>
              <p className="mb-3">{p.description}</p>
              <div className="d-flex flex-wrap gap-2 fs-xs">
                <span className="badge text-bg-light border">{p.components.length} components</span>
                <span className="badge text-bg-light border">{p.adrs.length} ADRs</span>
                <span className="badge text-bg-light border">{p.risks.length} risks</span>
                <span className="prov-badge prov-question">{open} open questions</span>
                <span className="prov-badge prov-assumption">{assumptions} assumptions</span>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-12 col-md-6 col-xl-4">
          <Link href="/projects/new" className="ar-card ar-card-link d-flex h-100 text-reset align-items-center justify-content-center text-center" style={{ borderStyle: "dashed", minHeight: 200 }}>
            <div className="ar-card-body">
              <i className="bi bi-plus-circle fs-1 text-muted-ar" aria-hidden="true" />
              <p className="fw-semibold mb-1 mt-2">Start a new project</p>
              <p className="fs-xs text-muted-ar mb-0">Describe your product and requirements.</p>
            </div>
          </Link>
        </div>
      </div>

      <section className="mt-5" aria-labelledby="how-heading">
        <h2 id="how-heading" className="h5 mb-3">How Architecter works</h2>
        <ol className="row g-3 list-unstyled">
          {[
            ["bi-list-check", "Define requirements", "Separate what you stated from what is assumed or still unknown."],
            ["bi-diagram-3", "Explore the architecture", "Inspect components and watch typical flows travel through the system."],
            ["bi-columns-gap", "Compare alternatives", "Weigh monolith vs. services, SQL vs. NoSQL and more, with honest estimates."],
            ["bi-journal-text", "Record decisions", "Keep ADRs and risks next to the design so reasoning is never lost."],
          ].map(([icon, title, text]) => (
            <li key={title} className="col-12 col-md-6 col-xl-3">
              <div className="ar-card ar-card-body h-100">
                <i className={`bi ${icon} fs-4 text-primary`} aria-hidden="true" />
                <h3 className="h6 mt-2">{title}</h3>
                <p className="fs-xs text-muted-ar mb-0">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
