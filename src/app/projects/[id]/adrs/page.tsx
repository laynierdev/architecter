import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdrWorkspace } from "./AdrWorkspace";

export const metadata: Metadata = { title: "Decisions" };

export default async function AdrsPage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  return (
    <div className="ar-main">
      <PageHeader title="Architecture decisions" description="Why the system looks the way it does. Proposed decisions are not yet confirmed." />
      <AdrWorkspace adrs={project.adrs} />
    </div>
  );
}
