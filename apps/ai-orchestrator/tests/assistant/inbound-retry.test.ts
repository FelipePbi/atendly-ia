import { describe, expect, it, vi } from "vitest";

import { AssistantService } from "../../src/modules/assistant/assistant.service.js";
import { GRAPH_RECURSION_LIMIT } from "../../src/modules/graph/message-graph.js";

/**
 * Regressao da validacao de 2026-10-11: "Queria marcar um horario" fez a IA
 * chamar quatro ferramentas, o grafo estourou o limite padrao de 25 passos do
 * LangGraph depois de gravar a resposta, e o retry do lote tentou gravar de
 * novo a mensagem ja salva. A chave unica de `externalMessageId` derrubava
 * todo retry e a IA parou de responder a conversa.
 */
const channelMessage = {
  provider: "evolution-go" as const,
  instanceId: "instance-1",
  messageId: "external-message-1",
  chatId: "5555999999999@s.whatsapp.net",
  customerPhone: "5555999999999",
  customerName: "Maria",
  fromMe: false,
  isGroup: false,
  kind: "text" as const,
  text: "Oi",
  raw: {},
  tenantId: "tenant-1",
  channelId: "channel-1",
  userId: "user-1",
  requestId: "request-1",
};

function prismaWithRecordedInbound(answer: { id: string } | null) {
  const uniqueViolation = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
  });
  return {
    conversation: {
      upsert: vi.fn().mockResolvedValue({ id: "conversation-1" }),
    },
    message: {
      create: vi.fn().mockRejectedValue(uniqueViolation),
      findUnique: vi.fn().mockResolvedValue({
        id: "message-1",
        conversationId: "conversation-1",
        createdAt: new Date("2026-10-12T01:15:45Z"),
        direction: "INBOUND",
      }),
      findFirst: vi.fn().mockResolvedValue(answer),
    },
  };
}

describe("retry de lote com a mensagem ja gravada", () => {
  it("reaproveita a linha e avisa que a IA ja respondeu", async () => {
    const prisma = prismaWithRecordedInbound({ id: "reply-1" });
    const assistant = new AssistantService(prisma as never);

    const recorded = await assistant.recordInboundText({
      phone: channelMessage.customerPhone,
      text: "Oi",
      channelMessage,
    });

    expect(recorded).toEqual({
      conversationId: "conversation-1",
      messageRecordId: "message-1",
      alreadyAnswered: true,
    });
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          direction: "OUTBOUND",
          source: "AI",
        }),
      }),
    );
  });

  it("sem resposta gravada depois dela, o turno roda de novo", async () => {
    const prisma = prismaWithRecordedInbound(null);
    const assistant = new AssistantService(prisma as never);

    const recorded = await assistant.recordInboundText({
      phone: channelMessage.customerPhone,
      text: "Oi",
      channelMessage,
    });

    expect(recorded).toEqual({
      conversationId: "conversation-1",
      messageRecordId: "message-1",
    });
  });

  it("outro erro de gravacao continua derrubando o lote", async () => {
    const prisma = prismaWithRecordedInbound(null);
    prisma.message.create.mockRejectedValue(new Error("connection lost"));
    const assistant = new AssistantService(prisma as never);

    await expect(
      assistant.recordInboundText({
        phone: channelMessage.customerPhone,
        text: "Oi",
        channelMessage,
      }),
    ).rejects.toThrow("connection lost");
  });
});

describe("limite de passos do grafo", () => {
  it("cabe um turno com varias idas a ferramentas", () => {
    // ~12 passos fixos + 3 por ferramenta: 4 ferramentas ja passam de 25.
    expect(GRAPH_RECURSION_LIMIT).toBeGreaterThanOrEqual(12 + 3 * 15);
  });
});

describe("conversa resolvida e mensagem nova do cliente", () => {
  // Comportamento confirmado em 2026-10-12: "Marcar como resolvida" fecha a
  // conversa (status CLOSED); a proxima mensagem do cliente reabre a mesma
  // conversa (status ACTIVE), sem criar outra.
  it("a mensagem nova grava na mesma conversa e reabre com status ACTIVE", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "conversation-1" });
    const prisma = {
      conversation: { upsert },
      message: { create: vi.fn().mockResolvedValue({ id: "message-1" }) },
    };
    const assistant = new AssistantService(prisma as never);

    await assistant.recordInboundText({
      phone: channelMessage.customerPhone,
      text: "Oi, de novo",
      channelMessage,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_channelId_externalContactId: {
            tenantId: "tenant-1",
            channelId: "channel-1",
            externalContactId: channelMessage.customerPhone,
          },
        },
        update: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });
});
