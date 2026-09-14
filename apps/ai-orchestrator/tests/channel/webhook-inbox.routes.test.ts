import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  InboxPort,
  InboxRecordInput,
} from "../../src/modules/inbox/InboxStore.js";

vi.stubEnv("EVOLUTION_WEBHOOK_TOKEN", "secret");

const { registerEvolutionWebhookRoutes } = await import(
  "../../src/modules/channel/routes/evolutionWebhook.routes.js"
);

const connection = {
  id: "channel-a",
  tenantId: "tenant-a",
  userId: "user-a",
  externalInstanceId: "instance-a",
  status: "ACTIVE",
  credentialCipher: null,
  credentialVersion: 0,
};

/** Prisma mínimo: só o que a resolução do evento consulta. */
const prisma = {
  channelConnection: {
    findUnique: async () => connection,
  },
  aiTenantConfig: { findUnique: async () => null },
} as never;

function messagePayload(messageId = "3EB0AAA") {
  return {
    event: "Message",
    instanceId: "instance-a",
    instanceToken: "should-be-redacted-before-persisting",
    data: {
      Info: {
        ID: messageId,
        Chat: "5511999999999@s.whatsapp.net",
        Sender: "5511999999999@s.whatsapp.net",
        PushName: "Cliente",
        Type: "text",
      },
      Message: { conversation: "Oi" },
    },
  };
}

interface RecordedCall extends InboxRecordInput {
  order: number;
}

function fakeInbox(overrides: Partial<InboxPort> = {}) {
  const records: RecordedCall[] = [];
  let order = 0;
  const inbox: InboxPort = {
    record: async (input) => {
      order += 1;
      records.push({ ...input, order });
      return { stored: true, duplicate: false, id: `event-${order}` };
    },
    applyConversationWindow: async () => null,
    claimNext: async () => null,
    complete: async () => 0,
    fail: async () => ({ retrying: false, deadLettered: false }),
    requestSupersede: async () => 0,
    isSupersedeRequested: async () => false,
    countDeadLetters: async () => 0,
    ...overrides,
  };
  return { inbox, records };
}

