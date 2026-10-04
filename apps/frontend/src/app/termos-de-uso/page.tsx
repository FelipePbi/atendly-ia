import type { Metadata } from "next";

import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import {
  getLegalDetails,
  legalDocumentsAreIndexable,
} from "@/config/legal-details";
import { createTermsOfUse } from "@/content/legal/terms-of-use.pt-BR";

export const metadata: Metadata = {
  title: "Termos de Uso | Avenly",
  description:
    "Termos que regem a criação da conta e o uso da plataforma Avenly.",
  robots: {
    index: legalDocumentsAreIndexable(),
    follow: legalDocumentsAreIndexable(),
  },
};

export default function TermsOfUsePage() {
  const details = getLegalDetails();
  return (
    <LegalDocumentLayout
      document={createTermsOfUse(details)}
      contactEmail={details.supportEmail}
    />
  );
}
