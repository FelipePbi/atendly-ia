import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = "root-internal-secret-with-32-chars-min";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

const [{ registerInternalRoutes }, credentials, { env }, { SchedulingClient }] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/config/env.js"),
    import("../../src/modules/scheduling-service/client.js"),
  ]);

/**
 * Goal110, prova 2 — a IA confere as credenciais internas derivadas com o
 * rótulo novo (`avenly:internal:v1`) e com o antigo (`atendly:internal:v1`),
 * só para o mesmo chamador, a mesma audiência e o mesmo uso, pelas rotas HTTP.
 */
const NEW_LABEL = "avenly:internal:v1";
const OLD_LABEL = "atendly:internal:v1";
const LABELS = [NEW_LABEL, OLD_LABEL] as const;

function derive(
  label: string,
  caller: string,
  audience: string,
  use: string,
): string {
  return createHmac("sha256", ROOT)
    .update(`${label}:${caller}:${audience}:${use}`)
    .digest("base64url");
}

const PROVISIONING_ROUTE = {
  method: "DELETE" as const,
  url: "/internal/channel-connections/evolution",
};
const COMMAND_ROUTE = {
  method: "GET" as const,
  url: "/internal/conversations",
};

function fakePrisma() {
  return {
    channelConnection: { updateMany: async () => ({ count: 0 }) },
    conversation: { findMany: async () => [] },
  } as never;
}

function call(
  app: FastifyInstance,
  route: { method: "DELETE" | "GET"; url: string },
  token: string,
  audience?: string,
) {
  return app.inject({
    ...route,
    headers: {
      authorization: `Bearer ${token}`,
      ...(audience ? { "x-service-audience": audience } : {}),
      "x-tenant-id": "tenant-a",
      "x-user-id": "user-a",
    },
  });
}

describe("IA accepts the derived credential with either label", () => {
  let app: FastifyInstance;
  const saved = {
    command: env.INTERNAL_COMMAND_TOKEN,
    provisioning: env.INTERNAL_PROVISIONING_TOKEN,
  };

  beforeEach(async () => {
    env.INTERNAL_COMMAND_TOKEN = "";
    env.INTERNAL_PROVISIONING_TOKEN = "";
    app = Fastify();
    await registerInternalRoutes(app, fakePrisma());
  });

  afterEach(async () => {
    env.INTERNAL_COMMAND_TOKEN = saved.command;
    env.INTERNAL_PROVISIONING_TOKEN = saved.provisioning;
    await app.close();
  });

  it("derives with the new label by default", () => {
    expect(
      credentials.deriveInternalToken(
        ROOT,
        "bff",
        credentials.SERVICE_AUDIENCE,
        "command",
      ),
    ).toEqual(derive(NEW_LABEL, "bff", "ai-orchestrator", "command"));
    expect(credentials.expectedToken("provisioning")).toEqual(
      derive(NEW_LABEL, "bff", "ai-orchestrator", "provisioning"),
    );
  });

  it("accepts provisioning and command tokens derived with either label", async () => {
    for (const label of LABELS) {
      const provisioning = await call(
        app,
        PROVISIONING_ROUTE,
        derive(label, "bff", "ai-orchestrator", "provisioning"),
      );
      expect(provisioning.statusCode, `provisioning ${label}`).toBe(200);

      const command = await call(
        app,
        COMMAND_ROUTE,
        derive(label, "bff", "ai-orchestrator", "command"),
        "ai-orchestrator",
      );
      expect(command.statusCode, `command ${label}`).toBe(200);
    }
  });

  it("answers 403 for the provisioning token on a command route and the reverse, with either label", async () => {
    for (const label of LABELS) {
      const provisioningOnCommand = await call(
        app,
        COMMAND_ROUTE,
        derive(label, "bff", "ai-orchestrator", "provisioning"),
      );
      expect(provisioningOnCommand.statusCode, `provisioning ${label}`).toBe(403);

      const commandOnProvisioning = await call(
        app,
        PROVISIONING_ROUTE,
        derive(label, "bff", "ai-orchestrator", "command"),
      );
      expect(commandOnProvisioning.statusCode, `command ${label}`).toBe(403);
    }
  });

  it("answers 401 for the old-label token derived for another caller", async () => {
    for (const use of ["provisioning", "command"] as const) {
      const response = await call(
        app,
        use === "command" ? COMMAND_ROUTE : PROVISIONING_ROUTE,
        derive(OLD_LABEL, "ai-orchestrator", "ai-orchestrator", use),
      );
      expect(response.statusCode, use).toBe(401);
    }
  });

  it("answers 401 for the old-label token derived for another audience", async () => {
    for (const use of ["provisioning", "command"] as const) {
      const response = await call(
        app,
        use === "command" ? COMMAND_ROUTE : PROVISIONING_ROUTE,
        derive(OLD_LABEL, "bff", "scheduling-service", use),
      );
      expect(response.statusCode, use).toBe(401);
    }
  });

  it("answers 401 for the old-label token derived without the use", async () => {
    const response = await call(
      app,
      COMMAND_ROUTE,
      createHmac("sha256", ROOT)
        .update(`${OLD_LABEL}:bff:ai-orchestrator`)
        .digest("base64url"),
    );
    expect(response.statusCode).toBe(401);
  });

  it("still answers 403 for a divergent declared audience", async () => {
    for (const label of LABELS) {
      const response = await call(
        app,
        COMMAND_ROUTE,
        derive(label, "bff", "ai-orchestrator", "command"),
        "scheduling-service",
      );
      expect(response.statusCode, label).toBe(403);
    }
  });

  it("still answers 401 for the raw shared secret", async () => {
    expect((await call(app, COMMAND_ROUTE, ROOT)).statusCode).toBe(401);
    expect((await call(app, PROVISIONING_ROUTE, ROOT)).statusCode).toBe(401);
  });

  it("keeps an explicit credential exclusive for its use", async () => {
    env.INTERNAL_COMMAND_TOKEN = "explicit-command-credential";

    const explicit = await call(
      app,
      COMMAND_ROUTE,
      "explicit-command-credential",
    );
    expect(explicit.statusCode).toBe(200);

    for (const label of LABELS) {
      const derived = await call(
        app,
        COMMAND_ROUTE,
        derive(label, "bff", "ai-orchestrator", "command"),
      );
      expect(derived.statusCode, `command ${label}`).toBe(401);

      // O uso sem credencial explícita continua derivado, com os dois rótulos.
      const provisioning = await call(
        app,
        PROVISIONING_ROUTE,
        derive(label, "bff", "ai-orchestrator", "provisioning"),
      );
      expect(provisioning.statusCode, `provisioning ${label}`).toBe(200);
    }
  });
});

