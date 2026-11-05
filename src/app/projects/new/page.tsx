import type { Metadata } from "next";
import { NewProjectForm } from "./NewProjectForm";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <main id="main-content" tabIndex={-1} className="ar-main container" style={{ maxWidth: 860 }}>
      <NewProjectForm />
    </main>
  );
}
