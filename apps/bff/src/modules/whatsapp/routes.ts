import { randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { resolveAiConversationStyle } from "../../lib/ai-conversation-style.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody } from "../../lib/http.js";
import { normalizeBrazilianWhatsappPhone } from "../../lib/phone.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { internalContext } from "../tenant/context.js";
import {
  findLinkedInstance,
  type LinkedInstance,
  requireLinkedInstance,
  resolveInstanceCredential,
  resolveLinkState,
  sealedInstanceCredentialData,
} from "./instance-link.js";

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
      const instance = await findLinkedInstance(tenant);
      if (!instance) return dataResponse(request, null);
      const credential = await resolveInstanceCredential(instance);
      // Caminho de transição: a migration da IA deixou todo vínculo já
      // existente sem projeção da credencial, e antes disso só `connect` e
      // `reconnect` reprovisionavam — ou seja, a recuperação dependia de cada
      // dono reconectar o número na mão. A leitura de status reprojeta o
      // segredo, que é idempotente do lado da IA, e assim o vínculo se
      // restabelece sozinho na primeira vez que o negócio abre a tela.
      await projectChannelCredential(request, instance, credential, ai);
      const status = await evolution.getStatus(credential, request.id);
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
      const instance = await requireLinkedInstance(
        currentTenantContext(request),
      );
      return dataResponse(
        request,
        await connect(request, instance, body, evolution, ai),
      );
    },
  );

  // Desconectar é também o caminho de resolução do vínculo pendente: a linha
  // legada é do próprio usuário autenticado e nenhum outro negócio a reivindica,
  // então o dono pode descartá-la aqui e conectar o número de novo. A
  // divergência entre negócios continua fora do autoatendimento.
  app.delete(
    "/v1/whatsapp",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const state = await resolveLinkState(tenant);
      if (state.kind === "divergent" || state.kind === "absent") {
        // Recusa igual à das demais rotas: na divergência já haveria outro
        // negócio no meio, e apagar seria decidir por ele.
        if (state.kind === "divergent") await findLinkedInstance(tenant);
        return dataResponse(request, { disconnected: true });
      }

      const instance = state.instance;
      // Sem dono de negócio a credencial não é abrível — a cifra está ligada ao
      // vínculo. O logout autenticado é pulado; a instância remota ainda é
      // removida pela credencial administrativa.
      if (state.kind === "linked") {
        const credential = await resolveInstanceCredential(instance);
        await evolution
          .logoutInstance(credential, request.id)
          .catch(() => null);
      }
      await evolution
        .deleteInstance(
          instance.evolutionInstanceId ?? instance.evolutionInstanceName,
          request.id,
        )
        .catch(() => null);
      await getPrisma().whatsAppInstance.delete({ where: { id: instance.id } });
      if (state.kind === "pending") {
        request.log.info(
          { instanceId: instance.id },
          "Pending WhatsApp link discarded by its own owner",
        );
      }
      return dataResponse(request, { disconnected: true });
    },
  );
}

async function ensureInstance(
  request: FastifyRequest,
  evolution: EvolutionClient,
  ai: AiOrchestratorClient,
): Promise<LinkedInstance> {
  const tenant = currentTenantContext(request);
  const existing = await findLinkedInstance(tenant);
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
  const evolutionInstanceName = created.data?.name ?? name;
  // O vínculo nasce com dono explícito e credencial já cifrada: nenhuma
  // gravação nova depende do backfill nem guarda o token em texto puro.
  const instance = await getPrisma().whatsAppInstance.create({
    data: {
      userId: tenant.userId,
      tenantId: tenant.tenantId,
      evolutionInstanceId: created.data?.id ?? created.data?.name ?? name,
      evolutionInstanceName,
      status: "CREATED",
      ...sealedInstanceCredentialData(created.data?.token ?? token, {
        tenantId: tenant.tenantId,
        evolutionInstanceName,
      }),
    },
  });
  await provisionChannel(request, instance, ai);
  return instance;
}

async function connect(
  request: FastifyRequest,
  instance: LinkedInstance,
  body: z.output<typeof connectSchema>,
  evolution: EvolutionClient,
  ai: AiOrchestratorClient,
) {
  await provisionChannel(request, instance, ai);
  const credential = await resolveInstanceCredential(instance);
  await evolution.connectInstance(
    credential,
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
    const pairing = await evolution.pairInstance(credential, phone, request.id);
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

  const qr = await evolution.getQr(credential, request.id);
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

/**
 * Reprojeta a credencial da instância na IA, sem tocar na configuração do
 * negócio.
 *
 * Falhar aqui não pode derrubar a leitura de status: a IA estar fora do ar não
 * torna o número menos conectado. O erro é registrado e a próxima leitura tenta
 * de novo.
 */
async function projectChannelCredential(
  request: FastifyRequest,
  instance: LinkedInstance,
  credential: string,
  ai: AiOrchestratorClient,
): Promise<void> {
  try {
    await ai.provisionEvolutionChannel(internalContext(request), {
      externalInstanceId:
        instance.evolutionInstanceId ?? instance.evolutionInstanceName,
      displayName: instance.evolutionInstanceName,
      instanceCredential: credential,
    });
  } catch (error) {
    request.log.warn(
      {
        err: error instanceof Error ? error.name : "PROVISION_ERROR",
        // Codigo e status dizem se a IA esta fora do ar, se recusou a
        // credencial ou se o vinculo nao existe la. Sem isso o warn nao
        // distinguia indisponibilidade de recusa.
        code:
          error instanceof AppError ? error.code : "PROVISION_ERROR",
        statusCode: error instanceof AppError ? error.statusCode : undefined,
      },
      "WhatsApp channel credential projection is pending for this business",
    );
  }
}

async function provisionChannel(
  request: FastifyRequest,
  instance: LinkedInstance,
  ai: AiOrchestratorClient,
): Promise<void> {
  const tenant = currentTenantContext(request);
  // Projeção controlada da credencial: o BFF entrega o segredo à IA pelo canal
  // interno autenticado com a credencial de provisionamento, e a IA a guarda
  // cifrada no próprio vínculo. Depois disso a IA nunca precisa do token vindo
  // do corpo de um webhook.
  await ai.provisionEvolutionChannel(internalContext(request), {
    externalInstanceId:
      instance.evolutionInstanceId ?? instance.evolutionInstanceName,
    displayName: instance.evolutionInstanceName,
    instanceCredential: await resolveInstanceCredential(instance),
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
    tone: resolveAiConversationStyle(settings.tone),
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
