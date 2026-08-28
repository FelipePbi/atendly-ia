import { AppError } from "../../../shared/errors/app-error.js";
import type {
  AvailableSlot,
  CalendarAppointment,
  CalendarAppointmentServiceItem,
  CalendarProvider,
  CalendarServiceDefinition,
  CancelCalendarAppointmentInput,
  CreateCalendarAppointmentInput,
  GetAvailabilityInput,
  ListAppointmentsInput,
  RescheduleCalendarAppointmentInput,
} from "../../calendar/calendar-provider.js";
import { computeAvailableSlots } from "./availability.js";
import { createMinhaAgendaClient, type MinhaAgendaClient } from "./client.js";
import type { MinhaAgendaConnectionConfig } from "./config.js";
import { addDays } from "./date-time.js";
import { normalizePhone, phoneMatches } from "./phone.js";
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
    const services = await this.findServices(input.serviceIds);
    const duration = this.calculateServiceBlockMinutes(services);
    await this.assertSlotAvailable(
      input.date,
      input.startTime,
      duration,
      input.stepMinutes,
    );
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

function toCalendarService(
  service: MinhaAgendaService,
): CalendarServiceDefinition {
  return {
    id: String(service.id),
    name: service.name,
    durationMinutes: service.duration,
    price: Number(service.price),
    active: !service.deleted,
    colorId: service.colorId,
  };
}

function toCalendarAppointment(
  appointment: MinhaAgendaAppointment,
): CalendarAppointment {
  const services = appointmentServices(appointment);
  return {
    id: String(appointment.id),
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
    totalPrice: Number(appointment.price ?? 0),
    comments: appointment.comments ?? null,
    status: appointment.deleted ? "CANCELLED" : "SCHEDULED",
  };
}

function appointmentServices(
  appointment: MinhaAgendaAppointment,
): CalendarAppointmentServiceItem[] {
  if (appointment.services?.length) {
    return appointment.services.map((service) => ({
      serviceId: String(service.id),
      name: service.name,
      durationMinutes: service.duration,
      price: Number(service.price),
    }));
  }
  if (appointment.appHasServices?.length) {
    return appointment.appHasServices.map((item) => ({
      serviceId: String(item.serviceId),
      name: item.service?.name ?? `Servico ${item.serviceId}`,
      durationMinutes: item.service?.duration ?? appointment.duration,
      price: Number(item.price ?? item.service?.price ?? 0),
    }));
  }
  if (appointment.serviceId) {
    return [
      {
        serviceId: String(appointment.serviceId),
        name:
          appointment.serviceName ??
          appointment.service?.name ??
          `Servico ${appointment.serviceId}`,
        durationMinutes: appointment.service?.duration ?? appointment.duration,
        price: Number(appointment.service?.price ?? appointment.price ?? 0),
      },
    ];
  }
  return [];
}
