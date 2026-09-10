import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addMinutes,
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AtendlyAvailability } from "../availability/atendly-availability.js";
import type {
  CalendarHold,
  CalendarHoldStatus,
  CalendarMutationCommit,
  CreateCalendarHoldInput,
} from "../calendar/calendar-provider.js";
import {
  databaseNow,
  lockCalendarDays,
  runCalendarWrite,
} from "../calendar/write-policy.js";
import {
  AtendlyServiceService,
  maxServiceBuffer,
} from "../services/atendly-service-service.js";

/**
 * Hold: ocupacao temporaria de um horario enquanto ele esta em confirmacao
 * (Goal008).
 *
 * Duas invariantes sustentam o resto do modulo. A primeira e que criar,
 * consumir e liberar hold sao escritas de agenda como qualquer outra: rodam
 * pela politica unica (`runCalendarWrite` + `lockCalendarDays`), com a
 * disponibilidade revalidada dentro da transacao. E o que faz dois holds
 * concorrentes no mesmo slot terminarem com um so vigente — o segundo revalida
 * ja enxergando o primeiro como ocupacao. A segunda e que a vigencia nunca e
 * decidida pelo relogio do processo: `expiresAt` nasce de `now()` do banco
 * mais o TTL, e toda leitura compara com `now()` do banco de novo. Por isso
 * nao existe worker de expiracao: um hold vencido simplesmente deixa de ser
 * encontrado pelo filtro, na mesma consulta que decide a disponibilidade.
 */

type TransactionClient = Prisma.TransactionClient;

interface AppointmentHoldRow {
  id: string;
  tenantId: string;
  startAt: Date;
  endAt: Date;
  proposedServiceIds: unknown;
  proposedDurationMinutes: number;
  proposedBufferBeforeMinutes: number;
  proposedBufferAfterMinutes: number;
  customerId: string | null;
  contactRef: string | null;
  source: "AI" | "USER";
  expiresAt: Date;
  consumedAt: Date | null;
  releasedAt: Date | null;
}

export const APPOINTMENT_HOLD_NOT_FOUND = "APPOINTMENT_HOLD_NOT_FOUND";
export const APPOINTMENT_HOLD_EXPIRED = "APPOINTMENT_HOLD_EXPIRED";

/**
 * Por que o hold apresentado nao serve para esta confirmacao. Todos levam ao
 * mesmo erro — quem chamou precisa consultar de novo, nao adivinhar — mas a
 * razao vai no detalhe para a IA saber o que dizer.
 */
export type HoldUnusableReason =
  "NOT_FOUND" | "EXPIRED" | "CONSUMED" | "RELEASED" | "SLOT_MISMATCH";

export type HoldLookup =
  | { hold: AppointmentHoldRow; unusableReason?: undefined }
  | { hold: null; unusableReason: HoldUnusableReason };

/**
 * O hold apresentado a uma confirmacao, ja avaliado contra o `now` do banco e
 * contra o intervalo pretendido.
 *
 * Nao lanca: um hold vencido nao e um pedido invalido, e sim uma condicao que
 * a confirmacao precisa **relatar** depois de revalidar a disponibilidade.
 * Quem chama decide o erro; aqui so se responde se ele serve.
 */
export async function findHoldForConsumption(
  transaction: TransactionClient,
  input: {
    tenantId: string;
    holdId: string;
    now: Date;
    startAt: Date;
    endAt: Date;
  },
): Promise<HoldLookup> {
  const hold = (await transaction.appointmentHold.findUnique({
    where: { tenantId_id: { tenantId: input.tenantId, id: input.holdId } },
  })) as AppointmentHoldRow | null;
  // Tenant errado e indistinguivel de inexistente: a chave e composta, e um
  // hold de outro negocio nunca pode ser confirmado nem revelado.
  if (!hold || hold.tenantId !== input.tenantId) {
    return { hold: null, unusableReason: "NOT_FOUND" };
  }
  if (hold.consumedAt) return { hold: null, unusableReason: "CONSUMED" };
  if (hold.releasedAt) return { hold: null, unusableReason: "RELEASED" };
  if (hold.expiresAt.getTime() <= input.now.getTime()) {
    return { hold: null, unusableReason: "EXPIRED" };
  }
  // Cobertura, nao igualdade: o hold precisa conter o intervalo pretendido.
  // Um hold de outro horario nao autoriza esta confirmacao.
  if (
    hold.startAt.getTime() > input.startAt.getTime() ||
    hold.endAt.getTime() < input.endAt.getTime()
  ) {
    return { hold: null, unusableReason: "SLOT_MISMATCH" };
  }
  return { hold };
}

