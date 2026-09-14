/**
 * Bytes de midia sob demanda (Goal013/WU-05).
 *
 * Sem rede real: `mediaUrl` hospedada e o download sob demanda sao dublados
 * (fetch e provedor), no mesmo espirito de
 * `tests/media/evolution-download-media.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { MessageMediaService } from "../../src/modules/media/message-media-service.js";

const TENANT = "tenant-1";
const CONVERSATION = "conversation-1";
const MESSAGE = "message-1";

function fakePrisma(message: Record<string, unknown> | null) {
  return {
    message: {
      findFirst: vi.fn().mockResolvedValue(message),
    },
  } as unknown as PrismaClient;
}

function baseMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: MESSAGE,
    tenantId: TENANT,
    conversationId: CONVERSATION,
    rawPayload: {
      data: {
        Message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } },
      },
    },
    channel: {
      tenantId: TENANT,
      externalInstanceId: "instance-1",
      credentialCipher: "cipher",
      credentialVersion: 1,
    },
    attachments: [
      {
        id: "attachment-1",
        kind: "AUDIO",
        mimetype: "audio/ogg; codecs=opus",
        fileName: "audio.ogg",
        mediaUrl: null,
        tooLarge: false,
      },
    ],
    ...overrides,
  };
}

describe("MessageMediaService.resolve", () => {
  it("recusa MESSAGE_NOT_FOUND quando a mensagem nao existe no tenant/conversa", async () => {
    const service = new MessageMediaService(fakePrisma(null), () => ({}));

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MESSAGE_NOT_FOUND" });
  });

  it("recusa MESSAGE_ATTACHMENT_NOT_FOUND quando a mensagem nao tem midia", async () => {
    const service = new MessageMediaService(
      fakePrisma(baseMessage({ attachments: [] })),
      () => ({}),
    );

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MESSAGE_ATTACHMENT_NOT_FOUND" });
  });

  it("recusa MEDIA_TOO_LARGE sem tentar baixar nada", async () => {
    const fetchMedia = vi.fn();
    const buildProvider = vi.fn();
    const service = new MessageMediaService(
      fakePrisma(
        baseMessage({
          attachments: [{ id: "a1", kind: "AUDIO", mimetype: null, fileName: null, mediaUrl: null, tooLarge: true }],
        }),
      ),
      buildProvider,
      fetchMedia as unknown as typeof fetch,
    );

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_TOO_LARGE" });
    expect(fetchMedia).not.toHaveBeenCalled();
    expect(buildProvider).not.toHaveBeenCalled();
  });

  it("busca a URL hospedada e devolve bytes e mimetype quando o attachment tem mediaUrl", async () => {
    const bytes = new TextEncoder().encode("bytes-hospedados");
    const fetchMedia = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const service = new MessageMediaService(
      fakePrisma(
        baseMessage({
          attachments: [
            {
              id: "a1",
              kind: "IMAGE",
              mimetype: null,
              fileName: "foto.jpg",
              mediaUrl: "https://storage.example/foto.jpg",
              tooLarge: false,
            },
          ],
        }),
      ),
      () => ({}),
      fetchMedia as unknown as typeof fetch,
    );

    const result = await service.resolve({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      messageId: MESSAGE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava sucesso");
    expect(Buffer.from(result.media.data).toString()).toBe("bytes-hospedados");
    expect(result.media.mimetype).toBe("image/jpeg");
    expect(result.media.fileName).toBe("foto.jpg");
    expect(fetchMedia).toHaveBeenCalledWith("https://storage.example/foto.jpg");
  });

  it("recusa MEDIA_UNAVAILABLE quando a URL hospedada falha, sem cair para o download sob demanda", async () => {
    const fetchMedia = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const buildProvider = vi.fn();
    const service = new MessageMediaService(
      fakePrisma(
        baseMessage({
          attachments: [
            { id: "a1", kind: "IMAGE", mimetype: "image/jpeg", fileName: null, mediaUrl: "https://storage.example/x.jpg", tooLarge: false },
          ],
        }),
      ),
      buildProvider,
      fetchMedia as unknown as typeof fetch,
    );

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
    expect(buildProvider).not.toHaveBeenCalled();
  });

  it("baixa sob demanda pela credencial do canal quando nao ha mediaUrl", async () => {
    const audioBytes = Buffer.from("bytes-de-audio");
    const downloadMedia = vi.fn().mockResolvedValue({
      provider: "evolution-go",
      base64: `data:audio/ogg;base64,${audioBytes.toString("base64")}`,
    });
    const buildProvider = vi.fn().mockReturnValue({ downloadMedia });
    const service = new MessageMediaService(fakePrisma(baseMessage()), buildProvider);

    const result = await service.resolve({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      messageId: MESSAGE,
      requestId: "request-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("esperava sucesso");
    expect(Buffer.from(result.media.data).toString()).toBe("bytes-de-audio");
    expect(result.media.fileName).toBe("audio.ogg");
    expect(downloadMedia).toHaveBeenCalledWith({
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } },
      requestId: "request-1",
    });
    expect(buildProvider).toHaveBeenCalledWith(
      expect.objectContaining({ externalInstanceId: "instance-1" }),
    );
  });

  it("recusa MEDIA_UNAVAILABLE quando a credencial do canal nao esta provisionada", async () => {
    const buildProvider = vi.fn().mockImplementation(() => {
      throw new Error("credential not provisioned");
    });
    const service = new MessageMediaService(fakePrisma(baseMessage()), buildProvider);

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
  });

  it("recusa MEDIA_UNAVAILABLE quando o provedor nao sabe baixar midia", async () => {
    const service = new MessageMediaService(fakePrisma(baseMessage()), () => ({}));

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
  });

  it("recusa MEDIA_UNAVAILABLE quando nao ha proto de midia no rawPayload", async () => {
    const downloadMedia = vi.fn();
    const service = new MessageMediaService(
      fakePrisma(baseMessage({ rawPayload: { data: { Message: {} } } })),
      () => ({ downloadMedia }),
    );

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
    expect(downloadMedia).not.toHaveBeenCalled();
  });

  it("recusa MEDIA_UNAVAILABLE quando o download sob demanda falha", async () => {
    const downloadMedia = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const service = new MessageMediaService(fakePrisma(baseMessage()), () => ({ downloadMedia }));

    await expect(
      service.resolve({ tenantId: TENANT, conversationId: CONVERSATION, messageId: MESSAGE }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
  });
});
