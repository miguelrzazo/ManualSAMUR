import type { Metadata } from "next";
import { EditorialWorkspace } from "@/components/editorial/EditorialWorkspace";
import "./editorial.css";

export const metadata: Metadata = {
  title: "Gestión editorial · Manual SAMUR",
  robots: { index: false, follow: false, noarchive: true, googleBot: { index: false, follow: false, noimageindex: true } },
};

export default function EditorialPage() {
  return <EditorialWorkspace />;
}
