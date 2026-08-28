import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
