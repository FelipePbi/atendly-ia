import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import {
  type AiConversationStyle,
  aiConversationStyleSchema,
  normalizeStoredAiConversationStyle,
  parseBodyWithAiConversationStyle,
} from "../../lib/ai-conversation-style.js";
import {
  businessAddressSchema,
  businessContextPayload,
  businessContextProjectionState,
  businessModalitySchema,
  resolveBusinessProfileFields,
} from "../../lib/business-profile.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const sourceSchema = z.enum(["ATENDLY", "EXTERNAL"]);
// Os tres estilos do produto e os dois valores antigos como alias declarado
// (Goal011); a resposta sempre devolve o vocabulario novo.
const toneSchema = aiConversationStyleSchema;
const patchSchema = z
  .object({
    business: z
      .object({
        name: z.string().trim().min(2).max(160),
        category: z.string().trim().min(1).max(120),
        timezone: z.string().trim().min(1).max(100),
        // Ausente preserva o que esta gravado; nunca grava conjunto vazio so
        // por omissao (Goal018/WU-01).
        modalities: z.array(businessModalitySchema).optional(),
        address: businessAddressSchema.optional(),
      })
      .optional(),
    calendar: z
      .object({
        source: sourceSchema,
        timezone: z.string().trim().min(1).max(100),
      })
      .optional(),
    service: z
      .object({
        id: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).max(200),
        durationMinutes: z.number().int().positive().max(1_440),
        priceType: z.enum(["FIXED", "ON_REQUEST"]),
        price: z.number().nonnegative().nullable().optional(),
        active: z.boolean().default(true),
      })
      .optional(),
    availability: z
      .object({
        timezone: z.string().trim().min(1).max(100),
        rules: z.array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            active: z.boolean().default(true),
          }),
        ),
      })
      .optional(),
    ai: z.object({ tone: toneSchema }).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one onboarding section is required.",
  });

export async function registerV1OnboardingRoutes(
  app: FastifyInstance,
): Promise<void> {
  const scheduling = new SchedulingClient();
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/onboarding",
    { preHandler: requireTenantContext },
    async (request) =>
      dataResponse(request, await onboardingState(request, scheduling)),
  );

  app.patch(
    "/v1/onboarding",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBodyWithAiConversationStyle(patchSchema, request.body);
      const context = internalContext(request);
      const tenant = currentTenantContext(request);
      const prisma = getPrisma();

      if (body.business) {
        assertTimezone(body.business.timezone);
        const currentProfile = await prisma.businessProfile.findUnique({
          where: { tenantId: tenant.tenantId },
        });
        const { modalities, address } = resolveBusinessProfileFields(
          currentProfile,
          body.business,
        );
        await prisma.$transaction([
          prisma.tenant.update({
            where: { id: tenant.tenantId },
            data: { name: body.business.name },
          }),
          prisma.businessProfile.upsert({
            where: { tenantId: tenant.tenantId },
            create: {
              tenantId: tenant.tenantId,
              businessName: body.business.name,
              category: body.business.category,
              timezone: body.business.timezone,
              modalities,
              address,
            },
            update: {
              businessName: body.business.name,
              category: body.business.category,
              timezone: body.business.timezone,
              modalities,
              address,
              businessContextVersion: { increment: 1 },
            },
          }),
        ]);
      }

      if (body.calendar) {
        await scheduling.configureCalendar(context, {
          source: internalSource(body.calendar.source),
          timezone: body.calendar.timezone,
        });
      }

      if (body.service) {
        const { id, ...service } = body.service;
        if (id) await scheduling.updateService(context, id, service);
        else await scheduling.createService(context, service);
      }

      if (body.availability) {
        await scheduling.updateAvailabilitySettings(context, body.availability);
      }

      if (body.ai) {
        const aiSettings = await prisma.aiSettings.upsert({
          where: { tenantId: tenant.tenantId },
          create: {
            tenantId: tenant.tenantId,
            enabled: false,
            tone: body.ai.tone,
          },
          update: {
            tone: body.ai.tone,
          },
        });
        await syncAiConfig(request, ai, aiSettings.enabled, body.ai.tone);
      }

      return dataResponse(request, await onboardingState(request, scheduling));
    },
  );

  app.post(
    "/v1/onboarding/complete",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const context = internalContext(request);
      const prisma = getPrisma();
      const [profile, settings, calendar] = await Promise.all([
        prisma.businessProfile.findUnique({
          where: { tenantId: tenant.tenantId },
        }),
        prisma.aiSettings.findUnique({ where: { tenantId: tenant.tenantId } }),
        scheduling.calendar(context),
      ]);
      const issues: string[] = [];
      if (!profile?.businessName.trim() || !profile.category?.trim()) {
        issues.push("BUSINESS_PROFILE_INCOMPLETE");
      }
      if (!profile?.modalities.length) {
        issues.push("BUSINESS_MODALITY_NOT_SELECTED");
      }
      if (profile?.modalities.includes("ON_SITE") && !profile.address?.trim()) {
        issues.push("BUSINESS_ADDRESS_REQUIRED");
      }
      if (!calendar.source) issues.push("CALENDAR_NOT_SELECTED");
      if (!normalizeStoredAiConversationStyle(settings?.tone)) {
        issues.push("AI_TONE_NOT_SELECTED");
      }

      if (calendar.source) {
        const services = await scheduling.listServices(context);
        if (!services.some((service) => service.active)) {
          issues.push("ACTIVE_SERVICE_REQUIRED");
        }
        if (calendar.source === "ATENDLY") {
          const availability = await scheduling.availabilitySettings(context);
          if (!availability.rules.some((rule) => rule.active)) {
            issues.push("AVAILABILITY_REQUIRED");
          }
        } else if (calendar.integration?.status !== "CONNECTED") {
          issues.push("CALENDAR_INTEGRATION_NOT_CONNECTED");
        }
      }

      if (issues.length > 0) {
        throw new AppError(
          "CONFLICT",
          "Onboarding requirements are not complete.",
          409,
          { issues },
        );
      }

      await prisma.businessProfile.update({
        where: { tenantId: tenant.tenantId },
        data: {
          onboardingCompletedAt: profile?.onboardingCompletedAt ?? new Date(),
        },
      });
      return dataResponse(request, await onboardingState(request, scheduling));
    },
  );
}

