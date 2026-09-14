import {
  BUSINESS_MODALITY_LABELS,
  type BusinessContext,
} from "../tenant-config/business-context.js";

export function buildTenantContextPrompt(
  businessContext: BusinessContext,
): string[] {
  // So lista as modalidades escolhidas; nunca afirma que o negocio nao
  // atende de um jeito que ele simplesmente nao configurou ainda.
  const modalities =
    businessContext.modalities.length > 0
      ? businessContext.modalities
          .map((modality) => BUSINESS_MODALITY_LABELS[modality])
          .join(", ")
      : "[nao configurado]";

  return [
    "Dados do negocio:",
    `Nome: ${businessContext.businessName || "[nao configurado]"}`,
    `Timezone do negocio: ${businessContext.timezone}`,
    `Segmento: ${businessContext.segment || "[nao configurado]"}`,
    `Modalidades de atendimento: ${modalities}`,
    `Endereco: ${businessContext.address || "[nao configurado]"}`,
    "Politicas textuais devem vir de conhecimento tenant-scoped; se nao houver fonte, nao invente regra.",
  ];
}
