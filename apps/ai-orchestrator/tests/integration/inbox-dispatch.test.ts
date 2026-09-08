import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { ChannelConnectionService } from "../../src/modules/channel/ChannelConnectionService.js";
import type { InboundProcessorInput } from "../../src/modules/channel/inbound-processor-factory.js";
import { InboundMessageProcessor } from "../../src/modules/channel/InboundMessageProcessor.js";
import { PrismaGraphRuntime } from "../../src/modules/graph/graph-runtime.js";
import { HandoffService } from "../../src/modules/handoff/HandoffService.js";
import { IdempotencyStore } from "../../src/modules/idempotency/IdempotencyStore.js";
import { InboundEventDispatcher } from "../../src/modules/inbox/InboundEventDispatcher.js";
import { buildConversationKey } from "../../src/modules/inbox/inbox-policy.js";
import { InboxStore } from "../../src/modules/inbox/InboxStore.js";
import { OutboxStore } from "../../src/modules/outbox/OutboxStore.js";

// Caminho durável completo contra PostgreSQL real: inbox e idempotência de
// verdade, com o mesmo dispatcher que o worker usa. O que está simulado aqui é
// só o que sairia da máquina — modelo e transporte —, porque o que está sob
// teste é a prova de recebimento, não a resposta gerada.
//
// A regressão que este arquivo tranca: o webhook grava a linha única em
// `ProcessedEvent` antes do 202, e o guard do grafo chamava `remember` de novo
// para o mesmo evento. A chave colidia, `remember` devolvia false e toda
// mensagem isolada do cliente terminava como 'duplicate' — recebida, nunca
// respondida. Só lote de dois ou mais funcionava.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-dispatch";
const CHANNEL = "channel-dispatch";
const INSTANCE = "instance-dispatch";
const CONTACT = "5511900000010";

const retry = { maxAttempts: 5, baseSeconds: 1, maxSeconds: 10 };
const claimOptions = {
  owner: "worker-dispatch",
  leaseMs: 60_000,
  groupWindowMs: 10_000,
  batchLimit: 10,
};

function messagePayload(messageId: string, text: string) {
  return {
    event: "Message",
    instanceId: INSTANCE,
    data: {
      Info: {
        ID: messageId,
        Chat: `${CONTACT}@s.whatsapp.net`,
        Sender: `${CONTACT}@s.whatsapp.net`,
        PushName: "Cliente",
        Type: "text",
      },
      Message: { conversation: text },
    },
  };
}

