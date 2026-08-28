export type CalendarSource = "atendly" | "external";

export interface OnboardingDraft {
  businessName: string;
  category: string;
  calendarSource?: CalendarSource;
  serviceName?: string;
  serviceDuration?: string;
  servicePrice?: string;
  workingDays: string[];
  tone?: "professional" | "friendly";
}

export interface OnboardingService {
  loadDraft(): Promise<OnboardingDraft>;
  saveDraft(draft: OnboardingDraft): Promise<void>;
}
