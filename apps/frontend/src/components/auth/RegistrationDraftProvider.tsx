"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type RegistrationDraft = {
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
};

export const INITIAL_REGISTRATION_DRAFT: RegistrationDraft = {
  email: "",
  password: "",
  confirmPassword: "",
  termsAccepted: false,
};

type RegistrationDraftContextValue = {
  draft: RegistrationDraft;
  updateDraft: (updates: Partial<RegistrationDraft>) => void;
  clearDraft: () => void;
  legalReturnSource: "/cadastro" | null;
  markLegalNavigationFromRegistration: () => void;
  clearLegalReturnSource: () => void;
};

const RegistrationDraftContext = createContext<RegistrationDraftContextValue | null>(null);

export function RegistrationDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<RegistrationDraft>(INITIAL_REGISTRATION_DRAFT);
  const [legalReturnSource, setLegalReturnSource] = useState<"/cadastro" | null>(null);

  const value = useMemo<RegistrationDraftContextValue>(
    () => ({
      draft,
      updateDraft: (updates) => setDraft((current) => ({ ...current, ...updates })),
      clearDraft: () => setDraft(INITIAL_REGISTRATION_DRAFT),
      legalReturnSource,
      markLegalNavigationFromRegistration: () => setLegalReturnSource("/cadastro"),
      clearLegalReturnSource: () => setLegalReturnSource(null),
    }),
    [draft, legalReturnSource],
  );

  return <RegistrationDraftContext.Provider value={value}>{children}</RegistrationDraftContext.Provider>;
}

export function useRegistrationDraft(): RegistrationDraftContextValue {
  const context = useContext(RegistrationDraftContext);
  if (!context) {
    throw new Error("useRegistrationDraft must be used within RegistrationDraftProvider.");
  }
  return context;
}
