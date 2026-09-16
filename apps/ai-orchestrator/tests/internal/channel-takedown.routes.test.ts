import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes, requiredScope }, { expectedToken }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
  ]);

/**
 * Goal025/WU-02 — `DELETE /internal/channel-connections/evolution`.
 *
 * A derrubada do canal e o que torna a nao-reativacao **verificavel**: sem
 * canal ativo, `supersededByChannelChange` passa a valer e o BFF nao tem como
 * religar a IA do negocio que pediu exclusao. Esta suite prova a fronteira da
 * rota — de onde vem o tenant, qual credencial passa, e que rodar duas vezes
 * nao e erro.
 */
interface UpdateManyCall {
  where: { tenantId: string; status: string };
  data: { status: string };
}

function fakePrisma(calls: UpdateManyCall[], count = 1) {
  return {
    channelConnection: {
      updateMany: async (args: UpdateManyCall) => {
        calls.push(args);
        return { count };
      },
    },
  } as never;
}

async function buildApp(calls: UpdateManyCall[], count = 1) {
  const app = Fastify();
  await registerInternalRoutes(app, fakePrisma(calls, count));
  return app;
}

function headers(use: "provisioning" | "command", tenantId = "tenant-a") {
  return {
    authorization: `Bearer ${expectedToken(use)}`,
    "x-service-audience": "ai-orchestrator",
    "x-tenant-id": tenantId,
    "x-user-id": `user-${tenantId}`,
  };
}

describe("DELETE /internal/channel-connections/evolution", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("derruba so o canal ativo do tenant do contexto", async () => {
    const calls: UpdateManyCall[] = [];
    app = await buildApp(calls);

    const response = await app.inject({
      method: "DELETE",
      url: "/internal/channel-connections/evolution",
      headers: headers("provisioning", "tenant-a"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, deactivated: 1 });
    // O tenant vem do contexto interno autenticado, nunca do corpo: nao existe
    // forma de derrubar o canal de outro negocio por esta rota.
    expect(calls).toEqual([
      {
        where: { tenantId: "tenant-a", status: "ACTIVE" },
        data: { status: "INACTIVE" },
      },
    ]);
  });

  it("negocio sem canal ativo devolve 200 e zero, nao erro", async () => {
    const calls: UpdateManyCall[] = [];
    app = await buildApp(calls, 0);

    const response = await app.inject({
      method: "DELETE",
      url: "/internal/channel-connections/evolution",
      headers: headers("provisioning"),
    });

    // Idempotencia: pedir exclusao duas vezes nao "derruba duas vezes", e a
    // segunda passada nao pode virar falha de um pedido que foi aceito.
    expect(response.statusCode).toBe(200);
    expect(response.json().deactivated).toBe(0);
  });

  it("exige a credencial de provisionamento, a mesma que provisiona o canal", () => {
    const scopeFor = (method: string) =>
      requiredScope({
        url: "/internal/channel-connections/evolution",
        method,
      } as never);

    expect(scopeFor("DELETE")).toBe("channel:provision");
    // Ligar e desligar o vinculo sao a mesma autoridade, de proposito: escopo
    // novo aqui exigiria credencial nova para algo que a de provisionamento ja
    // domina.
    expect(scopeFor("DELETE")).toBe(scopeFor("PUT"));
  });

  it("recusa a credencial de comando comum", async () => {
    const calls: UpdateManyCall[] = [];
    app = await buildApp(calls);

    const response = await app.inject({
      method: "DELETE",
      url: "/internal/channel-connections/evolution",
      headers: headers("command"),
    });

    expect(response.statusCode).toBe(403);
    // Recusada antes de qualquer efeito: nada foi derrubado.
    expect(calls).toEqual([]);
  });
});
