import type { BusinessContext } from "../tenant-config/business-context.js";

export function buildTenantContextPrompt(
  businessContext: BusinessContext,
): string[] {
  return [
    "Dados do negocio:",
    `Nome: ${businessContext.businessName || "[nao configurado]"}`,
    `Timezone do negocio: ${businessContext.timezone}`,
    "Politicas textuais devem vir de conhecimento tenant-scoped; se nao houver fonte, nao invente regra.",
  ];
}