async function onboardingState(
  request: FastifyRequest,
  scheduling: SchedulingClient,
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
    calendar.source === "ATENDLY"
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
      source: publicSource(calendar.source),
      timezone: calendar.timezone,
      integration: calendar.integration,
    },
    ai: {
      tone: normalizeStoredAiConversationStyle(settings?.tone),
    },
    service: services.find((service) => service.active) ?? null,
    availability,
    whatsapp: instance
      ? { status: instance.status, phoneNumber: instance.phoneNumber }
      : null,
    completed: Boolean(profile?.onboardingCompletedAt),
    completedAt: profile?.onboardingCompletedAt?.toISOString() ?? null,
  };
}

/**
 * Falha de projecao nunca vira erro da requisicao: o dado do negocio ja foi
 * gravado antes desta chamada, e o estado projetado/pendente exposto em
 * `onboardingState` e o unico aviso — sem retentativa automatica, sem 500
 * (Goal018/WU-03).
 */
async function syncAiConfig(
  request: FastifyRequest,
  ai: AiOrchestratorClient,
  enabled: boolean,
  tone: AiConversationStyle,
): Promise<void> {
  const tenant = currentTenantContext(request);
  const businessProfile = await getPrisma().businessProfile.upsert({
    where: { tenantId: tenant.tenantId },
    create: { tenantId: tenant.tenantId },
    update: {},
  });
  try {
    await ai.updateTenantConfig(internalContext(request), {
      enabled,
      tone,
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
  } catch (error) {
    request.log.warn(
      { err: error, tenantId: tenant.tenantId },
      "AI tenant config projection failed; business context stays pending.",
    );
  }
}

function internalSource(source: "ATENDLY" | "EXTERNAL") {
  return source === "ATENDLY"
    ? ("ATENDLY" as const)
    : ("MINHA_AGENDA" as const);
}

function publicSource(source: "ATENDLY" | "MINHA_AGENDA" | null) {
  if (source === null) return null;
  return source === "ATENDLY" ? ("ATENDLY" as const) : ("EXTERNAL" as const);
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid IANA timezone.", 400);
  }
}
