import { describe, expect, it } from "vitest";
import { mapEvolutionInbound } from "../../src/modules/channel/adapters/evolution/EvolutionInboundMapper.js";

describe("EvolutionInboundMapper", () => {
  it("normalizes a text message into the internal channel contract", () => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: "3EB0C05FF2D3A0068B2A2D",
          Type: "text",
          PushName: "Maria",
          Timestamp: "2026-05-24T12:00:00-03:00",
          MediaType: "",
        },
        Message: {
          conversation: "quanto custa manicure?",
        },
      },
    });

    expect(message).toMatchObject({
      provider: "evolution-go",
      instanceId: "instance-1",
      messageId: "3EB0C05FF2D3A0068B2A2D",
      chatId: "5511999999999@s.whatsapp.net",
      customerPhone: "5511999999999",
      customerName: "Maria",
      fromMe: false,
      isGroup: false,
      kind: "text",
      text: "quanto custa manicure?",
      timestamp: "2026-05-24T12:00:00-03:00",
    });
  });

  it.each([
    ["audio", "audio"],
    ["image", "image"],
    ["document", "document"],
    ["video", "video"],
    ["sticker", "sticker"],
  ] as const)("classifies media type %s as %s", (mediaType, kind) => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: `message-${mediaType}`,
          Type: "media",
          MediaType: mediaType,
        },
        Message: {},
      },
    });

    expect(message?.kind).toBe(kind);
  });

  it("extracts media metadata from the proto sub-object and the merged Go fields", () => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: "message-audio-1",
          Type: "media",
          MediaType: "audio",
        },
        Message: {
          audioMessage: {
            mimetype: "audio/ogg; codecs=opus",
            fileSHA256: "aGVsbG8=",
            fileLength: 12_345,
            seconds: 7,
          },
          base64: "d2hhdHNhcHAtYXVkaW8=",
        },
      },
    });

    expect(message?.media).toEqual({
      mimetype: "audio/ogg; codecs=opus",
      fileName: undefined,
      sizeBytes: 12_345,
      durationSeconds: 7,
      sha256: "aGVsbG8=",
      hasBase64: true,
      hasMediaUrl: false,
      mediaUrl: undefined,
      tooLarge: false,
    });
  });

  it("marks a WhatsApp GIF, which travels as a video message", () => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: "message-gif-1",
          Type: "media",
          MediaType: "video",
        },
        Message: {
          videoMessage: {
            mimetype: "video/mp4",
            fileLength: 240_000,
            seconds: 3,
            gifPlayback: true,
          },
          base64: "d2hhdHNhcHAtZ2lm",
        },
      },
    });

    // O kind continua `video`: o arquivo e um video e e assim que ele e
    // persistido. A marca e o que o grafo usa para nao responder nem renovar
    // a sessao (Goal013).
    expect(message?.kind).toBe("video");
    expect(message?.media?.gifPlayback).toBe(true);
  });

  it("does not mark a plain video as a GIF", () => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: "message-video-1",
          Type: "media",
          MediaType: "video",
        },
        Message: {
          videoMessage: { mimetype: "video/mp4", fileLength: 5_000_000 },
        },
      },
    });

    expect(message?.media?.gifPlayback).toBeUndefined();
  });

  it("maps a too-large document as an attachment without inline bytes", () => {
    const message = mapEvolutionInbound({
      event: "Message",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511999999999@s.whatsapp.net",
          Sender: "5511999999999@s.whatsapp.net",
          IsFromMe: false,
          IsGroup: false,
          ID: "message-document-1",
          Type: "media",
          MediaType: "document",
        },
        Message: {
          documentMessage: {
            mimetype: "application/pdf",
            fileName: "contrato.pdf",
          },
          mimetype: "application/pdf",
          fileName: "message-document-1.pdf",
          mediaSize: 40_000_000,
          mediaTooLarge: true,
        },
      },
    });

    expect(message?.media).toMatchObject({
      mimetype: "application/pdf",
      fileName: "contrato.pdf",
      sizeBytes: 40_000_000,
      hasBase64: false,
      tooLarge: true,
    });
  });

  it("uses chat id as the customer phone for fromMe events", () => {
    const message = mapEvolutionInbound({
      event: "SendMessage",
      instanceId: "instance-1",
      data: {
        Info: {
          Chat: "5511888888888@s.whatsapp.net",
          Sender: "5511777777777@s.whatsapp.net",
          IsFromMe: true,
          IsGroup: false,
          ID: "sent-1",
          Type: "text",
        },
        Message: {
          conversation: "mensagem manual",
        },
      },
    });

    expect(message?.customerPhone).toBe("5511888888888");
    expect(message?.fromMe).toBe(true);
  });

  it("returns null for invalid or irrelevant payloads", () => {
    expect(mapEvolutionInbound({})).toBeNull();
    expect(mapEvolutionInbound({ event: "QRCode" })).toBeNull();
    expect(mapEvolutionInbound(null)).toBeNull();
  });
});
