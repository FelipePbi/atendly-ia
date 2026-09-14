import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { buildConversationKey } from "../../src/modules/inbox/inbox-policy.js";
import { InboxStore } from "../../src/modules/inbox/InboxStore.js";
import { MessageMediaService } from "../../src/modules/media/message-media-service.js";

/**
 * Mídia contra PostgreSQL real (Goal013/WU-05).
 *
 * Mesmo alvo descartável das demais suítes de integração desta pasta:
 * `Message`/`MessageAttachment` já existem no banco de durabilidade (Goal013/
 * WU-02) e a purga do base64 embutido do `ProcessedEvent` concluído já roda em
 * produção (Goal013/WU-03, provada dia a dia em
 * `transport-durability.test.ts`). O que esta suíte prova, especificamente
 * desta unidade: o attachment persiste com o formato que a rota de mídia e o
 * DTO leem; a purga do backfill (migration) se comporta como a purga em
 * runtime, preservando o resto do proto; e a resolução de mídia nunca
 * atravessa tenant, mesmo com o id da mensagem certo. Sem AI_TEST_DATABASE_URL
 * a suíte é pulada; validate:integration a fornece.
 */
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT_A = "tenant-media-a";
const TENANT_B = "tenant-media-b";
const CHANNEL_A = "channel-media-a";
const CHANNEL_B = "channel-media-b";
const CONVERSATION_A = "conversation-media-a";
const CONVERSATION_B = "conversation-media-b";
const PHONE = "5511977777777";

