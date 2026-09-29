import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { AppError } from "../src/lib/errors.js";
import { phoneFromWhatsappJid } from "../src/lib/phone.js";
import { getPrisma } from "../src/lib/prisma.js";
import { settled } from "../src/modules/dashboard/routes.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal059/WU-01 — QA X-01 (leitura de status usa o vínculo e a credencial
 * abertos, nunca o envelope cru) e QA S-09/O-46 (número em dígitos).
 *
 * `/v1/status` e `/v1/dashboard` reaproveitam `whatsappSummary`; antes desta
 * correção ela lia `WhatsAppInstance` diretamente e passava
 * `evolutionInstanceToken` — o envelope cifrado — como `apikey` para a
 * Evolution. O dublê abaixo só aceita a credencial em claro, exatamente como
 * a Evolution real: com o vínculo cifrado, `/v1/status` e `/v1/dashboard`
 * reprovavam com `UNKNOWN`/degradado enquanto `/v1/whatsapp` (que já usava
 * `resolveInstanceCredential`) respondia `CONNECTED` — a divergência que esta
 * suíte prova que não existe mais.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];
// Conta chamadas reais a `/instance/status`, para distinguir "não chamou" de
// "chamou e a chamada falhou" — as duas terminam em `UNKNOWN`, mas só a
// primeira prova o critério de aceite de pending/divergent.
let evolutionStatusCalls = 0;

interface UpstreamCall {
  method: string;
  path: string;
  port: string;
  apikey: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function calendarPayload(source: "ATENDLY" | null) {
  return {
    source,
    timezone: source ? "America/Sao_Paulo" : null,
    integration: null,
    capabilities: {
      manageAvailability: true,
      manageServices: true,
      manageCustomers: true,
      createAppointments: true,
      migrate: false,
      aiActivationReady: false,
    },
  };
}

/**
 * Dublê HTTP único para Evolution, IA e Scheduling, roteado por porta (os
 * três têm base URL distinta) — o suficiente para `/v1/status` e
 * `/v1/dashboard` responderem sem 500, sem exercitar nada além do que este
 * Goal muda. Sem handler de Evolution, uma chamada a `/instance/status`
 * derruba o teste: é como as asserções de "sem chamada à Evolution" se
 * provam.
 */
function stubUpstream(handlers: {
  evolutionStatus?: (call: UpstreamCall) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const call: UpstreamCall = {
        method: request.method,
        path: url.pathname,
        port: url.port,
        apikey: request.headers.get("apikey"),
      };

      if (call.port === "8080") {
        evolutionStatusCalls += 1;
        if (call.path !== "/instance/status" || !handlers.evolutionStatus) {
          throw new Error(
            `Unexpected Evolution call: ${call.method} ${call.path}`,
          );
        }
        return handlers.evolutionStatus(call);
      }

      if (call.port === "3000") {
        if (call.path === "/internal/activation-test") {
          return jsonResponse({ data: null, requestId: "up-activation-test" });
        }
        if (call.path === "/internal/ai-tenant-config") {
          if (call.method === "PUT") {
            return jsonResponse({ ok: true, config: null });
          }
          return jsonResponse({ data: null, requestId: "up-ai-config" });
        }
        if (call.path === "/internal/dashboard") {
          return jsonResponse({
            data: {
              conversationsNeedingAttention: [],
              conversationsNeedingAttentionCount: 0,
              aiAppointmentsToday: 0,
              aiAppointmentsThisWeek: 0,
              automatedConversationsToday: 0,
              conversationsTakenOverThisWeek: 0,
            },
            requestId: "up-ai-dashboard",
          });
        }
      }

      if (call.port === "3003") {
        if (call.path === "/internal/calendar") {
          return jsonResponse({
            data: calendarPayload(null),
            requestId: "up-scheduling-calendar",
          });
        }
        if (call.path === "/internal/dashboard") {
          return jsonResponse({
            data: {
              appointmentsToday: 0,
              appointmentsThisWeek: 0,
              todayAppointments: [],
              nextAppointment: null,
              estimatedRevenueToday: null,
              calendar: calendarPayload(null),
            },
            requestId: "up-scheduling-dashboard",
          });
        }
      }

      throw new Error(
        `Unexpected upstream call: ${call.method} ${call.path} (port ${call.port})`,
      );
    }),
  );
}

