import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser, requireAuth } from "../lib/auth.js";
import { businessSettingsDto, settingsDto } from "../lib/dto.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { getPrisma } from "../lib/prisma.js";

const businessSettingsSchema = z.object({
  businessName: z.string().trim().max(160).optional(),
  professionalName: z.string().trim().max(160).optional().nullable(),
  businessAddress: z.string().trim().max(300).optional().nullable(),
  timezone: z.string().trim().max(80).optional(),
  maxSlotsToOffer: z.number().int().min(1).max(10).optional(),
  availabilityDays: z.number().int().min(1).max(90).optional(),
  slotStepMinutes: z.number().int().min(5).max(240).optional(),
  appointmentLookupDays: z.number().int().min(1).max(365).optional(),
  delayPolicy: z.string().trim().max(2000).optional().nullable(),
  cancellationPolicy: z.string().trim().max(2000).optional().nullable(),
  depositPolicy: z.string().trim().max(2000).optional().nullable()
});

const virtualAttendantSchema = z.object({
  aiEnabled: z.boolean().optional(),
  identityMode: z.enum(["PROFESSIONAL", "SEPARATE_ASSISTANT"]).optional(),
  assistantName: z.string().trim().max(120).optional().nullable(),
  assistantSex: z.enum(["FEMALE", "MALE"]).optional().nullable(),
  professionalSex: z.enum(["FEMALE", "MALE"]).optional(),
  personaType: z.enum(["CORPORATE", "WARM", "CUSTOM"]).optional().nullable(),
  customInstructions: z.string().trim().max(8000).optional().nullable(),
  activationMode: z.enum(["ALWAYS", "AWAY_FROM_WHATSAPP"]).optional(),
  awayTimeoutMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  awayScope: z.enum(["GLOBAL", "CONVERSATION"]).optional().nullable(),
  virtualAttendantOnboardingCompleted: z.boolean().optional()
});

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (
      request.url.startsWith("/business-settings") ||
      request.url.startsWith("/virtual-attendant") ||
      request.url.startsWith("/automation/ai")
    ) {
      await requireAuth(request);
    }
  });

  app.get("/business-settings", async (request) => {
    const user = currentUser(request);
    const settings = await getPrisma().businessSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {}
    });
    return dataResponse(request, { businessSettings: businessSettingsDto(settings) });
  });

  app.patch("/business-settings", async (request) => {
    const user = currentUser(request);
    const data = parseBody(businessSettingsSchema, request.body);
    const prisma = getPrisma();
    const settings = await prisma.businessSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data
    });

    if (typeof data.businessName === "string") {
      await prisma.userProfile.updateMany({
        where: { userId: user.id },
        data: {
          businessName: data.businessName
        }
      });
    }

    return dataResponse(request, { businessSettings: businessSettingsDto(settings) });
  });

  app.get("/virtual-attendant/settings", async (request) => {
    const user = currentUser(request);
    const settings = await getPrisma().userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, aiEnabled: false },
      update: {}
    });
    return dataResponse(request, { settings: settingsDto(settings) });
  });

  app.patch("/virtual-attendant/settings", async (request) => {
    const user = currentUser(request);
    const data = parseBody(virtualAttendantSchema, request.body);
    const settings = await getPrisma().userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, aiEnabled: data.aiEnabled ?? false, ...data },
      update: data
    });
    return dataResponse(request, { settings: settingsDto(settings) });
  });

  app.get("/virtual-attendant/prompt-preview", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const [businessSettings, settings] = await Promise.all([
      prisma.businessSettings.findUnique({ where: { userId: user.id } }),
      prisma.userSettings.findUnique({ where: { userId: user.id } })
    ]);

    return dataResponse(request, {
      preview: buildPromptPreview({
        businessSettings: businessSettings ? businessSettingsDto(businessSettings) : null,
        settings: settingsDto(settings)
      })
    });
  });

  app.get("/automation/ai", async (request) => {
    const user = currentUser(request);
    const settings = await getPrisma().userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, aiEnabled: false },
      update: {}
    });
    return dataResponse(request, { aiEnabled: settings.aiEnabled, settings: settingsDto(settings) });
  });

  app.patch("/automation/ai", async (request) => {
    const user = currentUser(request);
    const data = parseBody(z.object({ aiEnabled: z.boolean() }), request.body);
    const settings = await getPrisma().userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, aiEnabled: data.aiEnabled },
      update: { aiEnabled: data.aiEnabled }
    });
    return dataResponse(request, { settings: settingsDto(settings) });
  });
}

function buildPromptPreview(input: {
  businessSettings: ReturnType<typeof businessSettingsDto> | null;
  settings: ReturnType<typeof settingsDto>;
}) {
  const persona = input.settings.personaType ?? "Nao definida";
  const activation =
    input.settings.activationMode === "AWAY_FROM_WHATSAPP"
      ? `Somente ausente por ${input.settings.awayTimeoutMinutes ?? "?"} minuto(s).`
      : "Sempre que a IA estiver ativa.";

  return {
    blocks: [
      {
        label: "Negocio",
        value: input.businessSettings?.businessName || "Nao configurado"
      },
      {
        label: "Identidade",
        value:
          input.settings.identityMode === "SEPARATE_ASSISTANT"
            ? `Atendente ${input.settings.assistantName || "sem nome definido"}`
            : "Responder como a profissional"
      },
      {
        label: "Persona",
        value: persona
      },
      {
        label: "Ativacao",
        value: activation
      }
    ]
  };
}
