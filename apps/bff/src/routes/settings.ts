import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { businessSettingsDto, instanceDto, settingsDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { whatsappPhoneCandidates } from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import { getEvolutionStatus } from "../services/evolution-go.js";
import { dispatchToApi } from "../services/internal-api.js";
import { ensureCustomPersonaGeneration, importPersonaConversations, listPersonaImportsForUser } from "../services/persona.js";

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

const personaImportSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        size: z.number().int().nonnegative(),
        text: z.string()
      })
    )
    .min(1),
  participantName: z.string().trim().optional().nullable()
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

  app.post("/virtual-attendant/persona/import", async (request) => {
    const user = currentUser(request);
    const data = parseBody(personaImportSchema, request.body);
    const profile = await getPrisma().userProfile.findUnique({
      where: { userId: user.id },
      select: { businessName: true, fullName: true }
    });
    const result = await importPersonaConversations({
      userId: user.id,
      files: data.files,
      participantName: data.participantName,
      businessName: profile?.businessName,
      professionalName: profile?.fullName
    });
    return dataResponse(request, result);
  });

  app.get("/virtual-attendant/persona/imports", async (request) => {
    const user = currentUser(request);
    const imports = await listPersonaImportsForUser(user.id);
    return dataResponse(request, { imports });
  });

  app.post("/virtual-attendant/persona/generate", async (request) => {
    const user = currentUser(request);
    const settings = await ensureCustomPersonaGeneration(user.id);
    return dataResponse(request, { settings });
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
    const prisma = getPrisma();
    let automationSync: { skipped: boolean; resumed: number } | null = null;

    if (data.aiEnabled) {
      automationSync = await validateAiCanBeEnabledAndResumeHandoffs(user.id, request.id);
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, aiEnabled: data.aiEnabled },
      update: { aiEnabled: data.aiEnabled }
    });
    return dataResponse(request, { settings: settingsDto(settings), automationSync });
  });
}

async function validateAiCanBeEnabledAndResumeHandoffs(userId: string, requestId: string) {
  const prisma = getPrisma();
  const virtualSettings = settingsDto(
    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, aiEnabled: false },
      update: {}
    })
  );

  if (!virtualSettings.canEnable) {
    throw new AppError("CONFLICT", virtualSettings.readinessIssues[0] ?? "Complete virtual attendant setup first.", 409, {
      settings: virtualSettings,
      readinessIssues: virtualSettings.readinessIssues
    });
  }

  const businessSettings = await prisma.businessSettings.upsert({
    where: { userId },
    create: { userId },
    update: {}
  });
  const businessSettingsData = businessSettingsDto(businessSettings);
  if (!businessSettingsData.configured) {
    throw new AppError("CONFLICT", "Complete business settings before enabling AI.", 409, {
      businessSettings: businessSettingsData
    });
  }

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { userId }
  });

  if (!instance) {
    throw new AppError("CONFLICT", "Connect WhatsApp before enabling AI.", 409);
  }

  const status = await getEvolutionStatus(instance.evolutionInstanceToken).catch(() => null);
  const syncedInstance = await prisma.whatsAppInstance.update({
    where: { id: instance.id },
    data: {
      status: status?.connected ? "CONNECTED" : "DISCONNECTED",
      phoneNumber: status?.phoneNumber ?? instance.phoneNumber,
      connectedAt: status?.connected && !instance.connectedAt ? new Date() : instance.connectedAt
    }
  });

  if (syncedInstance.status !== "CONNECTED") {
    throw new AppError("CONFLICT", "Connect WhatsApp before enabling AI.", 409, {
      whatsappInstance: instanceDto(syncedInstance),
      settings: virtualSettings
    });
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId },
    select: { contactJid: true }
  });
  const phones = [...new Set(conversations.flatMap((conversation) => whatsappPhoneCandidates(conversation.contactJid)))];
  return resumeBotHandoffsInApi({ userId, requestId, phones });
}

async function resumeBotHandoffsInApi(input: {
  userId: string;
  requestId: string;
  phones: string[];
}): Promise<{ skipped: boolean; resumed: number }> {
  const phones = [...new Set(input.phones)].filter(Boolean);
  if (!env.INTERNAL_SERVICE_TOKEN || phones.length === 0) {
    return { skipped: true, resumed: 0 };
  }

  const result = await dispatchToApi("/internal/bot/resume", {
    userId: input.userId,
    requestId: input.requestId,
    body: { phones }
  }).catch(() => null);

  if (!result) {
    return { skipped: true, resumed: 0 };
  }

  return {
    skipped: false,
    resumed: isResumeResult(result) ? (result.resumed ?? phones.length) : phones.length
  };
}

function isResumeResult(value: unknown): value is { resumed?: number } {
  return Boolean(value && typeof value === "object" && "resumed" in value);
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