describe.skipIf(!databaseUrl)("durable dispatch against PostgreSQL", () => {
  let prisma: PrismaClient;
  let inbox: InboxStore;

  /**
   * Processador com as dependências reais que este teste precisa provar —
   * `IdempotencyStore` e `PrismaGraphRuntime` sobre o banco — e com automação e
   * transporte simulados.
   */
  function buildProcessor(sent: string[], grouped: string[] = []) {
    let recorded = 0;
    return (input: InboundProcessorInput) => {
      const automation = {
        handleIncomingText: vi.fn().mockResolvedValue({
          text: "Claro, posso ajudar.",
          conversationId: "unused",
          messageRecordId: "outbound-dispatch",
          correlationId: "ai-operation-dispatch",
        }),
        markOutboundMessageSent: vi.fn().mockResolvedValue(undefined),
        markOutboundDelivery: vi.fn().mockResolvedValue(undefined),
        recordManualOutboundText: vi.fn().mockResolvedValue({
          conversationId: "unused",
          messageRecordId: "manual-dispatch",
        }),
        // O lote agrupado da inbox usa o mesmo par que a automação real
        // expõe: registrar cada fragmento e responder uma vez ao conjunto.
        // Sem eles o processador cairia no caminho mensagem-a-mensagem e o
        // teste deixaria de provar o agrupamento.
        recordInboundText: vi.fn(async () => ({
          conversationId: "unused",
          messageRecordId: `inbound-dispatch-${(recorded += 1)}`,
        })),
        handleBufferedText: vi.fn(async (request: { text: string }) => {
          grouped.push(request.text);
          return {
            text: "Claro, posso ajudar.",
            conversationId: "unused",
            messageRecordId: "outbound-dispatch-grouped",
            correlationId: "ai-operation-dispatch-grouped",
          };
        }),
      };
      const provider = {
        sendText: vi.fn(async (request: { text: string }) => {
          sent.push(request.text);
          return {
            provider: "evolution-go" as const,
            messageId: "sent-dispatch",
            raw: {},
          };
        }),
      };
      return new InboundMessageProcessor(
        automation,
        provider,
        new IdempotencyStore(input.prisma),
        new HandoffService(input.prisma, {
          tenantId: input.tenantId,
          channelId: input.channelId,
        }),
        undefined,
        {
          runtime: new PrismaGraphRuntime(input.prisma),
          debounce: input.debounce,
          outboundGate: input.outboundGate,
        },
      );
    };
  }

  function buildDispatcher(sent: string[], grouped: string[] = []) {
    return new InboundEventDispatcher({
      prisma,
      logger: { warn: () => undefined, info: () => undefined } as never,
      inbox,
      outbox: new OutboxStore(prisma),
      channelConnections: new ChannelConnectionService(prisma),
      buildProcessor: buildProcessor(sent, grouped),
    });
  }

  /** O que o webhook faz antes do 202: sanear, classificar e gravar. */
  async function receive(messageId: string, text: string) {
    return inbox.record({
      tenantId: TENANT,
      channelId: CHANNEL,
      eventKey: `evolution-go:${INSTANCE}:${messageId}`,
      messageId,
      eventType: "message",
      conversationKey: buildConversationKey({
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT,
      }),
      rawPayload: messagePayload(messageId, text),
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    inbox = new InboxStore(prisma, retry);

    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: { status: "ACTIVE", externalInstanceId: INSTANCE },
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: "user-dispatch",
        provider: "EVOLUTION_GO",
        externalInstanceId: INSTANCE,
      },
    });
    await prisma.aiTenantConfig.upsert({
      where: { tenantId: TENANT },
      update: { enabled: true },
      create: { tenantId: TENANT, enabled: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({ where: { tenantId: TENANT } });
    await prisma.conversation.deleteMany({ where: { tenantId: TENANT } });
    // O claim não é escopado por tenant — é isso que permite um worker só
    // atender o banco inteiro. A limpeza acompanha: sobra de outra suíte seria
    // reivindicada aqui. As linhas legadas do ensaio ficam, porque `LEGACY`
    // nunca volta para a fila e uma delas é fixture de outro caso.
    await prisma.processedEvent.deleteMany({
      where: { status: { not: "LEGACY" } },
    });
  });

  it("processes and answers a single claimed event instead of calling it a duplicate", async () => {
    const stored = await receive("EVT-SINGLE", "Quero marcar um horario");
    expect(stored).toMatchObject({ stored: true, duplicate: false });

    const claim = await inbox.claimNext(claimOptions);
    expect(claim?.events).toHaveLength(1);

    const sent: string[] = [];
    const outcome = await buildDispatcher(sent).dispatch(claim!);

    expect(outcome.status).toBe("DONE");
    expect(outcome.result).toMatchObject({ kind: "message", size: 1 });
    // O ponto do teste: 'replied', não 'duplicate'. A linha da inbox já é a
    // prova de recebimento; o guard não pode recusar o próprio evento.
    expect(outcome.result.action).toBe("replied");
    expect(sent).toHaveLength(1);
  });

  it("keeps the webhook dedupe intact for a redelivered event", async () => {
    await receive("EVT-REDELIVERED", "Oi, quero marcar");
    const again = await receive("EVT-REDELIVERED", "Oi, quero marcar");

    expect(again).toMatchObject({ stored: false, duplicate: true });
    expect(
      await prisma.processedEvent.count({
        where: { tenantId: TENANT, eventKey: `evolution-go:${INSTANCE}:EVT-REDELIVERED` },
      }),
    ).toBe(1);

    // E a reentrega não vira trabalho novo: só o evento original é reivindicado.
    const claim = await inbox.claimNext(claimOptions);
    expect(claim?.events).toHaveLength(1);
    expect(await inbox.claimNext({ ...claimOptions, owner: "worker-other" })).toBeNull();
  });

  it("answers a grouped batch once, in order", async () => {
    await receive("EVT-FRAG-A", "Oi");
    await receive("EVT-FRAG-B", "queria marcar amanha");

    const claim = await inbox.claimNext(claimOptions);
    expect(claim?.events.map((event) => event.eventKey)).toEqual([
      `evolution-go:${INSTANCE}:EVT-FRAG-A`,
      `evolution-go:${INSTANCE}:EVT-FRAG-B`,
    ]);

    const sent: string[] = [];
    const grouped: string[] = [];
    const outcome = await buildDispatcher(sent, grouped).dispatch(claim!);

    expect(outcome.status).toBe("DONE");
    expect(outcome.result).toMatchObject({ kind: "message", size: 2 });
    expect(outcome.result.action).toBe("replied");
    // Uma resposta só, sobre os dois fragmentos e na ordem de recebimento.
    expect(sent).toHaveLength(1);
    expect(grouped).toEqual(["Oi\nqueria marcar amanha"]);
  });

  it("does not process a message the graph never saw as inbound work", async () => {
    // Evento persistido que já não é interpretável como mensagem: fica
    // registrado como ignorado, não volta para a fila para sempre.
    await inbox.record({
      tenantId: TENANT,
      channelId: CHANNEL,
      eventKey: `evolution-go:${INSTANCE}:EVT-BROKEN`,
      messageId: "EVT-BROKEN",
      eventType: "message",
      conversationKey: buildConversationKey({
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT,
      }),
      rawPayload: { event: "Message", instanceId: INSTANCE, data: {} },
    });

    const claim = await inbox.claimNext(claimOptions);
    const outcome = await buildDispatcher([]).dispatch(claim!);

    expect(outcome.status).toBe("IGNORED");
    expect(outcome.result).toMatchObject({ kind: "unmappable" });
  });
});
