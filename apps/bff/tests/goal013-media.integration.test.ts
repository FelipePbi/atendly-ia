import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal013, WU-06 — DTO de mensagem com `kind`/`attachment` e rota de mídia no
 * BFF, com a IA como dublê HTTP.
 *
 * O que é do BFF, provado aqui: o DTO da IA (com attachment) chega ao
 * consumidor sem reescrita, mensagem legada sem `kind`/`attachment` continua
 * decodificando, a rota de mídia repassa bytes e cabeçalhos exatamente como a
 * rota interna devolve, recusas próprias da IA chegam com código (nunca
 * `500` genérico) e o tenant repassado é sempre o da sessão autenticada, não
 * um valor fixo ou vazado entre negócios. A regra de negócio da mídia em si
 * — transcrição, purga de bytes, `tooLarge` — é provada nas suítes da IA.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  tenantId: string | null;
}

const upstream: UpstreamCall[] = [];

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Dublê HTTP da IA por rota interna. `respond` devolve a `Response` completa
 * (JSON ou binária); ausência de handler é erro de teste, não 200 silencioso.
 */
function stubUpstream(respond: (call: UpstreamCall) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        tenantId: request.headers.get("x-tenant-id"),
      };
      upstream.push(call);
      return respond(call);
    }),
  );
}

function messagePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "message-1",
    direction: "INBOUND",
    source: "CUSTOMER",
    body: "",
    createdAt: "2026-09-13T12:00:00.000Z",
    ...overrides,
  };
}

function attachmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "AUDIO",
    mimetype: "audio/ogg",
    fileName: null,
    sizeBytes: 20_480,
    durationSeconds: 12,
    tooLarge: false,
    transcript: "Quero agendar para amanhã às 14h.",
    transcriptStatus: "DONE",
    transcriptError: null,
    mediaAvailable: true,
    ...overrides,
  };
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal013: mídia no BFF", () => {
  it("lista mensagens com kind e attachment repassados exatamente como a IA devolve", async () => {
    const owner = await business("media-listing");
    stubUpstream((call) => {
      expect(call.path).toBe("/internal/conversations/conversation-1/messages");
      expect(call.tenantId).toBe(owner.tenantId);
      return jsonResponse({
        data: [
          messagePayload({
            id: "message-audio",
            kind: "AUDIO",
            attachment: attachmentPayload(),
          }),
          // Mensagem legada: sem kind nem attachment, como o estoque anterior
          // ao Goal013 continua devolvendo.
          messagePayload({ id: "message-legacy", body: "Oi, tudo bem?" }),
        ],
        requestId: "up-list",
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const messages = response.json().data;
    expect(messages).toHaveLength(2);
    expect(messages[0].kind).toBe("AUDIO");
    expect(messages[0].attachment).toEqual(attachmentPayload());
    expect(messages[1].kind).toBeUndefined();
    expect(messages[1].attachment).toBeUndefined();
  });

  it("devolve bytes e cabeçalhos por GET /v1/conversations/:id/messages/:messageId/media", async () => {
    const owner = await business("media-bytes");
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    stubUpstream((call) => {
      expect(call.path).toBe(
        "/internal/conversations/conversation-1/messages/message-image/media",
      );
      expect(call.tenantId).toBe(owner.tenantId);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-disposition": 'inline; filename="foto.png"',
        },
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages/message-image/media",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["content-disposition"]).toContain("foto.png");
    expect(Buffer.compare(response.rawPayload, bytes)).toBe(0);
  });

  it("repassa uma recusa própria da IA (mídia indisponível) com código, nunca 500 genérico", async () => {
    const owner = await business("media-unavailable");
    stubUpstream((call) => {
      expect(call.path).toBe(
        "/internal/conversations/conversation-1/messages/message-image/media",
      );
      return jsonResponse(
        {
          error: {
            code: "MEDIA_UNAVAILABLE",
            message: "Media is not available from the origin anymore.",
          },
          requestId: "up-refusal",
        },
        409,
      );
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages/message-image/media",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("UPSTREAM_ERROR");
    expect(response.json().error.details.upstreamCode).toBe("MEDIA_UNAVAILABLE");
  });

  it("repassa a recusa de attachment grande demais (tooLarge) com código próprio", async () => {
    const owner = await business("media-too-large");
    stubUpstream(() =>
      jsonResponse(
        {
          error: {
            code: "MEDIA_TOO_LARGE",
            message: "Attachment is too large to be shown.",
          },
          requestId: "up-too-large",
        },
        409,
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages/message-video/media",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.details.upstreamCode).toBe("MEDIA_TOO_LARGE");
  });

  it("repassa sempre o tenant da própria sessão, nunca um valor fixo entre negócios", async () => {
    const first = await business("media-isolation-a");
    const second = await business("media-isolation-b");
    const bytes = Buffer.from("conteudo-do-negocio");
    stubUpstream((call) =>
      call.tenantId === first.tenantId
        ? new Response(bytes, { status: 200, headers: { "content-type": "application/pdf" } })
        : new Response("not found for this tenant", { status: 404 }),
    );

    const ownResponse = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages/message-doc/media",
      headers: browserRead(first),
    });
    expect(ownResponse.statusCode).toBe(200);
    expect(upstream[0]?.tenantId).toBe(first.tenantId);

    // Mesma conversa/mensagem, sessão de outro negócio: o BFF repassa o
    // tenant da segunda sessão, não reaproveita nem vaza o da primeira — é a
    // IA que decide se a conversa pertence a esse tenant.
    const otherResponse = await app.inject({
      method: "GET",
      url: "/v1/conversations/conversation-1/messages/message-doc/media",
      headers: browserRead(second),
    });
    expect(otherResponse.statusCode).toBe(404);
    expect(upstream[1]?.tenantId).toBe(second.tenantId);
    expect(upstream[1]?.tenantId).not.toBe(upstream[0]?.tenantId);
  });
});
