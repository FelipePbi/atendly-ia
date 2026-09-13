import { z } from "zod";

import { type BffHttpClient } from "../http/BffHttpClient";
import {
  appointmentEventSchema,
  appointmentHoldSchema,
  appointmentLifecycleSchema,
  appointmentSchema,
  availabilityExceptionSchema,
  availabilitySlotSchema,
  blockSeriesSchema,
  calendarStateSchema,
  deletedSchema,
  seriesOccurrencePreviewSchema,
  type TimeBlockKind,
  timeBlockSchema,
} from "../mappers/publicApiSchemas";

export interface ListAppointmentsQuery {
  customerPhone?: string;
  endDate: string;
  startDate: string;
}

export interface CreateAppointmentInput {
  comments?: string;
  customerName: string;
  customerPhone: string;
  date: string;
  /** Duração do atendimento manual excepcional sem serviço cadastrado. */
  durationMinutes?: number;
  /** Reserva criada antes de confirmar (Goal008). */
  holdId?: string;
  /** Sobreposição por decisão humana; o motivo é obrigatório com ela. */
  overlapOverride?: boolean;
  overlapOverrideReason?: string;
  /** Vazio só no atendimento manual excepcional, que exige `title`. */
  serviceIds: string[];
  startTime: string;
  stepMinutes?: number;
  title?: string;
}

export interface RescheduleAppointmentInput {
  date: string;
  holdId?: string;
  overlapOverride?: boolean;
  overlapOverrideReason?: string;
  startTime: string;
  stepMinutes?: number;
}

export interface CreateHoldInput {
  contactRef?: string;
  customerId?: string;
  date: string;
  serviceIds: string[];
  startTime: string;
  stepMinutes?: number;
}

export interface AvailabilityQuery {
  days?: number;
  maxSlots?: number;
  serviceIds: string[];
  startDate: string;
  stepMinutes?: number;
}

export interface CreateTimeBlockInput {
  endAt: string;
  reason?: string | null;
  startAt: string;
  /** Compromisso pessoal ou bloqueio operacional (Goal009); default `BLOCK`. */
  kind?: TimeBlockKind;
  title?: string | null;
}

export interface MoveBlockOccurrenceInput {
  endAt: string;
  startAt: string;
}

export interface CreateExtraAvailabilityInput {
  date: string;
  endTime: string;
  startTime: string;
}

export interface CreateUnavailabilityInput {
  date: string;
  /** Ausentes para dia inteiro. */
  endTime?: string;
  startTime?: string;
  reason?: string;
  /** Decisão humana explícita quando a indisponibilidade cobre atendimento confirmado. */
  decidedBy?: string;
  decidedReason?: string;
}

export interface BlockSeriesRuleInput {
  daysOfWeek: number[];
  endTime: string;
  kind?: TimeBlockKind;
  occurrenceCount?: number;
  seriesEndDate?: string;
  seriesStartDate: string;
  startTime: string;
  title?: string | null;
}

export interface CreateBlockSeriesInput {
  rule: BlockSeriesRuleInput;
  skipConflicts?: boolean;
  forceOverlapReason?: string;
}

export interface EditBlockSeriesFromDateInput {
  fromDate: string;
  rule: Partial<BlockSeriesRuleInput>;
  skipConflicts?: boolean;
  forceOverlapReason?: string;
}

export interface PreviewAppointmentSeriesInput {
  contactRef?: string;
  customerId?: string;
  firstDate: string;
  firstStartTime: string;
  intervalDays?: number;
  occurrenceCount: number;
  serviceIds: string[];
}

export interface ConfirmAppointmentSeriesInput {
  comments?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  intervalDays: number;
  occurrences: Array<{ holdId: string }>;
  serviceIds: string[];
}

export interface CalendarIntegrationInput {
  configuration: {
    baseUrl: string;
    bufferBetweenServicesMinutes?: number;
    employeeId: number;
    enableWrites?: boolean;
    modelVersion?: number;
    paymentMethod: string;
    refreshSkewSeconds?: number;
    timeoutMs?: number;
  };
  credentials: {
    basicAuth: string;
    password: string;
    username: string;
  };
}

export class BffCalendarService {
  constructor(private readonly http: BffHttpClient) {}

