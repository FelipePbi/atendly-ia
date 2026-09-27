import type { FastifyRequest } from "fastify";

import type { SchedulingClient } from "../clients/scheduling/index.js";
import { internalContext } from "../modules/tenant/context.js";
import { normalizeStoredAiConversationStyle } from "./ai-conversation-style.js";
import { businessContextProjectionState } from "./business-profile.js";
import { phoneFromWhatsappJid } from "./phone.js";
import { getPrisma } from "./prisma.js";
import { currentTenantContext } from "./tenant-context.js";

/**
 * O estado do onboarding do negócio, numa função só.
 *
 * Vive aqui, e não dentro das rotas de onboarding, desde o Goal022: a central
 * de notificações precisa saber **se falta configuração essencial** para
 * decidir `SETUP_INCOMPLETE`, e uma segunda definição de "o que é essencial"
 * poderia divergir da primeira sem ninguém notar. A composição é a mesma de
 * sempre — negócio, calendário, serviço ativo, disponibilidade e instância
 * WhatsApp; o que mudou foi o endereço do arquivo.
 */
export async function onboardingState(
  request: FastifyRequest,
  scheduling: Pick<
    SchedulingClient,
    "calendar" | "listServices" | "availabilitySettings"
  >,
) {
  const tenant = currentTenantContext(request);
  const context = internalContext(request);
  const [profile, settings, instance, calendar] = await Promise.all([
    getPrisma().businessProfile.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    getPrisma().aiSettings.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    getPrisma().whatsAppInstance.findUnique({
      where: { userId: tenant.userId },
    }),
    scheduling.calendar(context),
  ]);
  const [services, availability] = await Promise.all([
    calendar.source ? scheduling.listServices(context) : Promise.resolve([]),
    calendar.source
      ? scheduling.availabilitySettings(context)
      : Promise.resolve(null),
  ]);
  return {
    business: profile
      ? {
          name: profile.businessName,
          category: profile.category,
          timezone: profile.timezone,
          modalities: profile.modalities,
          address: profile.address,
          contextVersion: profile.businessContextVersion,
          contextProjectedVersion: profile.businessContextProjectedVersion,
          contextProjectionStatus: businessContextProjectionState(profile),
        }
      : null,
    calendar: {
      source: calendar.source === "ATENDLY" ? "ATENDLY" : null,
      timezone: calendar.timezone,
      integration: calendar.integration,
    },
    ai: {
      tone: normalizeStoredAiConversationStyle(settings?.tone),
    },
    service: services.find((service) => service.active) ?? null,
    availability,
    whatsapp: instance
      ? {
          status: instance.status,
          // Estoque legado pode guardar o JID cru; o produto só expõe dígitos.
          phoneNumber: instance.phoneNumber
            ? phoneFromWhatsappJid(instance.phoneNumber) || null
            : null,
        }
      : null,
    completed: Boolean(profile?.onboardingCompletedAt),
    completedAt: profile?.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export type OnboardingState = Awaited<ReturnType<typeof onboardingState>>;

/**
 * Vocabulário fechado do que ainda falta para o negócio operar.
 *
 * É a **única** definição de configuração essencial do produto: `POST
 * /v1/onboarding/complete` a usa para recusar a conclusão, e a central de
 * notificações a usa para abrir e resolver `SETUP_INCOMPLETE`. Função pura
 * sobre o estado já lido — não faz chamada nenhuma, e por isso não custa uma
 * leitura a mais a quem já tem o estado em mãos.
 */
export function onboardingIssues(state: OnboardingState): string[] {
  const issues: string[] = [];
  const business = state.business;
  if (!business?.name.trim() || !business.category?.trim()) {
    issues.push("BUSINESS_PROFILE_INCOMPLETE");
  }
  if (!business?.modalities.length) {
    issues.push("BUSINESS_MODALITY_NOT_SELECTED");
  }
  if (business?.modalities.includes("ON_SITE") && !business.address?.trim()) {
    issues.push("BUSINESS_ADDRESS_REQUIRED");
  }
  if (!state.calendar.source) issues.push("CALENDAR_NOT_SELECTED");
  if (!state.ai.tone) issues.push("AI_TONE_NOT_SELECTED");

  if (state.calendar.source) {
    if (!state.service) issues.push("ACTIVE_SERVICE_REQUIRED");
    if (!state.availability?.rules.some((rule) => rule.active)) {
      issues.push("AVAILABILITY_REQUIRED");
    }
  }

  return issues;
}
