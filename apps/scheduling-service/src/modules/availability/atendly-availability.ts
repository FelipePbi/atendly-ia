import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  addMinutes,
  databaseDate,
  databaseTimeToMinutes,
  instantToLocalDateTime,
  localDateTimeToInstant,
  overlaps,
  timeFromMinutes,
  weekdayIndex,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  AvailableSlot,
  GetAvailabilityInput,
} from "../calendar/calendar-provider.js";
import { databaseNow } from "../calendar/write-policy.js";
import {
  AtendlyServiceService,
  maxServiceBuffer,
} from "../services/atendly-service-service.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

interface Interval {
  start: number;
  end: number;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

/** Regras de oferta do negocio (Goal009), lidas de `CalendarSettings`. */
export interface OfferRules {
  minLeadMinutes: number;
  maxLeadDays: number;
  granularityMinutes: number;
}

export const OFFER_RULES_NOT_FOUND = "CALENDAR_SETTINGS_NOT_FOUND";

export class AtendlyAvailability {
  constructor(
    private readonly database: DatabaseClient,
    private readonly tenantId: string,
    private readonly timeZone: string,
  ) {}

  async getAvailableSlots(
    input: GetAvailabilityInput,
  ): Promise<AvailableSlot[]> {
    const services = await new AtendlyServiceService(
      this.database,
      this.tenantId,
    ).requireActive(input.serviceIds);
    return this.findSlots({
      ...input,
      durationMinutes: services.reduce(
        (total, service) => total + service.durationMinutes,
        0,
      ),
      bufferBeforeMinutes: maxServiceBuffer(services, "bufferBeforeMinutes"),
      bufferAfterMinutes: maxServiceBuffer(services, "bufferAfterMinutes"),
    });
  }

  async assertAvailable(input: {
    date: string;
    startTime: string;
    durationMinutes: number;
    /** Buffer externo do conjunto proposto (Goal009); zero para atendimento manual sem servico. */
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    excludeAppointmentId?: string;
    excludeHoldId?: string;
  }): Promise<{ startAt: Date; endAt: Date }> {
    const slots = await this.findSlots({
      startDate: input.date,
      days: 1,
      maxSlots: 2_000,
      serviceIds: [],
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
      excludeAppointmentId: input.excludeAppointmentId,
      excludeHoldId: input.excludeHoldId,
    });
    const slot = slots.find(
      (candidate) =>
        candidate.date === input.date &&
        candidate.startTime === input.startTime,
    );
    if (!slot) {
      throw new AppError(
        "SLOT_UNAVAILABLE",
        "Slot is unavailable for the service duration.",
        409,
      );
    }
    const startAt = localDateTimeToInstant(
      slot.date,
      slot.startTime,
      this.timeZone,
    );
    return { startAt, endAt: addMinutes(startAt, input.durationMinutes) };
  }

  /** Regras de oferta vigentes do tenant (Goal009): sempre lidas do banco, nunca decididas por quem chama. */
  async offerRules(): Promise<OfferRules> {
    const settings = await this.database.calendarSettings.findUnique({
      where: { tenantId: this.tenantId },
    });
    if (!settings) {
      throw new AppError(
        OFFER_RULES_NOT_FOUND,
        "Calendar settings were not found for this tenant.",
        404,
      );
    }
    return {
      minLeadMinutes: settings.minLeadMinutes,
      maxLeadDays: settings.maxLeadDays,
      granularityMinutes: settings.granularityMinutes,
    };
  }

  /**
   * Maior buffer externo efetivamente gravado nas linhas vigentes do tenant
   * (Goal009). Serve para alargar a janela de busca de ocupacao, nunca para
   * calcular ocupacao: cada vizinho continua ocupando o proprio snapshot.
   */
  private async maxNeighborBuffer(): Promise<{
    before: number;
    after: number;
  }> {
    const [appointments, holds] = await Promise.all([
      this.database.appointment.aggregate({
        where: { tenantId: this.tenantId, status: { not: "CANCELLED" } },
        _max: {
          bufferBeforeMinutesSnapshot: true,
          bufferAfterMinutesSnapshot: true,
        },
      }),
      this.database.appointmentHold.aggregate({
        where: {
          tenantId: this.tenantId,
          consumedAt: null,
          releasedAt: null,
        },
        _max: {
          proposedBufferBeforeMinutes: true,
          proposedBufferAfterMinutes: true,
        },
      }),
    ]);
    return {
      before: Math.max(
        0,
        appointments._max.bufferBeforeMinutesSnapshot ?? 0,
        holds._max.proposedBufferBeforeMinutes ?? 0,
      ),
      after: Math.max(
        0,
        appointments._max.bufferAfterMinutesSnapshot ?? 0,
        holds._max.proposedBufferAfterMinutes ?? 0,
      ),
    };
  }

