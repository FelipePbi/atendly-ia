import { AppError } from "../../../shared/errors/app-error.js";
import { normalizePhone, phoneMatches } from "../../../shared/phone/phone.js";
import {
  type AvailableSlot,
  type CalendarAppointment,
  type CalendarAppointmentServiceItem,
  type CalendarHold,
  type CalendarProvider,
  type CalendarServiceDefinition,
  type CancelCalendarAppointmentInput,
  computeAgreementTotal,
  type CreateCalendarAppointmentInput,
  type CreateCalendarHoldInput,
  type GetAvailabilityInput,
  type ListAppointmentsInput,
  type RescheduleCalendarAppointmentInput,
} from "../../calendar/calendar-provider.js";
import {
  computeAvailableSlots,
  type MigrationAvailabilityRule,
  migrationAvailabilityRules,
} from "./availability.js";
import { createMinhaAgendaClient, type MinhaAgendaClient } from "./client.js";
import type { MinhaAgendaConnectionConfig } from "./config.js";
import { addDays } from "./date-time.js";
import type {
  CreateAppointmentInput,
  MinhaAgendaAppointment,
  MinhaAgendaCustomer,
  MinhaAgendaService,
  UpdateAppointmentInput,
} from "./types.js";

export class MinhaAgendaCalendarProvider implements CalendarProvider {
  private readonly client: MinhaAgendaClient;

  constructor(private readonly config: MinhaAgendaConnectionConfig) {
    this.client = createMinhaAgendaClient(config);
  }

  async listServices(): Promise<CalendarServiceDefinition[]> {
    const services = await this.listActiveExternalServices();
    return services.map(toCalendarService);
  }

  async listAppointments(
    input: ListAppointmentsInput,
  ): Promise<CalendarAppointment[]> {
    const customer = input.customerPhone
      ? await this.findCustomerByPhone(input.customerPhone)
      : null;
    if (input.customerPhone && !customer) return [];

    const appointments = await this.client.findAppointmentsByDateRange({
      startDate: input.startDate,
      endDate: input.endDate,
      employeeId: this.config.employeeId,
      isSlotBlocker: false,
    });

    return appointments
      .filter(
        (appointment) =>
          !appointment.deleted &&
          (!customer || appointment.customerId === customer.id),
      )
      .sort((left, right) =>
        `${left.date} ${left.startTime}`.localeCompare(
          `${right.date} ${right.startTime}`,
        ),
      )
      .map(toCalendarAppointment);
  }

  async getMigrationSnapshot(input: {
    startDate: string;
    endDate: string;
  }): Promise<{
    services: CalendarServiceDefinition[];
    appointments: CalendarAppointment[];
    availability: MigrationAvailabilityRule[];
  }> {
    const [services, appointments, companySchedule, employeeSchedule] =
      await Promise.all([
        this.listServices(),
        this.listAppointments(input),
        this.client.getCompanyWorkSchedule(),
        this.client.getEmployeeWorkScheduleByEmployeeId(this.config.employeeId),
      ]);
    return {
      services,
      appointments,
      availability: migrationAvailabilityRules(
        companySchedule,
        employeeSchedule,
      ),
    };
  }

  async getAppointment(appointmentId: string): Promise<CalendarAppointment> {
    return toCalendarAppointment(
      await this.client.getAppointment(parseExternalId(appointmentId)),
    );
  }

