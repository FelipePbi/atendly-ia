const required = [
  "ATENDLY_LEGAL_NAME",
  "ATENDLY_TRADE_NAME",
  "ATENDLY_CNPJ",
  "ATENDLY_LEGAL_ADDRESS",
  "ATENDLY_SUPPORT_EMAIL",
  "ATENDLY_PRIVACY_EMAIL",
  "ATENDLY_PRIVACY_OFFICER",
  "ATENDLY_AI_PROVIDER",
  "ATENDLY_HOSTING_PROVIDER",
  "ATENDLY_ANALYTICS_PROVIDERS",
  "ATENDLY_RETENTION_PERIOD",
  "ATENDLY_APPLICABLE_FORUM",
];

const missing = required.filter((key) => !process.env[key]?.trim());

if (
  missing.length > 0 ||
  process.env.ATENDLY_LEGAL_REVIEW_APPROVED !== "true"
) {
  const details = [
    missing.length > 0 ? `campos ausentes: ${missing.join(", ")}` : "",
    process.env.ATENDLY_LEGAL_REVIEW_APPROVED !== "true"
      ? "revisão jurídica não aprovada"
      : "",
  ].filter(Boolean);
  throw new Error(
    `Publicação dos documentos legais bloqueada — ${details.join("; ")}.`,
  );
}

process.stdout.write("Configuração jurídica obrigatória validada.\n");
