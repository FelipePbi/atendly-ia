import crypto from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { currentUser } from "../lib/auth.js";
import { businessSettingsDto, instanceDto, settingsDto } from "../lib/dto.js";
import { AppError } from "../lib/errors.js";
import { dataResponse, parseBody } from "../lib/http.js";
import { normalizeBrazilianWhatsappPhone } from "../lib/phone.js";
import { getPrisma } from "../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../lib/tenant-context.js";
import {
  syncAiTenantConfig,
  syncEvolutionChannelToAiOrchestrator,
} from "../services/ai-orchestrator.js";
import {
  buildWebhookUrl,
  connectEvolutionInstance,
  createEvolutionInstance,
  deleteEvolutionInstance,
  getEvolutionContacts,
  getEvolutionQr,
  getEvolutionStatus,
  logoutEvolutionInstance,
  pairEvolutionInstance,
} from "../services/evolution-go.js";

const pairingSchema = z.object({
  phone: z.string().trim().min(10).max(32),
});

const PAIRING_CODE_TTL_MS = 160_000;

export async function registerWhatsAppRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/whatsapp")) {
      await requireTenantContext(request);
    }
  });

  app.get("/whatsapp/status", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    const status = await withExistingEvolutionInstance(() =>
      getEvolutionStatus(instance.evolutionInstanceToken),
    );
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: status.connected ? "CONNECTED" : instance.status,
        phoneNumber: status.phoneNumber ?? instance.phoneNumber,
        connectedAt:
          status.connected && !instance.connectedAt
            ? new Date()
            : instance.connectedAt,
      },
    });

    return dataResponse(request, {
      status,
      whatsappInstance: instanceDto(updated),
    });
  });

  app.post("/whatsapp/instance", async (request, reply) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        profile: true,
        whatsappInstance: true,
      },
    });

    if (!record) {
      throw new AppError("NOT_FOUND", "User not found.", 404);
    }

    if (record.whatsappInstance) {
      let upstreamMissing = false;
      try {
        await getEvolutionStatus(
          record.whatsappInstance.evolutionInstanceToken,
        );
      } catch (error) {
        upstreamMissing = isMissingEvolutionInstanceError(error);
      }

      if (!upstreamMissing) {
        await syncChannelConnection(request, record.whatsappInstance);
        return dataResponse(request, {
          whatsappInstance: instanceDto(record.whatsappInstance),
        });
      }
    }

    const instanceName = buildInstanceName(
      record.profile?.fullName ?? record.email,
      record.profile?.businessName ?? "atendly",
    );
    const instanceToken = `wa_${crypto.randomBytes(32).toString("hex")}`;
    const evolution = await createEvolutionInstance({
      name: instanceName,
      token: instanceToken,
      webhookUrl: buildWebhookUrl(),
    });

    const instanceData = {
      evolutionInstanceId:
        evolution.data?.id ?? evolution.data?.name ?? instanceName,
      evolutionInstanceName: evolution.data?.name ?? instanceName,
      evolutionInstanceToken: evolution.data?.token ?? instanceToken,
      status: "CREATED" as const,
      qrcode: null,
      connectedAt: null,
    };
    const created = record.whatsappInstance
      ? await prisma.whatsAppInstance.update({
          where: { id: record.whatsappInstance.id },
          data: instanceData,
        })
      : await prisma.whatsAppInstance.create({
          data: {
            userId: user.id,
            ...instanceData,
          },
        });

    await syncChannelConnection(request, created);

    reply.code(201);
    return dataResponse(request, { whatsappInstance: instanceDto(created) });
  });

  app.delete("/whatsapp/instance", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return dataResponse(request, { whatsappInstance: null });
    }

    await deleteEvolutionInstance(
      instance.evolutionInstanceId ?? instance.evolutionInstanceName,
    ).catch(() => null);
    await prisma.whatsAppInstance.delete({
      where: { id: instance.id },
    });

    return dataResponse(request, { whatsappInstance: null });
  });

  app.post("/whatsapp/connect", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      throw new AppError(
        "NOT_FOUND",
        "Create a WhatsApp instance before connecting.",
        404,
      );
    }

    await syncChannelConnection(request, instance);
    await withExistingEvolutionInstance(() =>
      connectEvolutionInstance(
        instance.evolutionInstanceToken,
        buildWebhookUrl(),
      ),
    );
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "CONNECTING",
      },
    });

    return dataResponse(request, { whatsappInstance: instanceDto(updated) });
  });

  app.get("/whatsapp/qr", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    const qr = await withExistingEvolutionInstance(() =>
      getEvolutionQr(instance.evolutionInstanceToken),
    );
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        qrcode: qr.qrcode || instance.qrcode,
        status: qr.qrcode ? "WAITING_QR" : instance.status,
      },
    });

    return dataResponse(request, {
      qrcode: qr.qrcode,
      code: qr.code,
      pending: !qr.qrcode,
      whatsappInstance: instanceDto(updated),
    });
  });

  app.post(
    "/whatsapp/pair",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minutes",
        },
      },
    },
    async (request) => {
      const user = currentUser(request);
      const body = parseBody(pairingSchema, request.body);
      const phone = normalizeBrazilianWhatsappPhone(body.phone);
      if (!phone) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Informe um telefone brasileiro valido com DDD.",
          400,
        );
      }

      const prisma = getPrisma();
      const instance = await prisma.whatsAppInstance.findUnique({
        where: { userId: user.id },
      });
      if (!instance) {
        throw new AppError(
          "NOT_FOUND",
          "Create a WhatsApp instance before pairing.",
          404,
        );
      }

      await prisma.userProfile.updateMany({
        where: { userId: user.id },
        data: {
          whatsappPhoneRaw: body.phone,
          whatsappPhoneNormalized: phone,
        },
      });

      await syncChannelConnection(request, instance);
      await withExistingEvolutionInstance(() =>
        connectEvolutionInstance(
          instance.evolutionInstanceToken,
          buildWebhookUrl(),
        ),
      );
      const status = await withExistingEvolutionInstance(() =>
        getEvolutionStatus(instance.evolutionInstanceToken),
      );

      if (status.connected) {
        const connected = await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            status: "CONNECTED",
            phoneNumber: status.phoneNumber ?? instance.phoneNumber,
            qrcode: null,
            connectedAt: instance.connectedAt ?? new Date(),
          },
        });
        return dataResponse(request, {
          pairingCode: null,
          expiresAt: null,
          connected: true,
          whatsappInstance: instanceDto(connected),
        });
      }

      let pair: Awaited<ReturnType<typeof pairEvolutionInstance>>;
      try {
        pair = await withExistingEvolutionInstance(() =>
          pairEvolutionInstance(instance.evolutionInstanceToken, phone),
        );
      } catch (error) {
        if (error instanceof AppError && error.code === "NOT_FOUND")
          throw error;
        throw new AppError(
          "UPSTREAM_ERROR",
          "Não foi possível gerar o código de conexão.",
          502,
        );
      }
      const updated = await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { status: "CONNECTING" },
      });

      return dataResponse(request, {
        pairingCode: pair.pairingCode,
        expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString(),
        connected: false,
        whatsappInstance: instanceDto(updated),
      });
    },
  );

  app.post("/whatsapp/logout", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      return dataResponse(request, { whatsappInstance: null });
    }

    await logoutEvolutionInstance(instance.evolutionInstanceToken).catch(
      () => null,
    );
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status: "LOGGED_OUT",
        qrcode: null,
        connectedAt: null,
      },
    });

    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    return dataResponse(request, {
      whatsappInstance: instanceDto(updated),
      settings: settingsDto(settings),
    });
  });

  app.get("/whatsapp/contacts", async (request) => {
    const user = currentUser(request);
    const prisma = getPrisma();
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { userId: user.id },
    });

    if (!instance) {
      throw new AppError("NOT_FOUND", "WhatsApp instance not found.", 404);
    }

    if (instance.status !== "CONNECTED") {
      throw new AppError(
        "CONFLICT",
        "Connect WhatsApp before loading contacts.",
        409,
      );
    }

    const [contacts, ignoredContacts] = await Promise.all([
      getEvolutionContacts(instance.evolutionInstanceToken),
      prisma.ignoredContact.findMany({
        where: {
          userId: user.id,
          instanceId: instance.id,
          isActive: true,
        },
        select: { jid: true },
      }),
    ]);
    const ignoredJids = new Set(ignoredContacts.map((contact) => contact.jid));

    return dataResponse(request, {
      contacts: contacts.map((contact) => ({
        ...contact,
        displayName:
          contact.fullName ||
          contact.pushName ||
          contact.firstName ||
          contact.businessName ||
          contact.phoneNumber ||
          contact.jid,
        alreadyIgnored: ignoredJids.has(contact.jid),
      })),
    });
  });
}

