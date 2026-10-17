/**
 * Validade do link de mídia do WhatsApp (2026-10-16).
 *
 * O `directPath` guardado no proto é um link assinado da CDN que vence
 * (parâmetro `oe`, timestamp Unix em hexadecimal). Passado o prazo o download
 * sob demanda sempre falha, então a listagem de mensagens já diz
 * `mediaAvailable: false` — a tela mostra "Mídia indisponível" sem esperar a
 * ida ao WhatsApp — e a rota de bytes recusa sem chamar o provedor.
 */
import { randomBytes } from "node:crypto";

import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.stubEnv("INTERNAL_SERVICE_TOKEN", "root-internal-secret-with-32-chars-min");
vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", `v1:${randomBytes(32).toString("base64")}`);
vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", "v1");

const [{ registerInternalRoutes }, { expectedToken }, mediaBytes, mediaService] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/modules/media/media-bytes.js"),
    import("../../src/modules/media/message-media-service.js"),
  ]);

const NOW = new Date("2026-10-16T12:00:00.000Z");
const PAST = Math.floor(Date.parse("2026-10-10T00:00:00.000Z") / 1000).toString(16);
const FUTURE = Math.floor(Date.parse("2026-11-11T19:36:38.000Z") / 1000).toString(16);

function imagePayload(oe?: string) {
  const query = oe ? `?ccb=11-4&oh=01_x&oe=${oe}&_nc_sid=5e03e0` : "?ccb=11-4";
  return {
    data: {
      Message: {
        imageMessage: {
          URL: `https://mmg.whatsapp.net/v/t62/abc.enc${query}`,
          directPath: `/v/t62/abc.enc${query}`,
          mediaKey: "chave",
          mimetype: "image/jpeg",
        },
      },
    },
  };
}

const attachment = { tooLarge: false, mediaUrl: null };

describe("readMediaExpiry", () => {
  it("lê o oe hexadecimal do directPath", () => {
    expect(mediaBytes.readMediaExpiry(imagePayload("6AF4C3C6"))?.toISOString()).toBe(
      "2026-11-11T19:36:38.000Z",
    );
  });

  it("devolve undefined quando o link não traz validade ou não há mídia", () => {
    expect(mediaBytes.readMediaExpiry(imagePayload())).toBeUndefined();
    expect(
      mediaBytes.readMediaExpiry({ data: { Message: { conversation: "oi" } } }),
    ).toBeUndefined();
    expect(mediaBytes.readMediaExpiry(null)).toBeUndefined();
  });
});

describe("isMediaRetrievable", () => {
  it("link no prazo ou sem validade conhecida: vale tentar", () => {
    expect(mediaService.isMediaRetrievable(attachment, imagePayload(FUTURE), NOW)).toBe(true);
    expect(mediaService.isMediaRetrievable(attachment, imagePayload(), NOW)).toBe(true);
  });

  it("link vencido, sem proto ou grande demais: indisponível", () => {
    expect(mediaService.isMediaRetrievable(attachment, imagePayload(PAST), NOW)).toBe(false);
    expect(mediaService.isMediaRetrievable(attachment, null, NOW)).toBe(false);
    expect(
      mediaService.isMediaRetrievable({ tooLarge: true, mediaUrl: null }, imagePayload(FUTURE), NOW),
    ).toBe(false);
  });

  it("URL hospedada não depende do link do WhatsApp", () => {
    expect(
      mediaService.isMediaRetrievable(
        { tooLarge: false, mediaUrl: "https://storage.example/foto.jpg" },
        imagePayload(PAST),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("MessageMediaService com link vencido", () => {
  it("recusa MEDIA_UNAVAILABLE sem montar o provedor", async () => {
    const buildProvider = vi.fn();
    const prisma = {
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m1",
          rawPayload: imagePayload(PAST),
          channel: {},
          attachments: [
            { id: "a1", kind: "IMAGE", mimetype: "image/jpeg", fileName: null, mediaUrl: null, tooLarge: false },
          ],
        }),
      },
    };
    const service = new mediaService.MessageMediaService(
      prisma as never,
      buildProvider,
      fetch,
      undefined,
      () => NOW,
    );

    await expect(
      service.resolve({ tenantId: "t", conversationId: "c", messageId: "m1" }),
    ).resolves.toEqual({ ok: false, reason: "MEDIA_UNAVAILABLE" });
    expect(buildProvider).not.toHaveBeenCalled();
  });
});

describe("GET /internal/conversations/:id/messages", () => {
  function message(id: string, rawPayload: unknown) {
    return {
      id,
      direction: "INBOUND",
      source: "CUSTOMER",
      body: "",
      createdAt: new Date("2026-10-12T21:45:09.000Z"),
      kind: "IMAGE",
      deliveryState: null,
      deliveryDetail: null,
      rawPayload,
      attachments: [
        {
          kind: "IMAGE",
          mimetype: "image/jpeg",
          fileName: null,
          sizeBytes: 1000,
          durationSeconds: null,
          mediaUrl: null,
          tooLarge: false,
          transcript: null,
          transcriptStatus: null,
          transcriptError: null,
        },
      ],
    };
  }

  it("mediaAvailable segue o link do WhatsApp guardado em cada mensagem", async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    try {
      const prisma = {
        conversation: {
          findFirst: async () => ({ id: "c1", tenantId: "t1", messages: [], handoffs: [], sessions: [] }),
        },
        message: {
          findMany: async () => [
            message("vigente", imagePayload(FUTURE)),
            message("vencida", imagePayload(PAST)),
            message("sem-proto", null),
          ],
        },
      };
      const app = Fastify();
      await registerInternalRoutes(app, prisma as never, {
        inbox: { countDeadLetters: async () => 0 } as never,
      });

      const response = await app.inject({
        method: "GET",
        url: "/internal/conversations/c1/messages",
        headers: {
          authorization: `Bearer ${expectedToken("command")}`,
          "x-service-audience": "ai-orchestrator",
          "x-tenant-id": "t1",
          "x-user-id": "u1",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        data: Array<{ id: string; attachment: { mediaAvailable: boolean } }>;
      };
      expect(
        Object.fromEntries(body.data.map((m) => [m.id, m.attachment.mediaAvailable])),
      ).toEqual({ vigente: true, vencida: false, "sem-proto": false });
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
