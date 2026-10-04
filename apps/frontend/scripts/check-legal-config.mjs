const required = [
  "LEGAL_NAME",
  "TRADE_NAME",
  "CNPJ",
  "LEGAL_ADDRESS",
  "SUPPORT_EMAIL",
  "PRIVACY_EMAIL",
  "PRIVACY_OFFICER",
  "AI_PROVIDER",
  "HOSTING_PROVIDER",
  "ANALYTICS_PROVIDERS",
  "RETENTION_PERIOD",
  "APPLICABLE_FORUM",
];

// O deploy ainda tem os valores sob `ATENDLY_*` (Goal109): o nome novo vale
// primeiro e o antigo cobre a falta dele.
function read(suffix) {
  return (
    process.env[`AVENLY_${suffix}`]?.trim() ||
    process.env[`ATENDLY_${suffix}`]?.trim() ||
    ""
  );
}

const missing = required.filter((suffix) => !read(suffix));
const reviewApproved = read("LEGAL_REVIEW_APPROVED") === "true";

if (missing.length > 0 || !reviewApproved) {
  const details = [
    missing.length > 0
      ? `campos ausentes: ${missing.map((suffix) => `AVENLY_${suffix}`).join(", ")}`
      : "",
    !reviewApproved ? "revisão jurídica não aprovada" : "",
  ].filter(Boolean);
  throw new Error(
    `Publicação dos documentos legais bloqueada — ${details.join("; ")}.`,
  );
}

process.stdout.write("Configuração jurídica obrigatória validada.\n");