/**
 * Goal110, prova 3 (lado da IA) — a IA apresenta ao Scheduling o token derivado
 * com o rótulo novo, e nada de produção da IA deriva com o rótulo antigo para
 * apresentar: o rótulo antigo existe só como constante do verificador.
 */
describe("IA presents the derived credential with the new label", () => {
  const savedCommand = env.SCHEDULING_SERVICE_COMMAND_TOKEN;
  const savedFetch = global.fetch;

  afterEach(() => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = savedCommand;
    global.fetch = savedFetch;
  });

  it("sends the scheduling-service/command credential with the new label", async () => {
    env.SCHEDULING_SERVICE_COMMAND_TOKEN = "";
    let presented: string | undefined;
    global.fetch = (async (_url: unknown, init?: RequestInit) => {
      presented = (init?.headers as Record<string, string>).authorization;
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await new SchedulingClient()
      .listActiveServices({
        tenantId: "tenant-a",
        userId: "user-a",
        requestId: "req-1",
      })
      .catch(() => undefined);

    expect(presented).toBe(
      `Bearer ${derive(NEW_LABEL, "ai-orchestrator", "scheduling-service", "command")}`,
    );
    expect(presented).not.toBe(
      `Bearer ${derive(OLD_LABEL, "ai-orchestrator", "scheduling-service", "command")}`,
    );
  });

  it("keeps the old label only in the verifier's credential module", () => {
    const srcRoot = join(import.meta.dirname, "..", "..", "src");
    const holders: string[] = [];
    for (const entry of readdirSync(srcRoot, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const path = join(entry.parentPath, entry.name);
      const relativePath = relative(srcRoot, path).replaceAll("\\", "/");
      if (relativePath.split("/").includes("generated")) continue;
      if (readFileSync(path, "utf8").includes(OLD_LABEL)) {
        holders.push(relativePath);
      }
    }
    expect(holders).toEqual(["lib/internal-credentials.ts"]);
  });
});
