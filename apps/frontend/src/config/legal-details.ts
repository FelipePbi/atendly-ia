export type LegalDetails = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: string;
  supportEmail: string;
  privacyEmail: string;
  privacyOfficer: string;
  aiProvider: string;
  hostingProvider: string;
  analyticsProviders: string;
  retentionPeriod: string;
  applicableForum: string;
};

const legalDetailSources = {
  legalName: ["ATENDLY_LEGAL_NAME", "[RAZÃO SOCIAL]"],
  tradeName: ["ATENDLY_TRADE_NAME", "[NOME FANTASIA]"],
  cnpj: ["ATENDLY_CNPJ", "[CNPJ]"],
  address: ["ATENDLY_LEGAL_ADDRESS", "[ENDEREÇO]"],
  supportEmail: ["ATENDLY_SUPPORT_EMAIL", "[E-MAIL DE SUPORTE]"],
  privacyEmail: ["ATENDLY_PRIVACY_EMAIL", "[E-MAIL DE PRIVACIDADE]"],
  privacyOfficer: ["ATENDLY_PRIVACY_OFFICER", "[RESPONSÁVEL OU ENCARREGADO]"],
  aiProvider: ["ATENDLY_AI_PROVIDER", "[FORNECEDOR DE IA]"],
  hostingProvider: ["ATENDLY_HOSTING_PROVIDER", "[PROVEDOR DE HOSPEDAGEM]"],
  analyticsProviders: [
    "ATENDLY_ANALYTICS_PROVIDERS",
    "[PROVEDORES DE ANALYTICS]",
  ],
  retentionPeriod: ["ATENDLY_RETENTION_PERIOD", "[PRAZO DE RETENÇÃO]"],
  applicableForum: ["ATENDLY_APPLICABLE_FORUM", "[FORO APLICÁVEL]"],
} as const;

export function getLegalDetails(): LegalDetails {
  const missing: string[] = [];
  const details = Object.fromEntries(
    Object.entries(legalDetailSources).map(
      ([key, [environmentKey, placeholder]]) => {
        const configured = process.env[environmentKey]?.trim();
        if (!configured) missing.push(environmentKey);
        return [key, configured || placeholder];
      },
    ),
  ) as LegalDetails;

  // Publication remains protected by `npm run build:release` / `legal:check`.
  // The mock-first frontend build intentionally renders explicit placeholders.
  void missing;

  return details;
}

export function legalDocumentsAreIndexable(): boolean {
  return (
    process.env.ATENDLY_LEGAL_REVIEW_APPROVED === "true" &&
    process.env.ATENDLY_LEGAL_INDEXABLE === "true"
  );
}
