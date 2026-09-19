import { AppError } from "../../../shared/errors/app-error.js";
import type { CalendarServiceDefinition } from "../../calendar/calendar-provider.js";
import {
  createMinhaAgendaClient,
  type MinhaAgendaSourceClient,
} from "./client.js";
import type { MinhaAgendaConnectionConfig } from "./config.js";
import { addDays } from "./date-time.js";
import type {
  MinhaAgendaAppointment,
  MinhaAgendaCustomer,
  MinhaAgendaService,
} from "./types.js";

/**
 * Eixo do preview de importacao (Goal010): espelha o enum Prisma
 * `ImportCategory` por valor, sem depender do client gerado neste modulo de
 * leitura da origem.
 */
export type MinhaAgendaImportCategory =
  | "SERVICE"
  | "CUSTOMER"
  | "AVAILABILITY"
  | "TIME_BLOCK"
  | "FUTURE_APPOINTMENT"
  | "PAST_APPOINTMENT"
  | "CANCELLED_APPOINTMENT"
  | "NO_SHOW_APPOINTMENT";

/**
 * Cobertura explicita de uma categoria: quanto foi lido, quanto a origem
 * declarou existir (nulo quando a origem nao declara total — nunca zero
 * fabricado) e a limitacao declarada quando a origem nao fornece a
 * categoria.
 */
export interface MinhaAgendaImportCoverage {
  sourceSupported: boolean;
  sourceReportedCount: number | null;
  readCount: number;
  limitationCode: string | null;
  limitationDetail: string | null;
}

export interface MinhaAgendaImportRecord {
  externalId: string;
  /** Registro bruto da origem, preservado para rastreio. */
  raw: unknown;
}

export interface MinhaAgendaImportCategorySnapshot {
  category: MinhaAgendaImportCategory;
  coverage: MinhaAgendaImportCoverage;
  records: MinhaAgendaImportRecord[];
}

export interface MinhaAgendaImportSnapshot {
  generatedAt: string;
  services: MinhaAgendaImportCategorySnapshot;
  customers: MinhaAgendaImportCategorySnapshot;
  availability: MinhaAgendaImportCategorySnapshot;
  timeBlocks: MinhaAgendaImportCategorySnapshot;
  futureAppointments: MinhaAgendaImportCategorySnapshot;
  pastAppointments: MinhaAgendaImportCategorySnapshot;
  cancelledAppointments: MinhaAgendaImportCategorySnapshot;
  noShowAppointments: MinhaAgendaImportCategorySnapshot;
}

export interface GetImportSnapshotInput {
  /** Inicio da janela consultada nos endpoints de agendamento. */
  startDate: string;
  /** Fim da janela consultada nos endpoints de agendamento. */
  endDate: string;
  /**
   * Data de referencia ("hoje") que separa `FUTURE_APPOINTMENT` de
   * `PAST_APPOINTMENT`. Recebida do chamador (fuso do tenant), nunca
   * calculada aqui a partir do relogio do processo.
   */
  referenceDate: string;
}

/**
 * Tamanho da janela por chamada aos endpoints de agendamento. A origem nao
 * declara total nem pagina por cursor: percorrer em janelas fixas, somando o
 * lido de cada uma, evita uma unica chamada de anos que a origem poderia
 * truncar em silencio.
 */
const APPOINTMENT_WINDOW_DAYS = 90;