function evolutionConnected(expectedApikey: string, jid: string) {
  return (call: UpstreamCall) => {
    // O ponto inteiro do teste: só a credencial em claro é aceita, nunca o
    // envelope cifrado que `evolutionInstanceToken` guarda no banco.
    if (call.apikey !== expectedApikey) {
      return jsonResponse(
        { error: "invalid credential", requestId: "up-evolution-denied" },
        401,
      );
    }
    return jsonResponse({
      data: { connected: true, loggedIn: true, myJid: jid },
    });
  };
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

async function linkInstance(
  session: SessionHandle,
  credential: string,
  name: string,
) {
  return getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${name}-id`,
      evolutionInstanceName: name,
      status: "CONNECTED",
      ...sealedInstanceCredentialData(credential, {
        tenantId: session.tenantId,
        evolutionInstanceName: name,
      }),
    },
  });
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  evolutionStatusCalls = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal059/WU-01: leitura de status honesta", () => {
  it("resolve o vínculo e a credencial abertos: /v1/status e /v1/dashboard concordam com /v1/whatsapp (X-01)", async () => {
    const owner = await business("status059-open-credential");
    const credential = "wa_open_credential_059";
    await linkInstance(owner, credential, "status059_open");
    stubUpstream({
      evolutionStatus: evolutionConnected(
        credential,
        "5511987654321:10@s.whatsapp.net",
      ),
    });

    const whatsapp = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });
    const status = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });
    const dashboard = await app.inject({
      method: "GET",
      url: "/v1/dashboard",
      headers: browserRead(owner),
    });

    expect(whatsapp.statusCode).toBe(200);
    expect(status.statusCode).toBe(200);
    expect(dashboard.statusCode).toBe(200);

    const whatsappBody = whatsapp.json().data;
    const statusBody = status.json().data;
    const dashboardBody = dashboard.json().data;

    expect(whatsappBody.status).toBe("CONNECTED");
    expect(statusBody.whatsapp.status).toBe("CONNECTED");
    expect(statusBody.degraded).toBe(false);
    expect(dashboardBody.whatsapp.status).toBe("ok");
    expect(dashboardBody.whatsapp.data.status).toBe("CONNECTED");
    expect(dashboardBody.degraded).toBe(false);
  });

  it("vínculo pending dá UNKNOWN em /v1/status, sem chamar a Evolution", async () => {
    const owner = await business("status059-pending");
    const instance = await linkInstance(
      owner,
      "wa_pending_credential_059",
      "status059_pending",
    );
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: null },
    });
    // Nenhum handler de Evolution: uma chamada real derruba o teste.
    stubUpstream({});

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.whatsapp.status).toBe("UNKNOWN");
    expect(body.degraded).toBe(true);
    // O ponto do teste: nem tentativa houve, não só "tentou e falhou".
    expect(evolutionStatusCalls).toBe(0);
  });

  it("vínculo divergente dá UNKNOWN em /v1/status, sem chamar a Evolution", async () => {
    const a = await business("status059-divergent-a");
    const b = await business("status059-divergent-b");
    const instance = await linkInstance(
      b,
      "wa_divergent_credential_059",
      "status059_divergent",
    );
    await getPrisma().whatsAppInstance.update({
      where: { id: instance.id },
      data: { tenantId: a.tenantId },
    });
    stubUpstream({});

    const response = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(a),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.whatsapp.status).toBe("UNKNOWN");
    expect(body.degraded).toBe(true);
    expect(evolutionStatusCalls).toBe(0);
  });

  it("phoneNumber sai em dígitos, mesmo quando a Evolution devolve JID com sufixo de aparelho (formato real: número:sufixo@servidor)", async () => {
    const owner = await business("status059-digits");
    const credential = "wa_digits_credential_059";
    await linkInstance(owner, credential, "status059_digits");
    stubUpstream({
      evolutionStatus: evolutionConnected(
        credential,
        "5511987654321:8@s.whatsapp.net",
      ),
    });

    const whatsapp = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });
    const status = await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: browserRead(owner),
    });
    const dashboard = await app.inject({
      method: "GET",
      url: "/v1/dashboard",
      headers: browserRead(owner),
    });

    expect(whatsapp.json().data.phoneNumber).toBe("5511987654321");
    expect(status.json().data.whatsapp.phoneNumber).toBe("5511987654321");
    expect(dashboard.json().data.whatsapp.data.phoneNumber).toBe(
      "5511987654321",
    );
  });

  it("phoneNumber sai em dígitos quando a Evolution devolve JID em dígitos puros, sem sufixo de aparelho", async () => {
    const owner = await business("status059-digits-plain");
    const credential = "wa_digits_plain_credential_059";
    await linkInstance(owner, credential, "status059_digits_plain");
    stubUpstream({
      evolutionStatus: evolutionConnected(credential, "5511987654321@s.whatsapp.net"),
    });

    const whatsapp = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });

    expect(whatsapp.json().data.phoneNumber).toBe("5511987654321");
  });

  it("phoneNumber sai em dígitos quando a Evolution devolve myJid já em dígitos puros, sem servidor", async () => {
    const owner = await business("status059-digits-raw");
    const credential = "wa_digits_raw_credential_059";
    await linkInstance(owner, credential, "status059_digits_raw");
    stubUpstream({
      evolutionStatus: evolutionConnected(credential, "5511987654321"),
    });

    const whatsapp = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });

    expect(whatsapp.json().data.phoneNumber).toBe("5511987654321");
  });

  it("phoneNumber de linha antiga que guarda o JID cru sai em dígitos em /v1/whatsapp", async () => {
    const owner = await business("status059-legacy-jid");
    const credential = "wa_legacy_credential_059";
    await getPrisma().whatsAppInstance.create({
      data: {
        userId: owner.userId,
        tenantId: owner.tenantId,
        evolutionInstanceName: "status059_legacy",
        status: "CONNECTED",
        phoneNumber: "5511987654321@s.whatsapp.net",
        ...sealedInstanceCredentialData(credential, {
          tenantId: owner.tenantId,
          evolutionInstanceName: "status059_legacy",
        }),
      },
    });
    // A Evolution não devolve `myJid` desta vez: o único dado de número
    // disponível é o legado guardado em `instance.phoneNumber`.
    stubUpstream({
      evolutionStatus: (call) => {
        if (call.apikey !== credential) {
          return jsonResponse({ error: "invalid credential" }, 401);
        }
        return jsonResponse({ data: { connected: false, loggedIn: false } });
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.phoneNumber).toBe("5511987654321");

    // A resposta sai em dígitos também quando `whatsappDto` reconverte por
    // conta própria; só a leitura direta da linha prova que o `update` da
    // rota gravou dígitos, não o JID cru.
    const stored = await getPrisma().whatsAppInstance.findUnique({
      where: { userId: owner.userId },
    });
    expect(stored?.phoneNumber).toBe("5511987654321");
  });

  it("JID @lid ou de grupo em linha antiga nunca vira número em /v1/whatsapp", async () => {
    const owner = await business("status059-legacy-lid");
    const credential = "wa_legacy_lid_credential_059";
    await getPrisma().whatsAppInstance.create({
      data: {
        userId: owner.userId,
        tenantId: owner.tenantId,
        evolutionInstanceName: "status059_legacy_lid",
        status: "CONNECTED",
        phoneNumber: "123456789012345@lid",
        ...sealedInstanceCredentialData(credential, {
          tenantId: owner.tenantId,
          evolutionInstanceName: "status059_legacy_lid",
        }),
      },
    });
    expect(phoneFromWhatsappJid("123456789012345@lid")).toBe("");
    stubUpstream({
      evolutionStatus: (call) => {
        if (call.apikey !== credential) {
          return jsonResponse({ error: "invalid credential" }, 401);
        }
        return jsonResponse({ data: { connected: false, loggedIn: false } });
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/whatsapp",
      headers: browserRead(owner),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.phoneNumber).toBeNull();
  });
});

describe("Goal059/WU-01: settled() não vaza segredo no log de falha", () => {
  it("registra código e status HTTP, sem credencial, envelope, número nem corpo da resposta", async () => {
    const warn = vi.fn();
    const log = { warn } as unknown as Parameters<typeof settled>[1];
    const error = new AppError(
      "CREDENTIAL_UNAVAILABLE",
      "sealed:super-secret-envelope wa_plaintext_credential +5511999999999 upstream-body",
      503,
    );

    const result = await settled(
      Promise.reject(error),
      log,
    );

    expect(result).toEqual({
      status: "error",
      data: null,
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const [payload] = warn.mock.calls[0]!;
    expect(payload).toEqual({
      code: "CREDENTIAL_UNAVAILABLE",
      statusCode: 503,
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("plaintext_credential");
    expect(serialized).not.toContain("+5511999999999");
    expect(serialized).not.toContain("upstream-body");
  });

  it("registra INTERNAL_ERROR para falha que não é AppError, sem statusCode inventado", async () => {
    const warn = vi.fn();
    const log = { warn } as unknown as Parameters<typeof settled>[1];

    await settled(Promise.reject(new Error("boom")), log);

    expect(warn).toHaveBeenCalledWith(
      { code: "INTERNAL_ERROR", statusCode: undefined },
      expect.any(String),
    );
  });
});
