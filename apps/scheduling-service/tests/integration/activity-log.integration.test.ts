// Primeiro import de propósito: fixa as variáveis da autenticação interna
// antes de `config/env.ts` ser avaliado (ver o próprio arquivo).
import "../unit/support/test-env.js";

import { PrismaPg } from "@prisma/adapter-pg";
import Fastify, { type FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { registerCalendarRoutes } from "../../src/modules/calendar/routes.js";
import { registerManagementRoutes } from "../../src/modules/internal-api/routes.js";
import {
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "../unit/support/test-env.js";
import { resetTenant } from "./support/reset-tenant.js";

/**
 * Registro de atividade (D-176) contra PostgreSQL real: o antes e o depois
 * de cada mudança, IA e profissional separadas, o negócio só vê o próprio
 * registro, filtros e paginação da leitura, e o registro não aceita UPDATE.
 */

const holder = vi.hoisted(() => ({ prisma: null as unknown }));

vi.mock("../../src/infrastructure/database/prisma.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/infrastructure/database/prisma.js")
    >();
  return { ...actual, getPrisma: () => holder.prisma };
});

const connectionString = process.env.SCHEDULING_TEST_DATABASE_URL?.trim();
const describeWithDatabase = connectionString ? describe : describe.skip;

const tenantA = "activity-tenant-a";
const tenantB = "activity-tenant-b";
const timeZone = "America/Sao_Paulo";

let prisma: PrismaClient;
let app: FastifyInstance;
let serviceId = "";
let requestCounter = 0;

const tokens = {
  bff: deriveInternalToken(
    TEST_INTERNAL_SERVICE_TOKEN,
    "bff",
    SERVICE_AUDIENCE,
    "command",
  ),
  ai: deriveInternalToken(
    TEST_INTERNAL_SERVICE_TOKEN,
    "ai-orchestrator",
    SERVICE_AUDIENCE,
    "command",
  ),
};

function headers(tenantId: string, caller: keyof typeof tokens = "bff") {
  requestCounter += 1;
  return {
    authorization: `Bearer ${tokens[caller]}`,
    "x-tenant-id": tenantId,
    "x-user-id": "owner-1",
    "x-request-id": `req-activity-${requestCounter}`,
    "idempotency-key": `idem-activity-${requestCounter}`,
    "content-type": "application/json",
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  await registerManagementRoutes(instance, prisma);
  await registerCalendarRoutes(instance);
  instance.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    }
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: (error as Error).message },
      requestId: request.id,
    });
  });
  return instance;
}

