import { afterEach, describe, expect, it, vi } from "vitest";

import { conversationEventSchema } from "@atendly-ia/public-api-contract";
import { AppError } from "../src/lib/errors.js";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const { AiOrchestratorClient } = await import(
  "../src/clients/ai-orchestrator/index.js"
);

/**
 * Goal070/WU-02 — proxy fino de `GET /v1/conversations/:id/events`, igual a
 * `listMessages`: repassa o array da rota interna, sem tocar no formato, e
 * deixa a recusa da rota interna atravessar pelo mesmo `UPSTREAM_ERROR` que
 * `/messages` já usa.
 */

const context = { tenantId: "tenant-1", userId: "user-1", requestId: "req-1" };

function stubFetch(status: number, payload: unknown) {
  const calls: { url: string; tenantId: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      calls.push({
        url: request.url,
        tenantId: request.headers.get("x-tenant-id"),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiOrchestratorClient.listConversationEvents", () => {
  it("chama a rota interna de eventos e devolve o array decodificado", async () => {
    const events = [
      {
        type: "HOLD_PLACED",
        id: "call-1",
        occurredAt: "2026-09-27T10:00:00.000Z",
        date: "2026-09-28",
        startTime: "14:00",
        holdExpiresAt: "2026-09-27T10:10:00.000Z",
      },
      {
        type: "HOLD_EXPIRED",
        id: "call-1:expired",
        occurredAt: "2026-09-27T10:10:00.000Z",
        date: "2026-09-28",
        startTime: "14:00",
      },
      {
        type: "APPOINTMENT_CREATED",
        id: "call-2",
        occurredAt: "2026-09-27T10:15:00.000Z",
        appointmentId: "appt-1",
        date: "2026-09-28",
        startTime: "15:00",
      },
    ];
    const calls = stubFetch(200, { data: events, requestId: "upstream-1" });
    const client = new AiOrchestratorClient();

    const result = await client.listConversationEvents(context, "conv-1");

    expect(result).toEqual(events);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      "/internal/conversations/conv-1/events",
    );
    expect(calls[0].tenantId).toBe("tenant-1");
  });

  it("devolve array vazio quando a conversa não teve nenhum evento", async () => {
    stubFetch(200, { data: [], requestId: "upstream-2" });
    const client = new AiOrchestratorClient();

    const result = await client.listConversationEvents(context, "conv-2");

    expect(result).toEqual([]);
  });

  it("a recusa da rota interna chega como UPSTREAM_ERROR, igual a listMessages", async () => {
    stubFetch(404, {
      error: { code: "CONVERSATION_NOT_FOUND", message: "Not found." },
      requestId: "upstream-3",
    });
    const client = new AiOrchestratorClient();

    await expect(
      client.listConversationEvents(context, "conv-missing"),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      statusCode: 404,
      details: expect.objectContaining({ upstreamCode: "CONVERSATION_NOT_FOUND" }),
    });
  });

  it("recusa corpo que não bate com nenhum dos três tipos de evento", async () => {
    stubFetch(200, {
      data: [{ type: "UNKNOWN_EVENT", id: "x" }],
      requestId: "upstream-4",
    });
    const client = new AiOrchestratorClient();

    await expect(
      client.listConversationEvents(context, "conv-3"),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("conversationEventSchema (packages/public-api-contract)", () => {
  it("aceita os três tipos de evento, discriminados por type", () => {
    expect(
      conversationEventSchema.safeParse({
        type: "HOLD_PLACED",
        id: "call-1",
        occurredAt: "2026-09-27T10:00:00.000Z",
        date: "2026-09-28",
        startTime: "14:00",
        holdExpiresAt: "2026-09-27T10:10:00.000Z",
      }).success,
    ).toBe(true);

    expect(
      conversationEventSchema.safeParse({
        type: "HOLD_EXPIRED",
        id: "call-1:expired",
        occurredAt: "2026-09-27T10:10:00.000Z",
        date: "2026-09-28",
        startTime: "14:00",
      }).success,
    ).toBe(true);

    expect(
      conversationEventSchema.safeParse({
        type: "APPOINTMENT_CREATED",
        id: "call-2",
        occurredAt: "2026-09-27T10:15:00.000Z",
        appointmentId: "appt-1",
        date: "2026-09-28",
        startTime: "15:00",
      }).success,
    ).toBe(true);
  });

  it("recusa type desconhecido", () => {
    expect(
      conversationEventSchema.safeParse({
        type: "SOMETHING_ELSE",
        id: "x",
        occurredAt: "2026-09-27T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
