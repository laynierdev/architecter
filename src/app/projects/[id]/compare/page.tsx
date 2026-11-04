import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompareView } from "./CompareView";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  return (
    <div className="ar-main">
      <PageHeader title="Compare alternatives" description="Understand the trade-offs before committing. Scores are qualitative judgments, not measurements." />
      <CompareView alternatives={project.alternatives} />
    </div>
  );
}
