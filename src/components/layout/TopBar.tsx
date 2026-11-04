import Link from "next/link";

export function TopBar() {
  return (
    <header className="ar-topbar d-flex align-items-center px-3 gap-3">
      <Link href="/" className="ar-brand" aria-label="Architecter home">
        <span className="ar-logo" aria-hidden="true">
          <i className="bi bi-diagram-3-fill" />
        </span>
        <span>
          Architecter <small className="d-none d-sm-inline ms-1">From requirements to architecture</small>
        </span>
      </Link>
      <div className="ms-auto d-flex align-items-center gap-2">
        <span className="badge text-bg-light border fw-normal" title="Projects are kept in memory until persistence is added">
          <i className="bi bi-flask me-1" aria-hidden="true" />
          Preview build
        </span>
        <Link href="/projects/new" className="btn btn-primary btn-sm">
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          New project
        </Link>
      </div>
    </header>
  );
}
