import type { Metadata } from "next";

export const metadata: Metadata = { title: "Migração de agenda" };

export default function MigracaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
