import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findPublicApiRoute,
  messageSchema,
  settingsStateSchema,
} from "@avenly-ia/public-api-contract";

/**
 * D-208 — "Como a IA envia as mensagens" no BFF. Sem PostgreSQL: o tenant e o
 * Prisma são dublês de módulo, e a IA e o Scheduling um `fetch` dublê. Prova:
 * o contrato aceita o campo novo (e a resposta antiga sem ele); o PATCH grava
 * a escolha, projeta para a IA junto com o estilo e registra a atividade com
 * a mudança; ausente, preserva o gravado; valor desconhecido é recusado.
 */

const ROOT = "root-internal-secret-with-32-chars-min-208";
vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);

vi.mock("../src/lib/tenant-context.js", () => ({
  requireTenantContext: async (request: FastifyRequest) => {
    request.tenantContext = {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "OWNER",
    };
  },
  currentTenantContext: (request: FastifyRequest) => request.tenantContext,
}));

interface AiRow {
  tenantId: string;
  enabled: boolean;
  tone: string | null;
  pausedAt: Date | null;
  messageDelivery: "PARTS" | "SINGLE";
}

let row: AiRow | null = null;
const activity: Array<Record<string, unknown>> = [];

const profile = {
  tenantId: "tenant-1",
  businessName: "Studio",
  language: "pt-BR",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  category: "Beleza",
  modalities: [],
  address: null,
  addressParts: null,
  businessContextVersion: 1,
  businessContextProjectedVersion: 1,
};

function upsertAi(args: {
  create: Partial<AiRow>;
  update: Partial<AiRow>;
}): AiRow {
  row = row
    ? { ...row, ...args.update }
    : {
        tenantId: "tenant-1",
        enabled: false,
        tone: null,
        pausedAt: null,
        messageDelivery: "PARTS",
        ...args.create,
      };
  return row;
}

vi.mock("../src/lib/prisma.js", () => {
  const prisma = {
    activityLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activity.push(data);
        return data;
      },
    },
    aiSettings: {
      findUnique: async () => row,
      upsert: async (args: {
        create: Partial<AiRow>;
        update: Partial<AiRow>;
      }) => upsertAi(args),
    },
    businessProfile: {
      findUnique: async () => profile,
      upsert: async () => profile,
      update: async () => profile,
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work(prisma),
  };
  return { getPrisma: () => prisma };
});

const { registerV1SettingsRoutes } =
  await import("../src/modules/settings/routes.js");
const { registerResponseContractCheck } =
  await import("../src/lib/response-contract.js");
const { AppError } = await import("../src/lib/errors.js");

const calendar = {
  source: "ATENDLY",
  timezone: "America/Sao_Paulo",
  integration: null,
  capabilities: {
    manageAvailability: true,
    manageServices: true,
    manageCustomers: true,
    createAppointments: true,
    migrate: true,
    aiActivationReady: true,
  },
};

const projections: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let app: FastifyInstance;

beforeEach(async () => {
  row = null;
  activity.length = 0;
  projections.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      if (url.pathname === "/internal/ai-tenant-config") {
        projections.push(JSON.parse(await request.text()));
        return jsonResponse({ ok: true, config: {} });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({ data: calendar, requestId: "cal" });
      }
      if (url.pathname.startsWith("/internal/availability")) {
        return jsonResponse({
          data: { timezone: "America/Sao_Paulo", rules: [] },
          requestId: "av",
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }),
  );
  app = Fastify({ logger: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply
      .code(500)
      .send({ error: { code: "INTERNAL_ERROR", message: String(error) } });
  });
  registerResponseContractCheck(app);
  await registerV1SettingsRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllGlobals();
});

const patchAi = (payload: unknown) =>
  app.inject({ method: "PATCH", url: "/v1/settings/ai", payload });

describe("D-208: contrato", () => {
  it("ai.messageDelivery é opcional (resposta antiga vale) e só aceita PARTS ou SINGLE", () => {
    const base = {
      business: null,
      ai: { enabled: false, tone: "BALANCED" },
      calendar,
      availability: null,
    };
    expect(settingsStateSchema.parse(base).ai.messageDelivery).toBeUndefined();
    expect(
      settingsStateSchema.parse({
        ...base,
        ai: { ...base.ai, messageDelivery: "SINGLE" },
      }).ai.messageDelivery,
    ).toBe("SINGLE");
    expect(() =>
      settingsStateSchema.parse({
        ...base,
        ai: { ...base.ai, messageDelivery: "BLOCO" },
      }),
    ).toThrow();
    expect(findPublicApiRoute("PATCH", "/v1/settings/ai")?.schema).toBe(
      settingsStateSchema,
    );
  });

  it("a mensagem pode trazer as partes, em ordem; sem elas continua válida", () => {
    const message = {
      id: "m1",
      direction: "OUTBOUND",
      source: "AI",
      body: "Oi, Ana!\n\nTudo bem?",
      createdAt: "2026-10-19T12:00:00.000Z",
    };
    expect(messageSchema.parse(message).parts).toBeUndefined();
    expect(
      messageSchema.parse({ ...message, parts: ["Oi, Ana!", "Tudo bem?"] })
        .parts,
    ).toEqual(["Oi, Ana!", "Tudo bem?"]);
  });
});

describe("D-208: PATCH /v1/settings/ai com messageDelivery", () => {
  it("sem linha gravada, GET responde em partes (o padrão)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/settings" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.ai.messageDelivery).toBe("PARTS");
  });

  it("grava SINGLE, projeta para a IA com o estilo e registra a atividade com a mudança", async () => {
    row = {
      tenantId: "tenant-1",
      enabled: false,
      tone: "CASUAL",
      pausedAt: null,
      messageDelivery: "PARTS",
    };
    const response = await patchAi({
      enabled: false,
      tone: "CASUAL",
      messageDelivery: "SINGLE",
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.ai).toMatchObject({
      tone: "CASUAL",
      messageDelivery: "SINGLE",
    });
    expect(row?.messageDelivery).toBe("SINGLE");
    expect(projections.at(-1)).toMatchObject({
      enabled: false,
      tone: "CASUAL",
      messageDelivery: "SINGLE",
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "settings.ai_updated",
      changes: [{ field: "messageDelivery", before: "PARTS", after: "SINGLE" }],
    });
  });

  it("ausente preserva a escolha gravada e não registra mudança de envio", async () => {
    row = {
      tenantId: "tenant-1",
      enabled: false,
      tone: "BALANCED",
      pausedAt: null,
      messageDelivery: "SINGLE",
    };
    const response = await patchAi({ enabled: false, tone: "PROFESSIONAL" });

    expect(response.statusCode, response.body).toBe(200);
    expect(row?.messageDelivery).toBe("SINGLE");
    expect(projections.at(-1)).toMatchObject({ messageDelivery: "SINGLE" });
    const changes = (activity[0]?.changes ?? []) as Array<{ field: string }>;
    expect(changes.map((change) => change.field)).toEqual(["tone"]);
  });

  it("valor desconhecido é recusado sem gravar nem projetar", async () => {
    const response = await patchAi({
      enabled: false,
      tone: "BALANCED",
      messageDelivery: "BLOCO",
    });
    expect(response.statusCode).toBe(400);
    expect(row).toBeNull();
    expect(projections).toHaveLength(0);
  });
});
