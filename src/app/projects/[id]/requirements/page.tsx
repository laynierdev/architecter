import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirementsBoard } from "./RequirementsBoard";

export const metadata: Metadata = { title: "Requirements" };

export default function RequirementsPage() {
  return (
    <div className="ar-main">
      <PageHeader title="Requirements" description="What you stated, what was assumed, and what is still unknown. Nothing here is invented silently." />
      <RequirementsBoard />
    </div>
  );
}
