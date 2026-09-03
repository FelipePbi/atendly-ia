import { notFound } from "next/navigation";

import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import {
  isOnboardingScenario,
  onboardingOrder,
} from "@/features/onboarding/scenarios";

export function generateStaticParams() {
  return onboardingOrder.map((step) => ({ step }));
}
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (!isOnboardingScenario(step)) notFound();
  return <OnboardingScreen scenario={step} />;
}
