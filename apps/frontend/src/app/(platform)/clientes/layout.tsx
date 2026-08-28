import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