describe.skipIf(!databaseUrl)("media against PostgreSQL", () => {
  let prisma: PrismaClient;
  let inbox: InboxStore;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    inbox = new InboxStore(prisma, {
      maxAttempts: 5,
      baseSeconds: 1,
      maxSeconds: 10,
    });

    for (const [tenantId, channelId, conversationId] of [
      [TENANT_A, CHANNEL_A, CONVERSATION_A],
      [TENANT_B, CHANNEL_B, CONVERSATION_B],
    ] as const) {
      await prisma.channelConnection.upsert({
        where: { tenantId_id: { tenantId, id: channelId } },
        update: {},
        create: {
          id: channelId,
          tenantId,
          userId: `user-${tenantId}`,
          provider: "EVOLUTION_GO",
          externalInstanceId: `instance-${tenantId}`,
        },
      });
      await prisma.conversation.upsert({
        where: {
          tenantId_channelId_id: { tenantId, channelId, id: conversationId },
        },
        update: {},
        create: {
          id: conversationId,
          tenantId,
          channelId,
          externalContactId: PHONE,
          state: {},
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.messageAttachment.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.message.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.processedEvent.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.messageAttachment.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.message.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.processedEvent.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
  });

  describe("Message com attachment", () => {
    it("persiste kind, attachment e transcrição, e lê de volta no mesmo formato da rota", async () => {
      const message = await prisma.message.create({
        data: {
          tenantId: TENANT_A,
          channelId: CHANNEL_A,
          conversationId: CONVERSATION_A,
          direction: "INBOUND",
          source: "CUSTOMER",
          role: "user",
          body: "",
          kind: "AUDIO",
          externalMessageId: "external-audio-1",
          rawPayload: {
            data: {
              Info: { ID: "external-audio-1" },
              Message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } },
            },
          },
        },
      });
      await prisma.messageAttachment.create({
        data: {
          tenantId: TENANT_A,
          messageId: message.id,
          kind: "AUDIO",
          mimetype: "audio/ogg; codecs=opus",
          sizeBytes: 12_345,
          durationSeconds: 7,
          tooLarge: false,
          transcript: "quero agendar amanha de manha",
          transcriptStatus: "DONE",
          transcriptProvider: "openai",
          transcriptModel: "whisper-1",
          transcribedAt: new Date(),
        },
      });

      const read = await prisma.message.findFirstOrThrow({
        where: { tenantId: TENANT_A, id: message.id },
        include: { attachments: true },
      });

      expect(read.kind).toBe("AUDIO");
      expect(read.attachments).toHaveLength(1);
      expect(read.attachments[0]).toMatchObject({
        kind: "AUDIO",
        mimetype: "audio/ogg; codecs=opus",
        sizeBytes: 12_345,
        durationSeconds: 7,
        tooLarge: false,
        transcript: "quero agendar amanha de manha",
        transcriptStatus: "DONE",
      });
    });
  });

  describe("ProcessedEvent sem base64", () => {
    const mediaEvent = (key: string) => ({
      tenantId: TENANT_A,
      channelId: CHANNEL_A,
      eventKey: key,
      messageId: key,
      eventType: "message",
      conversationKey: buildConversationKey({
        tenantId: TENANT_A,
        channelId: CHANNEL_A,
        externalContactId: PHONE,
      }),
      rawPayload: {
        event: "Message",
        data: {
          Info: { ID: key },
          Message: {
            audioMessage: { mimetype: "audio/ogg", fileSHA256: "aGVsbG8=" },
            base64: "d2hhdHNhcHAtYXVkaW8=",
          },
        },
      },
    });

    it("perde o base64 embutido ao concluir em runtime (DONE)", async () => {
      await inbox.record(mediaEvent("evt-media-done"));
      const claim = await inbox.claimNext({
        owner: "worker-a",
        leaseMs: 60_000,
        groupWindowMs: 10_000,
        batchLimit: 10,
      });
      expect(claim).not.toBeNull();
      await inbox.complete({
        ids: claim!.events.map((event) => event.id),
        leaseToken: claim!.leaseToken,
        status: "DONE",
      });

      const row = await prisma.processedEvent.findFirstOrThrow({
        where: { tenantId: TENANT_A, eventKey: "evt-media-done" },
      });
      const rawPayload = row.rawPayload as {
        data: { Info: { ID: string }; Message: Record<string, unknown> };
      };
      expect(rawPayload.data.Message).not.toHaveProperty("base64");
      // O resto do proto de midia continua intacto: e a chave do download sob
      // demanda, nao os bytes em si.
      expect(rawPayload.data.Message.audioMessage).toEqual({
        mimetype: "audio/ogg",
        fileSHA256: "aGVsbG8=",
      });
      expect(rawPayload.data.Info).toEqual({ ID: "evt-media-done" });
    });

    it("perde só o base64 depois do backfill, sem tocar evento pendente nem o resto do proto", async () => {
      // Simula um evento concluído por um binário anterior a este Goal, que
      // gravou DONE sem passar pela purga em runtime — exatamente o que a
      // migration de backfill precisa varrer.
      await prisma.processedEvent.create({
        data: {
          ...mediaEvent("evt-media-legacy-done"),
          provider: "EVOLUTION_GO",
          status: "DONE",
          completedAt: new Date(),
        },
      });
      await prisma.processedEvent.create({
        data: {
          ...mediaEvent("evt-media-pending"),
          provider: "EVOLUTION_GO",
          status: "RECEIVED",
        },
      });

      // Mesma operação da migration (`data.Message.base64` fora, resto do
      // payload preservado), restrita aos eventos concluídos.
      await prisma.$executeRaw`
        UPDATE "ProcessedEvent"
        SET "rawPayload" = "rawPayload" #- '{data,Message,base64}'
        WHERE "tenantId" = ${TENANT_A}
          AND "status" IN ('DONE', 'FAILED', 'IGNORED')
          AND "rawPayload" #> '{data,Message,base64}' IS NOT NULL
      `;

      const [done, pending] = await Promise.all([
        prisma.processedEvent.findFirstOrThrow({
          where: { tenantId: TENANT_A, eventKey: "evt-media-legacy-done" },
        }),
        prisma.processedEvent.findFirstOrThrow({
          where: { tenantId: TENANT_A, eventKey: "evt-media-pending" },
        }),
      ]);

      const doneMessage = (done.rawPayload as { data: { Message: Record<string, unknown> } })
        .data.Message;
      expect(doneMessage).not.toHaveProperty("base64");
      expect(doneMessage.audioMessage).toEqual({
        mimetype: "audio/ogg",
        fileSHA256: "aGVsbG8=",
      });

      // Pendente nunca é tocado: o processamento em curso pode ainda precisar
      // dos bytes.
      const pendingMessage = (
        pending.rawPayload as { data: { Message: Record<string, unknown> } }
      ).data.Message;
      expect(pendingMessage.base64).toBe("d2hhdHNhcHAtYXVkaW8=");
    });
  });

  describe("isolamento por tenant da rota de mídia", () => {
    it("resolve a mídia hospedada do próprio tenant e recusa a mensagem do outro tenant como inexistente", async () => {
      const messageA = await prisma.message.create({
        data: {
          tenantId: TENANT_A,
          channelId: CHANNEL_A,
          conversationId: CONVERSATION_A,
          direction: "INBOUND",
          source: "CUSTOMER",
          role: "user",
          body: "",
          kind: "IMAGE",
        },
      });
      await prisma.messageAttachment.create({
        data: {
          tenantId: TENANT_A,
          messageId: messageA.id,
          kind: "IMAGE",
          mimetype: "image/jpeg",
          fileName: "foto.jpg",
          mediaUrl: "https://storage.example/foto.jpg",
          tooLarge: false,
        },
      });

      const fetchHostedMedia = vi
        .fn()
        .mockResolvedValue(
          new Response(new TextEncoder().encode("bytes-da-foto"), {
            status: 200,
            headers: { "content-type": "image/jpeg" },
          }),
        );
      const media = new MessageMediaService(
        prisma,
        () => ({}),
        fetchHostedMedia as unknown as typeof fetch,
      );

      const ownTenant = await media.resolve({
        tenantId: TENANT_A,
        conversationId: CONVERSATION_A,
        messageId: messageA.id,
      });
      expect(ownTenant.ok).toBe(true);
      if (ownTenant.ok) {
        expect(Buffer.from(ownTenant.media.data).toString()).toBe("bytes-da-foto");
      }
      expect(fetchHostedMedia).toHaveBeenCalledTimes(1);

      // Mesmo messageId e mesmo conversationId, mas sob o tenant errado: a
      // consulta filtra pelos três, então a mensagem do tenant A não existe
      // para o tenant B — nunca um vazamento de bytes de outro negócio.
      fetchHostedMedia.mockClear();
      const crossTenant = await media.resolve({
        tenantId: TENANT_B,
        conversationId: CONVERSATION_A,
        messageId: messageA.id,
      });
      expect(crossTenant).toEqual({ ok: false, reason: "MESSAGE_NOT_FOUND" });
      expect(fetchHostedMedia).not.toHaveBeenCalled();

      // E o mesmo messageId sob a própria conversa do tenant B também não
      // existe: não há mensagem alguma lá.
      const wrongConversation = await media.resolve({
        tenantId: TENANT_B,
        conversationId: CONVERSATION_B,
        messageId: messageA.id,
      });
      expect(wrongConversation).toEqual({ ok: false, reason: "MESSAGE_NOT_FOUND" });
    });
  });
});
