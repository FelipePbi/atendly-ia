import { describe, expect, it } from "vitest";

import { BffHttpClient } from "../src/data/http/BffHttpClient";
import { messageSchema } from "../src/data/mappers/publicApiSchemas";
import { BffConversationService } from "../src/data/services/BffConversationService";

/**
 * Goal013: kind e attachment de mídia no DTO de mensagem, e o método de
 * mídia sob demanda no serviço de conversas. Sem tela: o player e a exibição
 * são do Goal017 — aqui é só o contrato que a camada de dados precisa
 * entender.
 */

const textMessage = {
  id: "message-1",
  direction: "OUTBOUND" as const,
  source: "AI" as const,
  body: "Olá!",
  createdAt: "2026-09-13T12:00:00.000Z",
};

const audioAttachment = {
  kind: "AUDIO" as const,
  mimetype: "audio/ogg",
  fileName: null,
  sizeBytes: 12_345,
  durationSeconds: 8,
  tooLarge: false,
  transcript: "Oi, gostaria de agendar um horário.",
  transcriptStatus: "DONE" as const,
  transcriptError: null,
  mediaAvailable: true,
};

describe("contrato de kind e attachment de mídia (Goal013)", () => {
  it("decodifica mensagem legada sem kind nem attachment", () => {
    const message = messageSchema.parse(textMessage);
    expect(message.kind).toBeUndefined();
    expect(message.attachment).toBeUndefined();
  });

  it("decodifica mensagem de texto explícita, sem attachment", () => {
    const message = messageSchema.parse({
      ...textMessage,
      kind: "TEXT",
      attachment: null,
    });
    expect(message.kind).toBe("TEXT");
    expect(message.attachment).toBeNull();
  });

  it("decodifica mensagem de áudio com transcrição concluída", () => {
    const message = messageSchema.parse({
      ...textMessage,
      id: "message-2",
      direction: "INBOUND",
      source: "CUSTOMER",
      kind: "AUDIO",
      attachment: audioAttachment,
    });
    expect(message.kind).toBe("AUDIO");
    expect(message.attachment).toMatchObject({
      kind: "AUDIO",
      transcriptStatus: "DONE",
      mediaAvailable: true,
    });
  });

  it("decodifica attachment de mídia grande demais, sem transcrição", () => {
    const message = messageSchema.parse({
      ...textMessage,
      id: "message-3",
      kind: "IMAGE",
      attachment: {
        kind: "IMAGE",
        mimetype: "image/jpeg",
        fileName: "foto.jpg",
        sizeBytes: 9_000_000,
        durationSeconds: null,
        tooLarge: true,
        transcript: null,
        transcriptStatus: null,
        transcriptError: null,
        mediaAvailable: false,
      },
    });
    expect(message.attachment?.tooLarge).toBe(true);
    expect(message.attachment?.mediaAvailable).toBe(false);
  });

  it("recusa kind de mensagem fora do vocabulário", () => {
    expect(() =>
      messageSchema.parse({ ...textMessage, kind: "GIF" }),
    ).toThrow();
  });

  it("recusa kind de attachment fora do vocabulário", () => {
    expect(() =>
      messageSchema.parse({
        ...textMessage,
        kind: "AUDIO",
        attachment: { ...audioAttachment, kind: "TEXT" },
      }),
    ).toThrow();
  });

  it("recusa transcriptStatus fora do vocabulário", () => {
    expect(() =>
      messageSchema.parse({
        ...textMessage,
        kind: "AUDIO",
        attachment: { ...audioAttachment, transcriptStatus: "PROCESSING" },
      }),
    ).toThrow();
  });
});

describe("BffConversationService.getMedia (Goal013)", () => {
  it("busca o corpo bruto da mídia pela rota de mensagem/attachment", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImplementation: typeof fetch = async (input, init) => {
      calls.push({
        url: new Request(input as RequestInfo, init).url,
        method: init?.method ?? "GET",
      });
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-disposition": 'inline; filename="foto.jpg"',
        },
      });
    };
    const http = new BffHttpClient({
      baseUrl: "https://bff.example.invalid",
      fetchImplementation,
    });
    const service = new BffConversationService(http);

    const media = await service.getMedia("conversation-1", "message-1");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "https://bff.example.invalid/v1/conversations/conversation-1/messages/message-1/media",
    );
    expect(media.contentType).toBe("image/jpeg");
    expect(media.fileName).toBe("foto.jpg");
    expect(await media.blob.arrayBuffer()).toEqual(bytes.buffer);
  });

  it("recusa com o mesmo envelope de erro das demais rotas quando a mídia não está disponível", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          error: { code: "UPSTREAM_ERROR", message: "Mídia indisponível." },
          requestId: "request-1",
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    const http = new BffHttpClient({
      baseUrl: "https://bff.example.invalid",
      fetchImplementation,
    });
    const service = new BffConversationService(http);

    await expect(
      service.getMedia("conversation-1", "message-1"),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});
