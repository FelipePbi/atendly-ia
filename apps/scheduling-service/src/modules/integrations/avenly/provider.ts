import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import {
  addDays,
  addMinutes,
  instantToLocalDateTime,
  localDateTimeToInstant,
} from "../../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { actorFromSource } from "../../activity/activity-log.js";
import { customerActivity } from "../../activity/entity-activity.js";
import { recordAppointmentEvent } from "../../appointments/appointment-event-service.js";
import { toSnapshot } from "../../appointments/appointment-lifecycle-service.js";
import { AvenlyAvailability } from "../../availability/avenly-availability.js";
import {
  type AvailableSlot,
  type CalendarAppointment,
  type CalendarHold,
  type CalendarMutationCommit,
  type CalendarProvider,
  type CalendarServiceDefinition,
  type CancelCalendarAppointmentInput,
  computeAgreementTotal,
  type CreateCalendarAppointmentInput,
  type CreateCalendarHoldInput,
  type GetAvailabilityInput,
  type ListAppointmentsInput,
  type OverlapOverrideInput,
  type RescheduleCalendarAppointmentInput,
} from "../../calendar/calendar-provider.js";
import {
  appointmentVersionWrite,
  databaseNow,
  lockCalendarDays,
  notifiableAppointmentFields,
  runCalendarWrite,
} from "../../calendar/write-policy.js";
import { AvenlyCustomerService } from "../../customers/avenly-customer-service.js";
import {
  AvenlyAppointmentHoldService,
  consumeHold,
  findHoldForConsumption,
  holdUnusable,
  intendedInterval,
  releaseHoldWithin,
} from "../../holds/appointment-hold-service.js";
import { recomputeAppointmentIntentsWithin } from "../../reminders/notification-intent-service.js";
import {
  AvenlyServiceService,
  maxServiceBuffer,
} from "../../services/avenly-service-service.js";

export const appointmentInclude = {
  customer: true,
  items: true,
} satisfies Prisma.AppointmentInclude;

export type AppointmentRecord = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

/**
 * DTO do atendimento a partir da linha persistida — exportada para a serie
 * de atendimento (Goal009), que cria varias linhas na mesma transacao sem
 * passar pelas mutacoes de uma unidade so do provider.
 */