  async getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]> {
    const services = await this.findServices(input.serviceIds);
    const serviceDuration = this.calculateServiceBlockMinutes(services);
    const endDate = addDays(input.startDate, input.days - 1);
    const [companySchedule, employeeSchedule, appointments, blockers] =
      await Promise.all([
        this.client.getCompanyWorkSchedule(),
        this.client.getEmployeeWorkScheduleByEmployeeId(this.config.employeeId),
        this.client.findAppointmentsByDateRange({
          startDate: input.startDate,
          endDate,
          employeeId: this.config.employeeId,
          isSlotBlocker: false,
        }),
        this.client.findAppointmentsByDateRange({
          startDate: input.startDate,
          endDate,
          employeeId: this.config.employeeId,
          isSlotBlocker: true,
        }),
      ]);

    return computeAvailableSlots({
      companySchedule,
      employeeSchedule,
      appointments,
      blockers,
      serviceDuration,
      startDate: input.startDate,
      days: input.days,
      stepMinutes: input.stepMinutes,
      maxSlots: input.maxSlots,
    });
  }

  async createAppointment(
    input: CreateCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    this.requireWrites();
    this.refuseAtendlyOnlyWrite(input);
    const services = await this.findServices(input.serviceIds);
    const duration = this.calculateServiceBlockMinutes(services);
    await this.assertSlotAvailable(
      input.date,
      input.startTime,
      duration,
      input.stepMinutes,
    );
    // A agenda externa continua identificando pessoa por telefone: a
    // identidade por ID do Goal006 vale para a Agenda Atendly. Aqui o contrato
    // externo é recusado explicitamente quando falta o que ele exige, em vez
    // de inventar um cadastro.
    if (!input.customerPhone || !input.customerName) {
      throw new AppError(
        "EXTERNAL_CUSTOMER_IDENTIFICATION_REQUIRED",
        "The external calendar requires customer name and phone; scheduling by customerId is only supported by the Atendly calendar.",
        400,
      );
    }
    const customer = await this.findOrCreateCustomer(
      input.customerPhone,
      input.customerName,
      input.idempotencyKey,
    );
    const firstService = services[0];
    const payload: CreateAppointmentInput = {
      date: input.date,
      startTime: input.startTime,
      duration,
      customerId: customer.id,
      paymentMethod: this.config.paymentMethod,
      comments: input.comments ?? "",
      colorId: firstService?.colorId ?? null,
      materialCost: null,
      reminder: false,
      userId: this.config.employeeId,
      roomId: "",
      modelVersion: this.config.modelVersion,
      loyaltyCardCustomerId: null,
      items: services.map((service) => ({
        serviceId: service.id,
        price: service.price.toFixed(2),
      })),
      productItems: [],
    };

    return toCalendarAppointment(
      await this.client.createAppointment(payload, input.idempotencyKey),
    );
  }

  async rescheduleAppointment(
    input: RescheduleCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    this.requireWrites();
    this.refuseAtendlyOnlyWrite(input);
    const appointmentId = parseExternalId(input.appointmentId);
    const current = await this.client.getAppointment(appointmentId);
    const serviceId = this.extractSingleServiceId(current);
    const service = await this.findExternalService(serviceId);
    await this.assertSlotAvailable(
      input.date,
      input.startTime,
      current.duration || service.duration,
      input.stepMinutes,
      appointmentId,
    );
    if (!current.customerId) {
      throw new AppError(
        "APPOINTMENT_CUSTOMER_REQUIRED",
        "Appointment does not have a customer.",
        409,
      );
    }

    const payload: UpdateAppointmentInput = {
      id: current.id,
      date: input.date,
      startTime: input.startTime,
      duration: current.duration || service.duration,
      customerId: current.customerId,
      accountsReceivableId: current.accountsReceivableId ?? null,
      paymentMethod: current.paymentMethod ?? this.config.paymentMethod,
      comments: current.comments ?? "",
      colorId: current.colorId ?? service.colorId,
      materialCost: current.materialCost ?? null,
      reminder: current.reminder ?? false,
      userId: current.userId,
      roomId:
        current.roomId === undefined ? null : String(current.roomId ?? ""),
      appointmentRepeatInfoForm: null,
      discount: current.discount ?? null,
      discountInPercentage: current.discountInPercentage ?? false,
      tag: current.tag ?? null,
      modelVersion: current.modelVersion ?? this.config.modelVersion,
      loyaltyCardCustomerId: current.loyaltyCardCustomerId ?? null,
      items: [{ serviceId: service.id, price: current.price ?? service.price }],
      productItems: [],
    };

    return toCalendarAppointment(
      await this.client.updateAppointment(
        appointmentId,
        payload,
        input.idempotencyKey,
      ),
    );
  }

  async cancelAppointment(
    input: CancelCalendarAppointmentInput,
  ): Promise<CalendarAppointment> {
    this.requireWrites();
    const appointmentId = parseExternalId(input.appointmentId);
    const current = await this.client.getAppointment(appointmentId);
    const comments =
      input.comments ?? `Cancelado via Atendly em ${new Date().toISOString()}`;
    await this.client.cancelWithComments(
      appointmentId,
      comments,
      input.idempotencyKey,
    );
    return { ...toCalendarAppointment(current), status: "CANCELLED" };
  }

  /**
   * A fonte externa mantem a interface, mas recusa o que so a Agenda Atendly
   * sabe garantir (Goal008): sobreposicao forcada e atendimento sem servico
   * cadastrado dependem da politica unica de escrita — transacao, lock e
   * historico no mesmo commit — que nao existe do outro lado de uma chamada
   * HTTP. Recusar e explicito; aceitar seria fingir a mesma garantia.
   */
  private refuseAtendlyOnlyWrite(input: {
    overlapOverride?: boolean;
    serviceIds?: string[];
    holdId?: string;
  }): void {
    if (input.holdId) this.refuseHolds();
    if (input.overlapOverride) {
      throw new AppError(
        "EXTERNAL_CALENDAR_OVERLAP_OVERRIDE_UNSUPPORTED",
        "The external calendar does not support forcing an overlapping appointment.",
        409,
      );
    }
    if (input.serviceIds && input.serviceIds.length === 0) {
      throw new AppError(
        "EXTERNAL_CALENDAR_MANUAL_APPOINTMENT_UNSUPPORTED",
        "The external calendar does not support an appointment without a catalog service.",
        409,
      );
    }
  }

  /**
   * Holds nao existem na fonte externa (Goal008). Segurar um horario por
   * minutos depende de reservar tempo sob a mesma transacao, o mesmo lock e o
   * mesmo relogio que decidem a disponibilidade — nada disso atravessa uma
   * chamada HTTP para outro sistema. Recusar e explicito; aceitar seria
   * prometer uma reserva que ninguem esta guardando.
   */
  async createHold(_input: CreateCalendarHoldInput): Promise<CalendarHold> {
    this.refuseHolds();
  }

  async listHolds(): Promise<CalendarHold[]> {
    this.refuseHolds();
  }

  async getHold(_holdId: string): Promise<CalendarHold> {
    this.refuseHolds();
  }

  async releaseHold(_holdId: string): Promise<CalendarHold> {
    this.refuseHolds();
  }

  private refuseHolds(): never {
    throw new AppError(
      "EXTERNAL_CALENDAR_HOLD_UNSUPPORTED",
      "The external calendar does not support holding a slot for confirmation.",
      409,
    );
  }

  private requireWrites(): void {
    if (!this.config.enableWrites) {
      throw new AppError(
        "MINHA_AGENDA_WRITES_DISABLED",
        "Minha Agenda writes are disabled for this tenant.",
        409,
      );
    }
  }

  private async findOrCreateCustomer(
    phone: string,
    name: string,
    idempotencyKey: string,
  ): Promise<MinhaAgendaCustomer> {
    const normalizedPhone = normalizePhone(phone);
    const existing = await this.findCustomerByPhone(normalizedPhone);
    if (existing) return existing;
    return this.client.createCustomer(
      {
        name: name.trim() || normalizedPhone,
        phone1: normalizedPhone,
        phone2: "",
        birthDate: null,
        address: "",
        remarks: "",
        cpf: "",
        cnpj: null,
        comments: "",
        phoneInternational: "",
        email: "",
        isCnpj: false,
      },
      `${idempotencyKey}:customer`,
    );
  }

  private async findCustomerByPhone(
    phone: string,
  ): Promise<MinhaAgendaCustomer | null> {
    const normalizedPhone = normalizePhone(phone);
    const customers = await this.client.searchCustomers(normalizedPhone);
    return (
      customers.find(
        (customer) =>
          phoneMatches(customer.phone1, normalizedPhone) ||
          phoneMatches(customer.phone2, normalizedPhone),
      ) ?? null
    );
  }

  private async listActiveExternalServices(): Promise<MinhaAgendaService[]> {
    return (await this.client.listServices()).filter(
      (service) => !service.deleted,
    );
  }

  private async findExternalService(
    serviceId: number,
  ): Promise<MinhaAgendaService> {
    const service = (await this.listActiveExternalServices()).find(
      (item) => item.id === serviceId,
    );
    if (!service) {
      throw new AppError(
        "SERVICE_NOT_FOUND",
        "Servico nao encontrado no Minha Agenda.",
        404,
      );
    }
    return service;
  }

  private async findServices(
    serviceIds: string[],
  ): Promise<MinhaAgendaService[]> {
    const ids = [
      ...new Set(serviceIds.map((serviceId) => parseExternalId(serviceId))),
    ];
    if (ids.length === 0) {
      throw new AppError(
        "SERVICE_REQUIRED",
        "Informe ao menos um servico valido para o agendamento.",
        400,
      );
    }
    const services = await this.listActiveExternalServices();
    return ids.map((id) => {
      const service = services.find((item) => item.id === id);
      if (!service) {
        throw new AppError(
          "SERVICE_NOT_FOUND",
          "Servico nao encontrado no Minha Agenda.",
          404,
        );
      }
      return service;
    });
  }

  private calculateServiceBlockMinutes(services: MinhaAgendaService[]): number {
    return (
      services.reduce((total, service) => total + service.duration, 0) +
      this.config.bufferBetweenServicesMinutes *
        Math.max(0, services.length - 1)
    );
  }

  private async assertSlotAvailable(
    date: string,
    startTime: string,
    duration: number,
    stepMinutes: number,
    exceptForId?: number,
  ): Promise<void> {
    const [appointments, blockers, companySchedule, employeeSchedule] =
      await Promise.all([
        this.client.findAppointmentsByDateRange({
          startDate: date,
          endDate: date,
          employeeId: this.config.employeeId,
          isSlotBlocker: false,
        }),
        this.client.findAppointmentsByDateRange({
          startDate: date,
          endDate: date,
          employeeId: this.config.employeeId,
          isSlotBlocker: true,
        }),
        this.client.getCompanyWorkSchedule(),
        this.client.getEmployeeWorkScheduleByEmployeeId(this.config.employeeId),
      ]);

    const slots = computeAvailableSlots({
      companySchedule,
      employeeSchedule,
      appointments,
      blockers,
      serviceDuration: duration,
      startDate: date,
      days: 1,
      stepMinutes,
      maxSlots: 1_000,
      excludeAppointmentId: exceptForId,
    });
    if (!slots.some((slot) => slot.startTime === startTime)) {
      throw new AppError(
        "SLOT_UNAVAILABLE",
        "Horario indisponivel para a duracao do servico.",
        409,
      );
    }

    const exists = await this.client.appointmentExists({
      employeeId: this.config.employeeId,
      date,
      startTime,
      exceptForId,
    });
    if (exists) {
      throw new AppError(
        "APPOINTMENT_EXISTS",
        "Ja existe agendamento no inicio desse horario.",
        409,
      );
    }
  }

  private extractSingleServiceId(appointment: MinhaAgendaAppointment): number {
    if (appointment.serviceId) return appointment.serviceId;
    const ids = appointment.serviceIds?.filter(Boolean) ?? [];
    if (ids.length === 1) return ids[0];
    const itemIds =
      appointment.appHasServices
        ?.map((item) => item.serviceId)
        .filter(Boolean) ?? [];
    if (itemIds.length === 1) return itemIds[0];
    throw new AppError(
      "MULTI_SERVICE_APPOINTMENT",
      "Remarcacao automatica bloqueada para agendamento com multiplos servicos.",
      409,
    );
  }
}

