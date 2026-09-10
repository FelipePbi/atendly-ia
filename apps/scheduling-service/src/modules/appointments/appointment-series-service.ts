import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
  minutesFromTime,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyAvailability } from "../availability/atendly-availability.js";
import type {
  CalendarAppointment,
  CalendarMutationCommit,
} from "../calendar/calendar-provider.js";
import { parseCalendarAppointment } from "../calendar/calendar-service.js";
import { CalendarMutationIdempotency } from "../calendar/idempotency.js";
import {
  databaseNow,
  lockCalendarDays,
  runCalendarWrite,
} from "../calendar/write-policy.js";
import { AtendlyCustomerService } from "../customers/atendly-customer-service.js";
import {
  AtendlyAppointmentHoldService,
  consumeHold,
  findHoldForConsumption,
  holdUnusable,
} from "../holds/appointment-hold-service.js";
import { AtendlyServiceService } from "../services/atendly-service-service.js";
import {
  appointmentInclude,
  toAtendlyAppointment,
} from "../integrations/atendly/provider.js";
import { recordAppointmentEvent } from "./appointment-event-service.js";

/**
 * Serie de atendimento a partir de um servico (Goal009): pedido com
 * quantidade, intervalo (padrao do servico ou explicito) e primeira
 * data/horario. A pre-visualizacao cria um hold por ocorrencia (reutilizando
 * `AtendlyAppointmentHoldService`); a confirmacao consome todos em uma unica
 * transacao — se qualquer ocorrencia nao puder ser confirmada, nada e
 * criado.
 */

export interface SeriesOccurrencePreview {
  index: number;
  requestedDate: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  adjusted: boolean;
  holdId: string | null;
  unavailable: boolean;
}

export interface PreviewSeriesInput {
  serviceIds: string[];
  occurrenceCount: number;
  intervalDays?: number;
  firstDate: string;
  firstStartTime: string;
  customerId?: string;
  contactRef?: string;
  source: "AI" | "USER";
}

export interface ConfirmSeriesInput {
  occurrences: Array<{ holdId: string }>;
  serviceIds: string[];
  intervalDays: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  comments?: string;
  source: "AI" | "USER";
  createdBy: string;
  /** Como qualquer outra mutacao da agenda (Goal008): retentativa faz replay. */
  idempotencyKey: string;
}

export class AtendlyAppointmentSeriesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
    private readonly timeZone: string,
  ) {}

  async preview(input: PreviewSeriesInput): Promise<SeriesOccurrencePreview[]> {
    const cap = env.APPOINTMENT_SERIES_MAX_OCCURRENCES;
    if (
      !Number.isInteger(input.occurrenceCount) ||
      input.occurrenceCount <= 0 ||
      input.occurrenceCount > cap
    ) {
      throw new AppError(
        "APPOINTMENT_SERIES_TOO_LONG",
        `Appointment series occurrence count must be between 1 and the configured cap of ${cap}.`,
        400,
        { cap },
      );
    }
    const services = await new AtendlyServiceService(
      this.prisma,
      this.tenantId,
    ).requireActive(input.serviceIds);
    const intervalDays = this.resolveIntervalDays(input, services);
    const windowDays = env.APPOINTMENT_SERIES_ADJUST_WINDOW_DAYS;
    const holds = new AtendlyAppointmentHoldService(
      this.prisma,
      this.tenantId,
      this.timeZone,
    );

    const results: SeriesOccurrencePreview[] = [];
    for (let index = 0; index < input.occurrenceCount; index += 1) {
      const requestedDate = addDays(input.firstDate, index * intervalDays);
      const found = await this.findNearestSlot({
        serviceIds: input.serviceIds,
        requestedDate,
        requestedTime: input.firstStartTime,
        windowDays,
      });
      if (!found) {
        results.push({
          index,
          requestedDate,
          date: null,
          startTime: null,
          endTime: null,
          adjusted: false,
          holdId: null,
          unavailable: true,
        });
        continue;
      }
      const hold = await holds.createHold({
        source: input.source,
        serviceIds: input.serviceIds,
        date: found.date,
        startTime: found.startTime,
        customerId: input.customerId,
        contactRef: input.contactRef,
        idempotencyKey: `series-preview-${randomUUID()}`,
      });
      results.push({
        index,
        requestedDate,
        date: found.date,
        startTime: found.startTime,
        endTime: found.endTime,
        adjusted: found.date !== requestedDate,
        holdId: hold.id,
        unavailable: false,
      });
    }
    return results;
  }

  /**
   * Confirmacao atomica: uma unica transacao, lock de todos os dias
   * afetados em ordem estavel, revalidacao e consumo de cada hold. Se
   * qualquer ocorrencia falhar, o erro propaga e o `$transaction` desfaz
   * tudo — nada fica parcialmente criado.
   */
  async confirm(input: ConfirmSeriesInput): Promise<CalendarAppointment[]> {
    if (input.occurrences.length === 0) {
      throw new AppError(
        "APPOINTMENT_SERIES_EMPTY",
        "An appointment series requires at least one occurrence.",
        400,
      );
    }
    // O teto do Goal009 vale na confirmacao tambem, nao so no preview: quem
    // fala com a rota interna monta a lista de holds, e previews sucessivos
    // poderiam ser reunidos acima do teto se so o preview validasse.
    const cap = env.APPOINTMENT_SERIES_MAX_OCCURRENCES;
    if (input.occurrences.length > cap) {
      throw new AppError(
        "APPOINTMENT_SERIES_TOO_LONG",
        `Appointment series occurrence count must be between 1 and the configured cap of ${cap}.`,
        400,
        { cap },
      );
    }
    // Idempotencia na mesma politica das demais mutacoes da agenda (Goal008):
    // efeito e resultado entram no mesmo commit, e a retentativa da mesma
    // chave devolve a serie ja criada em vez de bater em conflito. O resultado
    // e guardado como objeto porque o registro idempotente guarda objeto, nao
    // lista; o contrato da rota continua sendo a lista de atendimentos.
    const outcome = await new CalendarMutationIdempotency(this.prisma).execute({
      tenantId: this.tenantId,
      key: input.idempotencyKey,
      operation: "CONFIRM_APPOINTMENT_SERIES",
      request: input,
      execute: (commit) => this.runConfirm(input, commit),
      parseResponse: parseConfirmedSeries,
      recoverEffect: (effect) => this.recoverSeries(effect.entityId),
    });
    return outcome.appointments;
  }

  /**
   * Confirmacao atomica: uma unica transacao, lock de todos os dias
   * afetados em ordem estavel, revalidacao e consumo de cada hold. Se
   * qualquer ocorrencia falhar, o erro propaga e o `$transaction` desfaz
   * tudo — nada fica parcialmente criado.
   */
  private async runConfirm(
    input: ConfirmSeriesInput,
    commit: CalendarMutationCommit<ConfirmedSeries>,
  ): Promise<ConfirmedSeries> {
    try {
      return await runCalendarWrite(this.prisma, async (transaction) => {
        const holdIds = input.occurrences.map((occurrence) => occurrence.holdId);
        const holdRows = await transaction.appointmentHold.findMany({
          where: { tenantId: this.tenantId, id: { in: holdIds } },
        });
        const byId = new Map(holdRows.map((hold) => [hold.id, hold]));
        const days = holdIds.map((holdId, index) => {
          const hold = byId.get(holdId);
          if (!hold) {
            throw occurrenceFailure(
              holdUnusable(holdId, "NOT_FOUND", false),
              index,
              holdId,
              null,
            );
          }
          return instantToLocalDateTime(hold.startAt, this.timeZone).date;
        });
        await lockCalendarDays(transaction, this.tenantId, days);
        const now = await databaseNow(transaction);

        const customerId = await this.resolveCustomer(transaction, input);
        const series = await transaction.appointmentSeries.create({
          data: {
            tenantId: this.tenantId,
            serviceIds: input.serviceIds,
            intervalDays: input.intervalDays,
            occurrenceCount: input.occurrences.length,
            customerId: customerId ?? null,
            createdBy: input.createdBy,
          },
        });

        const created: CalendarAppointment[] = [];
        for (const [index, occurrence] of input.occurrences.entries()) {
          const hold = byId.get(occurrence.holdId);
          const local = hold
            ? instantToLocalDateTime(hold.startAt, this.timeZone)
            : null;
          try {
            if (!hold || !local) {
              throw holdUnusable(occurrence.holdId, "NOT_FOUND", false);
            }
            const lookup = await findHoldForConsumption(transaction, {
              tenantId: this.tenantId,
              holdId: occurrence.holdId,
              now,
              startAt: hold.startAt,
              endAt: hold.endAt,
            });
            if (lookup.unusableReason) {
              throw holdUnusable(
                occurrence.holdId,
                lookup.unusableReason,
                false,
              );
            }
            const services = await new AtendlyServiceService(
              transaction,
              this.tenantId,
            ).requireActive(toServiceIds(hold.proposedServiceIds));
            const slot = await new AtendlyAvailability(
              transaction,
              this.tenantId,
              this.timeZone,
            ).assertAvailable({
              date: local.date,
              startTime: local.time,
              durationMinutes: hold.proposedDurationMinutes,
              bufferBeforeMinutes: hold.proposedBufferBeforeMinutes,
              bufferAfterMinutes: hold.proposedBufferAfterMinutes,
              excludeHoldId: hold.id,
            });
            const record = await transaction.appointment.create({
              data: {
                source: input.source,
                startAt: slot.startAt,
                endAt: slot.endAt,
                status: "CONFIRMED",
                statusRaw: "CONFIRMED",
                createdBy: input.createdBy,
                comments: input.comments ?? null,
                bufferBeforeMinutesSnapshot: hold.proposedBufferBeforeMinutes,
                bufferAfterMinutesSnapshot: hold.proposedBufferAfterMinutes,
                series: {
                  connect: {
                    tenantId_id: { tenantId: this.tenantId, id: series.id },
                  },
                },
                customer: {
                  connect: {
                    tenantId_id: { tenantId: this.tenantId, id: customerId },
                  },
                },
                items: {
                  create: services.map((service) => ({
                    serviceNameSnapshot: service.name,
                    durationMinutesSnapshot: service.durationMinutes,
                    priceTypeSnapshot: service.priceType,
                    priceSnapshot: service.price,
                    service: {
                      connect: {
                        tenantId_id: {
                          tenantId: this.tenantId,
                          id: service.id,
                        },
                      },
                    },
                  })),
                },
              },
              include: appointmentInclude,
            });
            const appointment = toAtendlyAppointment(record, this.timeZone);
            await recordAppointmentEvent(
              transaction,
              this.tenantId,
              record.id,
              {
                type: "CREATED",
                source: input.source,
                actor: input.createdBy,
                after: {
                  date: appointment.date,
                  startTime: appointment.startTime,
                  endTime: appointment.endTime,
                  status: appointment.status,
                },
              },
            );
            await consumeHold(transaction, {
              tenantId: this.tenantId,
              holdId: hold.id,
              now,
            });
            await recordAppointmentEvent(
              transaction,
              this.tenantId,
              record.id,
              {
                type: "HOLD_CONSUMED",
                source: input.source,
                actor: input.createdBy,
                after: { holdId: hold.id },
              },
            );
            created.push(appointment);
          } catch (error) {
            // A ocorrencia que falhou precisa ser identificavel na resposta
            // (Goal009, criterio 6). Sem isto, `SLOT_UNAVAILABLE` vindo do
            // motor nao diz qual das N ocorrencias caiu, e a sugestao de
            // alternativas — que parte do hold — nao tem por onde comecar.
            throw occurrenceFailure(
              error,
              index,
              occurrence.holdId,
              local?.date ?? null,
            );
          }
        }
        const result: ConfirmedSeries = {
          seriesId: series.id,
          appointments: created,
        };
        await commit(transaction, {
          result,
          effect: { entityType: "APPOINTMENT_SERIES", entityId: series.id },
        });
        return result;
      });
    } catch (error) {
      if (error instanceof AppError) {
        const alternatives = await this.suggestAlternatives(input, error);
        if (alternatives) {
          throw new AppError(error.code, error.message, error.statusCode, {
            ...(typeof error.details === "object" && error.details
              ? error.details
              : {}),
            alternatives,
          });
        }
      }
      throw error;
    }
  }

  /**
   * Chave idempotente cujo efeito ja existe: a serie e lida de volta em vez de
   * confirmada de novo, como o Goal008 faz para atendimento e hold.
   */
  private async recoverSeries(seriesId: string): Promise<ConfirmedSeries> {
    const records = await this.prisma.appointment.findMany({
      where: { tenantId: this.tenantId, seriesId },
      orderBy: { startAt: "asc" },
      include: appointmentInclude,
    });
    if (records.length === 0) {
      throw new AppError(
        "APPOINTMENT_SERIES_NOT_FOUND",
        "The recorded appointment series no longer exists.",
        404,
      );
    }
    return {
      seriesId,
      appointments: records.map((record) =>
        toAtendlyAppointment(record, this.timeZone),
      ),
    };
  }

  /**
   * Melhor esforco, fora da transacao ja desfeita: reconsulta disponibilidade
   * do primeiro hold que falhou para sugerir horarios alternativos. Nunca
   * lanca — uma falha aqui nao pode mascarar o erro real da confirmacao.
   */
  private async suggestAlternatives(
    input: ConfirmSeriesInput,
    error: AppError,
  ): Promise<Array<{ date: string; startTime: string; endTime: string }> | null> {
    try {
      const holdId = (error.details as { holdId?: string } | undefined)?.holdId;
      if (!holdId) return null;
      const hold = await this.prisma.appointmentHold.findFirst({
        where: { tenantId: this.tenantId, id: holdId },
      });
      if (!hold) return null;
      const date = instantToLocalDateTime(hold.startAt, this.timeZone).date;
      return await new AtendlyAvailability(
        this.prisma,
        this.tenantId,
        this.timeZone,
      ).getAvailableSlots({
        serviceIds: input.serviceIds,
        startDate: date,
        days: 1,
        maxSlots: 3,
      });
    } catch {
      return null;
    }
  }

  private resolveIntervalDays(
    input: PreviewSeriesInput,
    services: Array<{ recurrenceIntervalDays: number | null }>,
  ): number {
    if (input.intervalDays !== undefined) {
      if (!Number.isInteger(input.intervalDays) || input.intervalDays <= 0) {
        throw new AppError(
          "INVALID_APPOINTMENT_SERIES_INTERVAL",
          "Appointment series interval must be a positive integer of days.",
          400,
        );
      }
      return input.intervalDays;
    }
    if (services.length === 1 && services[0].recurrenceIntervalDays) {
      return services[0].recurrenceIntervalDays;
    }
    throw new AppError(
      "APPOINTMENT_SERIES_INTERVAL_REQUIRED",
      "An explicit interval is required when the service has no default recurrence interval or more than one service is proposed.",
      400,
    );
  }

  /**
   * Horario disponivel mais proximo, dentro da janela configuravel
   * (Goal009): primeiro tenta o mesmo horario pedido em cada data da janela,
   * mais perto primeiro (0, -1, +1, -2, +2, ...); se nenhuma data da janela
   * tiver esse horario livre, cai para o slot mais proximo por horario **na
   * propria data alvo**. `null` quando nada serve.
   */
  private async findNearestSlot(input: {
    serviceIds: string[];
    requestedDate: string;
    requestedTime: string;
    windowDays: number;
  }): Promise<{ date: string; startTime: string; endTime: string } | null> {
    const availability = new AtendlyAvailability(
      this.prisma,
      this.tenantId,
      this.timeZone,
    );
    for (const offset of searchOffsets(input.windowDays)) {
      const date = addDays(input.requestedDate, offset);
      const slots = await availability.getAvailableSlots({
        serviceIds: input.serviceIds,
        startDate: date,
        days: 1,
        maxSlots: 500,
      });
      const exact = slots.find((slot) => slot.startTime === input.requestedTime);
      if (exact) return exact;
    }
    const sameDaySlots = await availability.getAvailableSlots({
      serviceIds: input.serviceIds,
      startDate: input.requestedDate,
      days: 1,
      maxSlots: 500,
    });
    if (sameDaySlots.length === 0) return null;
    const target = minutesFromTime(input.requestedTime);
    return sameDaySlots.reduce((closest, slot) =>
      Math.abs(minutesFromTime(slot.startTime) - target) <
      Math.abs(minutesFromTime(closest.startTime) - target)
        ? slot
        : closest,
    );
  }

  private async resolveCustomer(
    transaction: Prisma.TransactionClient,
    input: ConfirmSeriesInput,
  ): Promise<string> {
    const customers = new AtendlyCustomerService(transaction, this.tenantId);
    if (input.customerId) return (await customers.get(input.customerId)).id;
    if (!input.customerName && !input.customerPhone) {
      throw new AppError(
        "CUSTOMER_IDENTIFICATION_REQUIRED",
        "An appointment series needs a resolved customerId or at least a customer name or phone.",
        400,
      );
    }
    const created = await customers.create({
      name: input.customerName,
      phone: input.customerPhone,
    });
    return created.id;
  }
}

