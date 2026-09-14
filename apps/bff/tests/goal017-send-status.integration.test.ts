import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal017/FIX-001 — os dois sucessos do envio chegam ao browser.
 *
 * A IA responde `201` quando o transporte aceitou o despacho e `202` quando a
 * tentativa ficou gravada sem confirmação de envio. O BFF é proxy dessa
 * decisão: se colapsar os dois em `201`, o segundo caso deixa de existir para
 * quem consome a API pública, e a tela apresenta como enviada uma mensagem que
 * a plataforma não conseguiu despachar.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

async function connectedBusiness(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  await getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${label}-id`,
      evolutionInstanceName: label,
      status: "CONNECTED",
      ...sealedInstanceCredentialData(`wa_synthetic_${label}`, {
        tenantId: session.tenantId,
        evolutionInstanceName: label,
      }),
    },
  });
  return session;
}

function stubOrchestrator(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: "message-1",
              direction: "OUTBOUND",
              source: "OWNER",
              body: "Confirmado para amanhã.",
              createdAt: "2026-09-14T12:00:00.000Z",
              deliveryState: status === 202 ? "UNKNOWN" : "SENT",
            },
            requestId: "upstream-1",
          }),
          { status, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("POST /v1/conversations/:id/messages", () => {
  it("responde 201 quando a IA confirmou o despacho", async () => {
    const owner = await connectedBusiness("send201");
    stubOrchestrator(201);

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/messages",
      headers: browserMutation(owner),
      payload: { text: "Confirmado para amanhã." },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.deliveryState).toBe("SENT");
  });

  it("repassa o 202 da IA em vez de apresentá-lo como 201", async () => {
    const owner = await connectedBusiness("send202");
    stubOrchestrator(202);

    const response = await app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-1/messages",
      headers: browserMutation(owner),
      payload: { text: "Confirmado para amanhã." },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data.deliveryState).toBe("UNKNOWN");
  });
});
