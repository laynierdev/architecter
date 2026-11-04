import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { ArchitectureWorkspace } from "@/components/panels/ArchitectureWorkspace";

export const metadata: Metadata = { title: "Architecture" };

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  return <ArchitectureWorkspace project={project} />;
}
