import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="ar-main" style={{ maxWidth: 820 }}>
      <PageHeader title="Project settings" description="Project information, export and AI provider." />
      <SettingsForm />
    </div>
  );
}
