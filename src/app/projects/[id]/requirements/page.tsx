import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stage1Notice } from "@/components/ui/Stage1Notice";
import { RequirementsBoard } from "./RequirementsBoard";

export const metadata: Metadata = { title: "Requirements" };

export default async function RequirementsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  const { draft } = await searchParams;

  return (
    <div className="ar-main">
      <PageHeader title="Requirements" description="What you stated, what was assumed, and what is still unknown. Nothing here is invented silently." />
      {draft && (
        <Stage1Notice>
          Your new project was not saved in this prototype, so you are viewing the demo project&apos;s requirements.
        </Stage1Notice>
      )}
      <Stage1Notice>Accepting or rejecting items below only changes this page in memory. Persistence arrives in Stage 4.</Stage1Notice>
      <RequirementsBoard project={project} />
    </div>
  );
}