  listAppointments(query: ListAppointmentsQuery, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/appointments",
      query: {
        customerPhone: query.customerPhone,
        endDate: query.endDate,
        startDate: query.startDate,
      },
      schema: z.array(appointmentSchema),
      signal,
    });
  }

  getAppointment(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/appointments/${encodeURIComponent(id)}`,
      schema: appointmentSchema,
      signal,
    });
  }

  createAppointment(
    input: CreateAppointmentInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: "/v1/appointments",
      schema: appointmentSchema,
      signal,
    });
  }

  rescheduleAppointment(
    id: string,
    input: RescheduleAppointmentInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/reschedule`,
      schema: appointmentSchema,
      signal,
    });
  }

  cancelAppointment(
    id: string,
    input: { comments?: string; reason?: string },
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/cancel`,
      schema: appointmentSchema,
      signal,
    });
  }

  /**
   * Ciclo de vida e histórico (Goal008). Sem `Idempotency-Key`: estas
   * operações não ocupam nem liberam horário, e a idempotência é a própria
   * transição — concluir de novo não é um segundo efeito.
   */
  completeAppointment(id: string, signal?: AbortSignal) {
    return this.http.request({
      body: {},
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/complete`,
      schema: appointmentLifecycleSchema,
      signal,
    });
  }

  markAppointmentNoShow(
    id: string,
    input: { note?: string },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/no-show`,
      schema: appointmentLifecycleSchema,
      signal,
    });
  }

  setAppointmentFinalValue(
    id: string,
    input: { amount: number },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/final-value`,
      schema: appointmentLifecycleSchema,
      signal,
    });
  }

  confirmAppointmentPresence(id: string, signal?: AbortSignal) {
    return this.http.request({
      body: {},
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/presence`,
      schema: appointmentLifecycleSchema,
      signal,
    });
  }

  listAppointmentEvents(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/appointments/${encodeURIComponent(id)}/events`,
      schema: z.array(appointmentEventSchema),
      signal,
    });
  }

  /** Reserva temporária: criar ocupa tempo, então exige `Idempotency-Key`. */
  createHold(
    input: CreateHoldInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: "/v1/holds",
      schema: appointmentHoldSchema,
      signal,
    });
  }

  listHolds(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/holds",
      schema: z.array(appointmentHoldSchema),
      signal,
    });
  }

  releaseHold(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/holds/${encodeURIComponent(id)}`,
      schema: appointmentHoldSchema,
      signal,
    });
  }

  getAvailability(query: AvailabilityQuery, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/availability",
      query: { ...query, serviceIds: query.serviceIds.join(",") },
      schema: z.array(availabilitySlotSchema),
      signal,
    });
  }

  createTimeBlock(input: CreateTimeBlockInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/time-blocks",
      schema: timeBlockSchema,
      signal,
    });
  }

  deleteTimeBlock(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/time-blocks/${encodeURIComponent(id)}`,
      schema: deletedSchema,
      signal,
    });
  }

  /** Remove uma única ocorrência de uma série, sem tocar a série (Goal009). */
  removeBlockOccurrence(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/time-blocks/${encodeURIComponent(id)}/occurrence`,
      schema: deletedSchema,
      signal,
    });
  }

  moveBlockOccurrence(
    id: string,
    input: MoveBlockOccurrenceInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: `/v1/time-blocks/${encodeURIComponent(id)}/occurrence`,
      schema: timeBlockSchema,
      signal,
    });
  }

  // --- Exceções de disponibilidade (Goal009) ------------------------------

  listAvailabilityExceptions(
    query: { endDate: string; startDate: string },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: "/v1/availability-exceptions",
      query,
      schema: z.array(availabilityExceptionSchema),
      signal,
    });
  }

  createExtraAvailability(
    input: CreateExtraAvailabilityInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/availability-exceptions/extra",
      schema: availabilityExceptionSchema,
      signal,
    });
  }

  createUnavailability(
    input: CreateUnavailabilityInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/availability-exceptions/unavailable",
      schema: availabilityExceptionSchema,
      signal,
    });
  }

  removeAvailabilityException(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/availability-exceptions/${encodeURIComponent(id)}`,
      schema: deletedSchema,
      signal,
    });
  }

  // --- Séries de bloqueio/compromisso (Goal009) ----------------------------

  createBlockSeries(input: CreateBlockSeriesInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/block-series",
      schema: blockSeriesSchema,
      signal,
    });
  }

  editBlockSeriesFromDate(
    id: string,
    input: EditBlockSeriesFromDateInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "PATCH",
      path: `/v1/block-series/${encodeURIComponent(id)}/from-date`,
      schema: blockSeriesSchema,
      signal,
    });
  }

  removeBlockSeries(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/block-series/${encodeURIComponent(id)}`,
      schema: deletedSchema,
      signal,
    });
  }

  // --- Série de atendimento (Goal009) ---------------------------------------

  previewAppointmentSeries(
    input: PreviewAppointmentSeriesInput,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/appointments/series/preview",
      schema: z.array(seriesOccurrencePreviewSchema),
      signal,
    });
  }

  confirmAppointmentSeries(
    input: ConfirmAppointmentSeriesInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: "/v1/appointments/series/confirm",
      schema: z.array(appointmentSchema),
      signal,
    });
  }

  getCalendar(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/calendar",
      schema: calendarStateSchema,
      signal,
    });
  }

  connectIntegration(input: CalendarIntegrationInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/calendar/integration/connect",
      schema: calendarStateSchema,
      signal,
    });
  }

  reconnectIntegration(signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: "/v1/calendar/integration/reconnect",
      schema: calendarStateSchema,
      signal,
    });
  }

  disconnectIntegration(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/calendar/integration",
      schema: calendarStateSchema,
      signal,
    });
  }
}
