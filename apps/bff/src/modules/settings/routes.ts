import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import {
  aiConversationStyleSchema,
  normalizeStoredAiConversationStyle,
  parseBodyWithAiConversationStyle,
  resolveAiConversationStyle,
} from "../../lib/ai-conversation-style.js";
import {
  businessAddressSchema,
  businessContextPayload,
  businessContextProjectionState,
  businessModalitySchema,
  resolveBusinessProfileFields,
} from "../../lib/business-profile.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const businessSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(100),
  // Ausente preserva o que esta gravado; nunca grava conjunto vazio so por
  // omissao (Goal018/WU-01).
  modalities: z.array(businessModalitySchema).optional(),
  address: businessAddressSchema.optional(),
});
const aiSchema = z.object({
  enabled: z.boolean(),
  // Os tres estilos do produto e os dois valores antigos como alias
  // declarado (Goal011); a resposta sempre devolve o vocabulario novo.
  tone: aiConversationStyleSchema,
});
const availabilitySchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  rules: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      active: z.boolean().default(true),
    }),
  ),
  // Regras de oferta do negocio (Goal009), aditivas ao corpo existente:
  // ausentes preservam o valor ja gravado no Scheduling.
  minLeadMinutes: z.number().int().min(0).max(43_200).optional(),
  maxLeadDays: z.number().int().min(1).max(365).optional(),
  granularityMinutes: z.number().int().min(5).max(120).optional(),
});

export async function registerV1SettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/settings",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(request, await settingsState(request, scheduling)),
  );

  app.patch(
    "/v1/settings/business",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(businessSchema, request.body);
      assertTimezone(body.timezone);
      const tenant = currentTenantContext(request);
      const prisma = getPrisma();
      const current = await prisma.businessProfile.findUnique({
        where: { tenantId: tenant.tenantId },
      });
      const { modalities, address } = resolveBusinessProfileFields(
        current,
        body,
      );
      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenant.tenantId },
          data: { name: body.name },
        }),
        prisma.businessProfile.upsert({
          where: { tenantId: tenant.tenantId },
          create: {
            tenantId: tenant.tenantId,
            businessName: body.name,
            category: body.category,
            timezone: body.timezone,
            modalities,
            address,
          },
          update: {
            businessName: body.name,
            category: body.category,
            timezone: body.timezone,
            modalities,
            address,
            businessContextVersion: { increment: 1 },
          },
        }),
      ]);
      const projected = await syncAi(request, ai);
      return dataResponse(
        request,
        await settingsState(request, scheduling, projected),
      );
    },
  );

  app.patch(
    "/v1/settings/ai",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBodyWithAiConversationStyle(aiSchema, request.body);
      if (body.enabled) {
        const calendar = await scheduling.calendar(internalContext(request));
        if (!calendar.capabilities.aiActivationReady) {
          throw new AppError(
            "CONFLICT",
            "At least one operational service is required to activate the AI.",
            409,
          );
        }
      }
      const tenant = currentTenantContext(request);
      await getPrisma().aiSettings.upsert({
        where: { tenantId: tenant.tenantId },
        create: {
          tenantId: tenant.tenantId,
          enabled: body.enabled,
          tone: body.tone,
        },
        update: {
          enabled: body.enabled,
          tone: body.tone,
        },
      });
      const projected = await syncAi(request, ai);
      return dataResponse(
        request,
        await settingsState(request, scheduling, projected),
      );
    },
  );

  app.patch(
    "/v1/settings/availability",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(
        request,
        await scheduling.updateAvailabilitySettings(
          internalContext(request),
          parseBody(availabilitySchema, request.body),
        ),
      ),
  );
}

async function settingsState(
  request: FastifyRequest,
  scheduling: SchedulingClient,
  /**
   * A projecao tentada **nesta requisicao** chegou na IA?
   *
   * `undefined` e "esta requisicao nao projetou nada" — leitura pura, em que
   * o estado vem so da comparacao entre as versoes gravadas. `false` e a
   * tentativa que falhou agora: a resposta continua sendo sucesso, porque o
   * dado do BFF foi gravado, mas o estado de projecao e o real.
   */
  projectedNow?: boolean,
) {
  const tenant = currentTenantContext(request);
  const context = internalContext(request);
  const [profile, aiSettings, calendar] = await Promise.all([
    getPrisma().businessProfile.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    getPrisma().aiSettings.findUnique({
      where: { tenantId: tenant.tenantId },
    }),
    scheduling.calendar(context),
  ]);
  const availability =
    calendar.source === "ATENDLY"
      ? await scheduling.availabilitySettings(context)
      : null;
  return {
    business: profile
      ? {
          name: profile.businessName,
          category: profile.category,
          timezone: profile.timezone,
          language: profile.language,
          currency: profile.currency,
          modalities: profile.modalities,
          address: profile.address,
          contextVersion: profile.businessContextVersion,
          contextProjectedVersion: profile.businessContextProjectedVersion,
          contextProjectionStatus:
            projectedNow === false
              ? "PENDING"
              : businessContextProjectionState(profile),
        }
      : null,
    ai: {
      enabled: Boolean(aiSettings?.enabled),
      tone: normalizeStoredAiConversationStyle(aiSettings?.tone),
    },
    calendar: {
      ...calendar,
      source:
        calendar.source === null
          ? null
          : calendar.source === "ATENDLY"
            ? "ATENDLY"
            : "EXTERNAL",
    },
    availability,
  };
}

/**
 * Falha de projecao nunca vira erro da requisicao: o dado do negocio ja foi
 * gravado antes desta chamada, e o estado projetado/pendente exposto em
 * `settingsState` e o unico aviso — sem retentativa automatica, sem 500
 * (Goal018/WU-03).
 *
 * Devolve se a projecao **desta** chamada chegou na IA (Goal019 §7, residuo
 * nominal do review018). Sem isso a resposta de `PATCH /v1/settings/ai`
 * afirmava `PROJECTED` mesmo com a projecao falhada: o contexto de negocio
 * nao muda de versao nesse caminho, entao a comparacao entre versoes gravadas
 * continuava batendo e escondia a falha que acabara de acontecer.
 */
async function syncAi(
  request: FastifyRequest,
  ai: AiOrchestratorClient,
): Promise<boolean> {
  const tenant = currentTenantContext(request);
  const [settings, businessProfile] = await Promise.all([
    getPrisma().aiSettings.upsert({
      where: { tenantId: tenant.tenantId },
      create: { tenantId: tenant.tenantId, enabled: false },
      update: {},
    }),
    getPrisma().businessProfile.upsert({
      where: { tenantId: tenant.tenantId },
      create: { tenantId: tenant.tenantId },
      update: {},
    }),
  ]);
  try {
    await ai.updateTenantConfig(internalContext(request), {
      enabled: settings.enabled,
      tone: resolveAiConversationStyle(settings.tone),
      businessContext: businessContextPayload(businessProfile),
    });
    if (
      businessProfile.businessContextProjectedVersion !==
      businessProfile.businessContextVersion
    ) {
      await getPrisma().businessProfile.update({
        where: { tenantId: tenant.tenantId },
        data: {
          businessContextProjectedVersion:
            businessProfile.businessContextVersion,
        },
      });
    }
    return true;
  } catch (error) {
    request.log.warn(
      { err: error, tenantId: tenant.tenantId },
      "AI tenant config projection failed; business context stays pending.",
    );
    return false;
  }
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid IANA timezone.", 400);
  }
}