export function holdUnusable(
  holdId: string,
  reason: HoldUnusableReason,
  slotStillAvailable: boolean,
): AppError {
  return new AppError(
    APPOINTMENT_HOLD_EXPIRED,
    "The hold is no longer valid for this slot; availability was revalidated.",
    409,
    { holdId, reason, slotStillAvailable },
  );
}

/** Consome o hold **dentro** da transacao do atendimento que ele autorizou. */
export async function consumeHold(
  transaction: TransactionClient,
  input: { tenantId: string; holdId: string; now: Date },
): Promise<void> {
  const consumed = await transaction.appointmentHold.updateMany({
    where: {
      tenantId: input.tenantId,
      id: input.holdId,
      consumedAt: null,
      releasedAt: null,
    },
    data: { consumedAt: input.now },
  });
  if (consumed.count === 0) {
    // Alguem consumiu ou liberou entre a leitura e a escrita: nao ha
    // confirmacao a fazer sob este hold.
    throw holdUnusable(input.holdId, "CONSUMED", false);
  }
}

/**
 * Libera o hold dentro da transacao que o dispensou. E o que a remarcacao faz:
 * o atendimento ja existe e passa a ocupar o novo horario, entao o hold nao e
 * consumido para virar atendimento — ele so deixa de segurar o horario.
 */
export async function releaseHoldWithin(
  transaction: TransactionClient,
  input: { tenantId: string; holdId: string; now: Date },
): Promise<void> {
  await transaction.appointmentHold.updateMany({
    where: {
      tenantId: input.tenantId,
      id: input.holdId,
      consumedAt: null,
      releasedAt: null,
    },
    data: { releasedAt: input.now },
  });
}

