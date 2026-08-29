import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
import { businessSettingsDto } from "../../lib/dto.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const sourceSchema = z.enum(["ATENDLY", "EXTERNAL"]);
const toneSchema = z.enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"]);
const patchSchema = z
  .object({
    business: z
      .object({
        name: z.string().trim().min(2).max(160),
        category: z.string().trim().min(1).max(120),
        timezone: z.string().trim().min(1).max(100),
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
  const evolution = new EvolutionClient();

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
      const body = parseBody(patchSchema, request.body);
      const context = internalContext(request);
      const tenant = currentTenantContext(request);
      const prisma = getPrisma();

      if (body.business) {
        assertTimezone(body.business.timezone);
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
            },
            update: {
              businessName: body.business.name,
              category: body.business.category,
              timezone: body.business.timezone,
            },
          }),
          prisma.businessSettings.upsert({
            where: { userId: tenant.userId },
            create: {
              userId: tenant.userId,
              businessName: body.business.name,
              timezone: body.business.timezone,
            },
            update: {
              businessName: body.business.name,
              timezone: body.business.timezone,
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
        const userSettings = await prisma.userSettings.upsert({
          where: { userId: tenant.userId },
          create: {
            userId: tenant.userId,
            aiEnabled: false,
            personaType:
              body.ai.tone === "PROFESSIONAL_OBJECTIVE" ? "CORPORATE" : "WARM",
            virtualAttendantOnboardingCompleted: true,
          },
          update: {
            personaType:
              body.ai.tone === "PROFESSIONAL_OBJECTIVE" ? "CORPORATE" : "WARM",
            virtualAttendantOnboardingCompleted: true,
          },
        });
        await syncAiConfig(request, ai, userSettings.aiEnabled, body.ai.tone);
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
      const [profile, settings, instance, calendar] = await Promise.all([
        prisma.businessProfile.findUnique({
          where: { tenantId: tenant.tenantId },
        }),
        prisma.userSettings.findUnique({ where: { userId: tenant.userId } }),
        prisma.whatsAppInstance.findUnique({
          where: { userId: tenant.userId },
        }),
        scheduling.calendar(context),
      ]);
      const issues: string[] = [];
      if (!profile?.businessName.trim() || !profile.category?.trim()) {
        issues.push("BUSINESS_PROFILE_INCOMPLETE");
      }
      if (!calendar.source) issues.push("CALENDAR_NOT_SELECTED");
      if (
        settings?.personaType !== "CORPORATE" &&
        settings?.personaType !== "WARM"
      ) {
        issues.push("AI_TONE_NOT_SELECTED");
      }
      if (!instance) issues.push("WHATSAPP_NOT_CONFIGURED");

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

      if (instance) {
        const status = await evolution.getStatus(
          instance.evolutionInstanceToken,
          request.id,
        );
        if (!status.connected) issues.push("WHATSAPP_NOT_CONNECTED");
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
    getPrisma().userSettings.findUnique({ where: { userId: tenant.userId } }),
    getPrisma().whatsAppInstance.findUnique({
      where: { userId: tenant.userId },
    }),
    scheduling.calendar(context),
  ]);
  return {
    business: profile
      ? {
          name: profile.businessName,
          category: profile.category,
          timezone: profile.timezone,
        }
      : null,
    calendar: {
      source: publicSource(calendar.source),
      timezone: calendar.timezone,
      integration: calendar.integration,
    },
    ai: {
      tone:
        settings?.personaType === "CORPORATE"
          ? "PROFESSIONAL_OBJECTIVE"
          : settings?.personaType === "WARM"
            ? "LIGHT_CLOSE"
            : null,
    },
    whatsapp: instance
      ? { status: instance.status, phoneNumber: instance.phoneNumber }
      : null,
    completed: Boolean(profile?.onboardingCompletedAt),
    completedAt: profile?.onboardingCompletedAt?.toISOString() ?? null,
  };
}

async function syncAiConfig(
  request: FastifyRequest,
  ai: AiOrchestratorClient,
  enabled: boolean,
  tone: "PROFESSIONAL_OBJECTIVE" | "LIGHT_CLOSE",
): Promise<void> {
  const tenant = currentTenantContext(request);
  const businessSettings = await getPrisma().businessSettings.upsert({
    where: { userId: tenant.userId },
    create: { userId: tenant.userId },
    update: {},
  });
  await ai.updateTenantConfig(internalContext(request), {
    enabled,
    tone,
    businessSettings: businessSettingsDto(businessSettings),
  });
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
