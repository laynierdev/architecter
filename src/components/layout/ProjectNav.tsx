"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { slug: "", label: "Overview", icon: "bi-grid-1x2" },
  { slug: "requirements", label: "Requirements", icon: "bi-list-check" },
  { slug: "architecture", label: "Architecture", icon: "bi-diagram-3" },
  { slug: "compare", label: "Compare", icon: "bi-columns-gap" },
  { slug: "adrs", label: "Decisions (ADRs)", icon: "bi-journal-text" },
  { slug: "risks", label: "Risks & quality", icon: "bi-shield-exclamation" },
  { slug: "settings", label: "Settings", icon: "bi-gear" },
];

export function ProjectNav({ projectId, projectName, tagline }: { projectId: string; projectName: string; tagline: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="ar-sidebar" aria-label="Project navigation">
      <div className="ar-project-card px-2 pb-3 mb-2 border-bottom">
        <div className="fs-xs text-muted-ar">Project</div>
        <div className="fw-semibold">{projectName}</div>
        <div className="fs-xs text-muted-ar">{tagline}</div>
      </div>
      <div className="ar-nav-list">
        {ITEMS.map((item) => {
          const href = item.slug ? `${base}/${item.slug}` : base;
          const active = item.slug ? pathname.startsWith(href) : pathname === base;
          return (
            <Link key={item.slug} href={href} className={`ar-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
