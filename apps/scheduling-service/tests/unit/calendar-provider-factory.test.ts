/**
 * Retirada da fonte externa (Goal027): `CalendarProviderFactory` nao escolhe
 * mais fonte nenhuma — ela instancia a Agenda Avenly e pronto. O que antes
 * era provado pelo erro `MINHA_AGENDA_OPERATIONAL_SOURCE_DISABLED` continua
 * provado aqui de outro jeito, e e o que importa: **nenhum caminho do
 * calendario constroi o leitor remoto**. O dublê de
 * `MinhaAgendaImportSourceReader` abaixo falha se for instanciado, entao um
 * caminho novo que o chamasse quebraria estes testes com o erro do dublê.
 *
 * A invariante que o `if` da factory defendia mora agora na constraint
 * `CHECK` de `CalendarSettings.source` (Goal027, WU-01), provada em
 * integracao pelo ensaio da migration — nao num ramo de codigo inalcancavel.
 *
 * O que sobrou de exigencia no caminho do provider e ter calendario
 * configurado: tenant sem linha de `CalendarSettings` continua recebendo
 * `404 CALENDAR_SETTINGS_NOT_FOUND`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/modules/integrations/minha-agenda/import-source-reader.js",
  () => ({
    MinhaAgendaImportSourceReader: class {
      constructor() {
        throw new Error(
          "dublê: MinhaAgendaImportSourceReader não deve ser instanciado fora da importação",
        );
      }
    },
  }),
);

import { AvenlyCalendarProvider } from "../../src/modules/integrations/avenly/provider.js";
import { CalendarService } from "../../src/modules/calendar/calendar-service.js";
import { CalendarProviderFactory } from "../../src/modules/calendar/provider-factory.js";
import { createDatabaseDouble } from "./support/database-double.js";

const tenantId = "tenant-a";
const context = { tenantId, userId: "user-1", requestId: "request-1" };

describe("CalendarProviderFactory: uma fonte so (Goal027)", () => {
  it("instancia a Agenda Avenly sem consultar a conexão da integração", async () => {
    const prisma = {
      integrationConnection: {
        findUnique: () => {
          throw new Error(
            "não deveria consultar IntegrationConnection para montar o provider",
          );
        },
      },
    };
    const factory = new CalendarProviderFactory(prisma as never);

    const provider = await factory.create({
      tenantId,
      userId: "user-1",
      timeZone: "America/Sao_Paulo",
    });

    expect(provider).toBeInstanceOf(AvenlyCalendarProvider);
  });
});

describe("CalendarService: nenhuma operação instancia o provider remoto (Goal010/Goal027)", () => {
  function setup(options: { withCalendar: boolean }) {
    const database = createDatabaseDouble();
    if (options.withCalendar) {
      database.tables.calendarSettings.rows.push({
        id: tenantId,
        tenantId,
        source: "AVENLY",
        timezone: "America/Sao_Paulo",
      });
    }
    return { calendar: new CalendarService(database.client as never) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opera normalmente para tenant com calendário configurado", async () => {
    const { calendar } = setup({ withCalendar: true });
    await expect(calendar.listServices(context)).resolves.toEqual([]);
  });

  it("recusa listServices sem calendário configurado, com 404", async () => {
    const { calendar } = setup({ withCalendar: false });
    await expect(calendar.listServices(context)).rejects.toMatchObject({
      code: "CALENDAR_SETTINGS_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("recusa a oferta de horários (getAvailability) sem calendário configurado", async () => {
    const { calendar } = setup({ withCalendar: false });
    await expect(
      calendar.getAvailability(context, {
        serviceIds: ["service-1"],
        startDate: "2026-01-01",
        days: 1,
        maxSlots: 10,
      }),
    ).rejects.toMatchObject({
      code: "CALENDAR_SETTINGS_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("recusa createAppointment sem calendário configurado", async () => {
    const { calendar } = setup({ withCalendar: false });
    await expect(
      calendar.createAppointment(context, {
        serviceIds: ["service-1"],
        date: "2026-01-01",
        startTime: "09:00",
        customerId: "customer-1",
        stepMinutes: 30,
        idempotencyKey: "key-1",
      }),
    ).rejects.toMatchObject({
      code: "CALENDAR_SETTINGS_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("recusa o ciclo de vida sem calendário configurado, no lugar do antigo 409 de fonte externa", async () => {
    const { calendar } = setup({ withCalendar: false });
    await expect(
      calendar.listAppointmentHistory(context, "appointment-1"),
    ).rejects.toMatchObject({
      code: "CALENDAR_SETTINGS_NOT_FOUND",
      statusCode: 404,
    });
  });
});
