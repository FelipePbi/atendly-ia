import { randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { normalizeBrazilianWhatsappPhone } from "../../lib/phone.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";

const connectSchema = z
  .object({
    mode: z.enum(["QR", "PAIRING_CODE"]).default("QR"),
    phone: z.string().trim().min(10).max(32).optional(),
  })
  .refine((value) => value.mode !== "PAIRING_CODE" || value.phone, {
    path: ["phone"],
    message: "Phone is required for pairing code mode.",
  });

export async function registerV1WhatsAppRoutes(
  app: FastifyInstance,
): Promise<void> {
  const evolution = new EvolutionClient();
  const ai = new AiOrchestratorClient();

  app.get(
    "/v1/whatsapp",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const instance = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: tenant.userId },
      });
      if (!instance) return dataResponse(request, null);
      const status = await evolution.getStatus(
        instance.evolutionInstanceToken,
        request.id,
      );
      const updated = await getPrisma().whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: status.connected ? "CONNECTED" : "DISCONNECTED",
          phoneNumber: status.phoneNumber ?? instance.phoneNumber,
          connectedAt:
            status.connected && !instance.connectedAt
              ? new Date()
              : instance.connectedAt,
        },
      });
      return dataResponse(request, whatsappDto(updated));
    },
  );

  app.post(
    "/v1/whatsapp/connect",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(connectSchema, request.body ?? {});
      const instance = await ensureInstance(request, evolution, ai);
      const result = await connect(request, instance, body, evolution, ai);
      return reply.code(201).send(dataResponse(request, result));
    },
  );

  app.post(
    "/v1/whatsapp/reconnect",
    { preHandler: requireTenantContext },
    async (request) => {
      const body = parseBody(connectSchema, request.body ?? {});
      const tenant = currentTenantContext(request);
      const instance = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: tenant.userId },
      });
      if (!instance) {
        throw new AppError(
          "NOT_FOUND",
          "WhatsApp connection was not found.",
          404,
        );
      }
      return dataResponse(
        request,
        await connect(request, instance, body, evolution, ai),
      );
    },
  );

  app.delete(
    "/v1/whatsapp",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const instance = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: tenant.userId },
      });
      if (!instance) return dataResponse(request, { disconnected: true });
      await evolution
        .logoutInstance(instance.evolutionInstanceToken, request.id)
        .catch(() => null);
      await evolution
        .deleteInstance(
          instance.evolutionInstanceId ?? instance.evolutionInstanceName,
          request.id,
        )
        .catch(() => null);
      await getPrisma().whatsAppInstance.delete({ where: { id: instance.id } });
      return dataResponse(request, { disconnected: true });
    },
  );
}

async function ensureInstance(
  request: FastifyRequest,
  evolution: EvolutionClient,
  ai: AiOrchestratorClient,
) {
  const tenant = currentTenantContext(request);
  const existing = await getPrisma().whatsAppInstance.findUnique({
    where: { userId: tenant.userId },
  });
  if (existing) {
    await provisionChannel(request, existing, ai);
    return existing;
  }

  const profile = await getPrisma().businessProfile.findUnique({
    where: { tenantId: tenant.tenantId },
  });
  const name = `${slug(profile?.businessName || "atendly")}_${randomBytes(4).toString("hex")}`;
  const token = `wa_${randomBytes(32).toString("hex")}`;
  const created = await evolution.createInstance(
    {
      name,
      token,
      webhookUrl: evolution.webhookUrl(),
    },
    request.id,
  );
  const instance = await getPrisma().whatsAppInstance.create({
    data: {
      userId: tenant.userId,
      evolutionInstanceId: created.data?.id ?? created.data?.name ?? name,
      evolutionInstanceName: created.data?.name ?? name,
      evolutionInstanceToken: created.data?.token ?? token,
      status: "CREATED",
    },
  });
  await provisionChannel(request, instance, ai);
  return instance;
}

async function connect(
  request: FastifyRequest,
  instance: {
    id: string;
    evolutionInstanceId: string | null;
    evolutionInstanceName: string;
    evolutionInstanceToken: string;
    phoneNumber: string | null;
  },
  body: z.output<typeof connectSchema>,
  evolution: EvolutionClient,
  ai: AiOrchestratorClient,
) {
  await provisionChannel(request, instance, ai);
  await evolution.connectInstance(
    instance.evolutionInstanceToken,
    evolution.webhookUrl(),
    request.id,
  );
  if (body.mode === "PAIRING_CODE") {
    const phone = normalizeBrazilianWhatsappPhone(body.phone ?? "");
    if (!phone) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A valid Brazilian phone with area code is required.",
        400,
      );
    }
    const pairing = await evolution.pairInstance(
      instance.evolutionInstanceToken,
      phone,
      request.id,
    );
    const updated = await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: "CONNECTING", phoneNumber: phone },
    });
    return {
      connection: whatsappDto(updated),
      pairingCode: pairing.pairingCode,
      expiresAt: new Date(Date.now() + 160_000).toISOString(),
      qrcode: null,
    };
  }

  const qr = await evolution.getQr(instance.evolutionInstanceToken, request.id);
  const updated = await getPrisma().whatsAppInstance.update({
    where: { id: instance.id },
    data: {
      status: qr.qrcode ? "WAITING_QR" : "CONNECTING",
      qrcode: qr.qrcode || null,
    },
  });
  return {
    connection: whatsappDto(updated),
    pairingCode: null,
    expiresAt: null,
    qrcode: qr.qrcode,
  };
}

async function provisionChannel(
  request: FastifyRequest,
  instance: {
    evolutionInstanceId: string | null;
    evolutionInstanceName: string;
  },
  ai: AiOrchestratorClient,
): Promise<void> {
  const tenant = currentTenantContext(request);
  await ai.provisionEvolutionChannel(internalContext(request), {
    externalInstanceId:
      instance.evolutionInstanceId ?? instance.evolutionInstanceName,
    displayName: instance.evolutionInstanceName,
  });
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

function whatsappDto(instance: {
  id: string;
  phoneNumber: string | null;
  status: string;
  connectedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: instance.id,
    phoneNumber: instance.phoneNumber,
    status: instance.status,
    connectedAt: instance.connectedAt?.toISOString() ?? null,
    updatedAt: instance.updatedAt.toISOString(),
  };
}

function slug(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "atendly"
  );
}
