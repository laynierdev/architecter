import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdrWorkspace } from "./AdrWorkspace";

export const metadata: Metadata = { title: "Decisions" };

export default function AdrsPage() {
  return (
    <div className="ar-main">
      <PageHeader title="Architecture decisions" description="Why the system looks the way it does. Proposed decisions are not yet confirmed." />
      <AdrWorkspace />
    </div>
  );
}
