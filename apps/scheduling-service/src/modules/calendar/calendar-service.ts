import { z } from "zod";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  type AppointmentEventRecord,
  listAppointmentEvents,
} from "../appointments/appointment-event-service.js";
import {
  type AppointmentLifecycleSnapshot,
  AtendlyAppointmentLifecycleService,
} from "../appointments/appointment-lifecycle-service.js";
import { isOperationalService } from "../services/atendly-service-service.js";
import type {
  CalendarAppointment,
  CalendarEffectEntityType,
  CalendarHold,
  CalendarMutationCommit,
  CalendarMutationEffect,
  CalendarProvider,
  CancelCalendarAppointmentInput,
  CreateCalendarAppointmentInput,
  CreateCalendarHoldInput,
  GetAvailabilityInput,
  ListAppointmentsInput,
  RescheduleCalendarAppointmentInput,
} from "./calendar-provider.js";
import { CalendarMutationIdempotency } from "./idempotency.js";
import { CalendarProviderFactory } from "./provider-factory.js";

const calendarAppointmentSchema: z.ZodType<CalendarAppointment> = z.object({
  id: z.string(),
  source: z.enum(["AI", "USER", "INTEGRATION"]),
  title: z.string().nullable().default(null),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  customerId: z.string().nullable(),
  customer: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      name: z.string(),
      durationMinutes: z.number().nullable(),
      priceType: z
        .enum(["FIXED", "STARTING_AT", "ON_REQUEST", "NOT_INFORMED"])
        .default("FIXED"),
      price: z.number().nullable(),
    }),
  ),
  totalPrice: z.number().nullable(),
  totalPriceType: z.enum(["FIXED", "STARTING_AT", "NONE"]),
  comments: z.string().nullable(),
  status: z.string(),
  // Ausentes em replay gravado antes do Goal009 (Goal009: buffer sem efeito
  // operacional ate agora, entao zero e o valor que a ocupacao ja tinha).
  bufferBeforeMinutes: z.number().default(0),
  bufferAfterMinutes: z.number().default(0),
  seriesId: z.string().nullable().default(null),
});

/**
 * Decodifica o resultado guardado pela idempotencia.
 *
 * Replay gravado antes do Goal007 nao tem `totalPriceType`. Ele e **derivado**
 * de `totalPrice` (numero -> `FIXED`, nulo -> `NONE`) em vez de assumir
 * `NONE` incondicionalmente: o valor ja estava la, e devolver "sem total"
 * para um acordo que tinha total fechado mudaria a resposta de uma chave ja
 * respondida.
 */
export function parseCalendarAppointment(
  value: unknown,
): CalendarAppointment {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).totalPriceType === undefined
  ) {
    const replay = value as Record<string, unknown>;
    return calendarAppointmentSchema.parse({
      ...replay,
      totalPriceType: typeof replay.totalPrice === "number" ? "FIXED" : "NONE",
    });
  }
  return calendarAppointmentSchema.parse(value);
}

const calendarHoldSchema: z.ZodType<CalendarHold> = z.object({
  id: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  serviceIds: z.array(z.string()),
  customerId: z.string().nullable(),
  contactRef: z.string().nullable(),
  source: z.enum(["AI", "USER"]),
  expiresAt: z.string(),
  status: z.enum(["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"]),
});

export interface CalendarRequestContext {
  tenantId: string;
  userId: string;
  requestId: string;
}

export class CalendarService {
  private readonly providerFactory: CalendarProviderFactory;
  private readonly idempotency: CalendarMutationIdempotency;

  constructor(private readonly prisma: PrismaClient) {
    this.providerFactory = new CalendarProviderFactory(prisma);
    this.idempotency = new CalendarMutationIdempotency(prisma);
  }

  /** Catálogo completo da fonte vigente: serviço em revisão continua listável (Goal007). */
  async listServices(context: CalendarRequestContext) {
    return (await this.provider(context)).listServices();
  }

