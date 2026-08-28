import type { Metadata } from "next";

export const metadata: Metadata = { title: "Início" };

export default function InicioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
