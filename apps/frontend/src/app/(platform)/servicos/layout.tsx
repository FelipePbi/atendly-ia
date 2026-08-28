import type { Metadata } from "next";

export const metadata: Metadata = { title: "Serviços" };

export default function ServicosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
