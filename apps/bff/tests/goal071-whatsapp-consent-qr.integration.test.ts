import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { sealedInstanceCredentialData } from "../src/modules/whatsapp/instance-link.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal071/WU-01 — `connect`/`reconnect` exigem `consentAccepted: true` antes
 * de qualquer efeito, e `GET /v1/whatsapp/qr` relê o QR corrente sobre o
 * marcador (coluna `qrcode`), sem migration.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  port: string;
  apikey: string | null;
}

let calls: UpstreamCall[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream(handlers: {
  evolutionCreate?: (call: UpstreamCall) => Response;
  evolutionConnect?: (call: UpstreamCall) => Response;
  evolutionQr?: (call: UpstreamCall) => Response;
  evolutionStatus?: (call: UpstreamCall) => Response;
  evolutionPair?: (call: UpstreamCall) => Response;
  evolutionLogout?: (call: UpstreamCall) => Response;
  evolutionDelete?: (call: UpstreamCall) => Response;
  aiChannel?: (call: UpstreamCall) => Response;
  aiTenantConfig?: (call: UpstreamCall) => Response;
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
      calls.push(call);

      if (call.port === "8080") {
        if (call.path === "/instance/create" && handlers.evolutionCreate) {
          return handlers.evolutionCreate(call);
        }
        if (call.path === "/instance/connect" && handlers.evolutionConnect) {
          return handlers.evolutionConnect(call);
        }
        if (call.path === "/instance/qr" && handlers.evolutionQr) {
          return handlers.evolutionQr(call);
        }
        if (call.path === "/instance/status" && handlers.evolutionStatus) {
          return handlers.evolutionStatus(call);
        }
        if (call.path === "/instance/pair" && handlers.evolutionPair) {
          return handlers.evolutionPair(call);
        }
        if (call.path === "/instance/logout" && handlers.evolutionLogout) {
          return handlers.evolutionLogout(call);
        }
        if (
          call.path.startsWith("/instance/delete/") &&
          handlers.evolutionDelete
        ) {
          return handlers.evolutionDelete(call);
        }
        throw new Error(
          `Unexpected Evolution call: ${call.method} ${call.path}`,
        );
      }

      if (call.port === "3000") {
        if (
          call.path === "/internal/channel-connections/evolution" &&
          handlers.aiChannel
        ) {
          return handlers.aiChannel(call);
        }
        if (
          call.path === "/internal/ai-tenant-config" &&
          handlers.aiTenantConfig
        ) {
          return handlers.aiTenantConfig(call);
        }
      }

      throw new Error(
        `Unexpected upstream call: ${call.method} ${call.path} (port ${call.port})`,
      );
    }),
  );
}

function evolutionCreated(id: string, name: string, token: string) {
  return () => jsonResponse({ data: { id, name, token, status: "created" } });
}

function aiOk() {
  return () => jsonResponse({ ok: true, connection: {} });
}

function aiConfigOk() {
  return () => jsonResponse({ ok: true, config: null });
}

function evolutionQrOnce(qrcode: string | null) {
  return () =>
    qrcode === null
      ? jsonResponse({ data: {} })
      : jsonResponse({ data: { qrcode } });
}

/** Sequência de QR do dublê, um valor por chamada (o fork gira o QR). */
function evolutionQrSequence(values: (string | null)[]) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? null;
    index += 1;
    return value === null
      ? jsonResponse({ data: {} })
      : jsonResponse({ data: { qrcode: value } });
  };
}

function qrCalls() {
  return calls.filter((call) => call.path === "/instance/qr");
}

