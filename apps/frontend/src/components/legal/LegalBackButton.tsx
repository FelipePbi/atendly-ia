"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRegistrationDraft } from "@/components/auth/RegistrationDraftProvider";

export function LegalBackButton() {
  const router = useRouter();
  const { legalReturnSource } = useRegistrationDraft();

  function handleBack() {
    if (legalReturnSource === "/cadastro") {
      router.back();
      return;
    }
    router.push("/cadastro");
  }

  return (
    <button className="legal-back-button" type="button" onClick={handleBack}>
      <ArrowLeft size={18} aria-hidden="true" />
      Voltar para criar conta
    </button>
  );
}
