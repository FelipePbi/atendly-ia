import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { AppError } from "../src/lib/errors.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal059/WU-02 — QA O-47: tentativa de conexão que falha entre a criação
 * remota e a gravação local não pode deixar uma instância órfã na Evolution,
 * e a instância nunca é criada sem chave de cifra para guardar a credencial.
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
  evolutionDelete?: (call: UpstreamCall) => Response;
  evolutionConnect?: (call: UpstreamCall) => Response;
  evolutionQr?: (call: UpstreamCall) => Response;
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
        if (
          call.path.startsWith("/instance/delete/") &&
          handlers.evolutionDelete
        ) {
          return handlers.evolutionDelete(call);
        }
        if (call.path === "/instance/connect" && handlers.evolutionConnect) {
          return handlers.evolutionConnect(call);
        }
        if (call.path === "/instance/qr" && handlers.evolutionQr) {
          return handlers.evolutionQr(call);
        }
        throw new Error(`Unexpected Evolution call: ${call.method} ${call.path}`);
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
  return () =>
    jsonResponse({ data: { id, name, token, status: "created" } });
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
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
  "Goal059/WU-02: tentativa de conexão que falha não deixa instância órfã (O-47)",
  () => {
    it("sem WHATSAPP_CREDENTIAL_KEYS, connect recusa com CREDENTIAL_UNAVAILABLE sem chamar a Evolution", async () => {
      const owner = await business("orphan059-no-key");
      const originalKeys = env.WHATSAPP_CREDENTIAL_KEYS;
      env.WHATSAPP_CREDENTIAL_KEYS = "";
      stubUpstream({});

      try {
        const response = await app.inject({
          method: "POST",
          url: "/v1/whatsapp/connect",
          headers: browserMutation(owner),
          payload: { mode: "QR" },
        });

        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe("CREDENTIAL_UNAVAILABLE");
        // O ponto do teste: nem tentativa de criação houve.
        expect(calls.filter((call) => call.path === "/instance/create")).toHaveLength(0);
      } finally {
        env.WHATSAPP_CREDENTIAL_KEYS = originalKeys;
      }
    });

    it("falha entre criação remota e gravação local remove a instância remota e relança o erro original", async () => {
      const owner = await business("orphan059-db-fail");
      const remoteId = "orphan059-remote-id";
      const dbError = new AppError(
        "VALIDATION_ERROR",
        "boom-local-write-059",
        400,
      );
      const prisma = getPrisma();
      vi.spyOn(prisma.whatsAppInstance, "create").mockRejectedValueOnce(
        dbError,
      );
      stubUpstream({
        evolutionCreate: evolutionCreated(remoteId, "orphan059_remote", "wa_tok_059"),
        evolutionDelete: () => jsonResponse({ data: {} }),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });

      // O erro que o dono vê é exatamente o que quebrou a gravação local, não
      // um erro novo sobre a limpeza.
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(response.json().error.message).toBe("boom-local-write-059");

      const deleteCalls = calls.filter((call) =>
        call.path.startsWith("/instance/delete/"),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]!.path).toBe(`/instance/delete/${remoteId}`);

      const row = await prisma.whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row).toBeNull();
    });

    it("falha da remoção compensatória não troca o erro original que o dono vê", async () => {
      const owner = await business("orphan059-cleanup-fail");
      const remoteId = "orphan059-remote-id-2";
      const dbError = new AppError(
        "VALIDATION_ERROR",
        "boom-local-write-059-cleanup",
        400,
      );
      const prisma = getPrisma();
      vi.spyOn(prisma.whatsAppInstance, "create").mockRejectedValueOnce(
        dbError,
      );
      stubUpstream({
        evolutionCreate: evolutionCreated(remoteId, "orphan059_remote_2", "wa_tok_059_2"),
        evolutionDelete: () =>
          jsonResponse({ error: "boom-cleanup-059" }, 500),
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });

      // Mesmo com a remoção compensatória falhando na Evolution, o erro que
      // chega ao dono continua sendo o da gravação local, sem nenhuma menção
      // à limpeza. `evolution.deleteInstance` usa a chave administrativa
      // (`EVOLUTION_GO_API_KEY`), não a credencial da instância: o catch em
      // `ensureInstance` só tem o nome do erro de limpeza para logar, nunca
      // uma credencial (apps/bff/src/modules/whatsapp/routes.ts).
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(response.json().error.message).toBe(
        "boom-local-write-059-cleanup",
      );
    });

    it("falha depois da gravação local não remove nada; a próxima tentativa reutiliza a linha", async () => {
      const owner = await business("orphan059-post-write-fail");
      const remoteId = "orphan059-remote-id-3";
      // Sem handler de IA: `provisionChannel`, chamado depois da gravação
      // local, falha ao tentar `/internal/channel-connections/evolution`. É
      // depois da linha existir — o catch de `ensureInstance` não a alcança
      // mais (ela só envolve a criação remota e a gravação local).
      stubUpstream({
        evolutionCreate: evolutionCreated(
          remoteId,
          "orphan059_remote_3",
          "wa_tok_059_3",
        ),
        evolutionDelete: () => jsonResponse({ data: {} }),
      });

      const first = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });
      expect(first.statusCode).toBe(502);

      expect(
        calls.filter((call) => call.path.startsWith("/instance/delete/")),
      ).toHaveLength(0);
      const row = await getPrisma().whatsAppInstance.findUnique({
        where: { userId: owner.userId },
      });
      expect(row).not.toBeNull();
      expect(row!.evolutionInstanceId).toBe(remoteId);

      calls = [];
      stubUpstream({
        evolutionCreate: evolutionCreated(
          remoteId,
          "orphan059_remote_3",
          "wa_tok_059_3",
        ),
        evolutionDelete: () => jsonResponse({ data: {} }),
        evolutionConnect: () => jsonResponse({ data: {} }),
        evolutionQr: () => jsonResponse({ data: { qrcode: "qr-059" } }),
        aiChannel: () => jsonResponse({ ok: true, connection: {} }),
        aiTenantConfig: () => jsonResponse({ ok: true, config: null }),
      });

      const second = await app.inject({
        method: "POST",
        url: "/v1/whatsapp/connect",
        headers: browserMutation(owner),
        payload: { mode: "QR" },
      });

      expect(second.statusCode).toBe(201);
      expect(second.json().data.connection.id).toBe(row!.id);
      // A linha do primeiro attempt foi reutilizada por `findLinkedInstance`:
      // nenhuma segunda instância nasceu na Evolution.
      expect(
        calls.filter((call) => call.path === "/instance/create"),
      ).toHaveLength(0);
    });
  },
);