function evolutionStatus(connected: boolean, loggedIn: boolean, jid?: string) {
  return () =>
    jsonResponse({
      data: { connected, loggedIn, ...(jid ? { myJid: jid } : {}) },
    });
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
  extra: Record<string, unknown> = {},
) {
  return getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceId: `${name}-id`,
      evolutionInstanceName: name,
      status: "CONNECTING",
      ...sealedInstanceCredentialData(credential, {
        tenantId: session.tenantId,
        evolutionInstanceName: name,
      }),
      ...extra,
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
  vi.restoreAllMocks();
  calls = [];
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal071/WU-01: consentimento na conexão",
  () => {
    it("connect sem consentAccepted recusa 400 VALIDATION_ERROR, sem chamar a Evolution nem gravar instância", async () => {
      const owner = await business("consent071-connect-missing");
      stubUpstream({});

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(calls).toHaveLength(0);
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row).toBeNull();
    });

    it("connect com consentAccepted: false recusa 400 VALIDATION_ERROR, sem chamar a Evolution nem gravar instância", async () => {
      const owner = await business("consent071-connect-false");
      stubUpstream({});

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR", consentAccepted: false },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(calls).toHaveLength(0);
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row).toBeNull();
    });

    it("reconnect sem consentAccepted recusa 400 VALIDATION_ERROR, sem chamar a Evolution nem alterar o vínculo existente", async () => {
      const owner = await business("consent071-reconnect-missing");
      const instance = await linkInstance(
        owner,
        "wa_consent071_reconnect",
        "consent071_reconnect",
        { qrcode: "stale-qr-071" },
      );
      stubUpstream({});

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/reconnect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(calls).toHaveLength(0);
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { id: instance.id },
      });
      expect(row?.qrcode).toBe("stale-qr-071");
      expect(row?.status).toBe("CONNECTING");
    });

    it("connect com consentAccepted: true e modo QR segue normalmente e grava o marcador", async () => {
      const owner = await business("consent071-connect-ok");
      stubUpstream({
        evolutionCreate: evolutionCreated(
          "consent071-remote",
          "consent071_ok",
          "wa_tok_consent071",
        ),
        evolutionConnect: () => jsonResponse({ data: {} }),
        evolutionQr: evolutionQrOnce("qr-consent071-1"),
        aiChannel: aiOk(),
        aiTenantConfig: aiConfigOk(),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR", consentAccepted: true },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data.qrcode).toBe("qr-consent071-1");
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row?.qrcode).toBe("qr-consent071-1");
    });
  },
);

