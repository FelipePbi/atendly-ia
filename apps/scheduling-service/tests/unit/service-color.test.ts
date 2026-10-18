/**
 * Cor do serviço (decisão de 2026-10-12): a criação manual exige escolha na
 * API pública (BFF); onboarding, importação e o backfill recebem uma cor
 * aleatória da paleta, escolhida por `pickServiceColor`, que evita repetir
 * enquanto houver cor livre no negócio. A cor continua editável, mas não
 * pode ser removida.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createDatabaseDouble } from "./support/database-double.js";

let currentClient: PrismaClient | undefined;
vi.mock("../../src/infrastructure/database/prisma.js", () => ({
  getPrisma: () => {
    if (!currentClient) throw new Error("dublê de banco não configurado");
    return currentClient;
  },
}));

import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import { AvenlyServiceService } from "../../src/modules/services/avenly-service-service.js";
import {
  nextServiceColorForTenant,
  pickServiceColor,
  SERVICE_COLOR_TOKENS,
  type ServiceColorToken,
} from "../../src/modules/services/service-color.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

const tenantId = "tenant-a";
const PALETTE = ["ROSE", "AMBER", "EMERALD", "SKY", "VIOLET", "SLATE"];

describe("pickServiceColor", () => {
  it("usa a paleta de cores de serviço do produto", () => {
    expect([...SERVICE_COLOR_TOKENS].sort()).toEqual([...PALETTE].sort());
    for (const value of [0, 0.2, 0.5, 0.99]) {
      expect(PALETTE).toContain(pickServiceColor([], () => value));
    }
  });

  it("não repete cor enquanto houver cor livre", () => {
    const used: ServiceColorToken[] = [];
    for (let index = 0; index < SERVICE_COLOR_TOKENS.length; index += 1) {
      const color = pickServiceColor(used, Math.random);
      expect(used).not.toContain(color);
      used.push(color);
    }
    expect(new Set(used).size).toBe(SERVICE_COLOR_TOKENS.length);
  });

  it("com uma só cor livre, escolhe essa cor qualquer que seja o sorteio", () => {
    const used: ServiceColorToken[] = ["ROSE", "AMBER", "EMERALD", "SKY", "VIOLET"];
    for (const value of [0, 0.5, 0.999]) {
      expect(pickServiceColor(used, () => value)).toBe("SLATE");
    }
  });

  it("com a paleta toda em uso, sorteia entre as menos usadas", () => {
    const used: Array<ServiceColorToken | null> = [
      ...SERVICE_COLOR_TOKENS,
      "ROSE",
      "AMBER",
      "EMERALD",
      "SKY",
      null,
    ];
    for (const value of [0, 0.6, 0.999]) {
      expect(["VIOLET", "SLATE"]).toContain(pickServiceColor(used, () => value));
    }
  });

  it("o sorteio decide entre as cores livres", () => {
    const first = pickServiceColor([], () => 0);
    const last = pickServiceColor([], () => 0.999);
    expect(first).not.toBe(last);
  });
});

describe("nextServiceColorForTenant e a criação sem cor", () => {
  it("considera só as cores do próprio negócio", async () => {
    const database = createDatabaseDouble();
    for (const [index, color] of ["ROSE", "AMBER", "EMERALD", "SKY", "VIOLET"].entries()) {
      database.tables.service.rows.push({
        id: `svc-${index}`,
        tenantId,
        colorToken: color,
      });
    }
    // Outro negócio já usa SLATE: não conta para este.
    database.tables.service.rows.push({
      id: "svc-other",
      tenantId: "tenant-b",
      colorToken: "SLATE",
    });
    await expect(
      nextServiceColorForTenant(database.client as never, tenantId),
    ).resolves.toBe("SLATE");
  });

  it("serviços criados sem cor recebem cores distintas da paleta", async () => {
    const database = createDatabaseDouble();
    const services = new AvenlyServiceService(database.client as never, tenantId);
    const colors: Array<string | null> = [];
    for (const name of ["Corte", "Escova", "Barba", "Manicure", "Pedicure", "Hidratação"]) {
      const created = await services.create({
        name,
        durationMinutes: 30,
        priceType: "ON_REQUEST",
      });
      colors.push(created.colorToken);
    }
    expect(new Set(colors).size).toBe(6);
    for (const color of colors) expect(PALETTE).toContain(color);
  });

  it("cor informada é respeitada", async () => {
    const database = createDatabaseDouble();
    const services = new AvenlyServiceService(database.client as never, tenantId);
    const created = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "ON_REQUEST",
      colorToken: "VIOLET",
    });
    expect(created.colorToken).toBe("VIOLET");
  });

  it("a cor pode ser trocada, mas não removida", async () => {
    const database = createDatabaseDouble();
    const services = new AvenlyServiceService(database.client as never, tenantId);
    const created = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "ON_REQUEST",
      colorToken: "VIOLET",
    });
    const changed = await services.update(created.id, { colorToken: "ROSE" });
    expect(changed.colorToken).toBe("ROSE");
    await expect(
      services.update(created.id, { colorToken: null }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_COLOR" });
    const untouched = await services.update(created.id, { name: "Corte curto" });
    expect(untouched.colorToken).toBe("ROSE");
  });

  it("cor personalizada (2026-10-18): hex apaga o token e o token apaga o hex", async () => {
    const database = createDatabaseDouble();
    const services = new AvenlyServiceService(database.client as never, tenantId);
    const created = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "ON_REQUEST",
      colorHex: "#7A9E7E",
    });
    expect(created).toMatchObject({ colorToken: null, colorHex: "#7a9e7e" });

    const suggested = await services.update(created.id, { colorToken: "SKY" });
    expect(suggested).toMatchObject({ colorToken: "SKY", colorHex: null });

    const custom = await services.update(created.id, { colorHex: "#123abc" });
    expect(custom).toMatchObject({ colorToken: null, colorHex: "#123abc" });

    const untouched = await services.update(created.id, { name: "Corte curto" });
    expect(untouched).toMatchObject({ colorToken: null, colorHex: "#123abc" });

    await expect(
      services.update(created.id, { colorHex: null }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_COLOR" });
    await expect(
      services.update(created.id, { colorHex: "verde" }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICE_COLOR" });
  });
});

describe("POST /internal/service-catalog sem cor (caminho do onboarding)", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    currentClient = undefined;
  });

  beforeEach(() => {
    currentClient = undefined;
  });

  it("cria o serviço com uma cor aleatória da paleta", async () => {
    const database = createDatabaseDouble();
    currentClient = database.client as never;
    database.tables.calendarSettings.rows.push({
      id: `settings-${tenantId}`,
      tenantId,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
      minLeadMinutes: 0,
      maxLeadDays: 90,
      granularityMinutes: 30,
    });
    app = Fastify();
    await registerManagementRoutes(app, database.client as never);
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message },
        });
      }
      return reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      });
    });
    const token = deriveInternalToken(
      TEST_INTERNAL_SERVICE_TOKEN,
      "bff",
      SERVICE_AUDIENCE,
      "command",
    );

    const response = await app.inject({
      method: "POST",
      url: "/internal/service-catalog",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "key-1",
        "x-tenant-id": tenantId,
        "x-user-id": "professional-1",
        "x-request-id": "req-1",
      },
      payload: {
        name: "Corte",
        durationMinutes: 45,
        priceType: "FIXED",
        price: 80,
        active: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ data: { colorToken: string | null } }>();
    expect(PALETTE).toContain(body.data.colorToken);
  });
});
