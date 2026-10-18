import { type z } from "zod";

import { type BffHttpClient, routeSchema } from "../http/BffHttpClient";
import {
  type Appointment,
  type AppointmentEvent,
  type AppointmentHold,
  type AppointmentLifecycle,
  type AppointmentNotification,
  type AvailabilityException,
  type AvailabilitySlot,
  type BlockSeries,
  type CalendarState,
  type deletedSchema,
  type SeriesOccurrencePreview,
  type TimeBlock,
  type TimeBlockKind,
} from "../mappers/publicApiSchemas";

type Deleted = z.infer<typeof deletedSchema>;

export interface ListAppointmentsQuery {
  customerId?: string;
  customerPhone?: string;
  endDate: string;
  startDate: string;
}

/**
 * Duração de um serviço ajustada só para este atendimento (D-207): o padrão
 * do catálogo não muda. Serviço que não aparece usa o padrão.
 */
export interface ServiceDurationInput {
  durationMinutes: number;
  serviceId: string;
}

export interface CreateAppointmentInput {
  comments?: string;
  /** Pessoa já resolvida; alternativa a `customerName`/`customerPhone`. */
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
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
  /** Duração ajustada de algum serviço para este atendimento (D-207). */
  serviceDurations?: ServiceDurationInput[];
  startTime: string;
  stepMinutes?: number;
  title?: string;
}

/** Ajuste da duração depois de marcado (D-207): todo serviço do atendimento. */
export interface ChangeAppointmentDurationInput {
  overlapOverride?: boolean;
  overlapOverrideReason?: string;
  services: ServiceDurationInput[];
}

export interface RescheduleAppointmentInput {
  date: string;
  holdId?: string;
  /** Aviso de alteração ao cliente (Goal021); a interface manda-o sempre explicitamente. */
  notifyCustomer?: boolean;
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
  serviceDurations?: ServiceDurationInput[];
  startTime: string;
  stepMinutes?: number;
}

export interface AvailabilityQuery {
  days?: number;
  maxSlots?: number;
  serviceIds: string[];
  serviceDurations?: ServiceDurationInput[];
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
  /** Decisão humana explícita quando a indisponibilidade cobre atendimento confirmado; o ator vem sempre da sessão (Goal016). */
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
  serviceDurations?: ServiceDurationInput[];
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
  email: string;
  password: string;
}

export class BffCalendarService {
  constructor(private readonly http: BffHttpClient) {}