export class AtendlyAppointmentHoldService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
    private readonly timeZone: string,
  ) {}

  /**
   * Cria o hold sob o mesmo lock do dia que a confirmacao usaria, com a
   * disponibilidade revalidada dentro da transacao: reservar um horario ocupa
   * tempo, e ocupar tempo passa pela politica unica de escrita.
   */
  async createHold(
    input: CreateCalendarHoldInput,
    commit?: CalendarMutationCommit<CalendarHold>,
  ): Promise<CalendarHold> {
    const source = input.source ?? "AI";
    return runCalendarWrite(this.prisma, async (transaction) => {
      await lockCalendarDays(transaction, this.tenantId, [input.date]);
      const services = await new AtendlyServiceService(
        transaction,
        this.tenantId,
      ).requireActive(input.serviceIds);
      const durationMinutes = services.reduce(
        (total, service) => total + service.durationMinutes,
        0,
      );
      // Buffer externo do conjunto proposto (Goal009): mesma semantica da
      // confirmacao — maior antes/depois entre os servicos propostos, nunca
      // somados.
      const bufferBeforeMinutes = maxServiceBuffer(services, "bufferBeforeMinutes");
      const bufferAfterMinutes = maxServiceBuffer(services, "bufferAfterMinutes");
      const slot = await new AtendlyAvailability(
        transaction,
        this.tenantId,
        this.timeZone,
      ).assertAvailable({
        date: input.date,
        startTime: input.startTime,
        durationMinutes,
        bufferBeforeMinutes,
        bufferAfterMinutes,
      });
      const now = await databaseNow(transaction);
      const created = (await transaction.appointmentHold.create({
        data: {
          tenantId: this.tenantId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          proposedServiceIds: services.map((service) => service.id),
          proposedDurationMinutes: durationMinutes,
          proposedBufferBeforeMinutes: bufferBeforeMinutes,
          proposedBufferAfterMinutes: bufferAfterMinutes,
          customerId: input.customerId ?? null,
          contactRef: input.contactRef ?? null,
          source,
          expiresAt: addSeconds(now, env.CALENDAR_HOLD_TTL_SECONDS),
        },
      })) as AppointmentHoldRow;
      const result = this.toHold(created, now);
      await commit?.(transaction, {
        result,
        effect: { entityType: "APPOINTMENT_HOLD", entityId: created.id },
      });
      return result;
    });
  }

  /** Somente os vigentes: nao consumidos, nao liberados e dentro do TTL. */
  async listHolds(): Promise<CalendarHold[]> {
    const now = await databaseNow(this.prisma);
    const holds = (await this.prisma.appointmentHold.findMany({
      where: {
        tenantId: this.tenantId,
        consumedAt: null,
        releasedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { startAt: "asc" },
    })) as AppointmentHoldRow[];
    return holds.map((hold) => this.toHold(hold, now));
  }

  async getHold(holdId: string): Promise<CalendarHold> {
    const now = await databaseNow(this.prisma);
    const hold = (await this.prisma.appointmentHold.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: holdId } },
    })) as AppointmentHoldRow | null;
    if (!hold) holdNotFound();
    return this.toHold(hold, now);
  }

  /**
   * Liberacao explicita: libera tempo, entao roda sob a mesma transacao e o
   * mesmo lock. Liberar de novo devolve o mesmo hold, sem segundo efeito.
   */
  async releaseHold(holdId: string): Promise<CalendarHold> {
    return runCalendarWrite(this.prisma, async (transaction) => {
      const existing = (await transaction.appointmentHold.findUnique({
        where: { tenantId_id: { tenantId: this.tenantId, id: holdId } },
      })) as AppointmentHoldRow | null;
      if (!existing) holdNotFound();
      await lockCalendarDays(transaction, this.tenantId, [
        this.localDate(existing.startAt),
      ]);
      const now = await databaseNow(transaction);
      if (existing.consumedAt || existing.releasedAt) {
        return this.toHold(existing, now);
      }
      await releaseHoldWithin(transaction, {
        tenantId: this.tenantId,
        holdId,
        now,
      });
      return this.toHold({ ...existing, releasedAt: now }, now);
    });
  }

  toHold(hold: AppointmentHoldRow, now: Date): CalendarHold {
    const start = instantToLocalDateTime(hold.startAt, this.timeZone);
    const end = instantToLocalDateTime(hold.endAt, this.timeZone);
    return {
      id: hold.id,
      date: start.date,
      startTime: start.time,
      endTime: end.time,
      durationMinutes: hold.proposedDurationMinutes,
      serviceIds: toServiceIds(hold.proposedServiceIds),
      customerId: hold.customerId,
      contactRef: hold.contactRef,
      source: hold.source,
      expiresAt: hold.expiresAt.toISOString(),
      status: holdStatus(hold, now),
    };
  }

  private localDate(instant: Date): string {
    return instantToLocalDateTime(instant, this.timeZone).date;
  }
}

/** Intervalo pretendido por uma mutacao, para comparar com a cobertura do hold. */
export function intendedInterval(input: {
  date: string;
  startTime: string;
  durationMinutes: number;
  timeZone: string;
}): { startAt: Date; endAt: Date } {
  const startAt = localDateTimeToInstant(
    input.date,
    input.startTime,
    input.timeZone,
  );
  return { startAt, endAt: addMinutes(startAt, input.durationMinutes) };
}

function holdStatus(hold: AppointmentHoldRow, now: Date): CalendarHoldStatus {
  if (hold.consumedAt) return "CONSUMED";
  if (hold.releasedAt) return "RELEASED";
  if (hold.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

function toServiceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function addSeconds(instant: Date, seconds: number): Date {
  return new Date(instant.getTime() + seconds * 1_000);
}

function holdNotFound(): never {
  throw new AppError(
    APPOINTMENT_HOLD_NOT_FOUND,
    "Appointment hold was not found.",
    404,
  );
}
