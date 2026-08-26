import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { getLegalDetails, legalDocumentsAreIndexable } from "@/config/legal-details";
import { createPrivacyPolicy } from "@/content/legal/privacy-policy.pt-BR";

export const metadata: Metadata = {
  title: "Política de Privacidade | Atendly",
  description: "Saiba como a Atendly trata dados pessoais e como exercer direitos previstos na LGPD.",
  robots: {
    index: legalDocumentsAreIndexable(),
    follow: legalDocumentsAreIndexable(),
  },
};

export default function PrivacyPolicyPage() {
  const details = getLegalDetails();
  return <LegalDocumentLayout document={createPrivacyPolicy(details)} contactEmail={details.privacyEmail} />;
}
