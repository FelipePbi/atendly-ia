import { z } from "zod";

import { type BffHttpClient } from "../http/BffHttpClient";
import {
  appointmentSchema,
  availabilitySlotSchema,
  calendarStateSchema,
  deletedSchema,
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
  serviceIds: string[];
  startTime: string;
  stepMinutes?: number;
}

export interface RescheduleAppointmentInput {
  date: string;
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
    input: { comments?: string },
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
