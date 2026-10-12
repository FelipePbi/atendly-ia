/**
 * Uso de cada serviço (D-170, pedido do usuário de 2026-10-12): o novo
 * agendamento mostra primeiro os 5 serviços mais usados, e "mais usado" é em
 * quantos atendimentos não cancelados dos últimos 90 dias o serviço aparece.
 * `GET /internal/service-catalog` traz esse número em `usageCount`.
 */
import "./support/test-env.js";

import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  deriveInternalToken,
  SERVICE_AUDIENCE,
} from "../../src/shared/auth/internal-credentials.js";
import { TEST_INTERNAL_SERVICE_TOKEN } from "./support/test-env.js";

const tenantId = "tenant-a";
const NOW = new Date("2026-10-12T15:00:00.000Z");
const DAY = 86_400_000;

type Database = ReturnType<typeof createDatabaseDouble>;

function seedAppointment(
  database: Database,
  input: {
    id: string;
    daysAgo: number;
    serviceIds: string[];
    status?: string;
    tenant?: string;
  },
) {
  const startAt = new Date(NOW.getTime() - input.daysAgo * DAY);
  database.tables.appointment.rows.push({
    id: input.id,
    tenantId: input.tenant ?? tenantId,
    customerId: "customer-1",
    source: "MANUAL",
    startAt,
    endAt: new Date(startAt.getTime() + 3_600_000),
    status: input.status ?? "CONFIRMED",
  });
  input.serviceIds.forEach((serviceId, index) => {
    database.tables.appointmentItem.rows.push({
      id: `${input.id}-item-${index}`,
      tenantId: input.tenant ?? tenantId,
      appointmentId: input.id,
      serviceId,
      serviceNameSnapshot: serviceId,
    });
  });
}

describe("AvenlyServiceService.usageCounts", () => {
  it("conta atendimentos não cancelados dos últimos 90 dias, uma vez por atendimento", async () => {
    const database = createDatabaseDouble();
    seedAppointment(database, { id: "a1", daysAgo: 1, serviceIds: ["corte", "escova"] });
    seedAppointment(database, { id: "a2", daysAgo: 30, serviceIds: ["corte", "corte"] });
    seedAppointment(database, { id: "a3", daysAgo: 89, serviceIds: ["escova"] });
    // Fora da conta: cancelado, mais de 90 dias, futuro e de outro negócio.
    seedAppointment(database, { id: "a4", daysAgo: 2, serviceIds: ["corte"], status: "CANCELLED" });
    seedAppointment(database, { id: "a5", daysAgo: 91, serviceIds: ["corte"] });
    seedAppointment(database, { id: "a6", daysAgo: -3, serviceIds: ["corte"] });
    seedAppointment(database, { id: "a7", daysAgo: 1, serviceIds: ["corte"], tenant: "tenant-b" });

    const counts = await new AvenlyServiceService(
      database.client as never,
      tenantId,
    ).usageCounts({ now: NOW });

    expect(Object.fromEntries(counts)).toEqual({ corte: 2, escova: 2 });
  });

  it("negócio sem atendimentos devolve o mapa vazio", async () => {
    const database = createDatabaseDouble();
    const counts = await new AvenlyServiceService(
      database.client as never,
      tenantId,
    ).usageCounts({ now: NOW });
    expect(counts.size).toBe(0);
  });
});

describe("GET /internal/service-catalog traz usageCount", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    currentClient = undefined;
  });

  it("cada serviço sai com o número de atendimentos recentes, zero quando não tem", async () => {
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
    const services = new AvenlyServiceService(database.client as never, tenantId);
    const corte = await services.create({
      name: "Corte",
      durationMinutes: 30,
      priceType: "FIXED",
      price: 50,
      colorToken: "ROSE",
    });
    const escova = await services.create({
      name: "Escova",
      durationMinutes: 40,
      priceType: "FIXED",
      price: 60,
      colorToken: "SKY",
    });
    const recent = Date.now() - 2 * DAY;
    database.tables.appointment.rows.push({
      id: "apt-1",
      tenantId,
      customerId: "customer-1",
      source: "MANUAL",
      startAt: new Date(recent),
      endAt: new Date(recent + 3_600_000),
      status: "COMPLETED",
    });
    database.tables.appointmentItem.rows.push({
      id: "apt-1-item",
      tenantId,
      appointmentId: "apt-1",
      serviceId: escova.id,
      serviceNameSnapshot: "Escova",
    });

    app = Fastify();
    await registerManagementRoutes(app, database.client as never);
    const token = deriveInternalToken(
      TEST_INTERNAL_SERVICE_TOKEN,
      "bff",
      SERVICE_AUDIENCE,
      "command",
    );
    const response = await app.inject({
      method: "GET",
      url: "/internal/service-catalog",
      headers: {
        authorization: `Bearer ${token}`,
        "x-tenant-id": tenantId,
        "x-user-id": "professional-1",
        "x-request-id": "req-1",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      data: Array<{ id: string; usageCount: number }>;
    }>();
    const byId = Object.fromEntries(
      body.data.map((item) => [item.id, item.usageCount]),
    );
    expect(byId).toEqual({ [corte.id]: 0, [escova.id]: 1 });
  });
});