function parseExternalId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(
      "INVALID_EXTERNAL_ID",
      "Minha Agenda identifier must be a positive integer.",
      400,
    );
  }
  return id;
}

// A resposta do Minha Agenda nao passa por validacao de schema (`client.ts`
// so faz `request<T>` com type assertion); preco e duracao "sabidos" pelo
// TypeScript podem estar ausentes de verdade em tempo de execucao. As funcoes
// abaixo tratam isso como o produto exige: ausente vira "nao informado" ou
// pendencia de revisao, nunca `FIXED`/zero/duracao copiada (DATA-09).
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

function toCalendarAppointment(
  appointment: MinhaAgendaAppointment,
): CalendarAppointment {
  const services = appointmentServices(appointment);
  const total = computeAgreementTotal(services);
  return {
    id: String(appointment.id),
    source: "INTEGRATION",
    // Atendimento sem servico cadastrado nao existe na fonte externa: la todo
    // compromisso vem de um servico, entao nunca ha titulo proprio.
    title: null,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    durationMinutes: appointment.duration,
    customerId:
      appointment.customerId === null ? null : String(appointment.customerId),
    customer: appointment.customer
      ? {
          id: String(appointment.customer.id),
          name: appointment.customer.name ?? null,
          phone: appointment.customer.phone1 ?? null,
        }
      : appointment.customerId
        ? {
            id: String(appointment.customerId),
            name: appointment.customerName ?? null,
            phone: null,
          }
        : null,
    services,
    totalPrice: total.amount,
    totalPriceType: total.type,
    comments: appointment.comments ?? null,
    status: appointment.deleted ? "CANCELLED" : "SCHEDULED",
  };
}

