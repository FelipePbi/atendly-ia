import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SendTextInput } from "../../src/modules/channel/ports/WhatsAppProvider.js";
import {
  AI_REPLY_MAX_PARTS,
  AI_REPLY_PART_GAP_MS,
  typingDelayFor,
  type AiReplyPartProgressPort,
  aiReplyCorrelationIdOf,
  aiReplyPartMessageId,
  dispatchAiReply,
  splitAiReplyIntoParts,
} from "../../src/modules/outbox/ai-reply-dispatch.js";

describe("splitAiReplyIntoParts", () => {
  it("separa a abertura curta e os paragrafos do exemplo da decisao", () => {
    expect(
      splitAiReplyIntoParts(
        "Oi! A Aplicação 5D custa R$ 190 💖\n\nSe quiser, posso te ajudar a agendar também.",
      ),
    ).toEqual([
      "Oi!",
      "A Aplicação 5D custa R$ 190 💖",
      "Se quiser, posso te ajudar a agendar também.",
    ]);
  });

  it("reconhece aberturas variadas de ate 4 palavras", () => {
    expect(splitAiReplyIntoParts("Olá! Temos horário sexta.")).toEqual([
      "Olá!",
      "Temos horário sexta.",
    ]);
    expect(splitAiReplyIntoParts("Oi, Ana! Tudo certo por aqui.")).toEqual([
      "Oi, Ana!",
      "Tudo certo por aqui.",
    ]);
    expect(splitAiReplyIntoParts("Bom dia!\nComo posso ajudar?")).toEqual([
      "Bom dia!",
      "Como posso ajudar?",
    ]);
  });

  it("mantem o emoji colado na abertura", () => {
    expect(splitAiReplyIntoParts("Oiii! 😊 Temos sim.")).toEqual([
      "Oiii! 😊",
      "Temos sim.",
    ]);
  });

  it("nao separa primeira frase longa nem frase terminada em ponto", () => {
    const longa =
      "Que bom que voce voltou por aqui! A Aplicação 5D custa R$ 190.";
    expect(splitAiReplyIntoParts(longa)).toEqual([longa]);
    const ponto = "Certo. Pode ser sexta? Tenho 16h.";
    expect(splitAiReplyIntoParts(ponto)).toEqual([ponto]);
  });

  it("paragrafo unico sem abertura vira uma parte so", () => {
    expect(
      splitAiReplyIntoParts("A Aplicação 5D custa R$ 190 e dura 2 horas."),
    ).toEqual(["A Aplicação 5D custa R$ 190 e dura 2 horas."]);
    expect(splitAiReplyIntoParts("Oi!")).toEqual(["Oi!"]);
  });

  it("nunca divide lista: itens ficam com a linha de introducao", () => {
    expect(
      splitAiReplyIntoParts(
        "Temos estes horários:\n\n- Sexta 14h\n- Sexta 16h\n\n- Sábado 9h\n\nQual prefere?",
      ),
    ).toEqual([
      "Temos estes horários:\n\n- Sexta 14h\n- Sexta 16h\n\n- Sábado 9h",
      "Qual prefere?",
    ]);
    expect(
      splitAiReplyIntoParts("Serviços:\n1. Corte\n2. Escova\n\nQuer agendar?"),
    ).toEqual(["Serviços:\n1. Corte\n2. Escova", "Quer agendar?"]);
    expect(splitAiReplyIntoParts("• Corte\n• Escova")).toEqual([
      "• Corte\n• Escova",
    ]);
  });

  it("nunca corta URL", () => {
    const comQuery =
      "Veja aqui https://avenly.app/agenda?dia=sexta&hora=16 e me diga!";
    expect(splitAiReplyIntoParts(comQuery)).toEqual([comQuery]);
    expect(
      splitAiReplyIntoParts(
        "Oi! O link é https://avenly.app/x?y=1\n\nQualquer dúvida me chama.",
      ),
    ).toEqual([
      "Oi!",
      "O link é https://avenly.app/x?y=1",
      "Qualquer dúvida me chama.",
    ]);
  });

  it("apara, descarta vazios e normaliza CRLF", () => {
    expect(splitAiReplyIntoParts("  \r\n\r\nPrimeiro.\r\n\r\n \r\n Segundo.  \n\n")).toEqual([
      "Primeiro.",
      "Segundo.",
    ]);
    expect(splitAiReplyIntoParts("   \n\n ")).toEqual([]);
  });

  it(`limita a ${AI_REPLY_MAX_PARTS} partes juntando o excedente na ultima`, () => {
    const parts = splitAiReplyIntoParts("Oi! Um.\n\nDois.\n\nTres.\n\nQuatro.\n\nCinco.");
    expect(parts).toHaveLength(AI_REPLY_MAX_PARTS);
    expect(parts).toEqual(["Oi!", "Um.", "Dois.", "Tres.\n\nQuatro.\n\nCinco."]);
  });

  it("nao inventa texto: as partes sao o texto original", () => {
    const text = "Oi! A Aplicação 5D custa R$ 190 💖\n\nSe quiser, posso agendar.";
    const joined = splitAiReplyIntoParts(text).join(" ").replace(/\s+/g, " ");
    expect(joined).toBe(text.replace(/\s+/g, " "));
  });
});

