import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [
  { registerInternalRoutes, requiredScope },
  { expectedToken },
  { AppError, toErrorMessage },
] = await Promise.all([
  import("../../src/modules/internal/routes.js"),
  import("../../src/lib/internal-credentials.js"),
  import("../../src/lib/errors.js"),
]);

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const CONVERSATION = "conversation-1";
const MESSAGE = "message-1";

type MediaResult =
  | { ok: true; media: { data: Uint8Array; mimetype: string; fileName?: string } }
  | {
      ok: false;
      reason:
        | "MESSAGE_NOT_FOUND"
        | "MESSAGE_ATTACHMENT_NOT_FOUND"
        | "MEDIA_TOO_LARGE"
        | "MEDIA_UNAVAILABLE";
    };

function fakeMedia(result: MediaResult) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    service: {
      async resolve(args: unknown) {
        calls.push(args as Record<string, unknown>);
        return result;
      },
    },
  };
}

/**
 * Prisma em dobro com duas conversas de tenants diferentes: o mesmo padrao de
 * `conversation-controls.routes.test.ts`, so o suficiente para
 * `requireConversation` provar isolamento antes de chamar a resolucao de midia.
 */
function fakePrisma() {
  const rows = [
    { id: CONVERSATION, tenantId: TENANT },
    { id: "conversation-2", tenantId: OTHER_TENANT },
  ];
  return {
    conversation: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const found = rows.find(
          (item) => item.id === where.id && item.tenantId === where.tenantId,
        );
        return found
          ? {
              ...found,
              messages: [],
              handoffs: [],
              contact: null,
              sessions: [],
              channel: { id: `channel-${found.tenantId}`, tenantId: found.tenantId },
            }
          : null;
      },
    },
  } as never;
}

function headers(tenantId = TENANT, token = expectedToken("command")) {
  return {
    authorization: `Bearer ${token}`,
    "x-tenant-id": tenantId,
    "x-user-id": "user-1",
  };
}

async function buildApp(result: MediaResult) {
  const app = Fastify();
  const media = fakeMedia(result);
  await registerInternalRoutes(app, fakePrisma(), { media: media.service });
  // Mesmo envelope de erro de `buildApp()` (src/app.ts): sem isto, o handler
  // padrao do Fastify nao devolve o `code` da recusa no corpo da resposta.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: error.message,
        code: error.code,
        requestId: request.id,
      });
    }
    return reply
      .code(500)
      .send({ ok: false, error: toErrorMessage(error), requestId: request.id });
  });
  await app.ready();
  return { app, media };
}

describe("rota de midia sob demanda (Goal013/WU-05)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("devolve os bytes com content-type e nome do arquivo", async () => {
    const built = await buildApp({
      ok: true,
      media: {
        data: new TextEncoder().encode("bytes-de-audio"),
        mimetype: "audio/ogg; codecs=opus",
        fileName: "audio.ogg",
      },
    });
    app = built.app;

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("audio/ogg; codecs=opus");
    expect(response.headers["content-disposition"]).toBe(
      'inline; filename="audio.ogg"',
    );
    expect(response.rawPayload.toString()).toBe("bytes-de-audio");
    expect(built.media.calls[0]).toMatchObject({
      tenantId: TENANT,
      conversationId: CONVERSATION,
      messageId: MESSAGE,
    });
  });

  it("devolve os bytes sem cabecalho de nome quando o attachment nao tem fileName", async () => {
    const built = await buildApp({
      ok: true,
      media: {
        data: new TextEncoder().encode("bytes"),
        mimetype: "image/jpeg",
      },
    });
    app = built.app;

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBeUndefined();
  });

  it.each([
    ["MESSAGE_NOT_FOUND", 404],
    ["MESSAGE_ATTACHMENT_NOT_FOUND", 404],
    ["MEDIA_TOO_LARGE", 409],
    ["MEDIA_UNAVAILABLE", 409],
  ] as const)(
    "recusa com codigo proprio %s e status %i, nunca 500 generico",
    async (reason, status) => {
      const built = await buildApp({ ok: false, reason });
      app = built.app;

      const response = await app.inject({
        method: "GET",
        url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
        headers: headers(),
      });

      expect(response.statusCode).toBe(status);
      expect(response.json().code).toBe(reason);
    },
  );

  it("nao encontra a conversa do outro tenant, e nunca chama a resolucao de midia", async () => {
    const built = await buildApp({
      ok: true,
      media: { data: new Uint8Array(), mimetype: "image/jpeg" },
    });
    app = built.app;

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/conversation-2/messages/${MESSAGE}/media`,
      headers: headers(TENANT),
    });

    expect(response.statusCode).toBe(404);
    expect(built.media.calls).toHaveLength(0);
  });

  it("exige o escopo de leitura de conversa, como as demais leituras", () => {
    expect(
      requiredScope({
        method: "GET",
        url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
      } as never),
    ).toBe("conversations:read");
  });

  it("recusa chamada sem credencial", async () => {
    const built = await buildApp({
      ok: true,
      media: { data: new Uint8Array(), mimetype: "image/jpeg" },
    });
    app = built.app;

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
      headers: { "x-tenant-id": TENANT, "x-user-id": "user-1" },
    });

    expect(response.statusCode).toBe(401);
    expect(built.media.calls).toHaveLength(0);
  });

  it("recusa credencial de provisionamento", async () => {
    const built = await buildApp({
      ok: true,
      media: { data: new Uint8Array(), mimetype: "image/jpeg" },
    });
    app = built.app;

    const response = await app.inject({
      method: "GET",
      url: `/internal/conversations/${CONVERSATION}/messages/${MESSAGE}/media`,
      headers: headers(TENANT, expectedToken("provisioning")),
    });

    expect(response.statusCode).toBe(403);
    expect(built.media.calls).toHaveLength(0);
  });
});
