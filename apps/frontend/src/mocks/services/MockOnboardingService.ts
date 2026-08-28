import type {
  OnboardingDraft,
  OnboardingService,
} from "@/features/onboarding/types";

const initialDraft: OnboardingDraft = {
  businessName: "Studio Aurora",
  category: "Beleza e estética",
  workingDays: ["SEG", "TER", "QUA", "QUI", "SEX"],
};

export class MockOnboardingService implements OnboardingService {
  private draft = initialDraft;
  async loadDraft() {
    return Promise.resolve(this.draft);
  }
  async saveDraft(draft: OnboardingDraft) {
    this.draft = draft;
    return Promise.resolve();
  }
}
