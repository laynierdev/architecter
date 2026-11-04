import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompareView } from "./CompareView";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <div className="ar-main">
      <PageHeader title="Compare alternatives" description="Understand the trade-offs before committing. Scores are qualitative judgments, not measurements." />
      <CompareView />
    </div>
  );
}
