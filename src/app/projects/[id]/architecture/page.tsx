import type { Metadata } from "next";
import { ArchitectureWorkspace } from "@/components/panels/ArchitectureWorkspace";

export const metadata: Metadata = { title: "Architecture" };

export default function ArchitecturePage() {
  return <ArchitectureWorkspace />;
}
