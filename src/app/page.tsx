import Link from "next/link";
import { Credits } from "@/components/ui/Credits";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectList } from "./ProjectList";

export default function DashboardPage() {
  return (
    <main id="main-content" tabIndex={-1} className="ar-main container-xl">
      <PageHeader
        title="Projects"
        description="Design systems from requirements, explore trade-offs and keep decisions documented."
        actions={
          <Link href="/projects/new" className="btn btn-primary">
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />New project
          </Link>
        }
      />

      <ProjectList />

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

      <footer className="mt-5 pt-3 border-top">
        <Credits className="mb-0" />
      </footer>
    </main>
  );
}
