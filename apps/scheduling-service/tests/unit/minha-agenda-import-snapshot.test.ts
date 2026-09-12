import { describe, expect, it } from "vitest";

import type { MinhaAgendaSourceClient } from "../../src/modules/integrations/minha-agenda/client.js";
import type { MinhaAgendaConnectionConfig } from "../../src/modules/integrations/minha-agenda/config.js";
import { MinhaAgendaCalendarProvider } from "../../src/modules/integrations/minha-agenda/provider.js";
import type {
  MinhaAgendaAppointment,
  MinhaAgendaService,
  WorkSchedule,
} from "../../src/modules/integrations/minha-agenda/types.js";
import { AppError } from "../../src/shared/errors/app-error.js";

function config(): MinhaAgendaConnectionConfig {
  return {
    tenantId: "tenant-a",
    baseUrl: "https://minha-agenda.example.invalid",
    basicAuth: "Basic abc",
    username: "user",
    password: "secret",
    employeeId: 7,
    paymentMethod: "dinheiro",
    modelVersion: 2,
    timeoutMs: 1_000,
    refreshSkewSeconds: 300,
    enableWrites: false,
    bufferBetweenServicesMinutes: 0,
  };
}

function appointment(
  overrides: Partial<MinhaAgendaAppointment> = {},
): MinhaAgendaAppointment {
  return {
    id: 1,
    userId: 7,
    date: "2026-01-01",
    startTime: "09:00",
    endTime: "09:30",
    duration: 30,
    customerId: null,
    customer: null,
    serviceId: 10,
    service: null,
    price: 50,
    ...overrides,
  };
}

/** Dublê da origem: superficie identica ao client HTTP, sem rede. */
class FakeSourceClient implements MinhaAgendaSourceClient {
  services: MinhaAgendaService[] = [];
  operational: MinhaAgendaAppointment[] = [];
  blockers: MinhaAgendaAppointment[] = [];
  companySchedule: WorkSchedule = {};
  employeeSchedule: WorkSchedule = {};
  appointmentRangeCalls: Array<{
    startDate: string;
    endDate: string;
    isSlotBlocker: boolean;
  }> = [];
  failAppointments = false;

  async listServices(): Promise<MinhaAgendaService[]> {
    return this.services;
  }
  async searchCustomers() {
    return [];
  }
  async createCustomer(): Promise<never> {
    throw new Error("not used by the import reader");
  }
  async findAppointmentsByDateRange(query: {
    startDate: string;
    endDate: string;
    isSlotBlocker: boolean;
  }): Promise<MinhaAgendaAppointment[]> {
    this.appointmentRangeCalls.push({
      startDate: query.startDate,
      endDate: query.endDate,
      isSlotBlocker: query.isSlotBlocker,
    });
    if (this.failAppointments) {
      throw new AppError("MINHA_AGENDA_INVALID_RESPONSE", "bad contract", 502, {
        context: "appointments.byDateRange",
      });
    }
    // Espelha a origem real: so devolve o que cai dentro da janela pedida,
    // para exercitar a paginacao por janelas do provider de verdade.
    const source = query.isSlotBlocker ? this.blockers : this.operational;
    return source.filter(
      (item) => item.date >= query.startDate && item.date <= query.endDate,
    );
  }
  async appointmentExists() {
    return false;
  }
  async getAppointment(): Promise<never> {
    throw new Error("not used by the import reader");
  }
  async createAppointment(): Promise<never> {
    throw new Error("not used by the import reader");
  }
  async updateAppointment(): Promise<never> {
    throw new Error("not used by the import reader");
  }
  async cancelWithComments(): Promise<void> {}
  async getCompanyWorkSchedule(): Promise<WorkSchedule> {
    return this.companySchedule;
  }
  async getEmployeeWorkScheduleByEmployeeId(): Promise<WorkSchedule> {
    return this.employeeSchedule;
  }
}

function provider(client: FakeSourceClient) {
  return new MinhaAgendaCalendarProvider(config(), client);
}

