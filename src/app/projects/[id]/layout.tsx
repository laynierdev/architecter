import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/layout/ProjectNav";
import { getProject } from "@/mock/demoProject";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  return (
    <div className="ar-shell">
      <ProjectNav projectId={project.id} projectName={project.name} tagline={project.tagline} />
      <main id="main-content" className="min-w-0">
        {children}
      </main>
    </div>
  );
}
