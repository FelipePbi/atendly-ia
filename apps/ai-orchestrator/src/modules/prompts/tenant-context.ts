import type { BusinessSettingsDTO } from "../business-settings/business-settings.js";

export function buildTenantContextPrompt(
  businessSettings: BusinessSettingsDTO,
): string[] {
  return [
    "Dados do negocio:",
    `Nome: ${businessSettings.businessName || "[nao configurado]"}`,
    `Profissional: ${businessSettings.professionalName || "[nao configurado]"}`,
    `Endereco: ${businessSettings.businessAddress || "[nao configurado]"}`,
    `Timezone do negocio: ${businessSettings.timezone}`,
    "",
    "Politicas do negocio:",
    `Politica de atraso: ${businessSettings.delayPolicy || "[nao configurada]"}`,
    `Politica de cancelamento: ${businessSettings.cancellationPolicy || "[nao configurada]"}`,
    `Politica de sinal: ${businessSettings.depositPolicy || "[nao configurada]"}`,
    "Se uma politica estiver como [nao configurada], nao invente regra. Responda que a profissional precisa confirmar essa parte.",
  ];
}