function appointmentServices(
  appointment: MinhaAgendaAppointment,
): CalendarAppointmentServiceItem[] {
  if (appointment.services?.length) {
    return appointment.services.map((service) => {
      const price = knownNumber(service.price);
      return {
        serviceId: String(service.id),
        name: service.name,
        durationMinutes: knownPositiveDuration(service.duration),
        priceType: price === null ? "NOT_INFORMED" : "FIXED",
        price,
      };
    });
  }
  if (appointment.appHasServices?.length) {
    return appointment.appHasServices.map((item) => {
      const price = knownNumber(item.price ?? item.service?.price);
      return {
        serviceId: String(item.serviceId),
        name: item.service?.name ?? `Servico ${item.serviceId}`,
        // Duracao propria do item, nunca a duracao total do atendimento
        // (DATA-09): sem duracao propria conhecida, fica explicitamente
        // ausente.
        durationMinutes: knownPositiveDuration(item.service?.duration),
        priceType: price === null ? "NOT_INFORMED" : "FIXED",
        price,
      };
    });
  }
  if (appointment.serviceId) {
    const price = knownNumber(appointment.service?.price ?? appointment.price);
    return [
      {
        serviceId: String(appointment.serviceId),
        name:
          appointment.serviceName ??
          appointment.service?.name ??
          `Servico ${appointment.serviceId}`,
        durationMinutes: knownPositiveDuration(appointment.service?.duration),
        priceType: price === null ? "NOT_INFORMED" : "FIXED",
        price,
      },
    ];
  }
  return [];
}