  /**
   * "Operacional" (Goal007): o mesmo predicado para todas as fontes, usado
   * por `/internal/services` (o que a IA pode oferecer) e pela capacidade de
   * ativação lida pelo BFF. A Agenda Atendly já filtra em `listForScheduling`;
   * a origem externa não tem estado de revisão, então só ativo e duração
   * conhecida se aplicam.
   */
  async listOperationalServices(context: CalendarRequestContext) {
    const services = await this.listServices(context);
    return services.filter((service) =>
      isOperationalService({
        active: service.active,
        durationMinutes: service.durationMinutes,
        needsReview: false,
      }),
    );
  }

  async listAppointments(
    context: CalendarRequestContext,
    input: ListAppointmentsInput,
  ) {
    return (await this.provider(context)).listAppointments(input);
  }

  async getAppointment(context: CalendarRequestContext, appointmentId: string) {
    return (await this.provider(context)).getAppointment(appointmentId);
  }

  async getAvailability(
    context: CalendarRequestContext,
    input: GetAvailabilityInput,
  ) {
    return (await this.provider(context)).getAvailability(input);
  }

  async createAppointment(
    context: CalendarRequestContext,
    input: CreateCalendarAppointmentInput,
  ) {
    return this.mutateAppointment(
      context,
      "CREATE_APPOINTMENT",
      input,
      (provider, commit) => provider.createAppointment(input, commit),
    );
  }

  /**
   * Hold (Goal008). Criar hold ocupa tempo, entao passa pela mesma
   * idempotencia das outras mutacoes: repetir a chave devolve o mesmo hold em
   * vez de segurar o horario duas vezes. Liberar e listar nao precisam de
   * chave — liberar de novo nao tem segundo efeito.
   */
  async createHold(
    context: CalendarRequestContext,
    input: CreateCalendarHoldInput,
  ) {
    return this.mutate(
      context,
      "CREATE_HOLD",
      input,
      (provider, commit) => provider.createHold(input, commit),
      (value) => calendarHoldSchema.parse(value),
      "APPOINTMENT_HOLD",
      (provider, effect) => provider.getHold(effect.entityId),
    );
  }

  async listHolds(context: CalendarRequestContext) {
    return (await this.provider(context)).listHolds();
  }

  async getHold(context: CalendarRequestContext, holdId: string) {
    return (await this.provider(context)).getHold(holdId);
  }

  async releaseHold(context: CalendarRequestContext, holdId: string) {
    return (await this.provider(context)).releaseHold(holdId);
  }

  /**
   * Ciclo de vida e histórico (Goal008) só existem na Agenda Atendly.
   *
   * Não é uma limitação temporária: concluir, marcar falta, registrar valor
   * final e gravar evento no mesmo commit do efeito dependem de o
   * atendimento ser uma linha **deste** banco. Do outro lado de uma fonte
   * externa não há transação para compartilhar, então a operação é recusada
   * com erro próprio em vez de simulada.
   */
  async completeAppointment(
    context: CalendarRequestContext,
    appointmentId: string,
  ): Promise<AppointmentLifecycleSnapshot> {
    return (await this.lifecycle(context)).complete(appointmentId);
  }

  async markNoShow(
    context: CalendarRequestContext,
    appointmentId: string,
    note: string | null,
  ): Promise<AppointmentLifecycleSnapshot> {
    return (await this.lifecycle(context)).markNoShow(appointmentId, { note });
  }

  async setFinalValue(
    context: CalendarRequestContext,
    appointmentId: string,
    amount: number,
  ): Promise<AppointmentLifecycleSnapshot> {
    return (await this.lifecycle(context)).setFinalValue(appointmentId, amount);
  }

  async confirmPresence(
    context: CalendarRequestContext,
    appointmentId: string,
  ): Promise<AppointmentLifecycleSnapshot> {
    return (await this.lifecycle(context)).confirmPresence(appointmentId);
  }

  /** Leitura cronológica do histórico operacional de um atendimento. */
  async listAppointmentHistory(
    context: CalendarRequestContext,
    appointmentId: string,
  ): Promise<AppointmentEventRecord[]> {
    await this.requireAtendlySource(context);
    // Confirma que o atendimento é do tenant antes de devolver histórico:
    // um id de outro negócio não pode virar leitura autorizada.
    await this.getAppointment(context, appointmentId);
    return listAppointmentEvents(
      this.prisma,
      context.tenantId,
      appointmentId,
    );
  }