describe("ids de transporte das partes", () => {
  it("a ultima parte leva o correlationId; as anteriores, sufixo -p<n>", () => {
    expect(aiReplyPartMessageId("ai-abc", 0, 3)).toBe("ai-abc-p1");
    expect(aiReplyPartMessageId("ai-abc", 1, 3)).toBe("ai-abc-p2");
    expect(aiReplyPartMessageId("ai-abc", 2, 3)).toBe("ai-abc");
    expect(aiReplyPartMessageId("ai-abc", 0, 1)).toBe("ai-abc");
    expect(aiReplyCorrelationIdOf("ai-abc-p2")).toBe("ai-abc");
    expect(aiReplyCorrelationIdOf("ai-abc")).toBe("ai-abc");
  });
});

function memoryProgress(initial = 0) {
  const state = { partsSent: initial };
  const port: AiReplyPartProgressPort = {
    readPartsSent: vi.fn(async () => state.partsSent),
    recordPartsSent: vi.fn(async ({ partsSent }) => {
      state.partsSent = partsSent;
    }),
  };
  return { port, state };
}

const reply = {
  to: "5511999999999",
  text: "Oi! A Aplicação 5D custa R$ 190 💖\n\nSe quiser, posso te ajudar a agendar também.",
  correlationId: "ai-row-1",
  messageRecordId: "message-1",
  quotedMessageId: "3EB0IN",
  quotedParticipant: "5511999999999@s.whatsapp.net",
  requestId: "req-1",
};

