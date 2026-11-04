import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/mock/demoProject";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const project = getProject((await params).id);
  if (!project) notFound();
  return (
    <div className="ar-main" style={{ maxWidth: 820 }}>
      <PageHeader title="Project settings" description="Basic project information and AI provider." />
      <SettingsForm name={project.name} description={project.description} />
    </div>
  );
}
