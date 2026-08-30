import type { Metadata } from "next";

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";

export const metadata: Metadata = { title: "Configuração inicial" };

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnboardingRuntimeProvider>{children}</OnboardingRuntimeProvider>;
}