describe("MinhaAgendaCalendarProvider.getImportSnapshot: leitura por categoria", () => {
  it("le por categoria sem reaproveitar os filtros operacionais de servico e agendamento", async () => {
    const client = new FakeSourceClient();
    client.services = [
      {
        id: 1,
        name: "Corte",
        duration: 30,
        price: 50,
        colorId: null,
        deleted: false,
      },
      {
        // Servico desativado: continua na leitura, ao contrario de
        // `listServices()` (que filtra `deleted`).
        id: 2,
        name: "Descontinuado",
        duration: 20,
        price: 30,
        colorId: null,
        deleted: true,
      },
    ];
    client.operational = [
      appointment({ id: 100, date: "2026-06-01" }), // futuro
      appointment({ id: 101, date: "2020-01-01" }), // passado
      appointment({ id: 102, date: "2020-06-01", deleted: true }), // cancelado
    ];
    client.blockers = [appointment({ id: 200, date: "2026-06-02" })];

    const snapshot = await provider(client).getImportSnapshot({
      startDate: "2020-01-01",
      endDate: "2026-12-31",
      referenceDate: "2026-01-01",
    });

    expect(
      snapshot.services.records.map((record) => record.externalId),
    ).toEqual(["1", "2"]);
    expect(snapshot.services.coverage).toMatchObject({
      sourceSupported: true,
      readCount: 2,
    });

    expect(
      snapshot.futureAppointments.records.map((r) => r.externalId),
    ).toEqual(["100"]);
    expect(snapshot.pastAppointments.records.map((r) => r.externalId)).toEqual([
      "101",
    ]);
    expect(
      snapshot.cancelledAppointments.records.map((r) => r.externalId),
    ).toEqual(["102"]);
    expect(snapshot.timeBlocks.records.map((r) => r.externalId)).toEqual([
      "200",
    ]);
  });

  it("preserva o raw do registro de origem para rastreio", async () => {
    const client = new FakeSourceClient();
    client.operational = [
      appointment({ id: 1, comments: "confirmar telefone" }),
    ];

    const snapshot = await provider(client).getImportSnapshot({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      referenceDate: "2026-01-01",
    });

    expect(snapshot.futureAppointments.records[0].raw).toMatchObject({
      id: 1,
      comments: "confirmar telefone",
    });
  });

  it("percorre a janela consultada em paginas e nao trunca em silencio", async () => {
    const client = new FakeSourceClient();
    client.operational = [appointment({ id: 1 })];

    await provider(client).getImportSnapshot({
      startDate: "2026-01-01",
      endDate: "2026-05-01", // mais de 90 dias: mais de uma janela
      referenceDate: "2026-01-01",
    });

    const operationalCalls = client.appointmentRangeCalls.filter(
      (call) => !call.isSlotBlocker,
    );
    expect(operationalCalls.length).toBeGreaterThan(1);
    expect(operationalCalls[0].startDate).toBe("2026-01-01");
    expect(operationalCalls.at(-1)?.endDate).toBe("2026-05-01");
  });

  describe("categoria nao fornecida pela origem vira limitacao declarada e quantificada", () => {
    it("CUSTOMER: sem diretorio de clientes, so o que aparece vinculado a agendamento", async () => {
      const client = new FakeSourceClient();
      client.operational = [
        appointment({
          id: 1,
          customer: { id: 9, name: "Ana", phone1: "+5511999990000" },
        }),
        appointment({ id: 2 }), // sem cliente vinculado
      ];

      const snapshot = await provider(client).getImportSnapshot({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        referenceDate: "2026-01-01",
      });

      expect(snapshot.customers.coverage.sourceSupported).toBe(false);
      expect(snapshot.customers.coverage.limitationCode).toBe(
        "CUSTOMER_DIRECTORY_UNAVAILABLE",
      );
      expect(snapshot.customers.coverage.readCount).toBe(1);
      expect(snapshot.customers.records).toEqual([
        {
          externalId: "9",
          raw: { id: 9, name: "Ana", phone1: "+5511999990000" },
        },
      ]);
      // Nao fabrica: nenhuma contagem declarada pela origem.
      expect(snapshot.customers.coverage.sourceReportedCount).toBeNull();
    });

    it("NO_SHOW_APPOINTMENT: nao modelado pela origem, sem fabricar cobertura", async () => {
      const client = new FakeSourceClient();

      const snapshot = await provider(client).getImportSnapshot({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        referenceDate: "2026-01-01",
      });

      expect(snapshot.noShowAppointments.coverage).toMatchObject({
        sourceSupported: false,
        limitationCode: "NO_SHOW_NOT_MODELED_BY_SOURCE",
        readCount: 0,
      });
      expect(snapshot.noShowAppointments.records).toEqual([]);
    });
  });

  it("RED: resposta fora do contrato de uma categoria falha identificada pela categoria e por uma causa sanitizada", async () => {
    const client = new FakeSourceClient();
    client.failAppointments = true;

    let caught: unknown;
    try {
      await provider(client).getImportSnapshot({
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        referenceDate: "2026-01-01",
      });
    } catch (error) {
      caught = error;
    }

    // GREEN: falha explicita nomeando as categorias afetadas e a causa
    // sanitizada (codigo do erro de origem) — nunca um snapshot parcial com
    // campos undefined.
    expect(caught).toBeInstanceOf(AppError);
    const appError = caught as AppError;
    expect(appError.code).toBe("MINHA_AGENDA_IMPORT_CATEGORY_FAILED");
    expect(appError.details).toMatchObject({
      categories: [
        "FUTURE_APPOINTMENT",
        "PAST_APPOINTMENT",
        "CANCELLED_APPOINTMENT",
      ],
      cause: "MINHA_AGENDA_INVALID_RESPONSE",
    });
  });
});