export function toAvenlyAppointment(
  appointment: AppointmentRecord,
  timeZone: string,
): CalendarAppointment {
  const start = instantToLocalDateTime(appointment.startAt, timeZone);
  const end = instantToLocalDateTime(appointment.endAt, timeZone);
  const services = appointment.items.map((item) => ({
    serviceId: item.serviceId,
    name: item.serviceNameSnapshot,
    durationMinutes: item.durationMinutesSnapshot,
    priceType: item.priceTypeSnapshot,
    price: item.priceSnapshot === null ? null : Number(item.priceSnapshot),
  }));
  const total = computeAgreementTotal(services);
  const lifecycle = toSnapshot(appointment);
  return {
    id: appointment.id,
    source: appointment.source,
    title: appointment.title,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    durationMinutes: Math.round(
      (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000,
    ),
    customerId: appointment.customerId,
    customer: {
      id: appointment.customer.id,
      name: appointment.customer.name,
      phone: appointment.customer.phone,
    },
    services,
    totalPrice: total.amount,
    totalPriceType: total.type,
    comments: appointment.comments,
    status: appointment.status,
    bufferBeforeMinutes: appointment.bufferBeforeMinutesSnapshot,
    bufferAfterMinutes: appointment.bufferAfterMinutesSnapshot,
    seriesId: appointment.seriesId,
    completedAt: lifecycle.completedAt,
    completionOrigin: lifecycle.completionOrigin,
    noShowAt: lifecycle.noShowAt,
    noShowNote: lifecycle.noShowNote,
    presenceConfirmedAt: lifecycle.presenceConfirmedAt,
    finalValue: lifecycle.finalValue,
  };
}

export class AvenlyCalendarProvider implements CalendarProvider {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
    private readonly userId: string,
    private readonly timeZone: string,
  ) {}

  async listServices(): Promise<CalendarServiceDefinition[]> {
    return new AvenlyServiceService(
      this.prisma,
      this.tenantId,
    ).listForScheduling();
  }

  async listAppointments(
    input: ListAppointmentsInput,
  ): Promise<CalendarAppointment[]> {
    // `customerId` é a pessoa; `customerPhone` é filtro de **candidatos** —
    // o mesmo número pode pertencer a mais de uma pessoa do negócio.
    let customerIds: string[] | null = null;
    if (input.customerId) {
      customerIds = [input.customerId];
    } else if (input.customerPhone) {
      const customers = new AvenlyCustomerService(this.prisma, this.tenantId);
      const candidates = await customers.findCandidatesByPhone(
        input.customerPhone,
      );
      if (candidates.length === 0) return [];
      customerIds = candidates.map((candidate) => candidate.id);
      if (input.includeDependents) {
        const dependents = await customers.findDependentsByPhone(
          input.customerPhone,
        );
        customerIds = [
          ...new Set([
            ...customerIds,
            ...dependents.map((dependent) => dependent.id),
          ]),
        ];
      }
    }

    const rangeStart = localDateTimeToInstant(
      input.startDate,
      "00:00",
      this.timeZone,
    );
    const rangeEnd = localDateTimeToInstant(
      addDays(input.endDate, 1),
      "00:00",
      this.timeZone,
    );
    if (rangeEnd <= rangeStart) {
      throw new AppError(
        "INVALID_DATE_RANGE",
        "Appointment end date must not precede start date.",
        400,
      );
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId: this.tenantId,
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(customerIds ? { customerId: { in: customerIds } } : {}),
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
    });
    return appointments.map((appointment) => this.toAppointment(appointment));
  }

  async getAppointment(appointmentId: string): Promise<CalendarAppointment> {
    return this.toAppointment(await this.requireAppointment(appointmentId));
  }

  async getAvailability(input: GetAvailabilityInput): Promise<AvailableSlot[]> {
    return new AvenlyAvailability(
      this.prisma,
      this.tenantId,
      this.timeZone,
    ).getAvailableSlots(input);
  }

  /**
   * Confirmacao sob a politica unica de escrita (Goal008): transacao
   * Serializable, lock do dia afetado, catalogo e disponibilidade
   * revalidados **dentro** da transacao e resultado idempotente gravado no
   * mesmo commit do atendimento.
   */
  async createAppointment(
    input: CreateCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment> {
    const overrideReason = resolveOverlapOverride(input);
    const manual = resolveManualAppointment(input);

    return runCalendarWrite(this.prisma, async (transaction) => {
      await lockCalendarDays(transaction, this.tenantId, [input.date]);
      const services = manual
        ? []
        : await new AvenlyServiceService(
            transaction,
            this.tenantId,
          ).requireActive(input.serviceIds);
      const durationMinutes =
        manual?.durationMinutes ??
        services.reduce((total, service) => total + service.durationMinutes, 0);
      // Buffer externo do conjunto proposto (Goal009): o maior antes/depois
      // entre os servicos — buffers intermediarios de multi-servico nunca
      // sao somados. Manual sem servico ocupa sem buffer.
      const bufferBeforeMinutes = maxServiceBuffer(services, "bufferBeforeMinutes");
      const bufferAfterMinutes = maxServiceBuffer(services, "bufferAfterMinutes");
      // O hold e validado **antes** de a disponibilidade ser consultada: se
      // ele nao serve mais, a confirmacao nao acontece, e o que a chamada
      // recebe e a expiracao junto com o estado revalidado do horario.
      const hold = input.holdId
        ? await this.claimHold(transaction, {
            holdId: input.holdId,
            date: input.date,
            startTime: input.startTime,
            durationMinutes,
            bufferBeforeMinutes,
            bufferAfterMinutes,
          })
        : null;
      const slot = overrideReason
        ? this.forcedSlot(input.date, input.startTime, durationMinutes)
        : await new AvenlyAvailability(
            transaction,
            this.tenantId,
            this.timeZone,
          ).assertAvailable({
            date: input.date,
            startTime: input.startTime,
            durationMinutes,
            bufferBeforeMinutes,
            bufferAfterMinutes,
            // O hold que esta sendo consumido nao ocupa contra a confirmacao
            // que o consome; para todo o resto ele continua ocupando.
            excludeHoldId: hold?.holdId,
          });
      // A pessoa so e criada aqui, **depois** de o slot ser validado dentro
      // da transacao: consulta de preco ou disponibilidade nao cria ninguem,
      // e uma confirmacao que falha no slot tambem nao.
      const customerId = await this.resolveCustomerForAppointment(
        transaction,
        input,
      );
      const created = await transaction.appointment.create({
        data: {
          source: input.source ?? "AI",
          startAt: slot.startAt,
          endAt: slot.endAt,
          // Estado do produto (Goal008). `statusRaw` e gravado UMA VEZ, na
          // criacao, com o mesmo texto: e o analogo do que a migration fez
          // pelas linhas legadas. Nenhuma transicao posterior o reescreve.
          status: "CONFIRMED",
          statusRaw: "CONFIRMED",
          title: manual?.title ?? null,
          createdBy: this.userId,
          comments: input.comments ?? null,
          bufferBeforeMinutesSnapshot: bufferBeforeMinutes,
          bufferAfterMinutesSnapshot: bufferAfterMinutes,
          customer: {
            connect: {
              tenantId_id: {
                tenantId: this.tenantId,
                id: customerId,
              },
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
      await recordAppointmentEvent(transaction, this.tenantId, created.id, {
        type: "CREATED",
        source: input.source ?? "AI",
        actor: this.userId,
        after: intervalOf(this.toAppointment(created)),
      });
      if (overrideReason) {
        await recordAppointmentEvent(transaction, this.tenantId, created.id, {
          type: "OVERLAP_OVERRIDE",
          source: input.source ?? "AI",
          actor: this.userId,
          reason: overrideReason,
        });
      }
      if (hold) {
        await consumeHold(transaction, {
          tenantId: this.tenantId,
          holdId: hold.holdId,
          now: hold.now,
        });
        await recordAppointmentEvent(transaction, this.tenantId, created.id, {
          type: "HOLD_CONSUMED",
          source: input.source ?? "AI",
          actor: this.userId,
          after: {
            holdId: hold.holdId,
            date: input.date,
            startTime: input.startTime,
          },
        });
      }
      // As intencoes de envio nascem na MESMA transacao do atendimento
      // (Goal021): um compromisso futuro e confirmado ja sai daqui com os
      // lembretes da configuracao vigente agendados, e nunca ha um instante em
      // que o atendimento existe sem que o lembrete dele tenha sido decidido.
      await recomputeAppointmentIntentsWithin(transaction, {
        tenantId: this.tenantId,
        appointment: created,
        now: hold?.now ?? (await databaseNow(transaction)),
      });
      return this.commitAppointment(transaction, created, commit);
    });
  }

  /**
   * Remarcacao sob a mesma politica. Trava o dia original e o novo em ordem
   * estavel — os dois sao afetados: um libera tempo e o outro ocupa.
   */
  async rescheduleAppointment(
    input: RescheduleCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment> {
    const overrideReason = resolveOverlapOverride(input);
    // Leitura previa so para saber qual dia o atendimento ocupa hoje: os dois
    // dias precisam ser travados em ordem estavel, e a ordem so pode ser
    // decidida conhecendo os dois. O estado que vale e o relido sob lock.
    const current = await this.requireAppointment(input.appointmentId);
    const originalDate = this.localDate(current.startAt);

    return runCalendarWrite(this.prisma, async (transaction) => {
      await lockCalendarDays(transaction, this.tenantId, [
        originalDate,
        input.date,
      ]);
      const persisted = await transaction.appointment.findUnique({
        where: {
          tenantId_id: {
            tenantId: this.tenantId,
            id: input.appointmentId,
          },
        },
        include: appointmentInclude,
      });
      if (!persisted) appointmentNotFound();
      assertCanReschedule(persisted);
      // Antecedencia medida contra o INICIO ATUAL do atendimento, nao o
      // horario novo pretendido (Goal073): o que a politica limita e o
      // quanto em cima da hora o cliente muda o que ja estava marcado.
      await this.assertCustomerChangePolicy(transaction, {
        startAt: persisted.startAt,
        source: input.source ?? "AI",
      });
      const persistedDate = this.localDate(persisted.startAt);
      if (persistedDate !== originalDate) {
        // O atendimento mudou de dia entre a leitura e o lock: o dia que ele
        // realmente libera ainda nao estava travado.
        await lockCalendarDays(transaction, this.tenantId, [persistedDate]);
      }
      const persistedDuration = appointmentDuration(persisted);
      // O buffer nao muda na remarcacao: e o mesmo snapshot da confirmacao —
      // editar o catalogo depois nao move a ocupacao, e remarcar tambem nao
      // recalcula.
      const bufferBeforeMinutes = persisted.bufferBeforeMinutesSnapshot;
      const bufferAfterMinutes = persisted.bufferAfterMinutesSnapshot;
      // O horario original segue ocupado por este atendimento ate aqui: o
      // hold segura apenas o **novo** horario, e nada solta o antigo antes de
      // a remarcacao acontecer de fato.
      const hold = input.holdId
        ? await this.claimHold(transaction, {
            holdId: input.holdId,
            date: input.date,
            startTime: input.startTime,
            durationMinutes: persistedDuration,
            bufferBeforeMinutes,
            bufferAfterMinutes,
            excludeAppointmentId: persisted.id,
          })
        : null;
      const slot = overrideReason
        ? this.forcedSlot(input.date, input.startTime, persistedDuration)
        : await new AvenlyAvailability(
            transaction,
            this.tenantId,
            this.timeZone,
          ).assertAvailable({
            date: input.date,
            startTime: input.startTime,
            durationMinutes: persistedDuration,
            bufferBeforeMinutes,
            bufferAfterMinutes,
            excludeAppointmentId: persisted.id,
            excludeHoldId: hold?.holdId,
          });
      const before = this.toAppointment(persisted);
      // Horario e o que o cliente precisaria saber: a versao notificavel sobe
      // no mesmo `update`, e nao sobe se a remarcacao cair no horario em que o
      // atendimento ja estava.
      const notifiable = { startAt: slot.startAt, endAt: slot.endAt };
      const updated = await transaction.appointment.update({
        where: {
          tenantId_id: {
            tenantId: this.tenantId,
            id: persisted.id,
          },
        },
        data: {
          ...notifiable,
          ...appointmentVersionWrite(
            notifiableAppointmentFields(persisted),
            notifiable,
          ),
        },
        include: appointmentInclude,
      });
      if (hold) {
        // Liberado, nao consumido: o hold nao virou atendimento — o
        // atendimento ja existia e passou a ocupar o horario que ele segurava.
        await releaseHoldWithin(transaction, {
          tenantId: this.tenantId,
          holdId: hold.holdId,
          now: hold.now,
        });
      }
      const after = this.toAppointment(updated);
      await recordAppointmentEvent(transaction, this.tenantId, updated.id, {
        type: "RESCHEDULED",
        source: input.source ?? "AI",
        actor: this.userId,
        reason: overrideReason,
        before: intervalOf(before),
        after: { ...intervalOf(after), holdId: hold?.holdId ?? null },
      });
      if (overrideReason) {
        await recordAppointmentEvent(transaction, this.tenantId, updated.id, {
          type: "OVERLAP_OVERRIDE",
          source: input.source ?? "AI",
          actor: this.userId,
          reason: overrideReason,
        });
      }
      // Remarcar nao deixa para tras o lembrete do horario velho: as
      // pendentes da versao anterior sao canceladas e as da nova nascem aqui,
      // no mesmo commit da mutacao.
      await recomputeAppointmentIntentsWithin(transaction, {
        tenantId: this.tenantId,
        appointment: updated,
        now: hold?.now ?? (await databaseNow(transaction)),
        previousVersion: persisted.notifiableVersion,
        notifyCustomer: input.notifyCustomer === true,
      });
      return this.commitAppointment(transaction, updated, commit);
    });
  }

  /**
   * Cancelamento sob a mesma politica: ele libera tempo do dia do
   * atendimento, entao trava esse dia e roda na mesma transacao que
   * confirmar e remarcar. Cancelar de novo devolve o mesmo atendimento, sem
   * segundo efeito.
   */
  async cancelAppointment(
    input: CancelCalendarAppointmentInput,
    commit?: CalendarMutationCommit<CalendarAppointment>,
  ): Promise<CalendarAppointment> {
    // Mesma leitura previa da remarcacao: descobre o dia a travar; o estado
    // que decide o cancelamento e o relido dentro da transacao.
    const current = await this.requireAppointment(input.appointmentId);
    const currentDate = this.localDate(current.startAt);

    return runCalendarWrite(this.prisma, async (transaction) => {
      await lockCalendarDays(transaction, this.tenantId, [currentDate]);
      const persisted = await transaction.appointment.findUnique({
        where: {
          tenantId_id: { tenantId: this.tenantId, id: input.appointmentId },
        },
        include: appointmentInclude,
      });
      if (!persisted) appointmentNotFound();
      const persistedDate = this.localDate(persisted.startAt);
      if (persistedDate !== currentDate) {
        await lockCalendarDays(transaction, this.tenantId, [persistedDate]);
      }
      if (persisted.status === "CANCELLED") {
        return this.commitAppointment(transaction, persisted, commit);
      }
      // Depois do atalho de replay acima: cancelar o que ja esta cancelado
      // nunca esbarra na politica, porque nao ha segundo efeito para conferir
      // antecedencia (Goal073).
      await this.assertCustomerChangePolicy(transaction, {
        startAt: persisted.startAt,
        source: input.source ?? "AI",
        exemption: input.policyExemption,
      });
      const cancelled = await transaction.appointment.update({
        where: {
          tenantId_id: { tenantId: this.tenantId, id: persisted.id },
        },
        data: {
          // `statusRaw` NAO e reescrito aqui: ele guarda o valor bruto
          // anterior a normalizacao do Goal008 (o `SCHEDULED` que a
          // migration preservou, ou o `CONFIRMED` gravado na criacao). Um
          // atendimento legado cancelado depois da migration perderia esse
          // bruto se cada transicao o sobrescrevesse — e o estado corrente
          // ja esta em `status`, sem precisar de segunda copia.
          status: "CANCELLED",
          comments: appendComment(persisted.comments, input.comments),
          // O estado muda; a observacao anexada, sozinha, nunca moveria a
          // versao — ela e alteracao somente interna.
          ...appointmentVersionWrite(notifiableAppointmentFields(persisted), {
            status: "CANCELLED",
          }),
        },
        include: appointmentInclude,
      });
      await recordAppointmentEvent(transaction, this.tenantId, cancelled.id, {
        type: "CANCELLED",
        source: input.source ?? "AI",
        actor: this.userId,
        reason: input.comments ?? null,
        before: { status: persisted.status },
        after: { status: "CANCELLED" },
      });
      // Cancelar SEMPRE cancela as intencoes pendentes; o aviso de alteracao
      // so nasce quando a notificacao foi pedida. Sao duas decisoes
      // diferentes, e so a segunda e opcional (Goal021, item 7).
      await recomputeAppointmentIntentsWithin(transaction, {
        tenantId: this.tenantId,
        appointment: cancelled,
        now: await databaseNow(transaction),
        previousVersion: persisted.notifiableVersion,
        notifyCustomer: input.notifyCustomer === true,
      });
      return this.commitAppointment(transaction, cancelled, commit);
    });
  }

  async createHold(
    input: CreateCalendarHoldInput,
    commit?: CalendarMutationCommit<CalendarHold>,
  ): Promise<CalendarHold> {
    return this.holds().createHold(input, commit);
  }

  async listHolds(): Promise<CalendarHold[]> {
    return this.holds().listHolds();
  }

  async getHold(holdId: string): Promise<CalendarHold> {
    return this.holds().getHold(holdId);
  }

  async releaseHold(holdId: string): Promise<CalendarHold> {
    return this.holds().releaseHold(holdId);
  }

  private holds(): AvenlyAppointmentHoldService {
    return new AvenlyAppointmentHoldService(
      this.prisma,
      this.tenantId,
      this.timeZone,
    );
  }

  /**
   * Valida o hold apresentado dentro da transacao da mutacao: tenant,
   * vigencia pelo relogio do banco e cobertura do intervalo pretendido.
   *
   * Quando ele nao serve, a disponibilidade e revalidada **sem** a protecao
   * do hold e o erro carrega o resultado dessa revalidacao. Nao existe
   * caminho em que um hold vencido vire confirmacao silenciosa: ou o hold
   * vale, ou a chamada volta sabendo que ele expirou e se o horario ainda
   * esta livre.
   */
  private async claimHold(
    transaction: Prisma.TransactionClient,
    input: {
      holdId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      excludeAppointmentId?: string;
    },
  ): Promise<{ holdId: string; now: Date }> {
    const now = await databaseNow(transaction);
    const intended = intendedInterval({
      date: input.date,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      timeZone: this.timeZone,
    });
    const lookup = await findHoldForConsumption(transaction, {
      tenantId: this.tenantId,
      holdId: input.holdId,
      now,
      startAt: intended.startAt,
      endAt: intended.endAt,
    });
    if (lookup.unusableReason) {
      throw holdUnusable(
        input.holdId,
        lookup.unusableReason,
        await this.isSlotAvailable(transaction, input),
      );
    }
    return { holdId: lookup.hold.id, now };
  }

  /** Revalidacao normal do horario, sem excluir hold nenhum da ocupacao. */
  private async isSlotAvailable(
    transaction: Prisma.TransactionClient,
    input: {
      date: string;
      startTime: string;
      durationMinutes: number;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
      excludeAppointmentId?: string;
    },
  ): Promise<boolean> {
    try {
      await new AvenlyAvailability(
        transaction,
        this.tenantId,
        this.timeZone,
      ).assertAvailable(input);
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === "SLOT_UNAVAILABLE") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Antecedencia minima do cliente (Goal073): so restringe o chamador IA — a
   * profissional (chamador USER) nunca e limitada por esta regra, no mesmo
   * padrao de `resolveOverlapOverride`. Lida dentro da PROPRIA transacao da
   * mutacao, nunca antes: a configuracao vigente e a do instante da escrita,
   * nao a de quando a chamada comecou.
   *
   * `minNoticeMinutes <= 0` (o default) nao restringe nada — nenhum negocio
   * existente ganha recusa nova so pela coluna aditiva ter chegado com zero.
   */
  private async assertCustomerChangePolicy(
    transaction: Prisma.TransactionClient,
    params: {
      startAt: Date;
      source: "AI" | "USER";
      exemption?: "ACTIVATION_TEST_CLEANUP";
    },
  ): Promise<void> {
    if (params.source !== "AI") return;
    if (params.exemption === "ACTIVATION_TEST_CLEANUP") return;
    const settings = await transaction.calendarSettings.findUniqueOrThrow({
      where: { tenantId: this.tenantId },
    });
    const minNoticeMinutes = settings.customerChangeMinNoticeMinutes;
    if (minNoticeMinutes <= 0) return;
    const now = await databaseNow(transaction);
    const noticeMinutes = (params.startAt.getTime() - now.getTime()) / 60_000;
    if (noticeMinutes < minNoticeMinutes) {
      throw new AppError(
        "CUSTOMER_CHANGE_OUTSIDE_POLICY",
        "The customer change notice policy no longer allows this change.",
        409,
        { minNoticeMinutes },
      );
    }
  }

  /**
   * Resultado da mutacao e sua gravacao idempotente, ainda dentro da
   * transacao do efeito: e isto que faz efeito e resultado entrarem no mesmo
   * commit.
   */
  private async commitAppointment(
    transaction: Prisma.TransactionClient,
    appointment: AppointmentRecord,
    commit: CalendarMutationCommit<CalendarAppointment> | undefined,
  ): Promise<CalendarAppointment> {
    const result = this.toAppointment(appointment);
    await commit?.(transaction, {
      result,
      effect: { entityType: "APPOINTMENT", entityId: appointment.id },
    });
    return result;
  }

  /**
   * Horario imposto por decisao humana: a sobreposicao ja foi autorizada
   * explicitamente, entao o intervalo vem do relogio local e nao da grade de
   * disponibilidade — que e justamente o que o override dispensa.
   */
  private forcedSlot(
    date: string,
    startTime: string,
    durationMinutes: number,
  ): { startAt: Date; endAt: Date } {
    if (durationMinutes <= 0) {
      throw new AppError(
        "INVALID_SERVICE_DURATION",
        "Appointment duration must be positive.",
        400,
      );
    }
    const startAt = localDateTimeToInstant(date, startTime, this.timeZone);
    return { startAt, endAt: addMinutes(startAt, durationMinutes) };
  }

  private localDate(instant: Date): string {
    return instantToLocalDateTime(instant, this.timeZone).date;
  }

  /**
   * Pessoa do agendamento, resolvida dentro da transação de confirmação.
   *
   * Com `customerId`, a pessoa é a escolhida — nada é renomeado nem fundido.
   * Sem ela, um cadastro novo nasce com o nome informado, mesmo que o número
   * já pertença a outra pessoa: telefone não prova identidade (D-005).
   */
  private async resolveCustomerForAppointment(
    transaction: Prisma.TransactionClient,
    input: CreateCalendarAppointmentInput,
  ): Promise<string> {
    const customers = new AvenlyCustomerService(transaction, this.tenantId);
    if (input.customerId) return (await customers.get(input.customerId)).id;
    if (!input.customerName && !input.customerPhone) {
      throw new AppError(
        "CUSTOMER_IDENTIFICATION_REQUIRED",
        "An appointment needs a resolved customerId or at least a customer name or phone.",
        400,
      );
    }
    const created = await customers.create({
      name: input.customerName,
      phone: input.customerPhone,
    });
    // Cadastro nascido do agendamento (quase sempre pela IA): atividade no
    // mesmo commit (D-176).
    const actor = actorFromSource(input.source ?? "AI", this.userId);
    if (actor) {
      await customerActivity.created(transaction, this.tenantId, actor, created);
    }
    return created.id;
  }

  private async requireAppointment(
    appointmentId: string,
  ): Promise<AppointmentRecord> {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        tenantId_id: { tenantId: this.tenantId, id: appointmentId },
      },
      include: appointmentInclude,
    });
    if (!appointment) appointmentNotFound();
    return appointment;
  }

  private toAppointment(appointment: AppointmentRecord): CalendarAppointment {
    return toAvenlyAppointment(appointment, this.timeZone);
  }
}

/**
 * Duracao real do agendamento para fins de remarcacao.
 *
 * Deriva do intervalo persistido (`endAt - startAt`), nao da soma dos
 * snapshots por item: um item pode nao ter duracao propria conhecida
 * (Goal007), e o intervalo continua sendo a fonte confiavel.
 */
function appointmentDuration(appointment: AppointmentRecord): number {
  return Math.round(
    (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000,
  );
}

/**
 * Sobreposicao so por decisao humana explicita (Goal008): origem `USER`,
 * flag e motivo. A IA nunca a aplica — pedido vindo de `AI` e recusado, e nao
 * silenciosamente ignorado, para que o encaixe automatico nao possa nascer de
 * um campo esquecido no caminho. O motivo obrigatorio acompanha a mutacao no
 * historico operacional do atendimento.
 */
function resolveOverlapOverride(
  input: OverlapOverrideInput & { source?: "AI" | "USER" },
): string | null {
  if (!input.overlapOverride) return null;
  if ((input.source ?? "AI") !== "USER") {
    throw new AppError(
      "OVERLAP_OVERRIDE_NOT_ALLOWED",
      "Only a human (source USER) can force an overlapping appointment.",
      403,
    );
  }
  const reason = input.overlapOverrideReason?.trim();
  if (!reason) {
    throw new AppError(
      "OVERLAP_OVERRIDE_REASON_REQUIRED",
      "Forcing an overlapping appointment requires a reason.",
      400,
    );
  }
  return reason;
}

/**
 * Atendimento manual excepcional sem servico cadastrado (Goal008): so para
 * `source: USER`, com titulo e duracao informados. Nasce sem
 * `AppointmentItem` e, por consequencia da regra unica do acordo, sem total
 * (`NONE`) — nada de preco fabricado.
 */
function resolveManualAppointment(
  input: CreateCalendarAppointmentInput,
): { title: string; durationMinutes: number } | null {
  if (input.serviceIds.length > 0) return null;
  if ((input.source ?? "AI") !== "USER") {
    throw new AppError(
      "MANUAL_APPOINTMENT_NOT_ALLOWED",
      "Only a human (source USER) can create an appointment without a catalog service.",
      403,
    );
  }
  const title = input.title?.trim();
  if (!title) {
    throw new AppError(
      "MANUAL_APPOINTMENT_TITLE_REQUIRED",
      "An appointment without a catalog service requires a title.",
      400,
    );
  }
  if (!input.durationMinutes || input.durationMinutes <= 0) {
    throw new AppError(
      "MANUAL_APPOINTMENT_DURATION_REQUIRED",
      "An appointment without a catalog service requires a positive duration.",
      400,
    );
  }
  return { title, durationMinutes: input.durationMinutes };
}

/**
 * So um atendimento `CONFIRMED` pode ser remarcado (Goal008): cancelado tem
 * erro proprio ja estabelecido, e concluido ou falta sao estados finais do
 * ciclo — corrigir um desses e' o caminho do ciclo de vida, nao remarcacao.
 */
function assertCanReschedule(appointment: AppointmentRecord): void {
  if (appointment.status === "CANCELLED") {
    throw new AppError(
      "APPOINTMENT_CANCELLED",
      "Cancelled appointment cannot be rescheduled.",
      409,
    );
  }
  if (appointment.status !== "CONFIRMED") {
    throw new AppError(
      "APPOINTMENT_RESCHEDULE_INVALID",
      `Appointment with status ${appointment.status} cannot be rescheduled.`,
      409,
      { status: appointment.status },
    );
  }
}

/** Antes/depois de um evento de horario: so o que a remarcacao muda. */
function intervalOf(appointment: CalendarAppointment): {
  date: string;
  startTime: string;
  endTime: string;
  status: string;
} {
  return {
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
  };
}

function appointmentNotFound(): never {
  throw new AppError(
    "APPOINTMENT_NOT_FOUND",
    "Appointment was not found.",
    404,
  );
}

function appendComment(
  current: string | null,
  cancellation: string | undefined,
): string | null {
  const next = cancellation?.trim();
  if (!next) return current;
  return current ? `${current}\n${next}` : next;
}
