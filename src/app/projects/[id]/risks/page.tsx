import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { RisksView } from "./RisksView";

export const metadata: Metadata = { title: "Risks & quality" };

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  return (
    <div className="ar-main">
      <PageHeader title="Risks & quality attributes" description="Where the design is strong, where it is weak, and what to do about it." />
      <RisksView project={project} />
    </div>
  );
}
