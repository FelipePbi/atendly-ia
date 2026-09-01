import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { SchedulingClient } from "../../clients/scheduling/index.js";
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
});
const aiSchema = z.object({
  enabled: z.boolean(),
  tone: z.enum(["PROFESSIONAL_OBJECTIVE", "LIGHT_CLOSE"]),
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
          },
          update: {
            businessName: body.name,
            category: body.category,
            timezone: body.timezone,
          },
        }),
      ]);
      await syncAi(request, ai);
      return dataResponse(request, await settingsState(request, scheduling));
    },
  );

  app.patch(
    "/v1/settings/ai",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(aiSchema, request.body);
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
      await syncAi(request, ai);
      return dataResponse(request, await settingsState(request, scheduling));
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
        }
      : null,
    ai: {
      enabled: Boolean(aiSettings?.enabled),
      tone: aiSettings?.tone ?? null,
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

async function syncAi(
  request: FastifyRequest,
  ai: AiOrchestratorClient,
): Promise<void> {
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
  await ai.updateTenantConfig(internalContext(request), {
    enabled: settings.enabled,
    tone: settings.tone ?? "LIGHT_CLOSE",
    businessContext: {
      businessName: businessProfile.businessName,
      timezone: businessProfile.timezone,
    },
  });
}

function assertTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid IANA timezone.", 400);
  }
}