  listAppointments(query: ListAppointmentsQuery, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/appointments",
      query: {
        customerId: query.customerId,
        customerPhone: query.customerPhone,
        endDate: query.endDate,
        startDate: query.startDate,
      },
      schema: routeSchema<Appointment[]>("GET", "/v1/appointments"),
      signal,
    });
  }

  getAppointment(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/appointments/${encodeURIComponent(id)}`,
      schema: routeSchema<Appointment>("GET", "/v1/appointments/:id"),
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
      schema: routeSchema<Appointment>("POST", "/v1/appointments"),
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
      schema: routeSchema<Appointment>(
        "POST",
        "/v1/appointments/:id/reschedule",
      ),
      signal,
    });
  }

  /** Ajuste da duração depois de marcado (D-207): pode ocupar tempo novo. */
  changeAppointmentDuration(
    id: string,
    input: ChangeAppointmentDurationInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/duration`,
      schema: routeSchema<Appointment>(
        "POST",
        "/v1/appointments/:id/duration",
      ),
      signal,
    });
  }

  cancelAppointment(
    id: string,
    input: {
      comments?: string;
      /** Aviso de alteração ao cliente (Goal021); a interface manda-o sempre explicitamente. */
      notifyCustomer?: boolean;
      reason?: string;
    },
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    return this.http.request({
      body: input,
      headers: { "idempotency-key": idempotencyKey },
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/cancel`,
      schema: routeSchema<Appointment>("POST", "/v1/appointments/:id/cancel"),
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
      schema: routeSchema<AppointmentLifecycle>(
        "POST",
        "/v1/appointments/:id/complete",
      ),
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
      schema: routeSchema<AppointmentLifecycle>(
        "POST",
        "/v1/appointments/:id/no-show",
      ),
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
      schema: routeSchema<AppointmentLifecycle>(
        "POST",
        "/v1/appointments/:id/final-value",
      ),
      signal,
    });
  }

  confirmAppointmentPresence(id: string, signal?: AbortSignal) {
    return this.http.request({
      body: {},
      method: "POST",
      path: `/v1/appointments/${encodeURIComponent(id)}/presence`,
      schema: routeSchema<AppointmentLifecycle>(
        "POST",
        "/v1/appointments/:id/presence",
      ),
      signal,
    });
  }

  listAppointmentEvents(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/appointments/${encodeURIComponent(id)}/events`,
      schema: routeSchema<AppointmentEvent[]>(
        "GET",
        "/v1/appointments/:id/events",
      ),
      signal,
    });
  }

  /**
   * Estado de envio ao cliente deste agendamento (Goal021): os lembretes e o
   * aviso de alteração desta ocorrência. Leitura separada da configuração do
   * negócio — `settings.getReminders` diz a antecedência configurada, nunca
   * se o lembrete deste compromisso saiu.
   */
  listAppointmentNotifications(id: string, signal?: AbortSignal) {
    return this.http.request({
      path: `/v1/appointments/${encodeURIComponent(id)}/notifications`,
      schema: routeSchema<AppointmentNotification[]>(
        "GET",
        "/v1/appointments/:id/notifications",
      ),
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
      schema: routeSchema<AppointmentHold>("POST", "/v1/holds"),
      signal,
    });
  }

  listHolds(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/holds",
      schema: routeSchema<AppointmentHold[]>("GET", "/v1/holds"),
      signal,
    });
  }

  releaseHold(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/holds/${encodeURIComponent(id)}`,
      schema: routeSchema<AppointmentHold>("DELETE", "/v1/holds/:id"),
      signal,
    });
  }

  getAvailability(query: AvailabilityQuery, signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/availability",
      query: {
        ...query,
        serviceDurations: query.serviceDurations?.length
          ? query.serviceDurations
              .map((item) => `${item.serviceId}:${item.durationMinutes}`)
              .join(",")
          : undefined,
        serviceIds: query.serviceIds.join(","),
      },
      schema: routeSchema<AvailabilitySlot[]>("GET", "/v1/availability"),
      signal,
    });
  }

  listTimeBlocks(
    query: { endDate: string; startDate: string },
    signal?: AbortSignal,
  ) {
    return this.http.request({
      path: "/v1/time-blocks",
      query,
      schema: routeSchema<TimeBlock[]>("GET", "/v1/time-blocks"),
      signal,
    });
  }

  createTimeBlock(input: CreateTimeBlockInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/time-blocks",
      schema: routeSchema<TimeBlock>("POST", "/v1/time-blocks"),
      signal,
    });
  }

  deleteTimeBlock(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/time-blocks/${encodeURIComponent(id)}`,
      schema: routeSchema<Deleted>("DELETE", "/v1/time-blocks/:id"),
      signal,
    });
  }

  /** Remove uma única ocorrência de uma série, sem tocar a série (Goal009). */
  removeBlockOccurrence(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/time-blocks/${encodeURIComponent(id)}/occurrence`,
      schema: routeSchema<Deleted>("DELETE", "/v1/time-blocks/:id/occurrence"),
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
      schema: routeSchema<TimeBlock>("PATCH", "/v1/time-blocks/:id/occurrence"),
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
      schema: routeSchema<AvailabilityException[]>(
        "GET",
        "/v1/availability-exceptions",
      ),
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
      schema: routeSchema<AvailabilityException>(
        "POST",
        "/v1/availability-exceptions/extra",
      ),
      signal,
    });
  }

  createUnavailability(input: CreateUnavailabilityInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/availability-exceptions/unavailable",
      schema: routeSchema<AvailabilityException>(
        "POST",
        "/v1/availability-exceptions/unavailable",
      ),
      signal,
    });
  }

  removeAvailabilityException(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/availability-exceptions/${encodeURIComponent(id)}`,
      schema: routeSchema<Deleted>("DELETE", "/v1/availability-exceptions/:id"),
      signal,
    });
  }

  // --- Séries de bloqueio/compromisso (Goal009) ----------------------------

  createBlockSeries(input: CreateBlockSeriesInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/block-series",
      schema: routeSchema<BlockSeries>("POST", "/v1/block-series"),
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
      schema: routeSchema<BlockSeries>(
        "PATCH",
        "/v1/block-series/:id/from-date",
      ),
      signal,
    });
  }

  removeBlockSeries(id: string, signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: `/v1/block-series/${encodeURIComponent(id)}`,
      schema: routeSchema<Deleted>("DELETE", "/v1/block-series/:id"),
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
      schema: routeSchema<SeriesOccurrencePreview[]>(
        "POST",
        "/v1/appointments/series/preview",
      ),
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
      schema: routeSchema<Appointment[]>(
        "POST",
        "/v1/appointments/series/confirm",
      ),
      signal,
    });
  }

  getCalendar(signal?: AbortSignal) {
    return this.http.request({
      path: "/v1/calendar",
      schema: routeSchema<CalendarState>("GET", "/v1/calendar"),
      signal,
    });
  }

  connectIntegration(input: CalendarIntegrationInput, signal?: AbortSignal) {
    return this.http.request({
      body: input,
      method: "POST",
      path: "/v1/calendar/integration/connect",
      schema: routeSchema<CalendarState>(
        "POST",
        "/v1/calendar/integration/connect",
      ),
      signal,
    });
  }

  reconnectIntegration(signal?: AbortSignal) {
    return this.http.request({
      method: "POST",
      path: "/v1/calendar/integration/reconnect",
      schema: routeSchema<CalendarState>(
        "POST",
        "/v1/calendar/integration/reconnect",
      ),
      signal,
    });
  }

  disconnectIntegration(signal?: AbortSignal) {
    return this.http.request({
      method: "DELETE",
      path: "/v1/calendar/integration",
      schema: routeSchema<CalendarState>("DELETE", "/v1/calendar/integration"),
      signal,
    });
  }
}
