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
  legalName: ["LEGAL_NAME", "[RAZÃO SOCIAL]"],
  tradeName: ["TRADE_NAME", "[NOME FANTASIA]"],
  cnpj: ["CNPJ", "[CNPJ]"],
  address: ["LEGAL_ADDRESS", "[ENDEREÇO]"],
  supportEmail: ["SUPPORT_EMAIL", "[E-MAIL DE SUPORTE]"],
  privacyEmail: ["PRIVACY_EMAIL", "[E-MAIL DE PRIVACIDADE]"],
  privacyOfficer: ["PRIVACY_OFFICER", "[RESPONSÁVEL OU ENCARREGADO]"],
  aiProvider: ["AI_PROVIDER", "[FORNECEDOR DE IA]"],
  hostingProvider: ["HOSTING_PROVIDER", "[PROVEDOR DE HOSPEDAGEM]"],
  analyticsProviders: ["ANALYTICS_PROVIDERS", "[PROVEDORES DE ANALYTICS]"],
  retentionPeriod: ["RETENTION_PERIOD", "[PRAZO DE RETENÇÃO]"],
  applicableForum: ["APPLICABLE_FORUM", "[FORO APLICÁVEL]"],
} as const;

// O deploy ainda tem os valores sob `ATENDLY_*` (Goal109): o nome novo vale
// primeiro e o antigo cobre a falta dele.
function readLegalEnvironment(suffix: string): string | undefined {
  return (
    process.env[`AVENLY_${suffix}`]?.trim() ||
    process.env[`ATENDLY_${suffix}`]?.trim() ||
    undefined
  );
}

export function getLegalDetails(): LegalDetails {
  const missing: string[] = [];
  const details = Object.fromEntries(
    Object.entries(legalDetailSources).map(
      ([key, [suffix, placeholder]]) => {
        const configured = readLegalEnvironment(suffix);
        if (!configured) missing.push(`AVENLY_${suffix}`);
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
    readLegalEnvironment("LEGAL_REVIEW_APPROVED") === "true" &&
    readLegalEnvironment("LEGAL_INDEXABLE") === "true"
  );
}