describe("Evolution webhook inbox", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("stores the sanitised event before acknowledging", async () => {
    const { inbox, records } = fakeInbox();
    const nudge = vi.fn();
    await registerEvolutionWebhookRoutes(app, prisma, {
      inbox,
      onEventStored: nudge,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload(),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ ok: true, duplicate: false });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tenantId: "tenant-a",
      channelId: "channel-a",
      eventType: "message",
      conversationKey: "tenant-a:channel-a:5511999999999",
      eventKey: "evolution-go:instance-a:3EB0AAA",
    });
    // O raw persistido já passou pelo saneamento: nada de token no que fica
    // guardado para replay.
    expect(JSON.stringify(records[0].rawPayload)).not.toContain(
      "should-be-redacted-before-persisting",
    );
    expect(nudge).toHaveBeenCalledTimes(1);
  });

  it("asks the inbox to recalculate the conversation window before acknowledging", async () => {
    // A janela deixou de viver no `Map` do processador: quem decide quando o
    // evento fica reivindicavel e o proprio inbox, sobre os fragmentos ja
    // gravados da conversa. Aqui a prova e de fiacao — o comportamento da
    // janela esta em tests/integration/transport-durability.test.ts.
    const windows: Array<{ conversationKey: string; text: string }> = [];
    const { inbox, records } = fakeInbox({
      applyConversationWindow: async (input) => {
        windows.push({
          conversationKey: input.conversationKey,
          text: input.text,
        });
        return {
          availableAt: new Date(Date.now() + 120_000),
          pendingFragments: 1,
          ambiguousFirstContact: true,
        };
      },
    });
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload(),
    });

    expect(response.statusCode).toBe(202);
    // O piso da janela ja sai no proprio record; a extensao adaptativa e a
    // espera da mensagem ambigua vem do inbox logo depois.
    expect(records[0].availableInMs).toBeGreaterThan(0);
    expect(windows).toEqual([
      { conversationKey: "tenant-a:channel-a:5511999999999", text: "Oi" },
    ]);
  });

  it("returns 5xx and processes nothing when the inbox cannot persist", async () => {
    const nudge = vi.fn();
    const { inbox } = fakeInbox({
      record: async () => {
        throw new Error("database is down");
      },
    });
    await registerEvolutionWebhookRoutes(app, prisma, {
      inbox,
      onEventStored: nudge,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload(),
    });

    // Sem linha gravada não existe ACK: o produtor precisa retentar.
    expect(response.statusCode).toBe(500);
    expect(nudge).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate without a new effect", async () => {
    const nudge = vi.fn();
    const supersede = vi.fn(async () => 0);
    const { inbox } = fakeInbox({
      record: async () => ({ stored: false, duplicate: true }),
      requestSupersede: supersede,
    });
    await registerEvolutionWebhookRoutes(app, prisma, {
      inbox,
      onEventStored: nudge,
    });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload(),
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ duplicate: true });
    expect(nudge).not.toHaveBeenCalled();
    expect(supersede).not.toHaveBeenCalled();
  });

  it("flags the conversation for re-evaluation when a new message arrives", async () => {
    const supersede = vi.fn(async () => 1);
    const { inbox } = fakeInbox({ requestSupersede: supersede });
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload("3EB0BBB"),
    });

    expect(supersede).toHaveBeenCalledWith("tenant-a:channel-a:5511999999999");
  });

  it("accepts delivery receipts as reconciliation work", async () => {
    const { inbox, records } = fakeInbox();
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: {
        event: "Receipt",
        instanceId: "instance-a",
        state: "Delivered",
        data: {
          MessageIDs: ["ai-operation-1"],
          Chat: "5511999999999@s.whatsapp.net",
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(records[0]).toMatchObject({
      eventType: "receipt",
      conversationKey: null,
      status: "RECEIVED",
    });
  });

  it("acknowledges technical events instead of making the producer retry a 400", async () => {
    const { inbox, records } = fakeInbox();
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    for (const event of ["Connected", "QRCode", "LoggedOut"]) {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/evolution?token=secret",
        payload: { event, instanceId: "instance-a", data: {} },
      });
      expect(response.statusCode).toBe(202);
    }

    expect(records.map((record) => record.status)).toEqual([
      "IGNORED",
      "IGNORED",
      "IGNORED",
    ]);
  });

  it("acknowledges and discards presence without persisting it", async () => {
    const { inbox, records } = fakeInbox();
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: { event: "Presence", instanceId: "instance-a", data: {} },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ stored: false });
    expect(records).toHaveLength(0);
  });

  it("asks the producer to retry when the channel owner cannot be resolved yet", async () => {
    const { inbox, records } = fakeInbox();
    const unlinked = {
      channelConnection: { findUnique: async () => null },
      aiTenantConfig: { findUnique: async () => null },
    } as never;
    await registerEvolutionWebhookRoutes(app, unlinked, { inbox });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: messagePayload("3EB0CCC"),
    });

    // 503, não 404: o vínculo pode estar sendo provisionado agora, e 4xx é
    // recusa definitiva para o produtor durável do Go.
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ retryable: true });
    expect(records).toHaveLength(0);
  });

  it("accepts a media webhook body well above the default 1 MiB Fastify limit", async () => {
    const { inbox, records } = fakeInbox();
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    // ~5 MiB de base64, dentro do teto explicito da rota (32 MiB).
    const base64 = "A".repeat(5 * 1024 * 1024);
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: {
        event: "Message",
        instanceId: "instance-a",
        data: {
          Info: {
            ID: "3EB0MEDIA",
            Chat: "5511999999999@s.whatsapp.net",
            Sender: "5511999999999@s.whatsapp.net",
            PushName: "Cliente",
            Type: "media",
            MediaType: "image",
          },
          Message: {
            imageMessage: { mimetype: "image/jpeg" },
            base64,
          },
        },
      },
    });

    expect(response.statusCode).toBe(202);
    expect(records).toHaveLength(1);
  });

  it("still refuses a payload that is not a readable event", async () => {
    const { inbox } = fakeInbox();
    await registerEvolutionWebhookRoutes(app, prisma, { inbox });

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/evolution?token=secret",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});
