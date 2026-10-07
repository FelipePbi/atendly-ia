import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes, requiredScope }, { expectedToken }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
  ]);

/**
 * Goal019/WU-07 — `PUT /internal/contacts/ignore`, a etapa opcional de
 * contatos ignorados entre conectar e testar aceitando telefone informado
 * manualmente, sem conversa aberta ainda.
 *
 * O que esta suite prova: o contato nasce quando nao existe (upsert por
 * `tenantId_channelId_externalContactId`), o telefone chega normalizado (so
 * digitos), a origem e distinguivel ("onboarding", nao "panel"), a rota
 * recusa sem canal WhatsApp ativo e sem telefone valido, e o escopo exigido e
 * o mesmo de `ignore` por conversa.
 */
interface ContactRow {
  id: string;
  tenantId: string;
  channelId: string;
  externalContactId: string;
  ignored: boolean;
  ignoredAt: Date | null;
  ignoredBy: string | null;
  ignoredSource: string | null;
}

function fakePrisma(options: { activeChannel: boolean }) {
  const contacts: ContactRow[] = [];
  let sequence = 0;
  return {
    contacts,
    channelConnection: {
      findUnique: async ({
        where,
      }: {
        where: { tenantId_provider: { tenantId: string; provider: string } };
      }) => {
        if (!options.activeChannel) return null;
        return {
          id: `channel-${where.tenantId_provider.tenantId}`,
          tenantId: where.tenantId_provider.tenantId,
          status: "ACTIVE",
        };
      },
    },
    // Goal139: "Remover" le o contato antes de gravar e procura as sessoes
    // abertas dele; esta suite nao tem sessao.
    conversationSession: { findMany: async () => [] },
    contact: {
      findUnique: async ({
        where,
      }: {
        where: {
          tenantId_channelId_externalContactId: {
            tenantId: string;
            channelId: string;
            externalContactId: string;
          };
        };
      }) => {
        const key = where.tenantId_channelId_externalContactId;
        return (
          contacts.find(
            (row) =>
              row.tenantId === key.tenantId &&
              row.channelId === key.channelId &&
              row.externalContactId === key.externalContactId,
          ) ?? null
        );
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: {
          tenantId_channelId_externalContactId: {
            tenantId: string;
            channelId: string;
            externalContactId: string;
          };
        };
        update: Partial<ContactRow>;
        create: Omit<ContactRow, "id">;
      }) => {
        const key = where.tenantId_channelId_externalContactId;
        const existing = contacts.find(
          (row) =>
            row.tenantId === key.tenantId &&
            row.channelId === key.channelId &&
            row.externalContactId === key.externalContactId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        sequence += 1;
        const created: ContactRow = { id: `contact-${sequence}`, ...create };
        contacts.push(created);
        return created;
      },
    },
  };
}

async function buildApp(options: { activeChannel: boolean }) {
  const prisma = fakePrisma(options);
  const app = Fastify();
  await registerInternalRoutes(app, prisma as never, {
    inbox: { countDeadLetters: async () => 0 },
  });
  return { app, prisma };
}

function headers(tenantId: string) {
  return {
    authorization: `Bearer ${expectedToken("command")}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("PUT /internal/contacts/ignore", () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof fakePrisma>;

  beforeEach(async () => {
    ({ app, prisma } = await buildApp({ activeChannel: true }));
  });

  afterEach(async () => {
    await app?.close();
  });

  it("cria o contato ignorado quando ele ainda nao existe, com telefone normalizado", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "+55 (11) 99999-0000", ignored: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      externalContactId: "5511999990000",
      ignored: true,
    });
    expect(prisma.contacts).toHaveLength(1);
    expect(prisma.contacts[0]).toMatchObject({
      tenantId: "tenant-a",
      channelId: "channel-tenant-a",
      externalContactId: "5511999990000",
      ignored: true,
      ignoredBy: "user-tenant-a",
      ignoredSource: "onboarding",
    });
  });

  it("atualiza o mesmo contato em vez de duplicar quando marcado de novo", async () => {
    await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "5511999990000", ignored: true },
    });
    const second = await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "5511999990000", ignored: false },
    });

    expect(second.json().data).toMatchObject({ ignored: false, ignoredAt: null });
    expect(prisma.contacts).toHaveLength(1);
  });

  it("recusa telefone vazio depois de normalizado", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "--------", ignored: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("CONTACT_PHONE_INVALID");
    expect(prisma.contacts).toHaveLength(0);
  });

  it("as rotas de contato exigem o mesmo escopo de escrita de conversa", () => {
    const scopeOf = (method: string, url: string) =>
      requiredScope({ method, url } as never);

    expect(scopeOf("PUT", "/internal/contacts/ignore")).toBe(
      "conversations:write",
    );
  });
});

describe("PUT /internal/contacts/ignore sem canal WhatsApp ativo", () => {
  it("recusa com 404 quando o tenant nao tem vinculo ativo", async () => {
    const { app } = await buildApp({ activeChannel: false });
    const response = await app.inject({
      method: "PUT",
      url: "/internal/contacts/ignore",
      headers: headers("tenant-a"),
      payload: { phone: "5511999990000", ignored: true },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("CHANNEL_CONNECTION_NOT_FOUND");
    await app.close();
  });
});