/** Uma semana à frente, no fuso do negócio: dentro da janela de oferta. */
function nextWeek(): string {
  const date = new Date(Date.now() + 7 * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

async function seedTenant(tenantId: string): Promise<string> {
  await prisma.calendarSettings.upsert({
    where: { tenantId },
    create: { tenantId, source: "AVENLY", timezone: timeZone },
    update: { source: "AVENLY", timezone: timeZone },
  });
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    await prisma.availabilityRule.create({
      data: {
        tenantId,
        dayOfWeek,
        startTime: new Date("1970-01-01T08:00:00.000Z"),
        endTime: new Date("1970-01-01T20:00:00.000Z"),
        active: true,
      },
    });
  }
  const service = await prisma.service.create({
    data: {
      tenantId,
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 80,
      active: true,
    },
  });
  return service.id;
}

type ActivityItem = {
  id: string;
  sequence: string;
  occurredAt: string;
  actorType: "AI" | "USER";
  actorId: string | null;
  area: string;
  action: string;
  entityId: string | null;
  entityLabel: string | null;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  details: Record<string, unknown> | null;
};

async function readActivity(
  tenantId: string,
  query = "",
): Promise<{ items: ActivityItem[]; hasMore: boolean }> {
  const response = await app.inject({
    method: "GET",
    url: `/internal/activity${query ? `?${query}` : ""}`,
    headers: headers(tenantId),
  });
  expect(response.statusCode).toBe(200);
  return response.json().data;
}

async function post(
  tenantId: string,
  url: string,
  payload: unknown,
  caller: keyof typeof tokens = "bff",
  method: "POST" | "PATCH" = "POST",
) {
  const response = await app.inject({
    method,
    url,
    headers: headers(tenantId, caller),
    payload: JSON.stringify(payload),
  });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response.json().data;
}

describeWithDatabase("activity log against PostgreSQL", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    holder.prisma = prisma;
    const [database] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(database.current_database).toMatch(/test/iu);
    app = await buildApp();
  });

  afterAll(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetTenant(prisma, tenantA);
    await resetTenant(prisma, tenantB);
    serviceId = await seedTenant(tenantA);
    await seedTenant(tenantB);
  });

  it("grava o antes e o depois da edição de cliente feita pela profissional", async () => {
    const created = await post(tenantA, "/internal/customers", {
      name: "Ana",
      phone: "5511988887777",
    });
    await post(
      tenantA,
      `/internal/customers/${created.id}`,
      { name: "Ana Souza", phone: "5511977776666" },
      "bff",
      "PATCH",
    );

    const { items } = await readActivity(tenantA, "area=CUSTOMERS");
    const [edit, creation] = items;
    expect(edit).toMatchObject({
      actorType: "USER",
      actorId: "owner-1",
      area: "CUSTOMERS",
      action: "customer.updated",
      entityId: created.id,
      entityLabel: "Ana Souza",
    });
    expect(edit.changes).toEqual([
      { field: "name", before: "Ana", after: "Ana Souza" },
      {
        field: "phone",
        before: expect.stringContaining("988887777"),
        after: expect.stringContaining("977776666"),
      },
    ]);
    expect(creation).toMatchObject({
      action: "customer.created",
      entityLabel: "Ana",
    });
    expect(creation.changes[0]).toEqual({
      field: "name",
      before: null,
      after: "Ana",
    });
  });

  it("não registra edição que não muda nada", async () => {
    const created = await post(tenantA, "/internal/customers", { name: "Bia" });
    await post(
      tenantA,
      `/internal/customers/${created.id}`,
      { name: "Bia" },
      "bff",
      "PATCH",
    );
    const { items } = await readActivity(tenantA, "area=CUSTOMERS");
    expect(items.map((item) => item.action)).toEqual(["customer.created"]);
  });

  it("separa o serviço editado do arquivado, com o preço antes e depois", async () => {
    await post(
      tenantA,
      `/internal/service-catalog/${serviceId}`,
      { price: 95 },
      "bff",
      "PATCH",
    );
    await post(
      tenantA,
      `/internal/service-catalog/${serviceId}`,
      { active: false },
      "bff",
      "PATCH",
    );
    const { items } = await readActivity(tenantA, "area=SERVICES");
    expect(items.map((item) => item.action)).toEqual([
      "service.archived",
      "service.updated",
    ]);
    expect(items[1].changes).toEqual([
      { field: "price", before: 80, after: 95 },
    ]);
    expect(items[0].changes).toEqual([
      { field: "active", before: true, after: false },
    ]);
  });

  it("marca a IA como autora do agendamento e a profissional da remarcação", async () => {
    const date = nextWeek();
    const appointment = await post(
      tenantA,
      "/internal/appointments",
      {
        serviceIds: [serviceId],
        date,
        startTime: "14:00",
        customerName: "Carla",
        customerPhone: "5511966665555",
      },
      "ai",
    );
    await post(tenantA, `/internal/appointments/${appointment.id}/reschedule`, {
      date,
      startTime: "15:30",
    });
    await post(tenantA, `/internal/appointments/${appointment.id}/cancel`, {
      comments: "Cliente pediu",
    });

    const { items } = await readActivity(tenantA);
    const byAction = new Map(items.map((item) => [item.action, item]));

    expect(byAction.get("customer.created")).toMatchObject({
      actorType: "AI",
      actorId: null,
      entityLabel: "Carla",
    });
    expect(byAction.get("appointment.created")).toMatchObject({
      actorType: "AI",
      actorId: null,
      area: "AGENDA",
      entityId: appointment.id,
      entityLabel: "Carla",
      details: expect.objectContaining({
        customerName: "Carla",
        services: ["Corte"],
        startsAt: `${date}T14:00`,
      }),
    });
    expect(byAction.get("appointment.rescheduled")).toMatchObject({
      actorType: "USER",
      actorId: "owner-1",
      changes: [
        {
          field: "startsAt",
          before: `${date}T14:00`,
          after: `${date}T15:30`,
        },
      ],
    });
    expect(byAction.get("appointment.cancelled")).toMatchObject({
      actorType: "USER",
      changes: [{ field: "status", before: "CONFIRMED", after: "CANCELLED" }],
      details: expect.objectContaining({ reason: "Cliente pediu" }),
    });

    // Filtro por quem fez.
    const ai = await readActivity(tenantA, "actor=AI");
    expect(ai.items.map((item) => item.action).sort()).toEqual([
      "appointment.created",
      "customer.created",
    ]);
  });

  it("registra a mudança da grade semanal dia a dia", async () => {
    await post(
      tenantA,
      "/internal/availability-settings",
      {
        timezone: timeZone,
        rules: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
        ],
      },
      "bff",
      "PATCH",
    );
    const { items } = await readActivity(tenantA, "area=SETTINGS");
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe("settings.availability_updated");
    expect(items[0].changes).toContainEqual({
      field: "weekday.1",
      before: "08:00–20:00",
      after: "09:00–18:00",
    });
    expect(items[0].changes).toContainEqual({
      field: "weekday.0",
      before: "08:00–20:00",
      after: null,
    });
  });

  it("nunca mostra o registro de um negócio para outro", async () => {
    await post(tenantA, "/internal/customers", { name: "Só do A" });
    await post(tenantB, "/internal/customers", { name: "Só do B" });

    const a = await readActivity(tenantA);
    const b = await readActivity(tenantB);
    expect(a.items.map((item) => item.entityLabel)).toEqual(["Só do A"]);
    expect(b.items.map((item) => item.entityLabel)).toEqual(["Só do B"]);
    // Nem a busca pelo nome atravessa o negócio.
    expect((await readActivity(tenantB, "q=Só do A")).items).toEqual([]);
  });

  it("filtra por busca e período e pagina pelo corte do BFF", async () => {
    for (const name of ["Dani", "Eva", "Fabi", "Gabi", "Hana"]) {
      await post(tenantA, "/internal/customers", { name });
    }
    expect(
      (await readActivity(tenantA, "q=abi")).items.map((item) => item.entityLabel),
    ).toEqual(["Gabi", "Fabi"]);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await readActivity(tenantA, `from=${encodeURIComponent(future)}`)).items).toEqual([]);

    const first = await readActivity(tenantA, "limit=2");
    expect(first.items.map((item) => item.entityLabel)).toEqual([
      "Hana",
      "Gabi",
    ]);
    expect(first.hasMore).toBe(true);
    const last = first.items[1];
    const second = await readActivity(
      tenantA,
      `limit=2&beforeAt=${encodeURIComponent(last.occurredAt)}&beforeSequence=${last.sequence}`,
    );
    expect(second.items.map((item) => item.entityLabel)).toEqual([
      "Fabi",
      "Eva",
    ]);
    const third = await readActivity(
      tenantA,
      `limit=2&beforeAt=${encodeURIComponent(second.items[1].occurredAt)}&beforeSequence=${second.items[1].sequence}`,
    );
    expect(third.items.map((item) => item.entityLabel)).toEqual(["Dani"]);
    expect(third.hasMore).toBe(false);
  });

  it("recusa UPDATE no registro: ele só cresce", async () => {
    await post(tenantA, "/internal/customers", { name: "Iris" });
    const row = await prisma.activityLog.findFirstOrThrow({
      where: { tenantId: tenantA },
    });
    await expect(
      prisma.activityLog.update({
        where: { id: row.id },
        data: { entityLabel: "Outro nome" },
      }),
    ).rejects.toThrow(/append-only/u);
  });

  it("não guarda senha, segredo nem token no registro", async () => {
    await post(tenantA, "/internal/customers", { name: "Jade" });
    const rows = await prisma.activityLog.findMany({
      where: { tenantId: tenantA },
    });
    const text = JSON.stringify(rows, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(text).not.toMatch(/password|secret|token/iu);
  });
});
