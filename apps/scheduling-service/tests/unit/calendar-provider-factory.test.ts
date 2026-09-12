/**
 * Corte do writer remoto (Goal010, WU-07): `CalendarProviderFactory` recusa
 * MINHA_AGENDA para qualquer operacao operacional — escrita, oferta de
 * horarios e leitura — com erro proprio e identificavel. O dublê de
 * `MinhaAgendaCalendarProvider` abaixo falha se for instanciado: ele prova
 * que nenhum caminho novo constroi o provider remoto fora da importacao,
 * porque o teste falharia com o erro do dublê em vez do erro esperado da
 * factory caso algum caminho ainda o chamasse.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/integrations/minha-agenda/provider.js", () => ({
  MinhaAgendaCalendarProvider: class {
    constructor() {
      throw new Error(
        "dublê: MinhaAgendaCalendarProvider não deve ser instanciado fora da importação",
      );
    }
  },
}));

import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { CalendarProviderFactory } from "../../src/modules/calendar/provider-factory.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const context = { tenantId, userId: "user-1", requestId: "request-1" };

describe("CalendarProviderFactory: corte do writer remoto (Goal010)", () => {
  it("recusa MINHA_AGENDA com erro próprio, sem consultar a conexão nem instanciar o provider remoto", async () => {
    const prisma = {
      integrationConnection: {
        findUnique: () => {
          throw new Error(
            "não deveria consultar IntegrationConnection para uma operação recusada",
          );
        },
      },
    };
    const factory = new CalendarProviderFactory(prisma as never);

    await expect(
      factory.create({
        tenantId,
        userId: "user-1",
        timeZone: "America/Sao_Paulo",
        source: "MINHA_AGENDA",
      }),
    ).rejects.toMatchObject({
      code: "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED",
      statusCode: 409,
    });
  });
});

describe("CalendarService: nenhuma operação instancia o provider remoto (Goal010)", () => {
  function setup(source: "ATENDLY" | "MINHA_AGENDA") {
    const database = createDatabaseDouble();
    database.tables.calendarSettings.rows.push({
      id: tenantId,
      tenantId,
      source,
      timezone: "America/Sao_Paulo",
    });
    return { calendar: new CalendarService(database.client as never) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recusa listServices com fonte MINHA_AGENDA", async () => {
    const { calendar } = setup("MINHA_AGENDA");
    await expect(calendar.listServices(context)).rejects.toMatchObject({
      code: "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED",
    });
  });

  it("recusa a oferta de horários (getAvailability) com fonte MINHA_AGENDA", async () => {
    const { calendar } = setup("MINHA_AGENDA");
    await expect(
      calendar.getAvailability(context, {
        serviceIds: ["service-1"],
        startDate: "2026-01-01",
        days: 1,
        maxSlots: 10,
      }),
    ).rejects.toMatchObject({ code: "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED" });
  });

  it("recusa createAppointment com fonte MINHA_AGENDA", async () => {
    const { calendar } = setup("MINHA_AGENDA");
    await expect(
      calendar.createAppointment(context, {
        serviceIds: ["service-1"],
        date: "2026-01-01",
        startTime: "09:00",
        customerId: "customer-1",
        stepMinutes: 30,
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({ code: "MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED" });
  });

  it("continua operando normalmente com fonte ATENDLY", async () => {
    const { calendar } = setup("ATENDLY");
    await expect(calendar.listServices(context)).resolves.toEqual([]);
  });
});