async function syncChannelConnection(
  request: FastifyRequest,
  instance: {
    evolutionInstanceId: string | null;
    evolutionInstanceName: string;
  },
): Promise<void> {
  const tenant = currentTenantContext(request);
  await syncEvolutionChannelToAiOrchestrator({
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    requestId: request.id,
    externalInstanceId:
      instance.evolutionInstanceId ?? instance.evolutionInstanceName,
    displayName: instance.evolutionInstanceName,
  });

  const prisma = getPrisma();
  const [businessSettings, virtualSettings] = await Promise.all([
    prisma.businessSettings.upsert({
      where: { userId: tenant.userId },
      create: { userId: tenant.userId },
      update: {},
    }),
    prisma.userSettings.upsert({
      where: { userId: tenant.userId },
      create: { userId: tenant.userId, aiEnabled: false },
      update: {},
    }),
  ]);
  const virtualSettingsDto = settingsDto(virtualSettings);
  await syncAiTenantConfig({
    tenantId: tenant.tenantId,
    userId: tenant.userId,
    requestId: request.id,
    enabled: virtualSettingsDto.aiEnabled,
    tone:
      virtualSettingsDto.personaType === "CORPORATE"
        ? "PROFESSIONAL_OBJECTIVE"
        : "LIGHT_CLOSE",
    businessSettings: businessSettingsDto(businessSettings),
  });
}

function buildInstanceName(fullName: string, businessName: string): string {
  const personSlug = slugify(fullName) || "usuario";
  const businessSlug = slugify(businessName) || "negocio";
  const hash = crypto.randomBytes(4).toString("hex");
  return `${personSlug}_${businessSlug}_${hash}`;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48)
    .replace(/^_|_$/g, "");
}

async function withExistingEvolutionInstance<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingEvolutionInstanceError(error)) {
      throw new AppError(
        "NOT_FOUND",
        "A instancia da Evolution nao foi encontrada.",
        404,
      );
    }
    throw error;
  }
}

function isMissingEvolutionInstanceError(error: unknown): boolean {
  return (
    error instanceof AppError &&
    error.code === "UPSTREAM_ERROR" &&
    error.statusCode === 401
  );
}
