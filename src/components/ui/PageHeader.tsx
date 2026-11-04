import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        <h1 className="h3 mb-1">{title}</h1>
        {description && <p className="text-muted-ar mb-0">{description}</p>}
      </div>
      {actions && <div className="d-flex gap-2">{actions}</div>}
    </header>
  );
}