function* dateWindows(
  startDate: string,
  endDate: string,
  windowDays: number,
): Generator<{ start: string; end: string }> {
  let cursor = startDate;
  while (cursor <= endDate) {
    const windowEnd = minDate(addDays(cursor, windowDays - 1), endDate);
    yield { start: cursor, end: windowEnd };
    cursor = addDays(windowEnd, 1);
  }
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function isCancelled(appointment: MinhaAgendaAppointment): boolean {
  return appointment.deleted === true;
}

/**
 * Falha de leitura de uma categoria: identificada pela categoria e por uma
 * causa sanitizada (codigo do erro de origem), nunca pelo payload cru nem
 * por um registro fabricado com campos ausentes.
 */
function importCategoryFailure(
  category: MinhaAgendaImportCategory | MinhaAgendaImportCategory[],
  error: unknown,
): AppError {
  const categories = Array.isArray(category) ? category : [category];
  const cause = error instanceof AppError ? error.code : "UNKNOWN";
  return new AppError(
    "MINHA_AGENDA_IMPORT_CATEGORY_FAILED",
    `Failed to read Minha Agenda import categor${categories.length > 1 ? "ies" : "y"} ${categories
      .map((item) => `"${item}"`)
      .join(", ")}: ${cause}.`,
    502,
    { categories, cause },
  );
}

export class MinhaAgendaImportSourceReader {
  private readonly client: MinhaAgendaSourceClient;

  constructor(
    private readonly config: MinhaAgendaConnectionConfig,
    client?: MinhaAgendaSourceClient,
  ) {
    this.client = client ?? createMinhaAgendaClient(config);
  }

  async listServices(): Promise<CalendarServiceDefinition[]> {
    const services = await this.listActiveExternalServices();
    return services.map(toCalendarService);
  }

  /**
   * Leitor por categoria da importacao unica (Goal010, WU-02): filtra
   * servico desativado e agendamento cancelado/bloqueio como categorias de
   * primeira classe, em vez de esconde-los como {@link listServices} faz.
   * Nao escreve nada.
   */
  async getImportSnapshot(
    input: GetImportSnapshotInput,
  ): Promise<MinhaAgendaImportSnapshot> {
    const services = await this.readServiceCategory();
    const availability = await this.readAvailabilityCategory();
    const operational = await this.readOperationalAppointments(
      input.startDate,
      input.endDate,
    );
    const timeBlocks = await this.readTimeBlockCategory(
      input.startDate,
      input.endDate,
    );
    const futureAppointments = this.buildAppointmentCategory(
      "FUTURE_APPOINTMENT",
      operational.filter(
        (appointment) =>
          !isCancelled(appointment) && appointment.date >= input.referenceDate,
      ),
    );
    const pastAppointments = this.buildAppointmentCategory(
      "PAST_APPOINTMENT",
      operational.filter(
        (appointment) =>
          !isCancelled(appointment) && appointment.date < input.referenceDate,
      ),
    );
    const cancelledAppointments = this.buildAppointmentCategory(
      "CANCELLED_APPOINTMENT",
      operational.filter((appointment) => isCancelled(appointment)),
    );
    const customers = this.readCustomerCategory([
      ...operational,
      ...timeBlocks.source,
    ]);
    const noShowAppointments = this.readNoShowCategory();

    return {
      generatedAt: new Date().toISOString(),
      services,
      customers,
      availability,
      timeBlocks: timeBlocks.snapshot,
      futureAppointments,
      pastAppointments,
      cancelledAppointments,
      noShowAppointments,
    };
  }

  private async readServiceCategory(): Promise<MinhaAgendaImportCategorySnapshot> {
    try {
      // Sem filtro operacional: servico desativado (`deleted: true`)
      // continua visivel para o preview decidir, em vez de sumir da leitura.
      const services = await this.client.listServices();
      return {
        category: "SERVICE",
        coverage: {
          sourceSupported: true,
          sourceReportedCount: null,
          readCount: services.length,
          limitationCode: null,
          limitationDetail: null,
        },
        records: services.map((service) => ({
          externalId: String(service.id),
          raw: service,
        })),
      };
    } catch (error) {
      throw importCategoryFailure("SERVICE", error);
    }
  }

  private async readAvailabilityCategory(): Promise<MinhaAgendaImportCategorySnapshot> {
    try {
      const [companySchedule, employeeSchedule] = await Promise.all([
        this.client.getCompanyWorkSchedule(),
        this.client.getEmployeeWorkScheduleByEmployeeId(this.config.employeeId),
      ]);
      return {
        category: "AVAILABILITY",
        coverage: {
          sourceSupported: true,
          sourceReportedCount: null,
          readCount: 2,
          limitationCode: null,
          limitationDetail: null,
        },
        records: [
          { externalId: "company", raw: companySchedule },
          {
            externalId: `employee:${this.config.employeeId}`,
            raw: employeeSchedule,
          },
        ],
      };
    } catch (error) {
      throw importCategoryFailure("AVAILABILITY", error);
    }
  }

  private async readOperationalAppointments(
    startDate: string,
    endDate: string,
  ): Promise<MinhaAgendaAppointment[]> {
    try {
      return await this.readAppointmentWindow(startDate, endDate, false);
    } catch (error) {
      throw importCategoryFailure(
        ["FUTURE_APPOINTMENT", "PAST_APPOINTMENT", "CANCELLED_APPOINTMENT"],
        error,
      );
    }
  }

  private async readAppointmentWindow(
    startDate: string,
    endDate: string,
    isSlotBlocker: boolean,
  ): Promise<MinhaAgendaAppointment[]> {
    const all: MinhaAgendaAppointment[] = [];
    for (const window of dateWindows(
      startDate,
      endDate,
      APPOINTMENT_WINDOW_DAYS,
    )) {
      const page = await this.client.findAppointmentsByDateRange({
        startDate: window.start,
        endDate: window.end,
        employeeId: this.config.employeeId,
        isSlotBlocker,
      });
      all.push(...page);
    }
    return all;
  }

  private async readTimeBlockCategory(
    startDate: string,
    endDate: string,
  ): Promise<{
    snapshot: MinhaAgendaImportCategorySnapshot;
    source: MinhaAgendaAppointment[];
  }> {
    try {
      const blockers = await this.readAppointmentWindow(
        startDate,
        endDate,
        true,
      );
      return {
        source: blockers,
        snapshot: this.buildAppointmentCategory("TIME_BLOCK", blockers),
      };
    } catch (error) {
      throw importCategoryFailure("TIME_BLOCK", error);
    }
  }

  private buildAppointmentCategory(
    category: MinhaAgendaImportCategory,
    appointments: MinhaAgendaAppointment[],
  ): MinhaAgendaImportCategorySnapshot {
    return {
      category,
      coverage: {
        sourceSupported: true,
        sourceReportedCount: null,
        readCount: appointments.length,
        limitationCode: null,
        limitationDetail: null,
      },
      records: appointments.map((appointment) => ({
        externalId: String(appointment.id),
        raw: appointment,
      })),
    };
  }

  /**
   * A origem nao expoe um diretorio de clientes (so busca por telefone); o
   * que da para ver e quem aparece vinculado a um agendamento ou bloqueio ja
   * lido. Isso e cobertura parcial e declarada, nunca o cadastro completo.
   */
  private readCustomerCategory(
    appointments: MinhaAgendaAppointment[],
  ): MinhaAgendaImportCategorySnapshot {
    const byId = new Map<number, MinhaAgendaCustomer>();
    for (const appointment of appointments) {
      if (appointment.customer)
        byId.set(appointment.customer.id, appointment.customer);
    }
    return {
      category: "CUSTOMER",
      coverage: {
        sourceSupported: false,
        sourceReportedCount: null,
        readCount: byId.size,
        limitationCode: "CUSTOMER_DIRECTORY_UNAVAILABLE",
        limitationDetail:
          "A origem não expõe um endpoint de listagem de clientes; apenas clientes vinculados a um agendamento ou bloqueio lido no período consultado ficam visíveis.",
      },
      records: [...byId.entries()].map(([id, customer]) => ({
        externalId: String(id),
        raw: customer,
      })),
    };
  }

  /**
   * A origem nao modela falta como estado distinto de cancelado no contrato
   * documentado (sem campo proprio em `MinhaAgendaAppointment`); fingir
   * cobertura fabricaria um status que ninguem informou.
   */
  private readNoShowCategory(): MinhaAgendaImportCategorySnapshot {
    return {
      category: "NO_SHOW_APPOINTMENT",
      coverage: {
        sourceSupported: false,
        sourceReportedCount: null,
        readCount: 0,
        limitationCode: "NO_SHOW_NOT_MODELED_BY_SOURCE",
        limitationDetail:
          "A origem não modela falta como estado distinto de cancelado; nenhum agendamento é classificado como falta a partir dela.",
      },
      records: [],
    };
  }

  private async listActiveExternalServices(): Promise<MinhaAgendaService[]> {
    return (await this.client.listServices()).filter(
      (service) => !service.deleted,
    );
  }
}

// O schema do Minha Agenda (`client.ts`) valida presenca e tipo dos campos
// obrigatorios, mas preco/duracao continuam vindo de um `passthrough()`: um
// numero valido no contrato ainda pode ser um valor de negocio ausente. As
// funcoes abaixo tratam isso como o produto exige: ausente vira "nao
// informado" ou pendencia de revisao, nunca `FIXED`/zero/duracao copiada
// (DATA-09).
function knownNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function knownPositiveDuration(value: unknown): number | null {
  const known = knownNumber(value);
  return known !== null && known > 0 ? known : null;
}

function toCalendarService(
  service: MinhaAgendaService,
): CalendarServiceDefinition {
  const price = knownNumber(service.price);
  return {
    id: String(service.id),
    name: service.name,
    durationMinutes: knownPositiveDuration(service.duration),
    priceType: price === null ? "NOT_INFORMED" : "FIXED",
    price,
    active: !service.deleted,
    colorId: service.colorId,
  };
}
