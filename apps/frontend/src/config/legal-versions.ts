export {
  CURRENT_LEGAL_VERSIONS,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_LAST_UPDATED_DATE,
  PRIVACY_POLICY_VERSION,
  TERMS_EFFECTIVE_DATE,
  TERMS_LAST_UPDATED_DATE,
  TERMS_VERSION,
} from "@atendly-ia/legal-contract";

export function formatLegalDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