describe("dispatchAiReply", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("envia as partes em ordem, com ao menos 1s entre elas, citando so a primeira", async () => {
    const sentAt: Array<{ at: number; input: SendTextInput }> = [];
    const provider = {
      sendText: vi.fn(async (input: SendTextInput) => {
        sentAt.push({ at: Date.now(), input });
        return { provider: "evolution-go" as const, messageId: input.correlationId, raw: { ok: true } };
      }),
    };
    const { port, state } = memoryProgress();

    const pending = dispatchAiReply(provider, reply, { progress: port });
    await vi.runAllTimersAsync();
    const outcome = await pending;

    expect(sentAt.map((item) => item.input.text)).toEqual([
      "Oi!",
      "A Aplicação 5D custa R$ 190 💖",
      "Se quiser, posso te ajudar a agendar também.",
    ]);
    expect(sentAt.map((item) => item.input.correlationId)).toEqual([
      "ai-row-1-p1",
      "ai-row-1-p2",
      "ai-row-1",
    ]);
    expect(sentAt[0].input.quotedMessageId).toBe("3EB0IN");
    expect(sentAt[1].input.quotedMessageId).toBeUndefined();
    expect(sentAt[2].input.quotedParticipant).toBeUndefined();
    for (let index = 1; index < sentAt.length; index += 1) {
      expect(sentAt[index].at - sentAt[index - 1].at).toBeGreaterThanOrEqual(
        AI_REPLY_PART_GAP_MS,
      );
    }
    expect(AI_REPLY_PART_GAP_MS).toBeGreaterThanOrEqual(1000);
    // "digitando…" so nas partes depois da primeira, proporcional ao texto.
    expect(sentAt[0].input.typingDelayMs).toBeUndefined();
    for (const item of sentAt.slice(1)) {
      expect(item.input.typingDelayMs).toBe(typingDelayFor(item.input.text));
      expect(item.input.typingDelayMs).toBeGreaterThanOrEqual(800);
      expect(item.input.typingDelayMs).toBeLessThanOrEqual(2000);
    }
    expect(outcome).toEqual({
      status: "sent",
      providerMessageId: "ai-row-1",
      raw: { ok: true },
      partsSent: 3,
      totalParts: 3,
    });
    expect(state.partsSent).toBe(3);
  });

  it("so conclui depois da ultima parte", async () => {
    let releaseLast: () => void = () => undefined;
    const provider = {
      sendText: vi.fn(async (input: SendTextInput) => {
        if (input.correlationId === "ai-row-1") {
          await new Promise<void>((resolve) => {
            releaseLast = resolve;
          });
        }
        return { provider: "evolution-go" as const, messageId: input.correlationId, raw: null };
      }),
    };
    let settled = false;
    const pending = dispatchAiReply(provider, reply).then((outcome) => {
      settled = true;
      return outcome;
    });
    await vi.advanceTimersByTimeAsync(AI_REPLY_PART_GAP_MS * 2);
    expect(provider.sendText).toHaveBeenCalledTimes(3);
    expect(settled).toBe(false);
    releaseLast();
    await expect(pending).resolves.toMatchObject({ status: "sent" });
  });

  it("parte unica sai como antes: texto intacto, mesmo id, sem espera nem progresso", async () => {
    const provider = {
      sendText: vi.fn(async () => ({ provider: "evolution-go" as const, messageId: "wa-1", raw: null })),
    };
    const { port } = memoryProgress();
    const sleep = vi.fn(async () => undefined);
    const outcome = await dispatchAiReply(
      provider,
      { ...reply, text: "A Aplicação 5D custa R$ 190 💖" },
      { progress: port, sleep },
    );
    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(provider.sendText).toHaveBeenCalledWith({
      to: reply.to,
      text: "A Aplicação 5D custa R$ 190 💖",
      quotedMessageId: "3EB0IN",
      quotedParticipant: reply.quotedParticipant,
      correlationId: "ai-row-1",
      requestId: "req-1",
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(port.readPartsSent).not.toHaveBeenCalled();
    expect(port.recordPartsSent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "sent", providerMessageId: "wa-1" });
  });

  it("falha no meio sobe o erro com o progresso gravado; o retry retoma sem duplicar", async () => {
    const delivered: string[] = [];
    let failNext = true;
    const provider = {
      sendText: vi.fn(async (input: SendTextInput) => {
        if (input.correlationId === "ai-row-1-p2" && failNext) {
          failNext = false;
          throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
        }
        delivered.push(input.text);
        return { provider: "evolution-go" as const, messageId: input.correlationId, raw: null };
      }),
    };
    const { port, state } = memoryProgress();

    const first = dispatchAiReply(provider, reply, { progress: port });
    const firstResult = first.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    await expect(firstResult).resolves.toMatchObject({ code: "ECONNREFUSED" });
    expect(delivered).toEqual(["Oi!"]);
    expect(state.partsSent).toBe(1);

    const retry = dispatchAiReply(provider, reply, { progress: port });
    await vi.runAllTimersAsync();
    await expect(retry).resolves.toMatchObject({ status: "sent", partsSent: 3 });
    expect(delivered).toEqual([
      "Oi!",
      "A Aplicação 5D custa R$ 190 💖",
      "Se quiser, posso te ajudar a agendar também.",
    ]);
    // Nenhuma parte confirmada foi reenviada.
    expect(
      provider.sendText.mock.calls.filter(([input]) => input.correlationId === "ai-row-1-p1"),
    ).toHaveLength(1);
  });

  it("retry com todas as partes ja enviadas nao envia nada", async () => {
    const provider = { sendText: vi.fn() };
    const { port } = memoryProgress(3);
    const outcome = await dispatchAiReply(provider, reply, { progress: port });
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: "sent", providerMessageId: "ai-row-1" });
  });

  it("interrompe a sequencia quando shouldStop responde motivo e descarta o resto", async () => {
    const provider = {
      sendText: vi.fn(async (input: SendTextInput) => ({
        provider: "evolution-go" as const,
        messageId: input.correlationId,
        raw: null,
      })),
    };
    const shouldStop = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("human_handling");
    const pending = dispatchAiReply(provider, reply, { shouldStop });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({
      status: "stopped",
      reason: "human_handling",
      partsSent: 2,
      totalParts: 3,
    });
    expect(provider.sendText).toHaveBeenCalledTimes(2);
  });
});

describe("eco das partes no canal", () => {
  it("parte anterior a ultima e reconhecida como saida da IA, nao como atividade manual", async () => {
    const { createFakePrisma } = await import("../session/support/fake-prisma.js");
    const { HandoffService } = await import("../../src/modules/handoff/HandoffService.js");
    const { store, prisma } = createFakePrisma();
    const scope = { tenantId: "tenant-1", channelId: "channel-1" };
    await store.message.create({
      data: {
        ...scope,
        direction: "OUTBOUND",
        correlationId: "ai-0b6f6c1e-1111-4222-8333-944455556666",
        externalMessageId: null,
      },
    });
    const handoff = new HandoffService(prisma, scope);

    await expect(
      handoff.isBotOutboundMessage("ai-0b6f6c1e-1111-4222-8333-944455556666-p1"),
    ).resolves.toBe(true);
    await expect(
      handoff.isBotOutboundMessage("ai-0b6f6c1e-1111-4222-8333-944455556666"),
    ).resolves.toBe(true);
    await expect(handoff.isBotOutboundMessage("3EB0HUMANO")).resolves.toBe(false);
    await expect(
      handoff.isBotOutboundMessage("ai-ffffffff-1111-4222-8333-944455556666-p1"),
    ).resolves.toBe(false);
  });
});
