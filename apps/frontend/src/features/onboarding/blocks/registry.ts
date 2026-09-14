import type { OnboardingBlockId } from "../blocks";
import { aiStepBody, persistAiStep } from "./ai";
import { businessStepBody, persistBusinessStep } from "./business";
import { persistScheduleStep, scheduleStepBody } from "./schedule";
import type { OnboardingStepBody, OnboardingStepPersist } from "./shared";
import { persistWhatsappStep, whatsappStepBody } from "./whatsapp";

export const stepBodyByBlock: Record<OnboardingBlockId, OnboardingStepBody> = {
  ai: aiStepBody,
  business: businessStepBody,
  schedule: scheduleStepBody,
  whatsapp: whatsappStepBody,
};

export const stepPersistByBlock: Record<
  OnboardingBlockId,
  OnboardingStepPersist
> = {
  ai: persistAiStep,
  business: persistBusinessStep,
  schedule: persistScheduleStep,
  whatsapp: persistWhatsappStep,
};

export { onboardingError } from "./shared";
