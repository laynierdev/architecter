import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { RisksView } from "./RisksView";

export const metadata: Metadata = { title: "Risks & quality" };

export default function RisksPage() {
  return (
    <div className="ar-main">
      <PageHeader title="Risks & quality attributes" description="Where the design is strong, where it is weak, and what to do about it." />
      <RisksView />
    </div>
  );
}