describe.skipIf(!RUN_INTEGRATION)(
  "Goal071/WU-01: GET /v1/whatsapp/qr relê o QR corrente",
  () => {
    it("sem vinculação por QR em curso, recusa 409 WHATSAPP_QR_NOT_IN_PROGRESS e não chama a Evolution", async () => {
      const owner = await business("qr071-not-in-progress");
      await linkInstance(owner, "wa_qr071_absent", "qr071_absent", {
        qrcode: null,
        status: "CONNECTING",
      });
      stubUpstream({});

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("WHATSAPP_QR_NOT_IN_PROGRESS");
      expect(calls).toHaveLength(0);
    });

    it("sem vínculo nenhum, recusa 404 NOT_FOUND, do mesmo jeito que as demais rotas de WhatsApp", async () => {
      const owner = await business("qr071-absent-link");
      stubUpstream({});

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(404);
      expect(calls).toHaveLength(0);
    });

    it("vínculo pendente ou divergente recusa 409 CONFLICT, como as demais rotas de WhatsApp", async () => {
      const a = await business("qr071-divergent-a");
      const b = await business("qr071-divergent-b");
      const instance = await linkInstance(
        b,
        "wa_qr071_divergent",
        "qr071_divergent",
        { qrcode: "qr-divergent-071" },
      );
      await getPrisma().whatsAppInstance.update({
        where: { id: instance.id },
        data: { tenantId: a.tenantId },
      });
      stubUpstream({});

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(a),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
      expect(calls).toHaveLength(0);
    });

    it("com número conectado, limpa o marcador, responde o estado conectado e não chama /instance/qr", async () => {
      const owner = await business("qr071-connected");
      const credential = "wa_qr071_connected";
      const instance = await linkInstance(owner, credential, "qr071_connected", {
        qrcode: "qr-still-marked-071",
      });
      stubUpstream({
        evolutionStatus: evolutionStatus(
          true,
          true,
          "5511987654321@s.whatsapp.net",
        ),
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json().data;
      expect(body.qrcode).toBeNull();
      expect(body.connection.status).toBe("CONNECTED");
      expect(body.connection.phoneNumber).toBe("5511987654321");
      expect(calls.filter((call) => call.path === "/instance/qr")).toHaveLength(
        0,
      );
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { id: instance.id },
      });
      expect(row?.qrcode).toBeNull();
      expect(row?.status).toBe("CONNECTED");
    });

    it("com o número apenas logado (sem connected), também limpa o marcador e não chama /instance/qr", async () => {
      const owner = await business("qr071-logged-in-only");
      const credential = "wa_qr071_logged_in";
      await linkInstance(owner, credential, "qr071_logged_in", {
        qrcode: "qr-still-marked-071-b",
      });
      stubUpstream({
        evolutionStatus: evolutionStatus(false, true),
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.qrcode).toBeNull();
      expect(
        calls.filter((call) => call.path === "/instance/qr"),
      ).toHaveLength(0);
    });

    it("com vinculação em curso, cada leitura devolve o QR corrente do dublê, sem persistir no marcador", async () => {
      const owner = await business("qr071-in-progress");
      const credential = "wa_qr071_in_progress";
      await linkInstance(owner, credential, "qr071_in_progress", {
        qrcode: "qr-initial-071",
      });
      stubUpstream({
        evolutionStatus: evolutionStatus(false, false),
        evolutionQr: evolutionQrSequence(["qr-turn-1-071", "qr-turn-2-071"]),
      });

      const first = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });
      const second = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(first.statusCode).toBe(200);
      expect(first.json().data.qrcode).toBe("qr-turn-1-071");
      expect(second.statusCode).toBe(200);
      expect(second.json().data.qrcode).toBe("qr-turn-2-071");
      // O marcador em si não é reescrito pela leitura: continua o valor
      // gravado por `connect`, prova de que a rota não perde a vinculação em
      // curso quando o dublê devolve um QR novo ou vazio.
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row?.qrcode).toBe("qr-initial-071");
    });

    it("sem QR disponível agora, responde 200 com qrcode: null, não erro", async () => {
      const owner = await business("qr071-no-qr-now");
      const credential = "wa_qr071_no_qr_now";
      await linkInstance(owner, credential, "qr071_no_qr_now", {
        qrcode: "qr-initial-071-b",
      });
      stubUpstream({
        evolutionStatus: evolutionStatus(false, false),
        evolutionQr: evolutionQrOnce(null),
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.qrcode).toBeNull();
    });

    it("a resposta nunca traz credencial, JID ou nome de instância", async () => {
      const owner = await business("qr071-no-leak");
      const credential = "wa_qr071_no_leak_super_secret";
      await linkInstance(owner, credential, "qr071_no_leak_instance_name", {
        qrcode: "qr-no-leak-071",
      });
      stubUpstream({
        evolutionStatus: evolutionStatus(false, false),
        evolutionQr: evolutionQrOnce("qr-no-leak-071-live"),
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      const serialized = JSON.stringify(response.json());
      expect(serialized).not.toContain(credential);
      expect(serialized).not.toContain("qr071_no_leak_instance_name");
      expect(serialized).not.toContain("@s.whatsapp.net");
    });

    it("isolamento entre negócios: a leitura de um negócio nunca enxerga o QR do outro", async () => {
      const ownerA = await business("qr071-isolation-a");
      const ownerB = await business("qr071-isolation-b");
      await linkInstance(ownerA, "wa_qr071_isolation_a", "qr071_isolation_a", {
        qrcode: "qr-isolation-a-071",
      });
      await linkInstance(ownerB, "wa_qr071_isolation_b", "qr071_isolation_b", {
        qrcode: "qr-isolation-b-071",
      });
      // O dublê devolve o QR de cada instância pela credencial que recebe:
      // se a rota abrisse a instância errada, o QR do outro negócio sairia.
      const qrByCredential: Record<string, string> = {
        wa_qr071_isolation_a: "qr-isolation-a-live-071",
        wa_qr071_isolation_b: "qr-isolation-b-live-071",
      };
      stubUpstream({
        evolutionStatus: evolutionStatus(false, false),
        evolutionQr: (call) =>
          jsonResponse({ data: { qrcode: qrByCredential[call.apikey ?? ""] } }),
      });

      // B lê primeiro, depois A, depois B de novo: a ordem das leituras não
      // decide qual QR sai.
      const firstB = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(ownerB),
      });
      const responseA = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(ownerA),
      });
      const secondB = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(ownerB),
      });

      expect(firstB.json().data.qrcode).toBe("qr-isolation-b-live-071");
      expect(responseA.json().data.qrcode).toBe("qr-isolation-a-live-071");
      expect(secondB.json().data.qrcode).toBe("qr-isolation-b-live-071");
      expect(JSON.stringify(responseA.json())).not.toContain(
        "qr-isolation-b",
      );
      expect(qrCalls().map((call) => call.apikey)).toEqual([
        "wa_qr071_isolation_b",
        "wa_qr071_isolation_a",
        "wa_qr071_isolation_b",
      ]);
    });

    it("connect com consentimento no modo PAIRING_CODE limpa o marcador: a leitura seguinte recusa 409 WHATSAPP_QR_NOT_IN_PROGRESS sem chamar /instance/qr", async () => {
      const owner = await business("qr071-pairing-clears");
      stubUpstream({
        evolutionCreate: evolutionCreated(
          "qr071-pairing-remote",
          "qr071_pairing",
          "wa_tok_qr071_pairing",
        ),
        evolutionConnect: () => jsonResponse({ data: {} }),
        evolutionQr: evolutionQrOnce("qr-before-pairing-071"),
        evolutionPair: () => jsonResponse({ data: { pairingCode: "K7M2P9QX" } }),
        evolutionStatus: evolutionStatus(false, false),
        aiChannel: aiOk(),
        aiTenantConfig: aiConfigOk(),
      });

      // Primeiro uma vinculação por QR, que grava o marcador...
      const qrConnect = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR", consentAccepted: true },
      });
      expect(qrConnect.statusCode).toBe(201);
      const marked = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(marked?.qrcode).toBe("qr-before-pairing-071");

      // ...depois o modo código, com consentimento, sobre o mesmo vínculo.
      const pairingConnect = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: {
          mode: "PAIRING_CODE",
          phone: "11987654321",
          consentAccepted: true,
        },
      });
      expect(pairingConnect.statusCode).toBe(201);
      expect(pairingConnect.json().data.pairingCode).toBe("K7M2P9QX");
      const cleared = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(cleared?.qrcode).toBeNull();

      calls = [];
      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("WHATSAPP_QR_NOT_IN_PROGRESS");
      expect(qrCalls()).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });

    it("depois de DELETE /v1/whatsapp, a rota não lê QR: recusa sem vínculo e zero chamadas a /instance/qr", async () => {
      const owner = await business("qr071-after-delete");
      await linkInstance(owner, "wa_qr071_after_delete", "qr071_after_delete", {
        qrcode: "qr-before-delete-071",
      });
      stubUpstream({
        evolutionLogout: () => jsonResponse({ data: {} }),
        evolutionDelete: () => jsonResponse({ data: {} }),
        evolutionStatus: evolutionStatus(false, false),
        evolutionQr: evolutionQrSequence([
          "qr-read-before-delete-071",
          "qr-must-not-be-read-071",
        ]),
      });

      // Antes de desconectar, a rota lê o QR da vinculação em curso: o 404
      // depois do DELETE vem do vínculo apagado, não de rota inexistente.
      const before = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });
      expect(before.statusCode).toBe(200);
      expect(before.json().data.qrcode).toBe("qr-read-before-delete-071");

      const removed = await app.inject({
        method: "DELETE",
        url: "/v1/whatsapp",
        headers: browserMutation(owner),
      });
      expect(removed.statusCode).toBe(200);
      expect(
        await getPrisma().whatsAppInstance.findUnique({
          where: { userId: owner.userId },
        }),
      ).toBeNull();

      calls = [];
      const response = await app.inject({
        method: "GET",
        url: "/v1/whatsapp/qr",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(404);
      expect(JSON.stringify(response.json())).not.toContain(
        "qr-must-not-be-read-071",
      );
      expect(qrCalls()).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });
  },
);
