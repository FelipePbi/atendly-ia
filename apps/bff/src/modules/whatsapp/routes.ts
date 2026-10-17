import { randomBytes } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AiOrchestratorClient } from "../../clients/ai-orchestrator/index.js";
import { EvolutionClient } from "../../clients/evolution/index.js";
import { resolveAiConversationStyle } from "../../lib/ai-conversation-style.js";
import { AppError } from "../../lib/errors.js";
import { dataResponse, parseBody, parseQuery } from "../../lib/http.js";
import { credentialKeysConfigured } from "../../lib/instance-credentials.js";
import {
  normalizeBrazilianWhatsappPhone,
  phoneFromWhatsappJid,
} from "../../lib/phone.js";
import { getPrisma } from "../../lib/prisma.js";
import {
  currentTenantContext,
  requireTenantContext,
} from "../../lib/tenant-context.js";
import { selectWhatsappContacts } from "../../lib/whatsapp-contacts.js";
import { recordActivity, userActor } from "../activity/activity-log.js";
import { internalContext } from "../tenant/context.js";
import { disconnectWhatsApp } from "./disconnect.js";
import {
  findLinkedInstance,
  type LinkedInstance,
  requireLinkedInstance,
  resolveInstanceCredential,
  sealedInstanceCredentialData,
} from "./instance-link.js";

const connectSchema = z
  .object({
    mode: z.enum(["QR", "PAIRING_CODE"]).default("QR"),
    phone: z.string().trim().min(10).max(32).optional(),
    // Consentimento exigido a cada vinculação (Goal071/WU-01), no padrão de
    // `termsAccepted` do cadastro: ausente ou diferente de `true` recusa antes
    // de `ensureInstance`, de qualquer chamada à Evolution e de qualquer
    // escrita. O aceite em si não é gravado.
    consentAccepted: z.literal(true),
  })
  .refine((value) => value.mode !== "PAIRING_CODE" || value.phone, {
    path: ["phone"],
    message: "Phone is required for pairing code mode.",
  });

const contactsQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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
      // O legado guarda o JID cru: converte antes de gravar, nunca depois,
      // para que a linha antiga saia limpa já na primeira releitura.
      const rawPhone = status.phoneNumber ?? instance.phoneNumber;
      const phoneNumber = rawPhone ? phoneFromWhatsappJid(rawPhone) || null : null;
      const updated = await getPrisma().whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: status.connected ? "CONNECTED" : "DISCONNECTED",
          phoneNumber,
          connectedAt:
            status.connected && !instance.connectedAt
              ? new Date()
              : instance.connectedAt,
          // Marcador de vinculação por QR em curso (Goal071/WU-01): qualquer
          // leitura que observe o número conectado o limpa.
          ...(status.connected ? { qrcode: null } : {}),
        },
      });
      return dataResponse(request, whatsappDto(updated));
    },
  );

  // Contatos do número conectado (validação de 2026-10-11): a escolha dos
  // contatos ignorados não depende de já haver conversas na Avenly. Lidos na
  // hora e nunca gravados; só quem a pessoa marcar vira contato ignorado.
  app.get(
    "/v1/whatsapp/contacts",
    { preHandler: requireTenantContext },
    async (request) => {
      const query = parseQuery(contactsQuerySchema, request.query);
      const tenant = currentTenantContext(request);
      const instance = await findLinkedInstance(tenant);
      if (!instance || instance.status !== "CONNECTED") {
        return dataResponse(request, { available: false, items: [] });
      }
      const credential = await resolveInstanceCredential(instance);
      const raw = await evolution.getContacts(credential, request.id);
      return dataResponse(request, {
        available: true,
        items: selectWhatsappContacts(raw, {
          excludePhone: instance.phoneNumber,
          limit: query.limit,
          search: query.search,
        }),
      });
    },
  );

  app.get(
    "/v1/whatsapp/qr",
    { preHandler: requireTenantContext },
    async (request) => {
      const tenant = currentTenantContext(request);
      const instance = await requireLinkedInstance(tenant);
      // Sem marcador (coluna `qrcode` vazia), não há vinculação por QR em
      // curso: recusa antes de qualquer chamada à Evolution. Reler o QR
      // nunca abre uma vinculação que um `connect` com consentimento não
      // abriu.
      if (!instance.qrcode) {
        throw new AppError(
          "WHATSAPP_QR_NOT_IN_PROGRESS",
          "There is no WhatsApp QR pairing in progress for this business.",
          409,
        );
      }

      const credential = await resolveInstanceCredential(instance);
      // No fork, ler o QR com o cliente já logado (ou nil) chama
      // StartInstance, que pode derrubar a sessão boa — por isso o status
      // vem antes de `getQr`, e conectado ou logado pulam `/instance/qr` por
      // completo.
      const status = await evolution.getStatus(credential, request.id);
      if (status.connected || status.loggedIn) {
        const rawPhone = status.phoneNumber ?? instance.phoneNumber;
        const phoneNumber = rawPhone
          ? phoneFromWhatsappJid(rawPhone) || null
          : null;
        const updated = await getPrisma().whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            status: "CONNECTED",
            phoneNumber,
            connectedAt: instance.connectedAt ?? new Date(),
            qrcode: null,
          },
        });
        return dataResponse(request, {
          connection: whatsappDto(updated),
          qrcode: null,
        });
      }

      const qr = await evolution.getQr(credential, request.id);
      return dataResponse(request, {
        connection: whatsappDto(instance),
        qrcode: qr.qrcode || null,
      });
    },
  );

  app.post(
    "/v1/whatsapp/connect",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const body = parseBody(connectSchema, request.body ?? {});
      const instance = await ensureInstance(request, evolution, ai);
      const result = await connect(request, instance, body, evolution, ai);
      const tenant = currentTenantContext(request);
      // Pedido de conexão (o QR vem depois); nenhuma credencial entra aqui.
      await recordActivity(getPrisma(), tenant.tenantId, {
        actor: userActor(tenant.userId),
        area: "SETTINGS",
        action: "settings.whatsapp_connect_started",
        entityType: "whatsapp",
      });
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
      // O caminho em si mora em `disconnect.ts` desde o Goal025/WU-02: a
      // exclusão de conta precisa executar exatamente este, e não uma cópia.
      // A divergência continua recusando com `CONFLICT` de dentro dele.
      const result = await disconnectWhatsApp(tenant, {
        evolution,
        requestId: request.id,
      });
      if (result.outcome === "PENDING_DISCARDED") {
        request.log.info(
          { instanceId: result.instanceId },
          "Pending WhatsApp link discarded by its own owner",
        );
      }
      await recordActivity(getPrisma(), tenant.tenantId, {
        actor: userActor(tenant.userId),
        area: "SETTINGS",
        action: "settings.whatsapp_disconnected",
        entityType: "whatsapp",
      });
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

  // Sem chave de cifra configurada, a linha local nunca poderia guardar a
  // credencial da instância nova — recusa antes de criar nada na Evolution,
  // para não sobrar uma instância remota que este BFF não consegue vincular.
  if (!credentialKeysConfigured()) {
    throw new AppError(
      "CREDENTIAL_UNAVAILABLE",
      "WHATSAPP_CREDENTIAL_KEYS is not configured: a new WhatsApp instance cannot be created.",
      503,
    );
  }

  const profile = await getPrisma().businessProfile.findUnique({
    where: { tenantId: tenant.tenantId },
  });
  const name = `${slug(profile?.businessName || "avenly")}_${randomBytes(4).toString("hex")}`;
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
  const evolutionInstanceId = created.data?.id ?? created.data?.name ?? name;
  // O vínculo nasce com dono explícito e credencial já cifrada: nenhuma
  // gravação nova depende do backfill nem guarda o token em texto puro.
  let instance: LinkedInstance;
  try {
    instance = await getPrisma().whatsAppInstance.create({
      data: {
        userId: tenant.userId,
        tenantId: tenant.tenantId,
        evolutionInstanceId,
        evolutionInstanceName,
        status: "CREATED",
        ...sealedInstanceCredentialData(created.data?.token ?? token, {
          tenantId: tenant.tenantId,
          evolutionInstanceName,
        }),
      },
    });
  } catch (error) {
    // A instância remota já existe na Evolution e nenhuma linha local a
    // referencia: sem esta remoção ela fica órfã lá, reivindicando o mesmo
    // nome numa tentativa futura. A remoção usa a chave administrativa, igual
    // a `disconnectWhatsApp`, e sua falha não pode trocar o erro original que
    // o dono vê.
    await evolution.deleteInstance(evolutionInstanceId, request.id).catch(
      (cleanupError) => {
        request.log.warn(
          {
            err:
              cleanupError instanceof Error
                ? cleanupError.name
                : "CLEANUP_ERROR",
          },
          "Failed to remove an orphaned Evolution instance after a failed WhatsApp connect attempt",
        );
      },
    );
    throw error;
  }
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
      // Modo código limpa o marcador de vinculação por QR em curso
      // (Goal071/WU-01): esta vinculação não é por QR.
      data: { status: "CONNECTING", phoneNumber: phone, qrcode: null },
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
    // Estoque legado pode guardar o JID cru; o produto só expõe dígitos.
    phoneNumber: instance.phoneNumber
      ? phoneFromWhatsappJid(instance.phoneNumber) || null
      : null,
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
      .slice(0, 48) || "avenly"
  );
}