/** Resultado idempotente da confirmacao: objeto, porque o registro guarda objeto. */
interface ConfirmedSeries {
  seriesId: string;
  appointments: CalendarAppointment[];
}

function parseConfirmedSeries(value: unknown): ConfirmedSeries {
  const record = (value ?? {}) as Record<string, unknown>;
  const list = Array.isArray(record.appointments) ? record.appointments : [];
  return {
    seriesId: String(record.seriesId ?? ""),
    appointments: list.map(parseCalendarAppointment),
  };
}

/**
 * Anexa ao erro a ocorrencia que falhou (indice, hold e data), preservando
 * codigo, mensagem, status e os detalhes que o erro original ja trazia.
 */
function occurrenceFailure(
  error: unknown,
  index: number,
  holdId: string,
  date: string | null,
): unknown {
  if (!(error instanceof AppError)) return error;
  const details =
    typeof error.details === "object" &&
    error.details &&
    !Array.isArray(error.details)
      ? (error.details as Record<string, unknown>)
      : {};
  return new AppError(error.code, error.message, error.statusCode, {
    ...details,
    occurrenceIndex: index,
    holdId,
    ...(date ? { occurrenceDate: date } : {}),
  });
}

function toServiceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function searchOffsets(windowDays: number): number[] {
  const offsets = [0];
  for (let step = 1; step <= windowDays; step += 1) {
    offsets.push(-step, step);
  }
  return offsets;
}