  private async findSlots(
    input: GetAvailabilityInput & {
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      excludeAppointmentId?: string;
      /**
       * O hold que **esta sendo consumido** por esta mutacao. Ele e o unico
       * que nao ocupa: para qualquer outro pedido, inclusive outro hold, ele
       * continua sendo tempo tomado.
       */
      excludeHoldId?: string;
    },
  ): Promise<AvailableSlot[]> {
    if (input.durationMinutes <= 0) {
      throw new AppError(
        "INVALID_SERVICE_DURATION",
        "Appointment duration must be positive.",
        400,
      );
    }

    const endDateExclusive = addDays(input.startDate, input.days);
    const rangeStart = localDateTimeToInstant(
      input.startDate,
      "00:00",
      this.timeZone,
    );
    const rangeEnd = localDateTimeToInstant(
      endDateExclusive,
      "00:00",
      this.timeZone,
    );
    const databaseStartDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const databaseEndDate = new Date(`${endDateExclusive}T00:00:00.000Z`);

    // Vigencia do hold pelo relogio do **banco**: dentro de uma transacao,
    // `now()` e constante, entao ler uma vez e filtrar por ela e o mesmo que
    // comparar no `WHERE` — e nao depende do relogio do processo.
    const now = await databaseNow(this.database);

    // Janela de busca alargada pelo buffer (Goal009).
    //
    // O vizinho ocupa `[startAt - bufferBefore, endAt + bufferAfter]`, mas o
    // `WHERE` so compara as colunas cruas. Consultado apenas o intervalo
    // pedido, um atendimento que termina exatamente no inicio do range com
    // `bufferAfter` — ou que comeca logo depois do fim dele com
    // `bufferBefore` — nao apareceria, e o slot que a ocupacao estendida dele
    // alcanca seria oferecido como livre. Isso morde de verdade em
    // `assertAvailable`, que consulta `days: 1`: a fronteira da meia-noite e
    // exatamente onde o vizinho do dia anterior mora.
    //
    // O alargamento usa o maior buffer efetivamente gravado no tenant (nao ha
    // teto de buffer no catalogo, entao nao existe constante segura) somado ao
    // buffer do proprio conjunto proposto, que estende o candidato para fora
    // do range pelo outro lado. E um superconjunto: nenhum vizinho relevante
    // fica de fora, e o que entra a mais e descartado pelo teste de
    // sobreposicao adiante.
    const neighborBuffer = await this.maxNeighborBuffer();
    const searchStart = addMinutes(
      rangeStart,
      -(input.bufferBeforeMinutes + neighborBuffer.after),
    );
    const searchEnd = addMinutes(
      rangeEnd,
      input.bufferAfterMinutes + neighborBuffer.before,
    );

    const [settings, rules, exceptions, timeBlocks, appointments, holds] =
      await Promise.all([
        this.database.calendarSettings.findUnique({
          where: { tenantId: this.tenantId },
        }),
        this.database.availabilityRule.findMany({
          where: { tenantId: this.tenantId, active: true },
        }),
        this.database.availabilityException.findMany({
          where: {
            tenantId: this.tenantId,
            date: { gte: databaseStartDate, lt: databaseEndDate },
          },
        }),
        this.database.timeBlock.findMany({
          where: {
            tenantId: this.tenantId,
            startAt: { lt: searchEnd },
            endAt: { gt: searchStart },
          },
        }),
        this.database.appointment.findMany({
          where: {
            tenantId: this.tenantId,
            status: { not: "CANCELLED" },
            startAt: { lt: searchEnd },
            endAt: { gt: searchStart },
            ...(input.excludeAppointmentId
              ? { id: { not: input.excludeAppointmentId } }
              : {}),
          },
        }),
        // Hold vigente ocupa como um atendimento. Vencido, consumido ou
        // liberado nao aparece aqui — e por isso que nao ha worker: a propria
        // consulta de disponibilidade e quem "expira" o hold.
        this.database.appointmentHold.findMany({
          where: {
            tenantId: this.tenantId,
            consumedAt: null,
            releasedAt: null,
            expiresAt: { gt: now },
            startAt: { lt: searchEnd },
            endAt: { gt: searchStart },
            ...(input.excludeHoldId
              ? { id: { not: input.excludeHoldId } }
              : {}),
          },
        }),
      ]);
    if (!settings) {
      throw new AppError(
        OFFER_RULES_NOT_FOUND,
        "Calendar settings were not found for this tenant.",
        404,
      );
    }

    // Regras de oferta (Goal009): aplicadas aqui, dentro do motor, para toda
    // oferta — a IA, o BFF e o override humano de sobreposicao (que ignora a
    // GRADE, nao o horizonte) nunca decidem isso por fora.
    const earliestAllowed = addMinutes(now, settings.minLeadMinutes);
    const latestAllowed = new Date(
      now.getTime() + settings.maxLeadDays * 86_400_000,
    );
    const granularityMinutes = settings.granularityMinutes;

    // Ocupacao estendida por buffer (Goal009): o atendimento e o hold ocupam
    // `[start - bufferBefore, end + bufferAfter]` do snapshot/proposta
    // gravados na linha — nunca recalculados do catalogo. O bloco nao tem
    // buffer, so o atendimento tem.
    const busy: BusyInterval[] = [
      ...timeBlocks.map((block) => ({
        start: block.startAt,
        end: block.endAt,
      })),
      ...appointments.map((appointment) => ({
        start: addMinutes(
          appointment.startAt,
          -appointment.bufferBeforeMinutesSnapshot,
        ),
        end: addMinutes(
          appointment.endAt,
          appointment.bufferAfterMinutesSnapshot,
        ),
      })),
      ...holds.map((hold) => ({
        start: addMinutes(hold.startAt, -hold.proposedBufferBeforeMinutes),
        end: addMinutes(hold.endAt, hold.proposedBufferAfterMinutes),
      })),
    ];
    const slots: AvailableSlot[] = [];

    for (let offset = 0; offset < input.days; offset += 1) {
      const date = addDays(input.startDate, offset);
      const intervals = resolveIntervals(
        rules
          .filter((rule) => rule.dayOfWeek === weekdayIndex(date))
          .map((rule) => ({
            start: databaseTimeToMinutes(rule.startTime),
            end: databaseTimeToMinutes(rule.endTime),
          })),
        exceptions
          .filter((exception) => databaseDate(exception.date) === date)
          .map((exception) => ({
            available: exception.available,
            start:
              exception.startTime === null
                ? 0
                : databaseTimeToMinutes(exception.startTime),
            end:
              exception.endTime === null
                ? 24 * 60
                : databaseTimeToMinutes(exception.endTime),
          })),
      );

      for (const interval of intervals) {
        const intervalEnd = instantForMinute(date, interval.end, this.timeZone);
        for (
          let start = interval.start;
          start < interval.end;
          start += granularityMinutes
        ) {
          const startAt = instantForMinute(date, start, this.timeZone);
          const endAt = addMinutes(startAt, input.durationMinutes);
          if (endAt > intervalEnd) break;
          if (startAt < earliestAllowed) continue;
          if (startAt > latestAllowed) continue;
          const extendedStart = addMinutes(startAt, -input.bufferBeforeMinutes);
          const extendedEnd = addMinutes(endAt, input.bufferAfterMinutes);
          if (
            busy.some((item) =>
              overlaps(extendedStart, extendedEnd, item.start, item.end),
            )
          ) {
            continue;
          }

          const localEnd = instantToLocalDateTime(endAt, this.timeZone);
          slots.push({
            date,
            startTime: timeFromMinutes(start),
            endTime: localEnd.time,
          });
          if (slots.length >= input.maxSlots) return slots;
        }
      }
    }

    return slots;
  }
}

function resolveIntervals(
  rules: Interval[],
  exceptions: Array<Interval & { available: boolean }>,
): Interval[] {
  const additions = exceptions
    .filter((exception) => exception.available)
    .map(({ start, end }) => ({ start, end }));
  const removals = exceptions
    .filter((exception) => !exception.available)
    .map(({ start, end }) => ({ start, end }));
  let intervals = mergeIntervals([...rules, ...additions]);
  for (const removal of removals) {
    intervals = intervals.flatMap((interval) => subtract(interval, removal));
  }
  return mergeIntervals(intervals);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start - right.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function subtract(interval: Interval, removal: Interval): Interval[] {
  if (removal.end <= interval.start || removal.start >= interval.end) {
    return [interval];
  }
  const result: Interval[] = [];
  if (removal.start > interval.start) {
    result.push({ start: interval.start, end: removal.start });
  }
  if (removal.end < interval.end) {
    result.push({ start: removal.end, end: interval.end });
  }
  return result;
}

function instantForMinute(
  date: string,
  minute: number,
  timeZone: string,
): Date {
  if (minute === 24 * 60) {
    return localDateTimeToInstant(addDays(date, 1), "00:00", timeZone);
  }
  return localDateTimeToInstant(date, timeFromMinutes(minute), timeZone);
}