  private async lifecycle(context: CalendarRequestContext) {
    await this.requireAtendlySource(context);
    return new AtendlyAppointmentLifecycleService(
      this.prisma,
      context.tenantId,
      context.userId,
    );
  }

  private async requireAtendlySource(
    context: CalendarRequestContext,
  ): Promise<void> {
    const settings = await this.requireSettings(context);
    if (settings.source !== "ATENDLY") {
      throw new AppError(
        "EXTERNAL_CALENDAR_LIFECYCLE_UNSUPPORTED",
        "Appointment lifecycle and history are only available for the Atendly calendar.",
        409,
      );
    }
  }

  async rescheduleAppointment(
    context: CalendarRequestContext,
    input: RescheduleCalendarAppointmentInput,
  ) {
    return this.mutateAppointment(
      context,
      "RESCHEDULE_APPOINTMENT",
      input,
      (provider, commit) => provider.rescheduleAppointment(input, commit),
    );
  }

  async cancelAppointment(
    context: CalendarRequestContext,
    input: CancelCalendarAppointmentInput,
  ) {
    return this.mutateAppointment(
      context,
      "CANCEL_APPOINTMENT",
      input,
      (provider, commit) => provider.cancelAppointment(input, commit),
    );
  }

  private async mutateAppointment(
    context: CalendarRequestContext,
    operation: string,
    input: { idempotencyKey: string },
    run: (
      provider: CalendarProvider,
      commit: CalendarMutationCommit<CalendarAppointment>,
    ) => Promise<CalendarAppointment>,
  ) {
    return this.mutate(
      context,
      operation,
      input,
      run,
      parseCalendarAppointment,
      "APPOINTMENT",
      (provider, effect) => provider.getAppointment(effect.entityId),
    );
  }

  /**
   * Caminho unico das mutacoes da agenda: a chave e reivindicada, a mutacao
   * roda recebendo o `commit` que grava resultado e referencia de efeito na
   * mesma transacao, e uma chave cujo efeito ja existe e recuperada lendo a
   * propria entidade em vez de mutar de novo.
   *
   * O tipo de efeito e parametro porque a entidade muda por operacao —
   * atendimento ou hold — e recuperar uma chave lendo a entidade errada seria
   * responder outra coisa como se fosse a mesma.
   */
  private async mutate<TResult>(
    context: CalendarRequestContext,
    operation: string,
    input: { idempotencyKey: string },
    run: (
      provider: CalendarProvider,
      commit: CalendarMutationCommit<TResult>,
    ) => Promise<TResult>,
    parseResponse: (value: unknown) => TResult,
    effectEntityType: CalendarEffectEntityType,
    recover: (
      provider: CalendarProvider,
      effect: CalendarMutationEffect,
    ) => Promise<TResult>,
  ) {
    return this.idempotency.execute({
      tenantId: context.tenantId,
      key: input.idempotencyKey,
      operation,
      request: input,
      execute: async (commit) => run(await this.provider(context), commit),
      parseResponse,
      recoverEffect: async (effect) => {
        if (effect.entityType !== effectEntityType) {
          throw new AppError(
            "CALENDAR_EFFECT_NOT_RECOVERABLE",
            "The recorded effect does not belong to this operation.",
            409,
          );
        }
        return recover(await this.provider(context), effect);
      },
    });
  }

  private async requireSettings(context: CalendarRequestContext) {
    const settings = await this.prisma.calendarSettings.findUnique({
      where: { tenantId: context.tenantId },
    });
    if (!settings) {
      throw new AppError(
        "CALENDAR_SETTINGS_NOT_FOUND",
        "Calendar settings were not found for this tenant.",
        404,
      );
    }
    return settings;
  }

  private async provider(context: CalendarRequestContext) {
    const settings = await this.requireSettings(context);
    return this.providerFactory.create({
      tenantId: context.tenantId,
      userId: context.userId,
      timeZone: settings.timezone,
      source: settings.source,
    });
  }
}
