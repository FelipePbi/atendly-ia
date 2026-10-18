import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { InternalRequestContext } from "../../shared/auth/internal-auth.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
  minutesFromTime,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  actorFromContext,
  diffFields,
  recordActivity,
} from "../activity/activity-log.js";
import { databaseNow } from "../calendar/write-policy.js";
import {
  appointmentValueCents,
  type RevenueAppointmentRow,
} from "../revenue/revenue-report.js";
import {
  type CompletedVisit,
  type CustomerReturnHistory,
  DECLINE_BLOCK_DAYS,
  mondayOf,
  type PacingPlan,
  type PacingRules,
  planSchedule,
  RETURN_SETTINGS_DEFAULTS,
  type ReturnCandidate,
  type ReturnExclusionCounts,
  type ReturnKind,
  type ReturnServiceInfo,
  selectRenewalCandidates,
  selectWinbackCandidates,
  sendByFor,
} from "./return-rules.js";

/**
 * Retorno de clientes do lado do dono da agenda (D-206).
 *
 * O Scheduling decide **quem** entra, **quando** sai e **com que fatos**; a IA
 * reivindica, aplica as regras do contato (ignorado, conversa pessoal),
 * compoe o texto no estilo do negocio, entrega e liquida — o mesmo desenho
 * dos lembretes (Goal021). Nada sai sem uma rodada aprovada pela profissional.
 */

export const RETURN_CAMPAIGN_NOT_FOUND = "RETURN_CAMPAIGN_NOT_FOUND";
export const RETURN_TARGET_NOT_FOUND = "RETURN_TARGET_NOT_FOUND";
export const RETURN_NO_CANDIDATES = "RETURN_NO_CANDIDATES";
export const RETURN_PLAN_DOES_NOT_FIT = "RETURN_PLAN_DOES_NOT_FIT";
export const RETURN_CAMPAIGN_STATE_CONFLICT = "RETURN_CAMPAIGN_STATE_CONFLICT";

/** Motivos de saida sem mensagem, vocabulario fechado. */
export const RETURN_SKIP_REASONS = [
  "DEACTIVATED",
  "NO_PHONE",
  "HAS_APPOINTMENT",
  "OPTED_OUT",
  "RECENTLY_CONTACTED",
  "DEADLINE_PASSED",
  "OWNER_SKIPPED",
  "CAMPAIGN_CANCELLED",
  "CONTACT_IGNORED",
  "PERSONAL_CONTACT",
  "NOT_ALLOWED_LOCALLY",
  "INVALID_PHONE",
  "REPLIED",
] as const;
export type ReturnSkipReason = (typeof RETURN_SKIP_REASONS)[number];
export const RETURN_FAIL_REASONS = [
  "TRANSPORT_FAILED",
  "TRANSPORT_UNKNOWN",
  "ATTEMPTS_EXHAUSTED",
] as const;
export type ReturnFailReason = (typeof RETURN_FAIL_REASONS)[number];

type Database = PrismaClient | Prisma.TransactionClient;

export interface ReturnSettingsView {
  configured: boolean;
  dailyLimit: number;
  windowDays: number[];
  windowStart: string;
  windowEnd: string;
  leadDays: number;
  winbackDays: number;
  winbackIncentive: string | null;
  renewalMessage: string | null;
  winbackMessage: string | null;
}

export interface ReturnSettingsInput {
  dailyLimit?: number;
  windowDays?: number[];
  windowStart?: string;
  windowEnd?: string;
  leadDays?: number;
  winbackDays?: number;
  winbackIncentive?: string | null;
  renewalMessage?: string | null;
  winbackMessage?: string | null;
}

interface SettingsRow {
  dailyLimit: number;
  windowDays: number[];
  windowStartMinutes: number;
  windowEndMinutes: number;
  leadDays: number;
  winbackDays: number;
  winbackIncentive: string | null;
  renewalMessage: string | null;
  winbackMessage: string | null;
}

function minutesToClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockToMinutes(value: string): number {
  return value === "24:00" ? 1440 : minutesFromTime(value);
}

function settingsView(row: SettingsRow | null): ReturnSettingsView {
  const source = row ?? {
    ...RETURN_SETTINGS_DEFAULTS,
    windowDays: [...RETURN_SETTINGS_DEFAULTS.windowDays],
  };
  return {
    configured: row !== null,
    dailyLimit: source.dailyLimit,
    windowDays: [...source.windowDays].sort((left, right) => left - right),
    windowStart: minutesToClock(source.windowStartMinutes),
    windowEnd: minutesToClock(source.windowEndMinutes),
    leadDays: source.leadDays,
    winbackDays: source.winbackDays,
    winbackIncentive: source.winbackIncentive,
    renewalMessage: source.renewalMessage,
    winbackMessage: source.winbackMessage,
  };
}

/** Campos da configuracao que entram no registro de atividade. */
function settingsActivityFields(view: ReturnSettingsView) {
  return {
    dailyLimit: view.dailyLimit,
    windowDays: JSON.stringify(view.windowDays),
    windowStart: view.windowStart,
    windowEnd: view.windowEnd,
    leadDays: view.leadDays,
    winbackDays: view.winbackDays,
    winbackIncentive: view.winbackIncentive,
    renewalMessage: view.renewalMessage,
    winbackMessage: view.winbackMessage,
  };
}

function emptyToNull(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export interface ReturnCandidateView extends ReturnCandidate {
  sendBy: string | null;
}

export interface ReturnCandidateList {
  kind: ReturnKind;
  timezone: string;
  today: string;
  weekStart: string | null;
  weekEnd: string | null;
  days: number | null;
  candidates: ReturnCandidateView[];
  excluded: ReturnExclusionCounts;
}

export interface ReturnCandidateQuery {
  kind: ReturnKind;
  week?: "this" | "next";
  days?: number;
}

export interface ReturnPlanInput extends ReturnCandidateQuery {
  customerIds: string[];
  dailyLimit?: number;
}

export interface ReturnPlanView {
  dailyLimit: number;
  total: number;
  notFitting: string[];
  minimumDailyLimit: number | null;
  /** Ultimo dia previsto, para "a rodada termina por volta de". */
  lastPlannedDate: string | null;
}

export interface CreateReturnCampaignInput extends ReturnPlanInput {
  /** Aceite explicito de quem nao cabe: elas entram mesmo assim, sem prazo. */
  acceptNotFitting?: boolean;
}

export interface ReturnCampaignCounts {
  total: number;
  queued: number;
  sent: number;
  replied: number;
  booked: number;
  declined: number;
  skipped: number;
  failed: number;
  /** Faturado dos atendimentos marcados pela rodada e ja concluidos. */
  revenue: number;
}

export interface ReturnCampaignSummary {
  id: string;
  kind: ReturnKind;
  state: string;
  dailyLimit: number;
  incentive: string | null;
  weekStart: string | null;
  winbackDays: number | null;
  createdAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  counts: ReturnCampaignCounts;
}

export interface ReturnTargetView {
  id: string;
  customerId: string;
  customerName: string | null;
  state: string;
  reason: string | null;
  serviceName: string | null;
  expectedDate: string | null;
  lastVisitDate: string | null;
  sendBy: string | null;
  plannedDate: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  bookedAt: string | null;
  appointmentId: string | null;
  followUpState: string | null;
  followUpSentAt: string | null;
  offeredSlots: Array<{ date: string; time: string }>;
  messageBody: string | null;
}

export interface ReturnCampaignDetail extends ReturnCampaignSummary {
  messageTemplate: string | null;
  targets: ReturnTargetView[];
}

export interface CustomerReturnStatus {
  customerId: string;
  blocked: boolean;
  permanent: boolean;
  blockedUntil: string | null;
  reason: string | null;
  lastMessageAt: string | null;
}

const LIVE_CAMPAIGN_STATES = ["ACTIVE", "PAUSED"] as const;
const PENDING_TARGET_STATES = ["QUEUED", "CLAIMED"] as const;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function asDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function isBlocked(
  customer: { returnBlockedAt: Date | null; returnBlockedUntil: Date | null },
  now: Date,
): boolean {
  if (!customer.returnBlockedAt) return false;
  return (
    customer.returnBlockedUntil === null ||
    customer.returnBlockedUntil.getTime() > now.getTime()
  );
}

export class CustomerReturnService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tenantId: string,
  ) {}

  // --- Configuracao ----------------------------------------------------------

  async settings(
    database: Database = this.prisma,
  ): Promise<ReturnSettingsView> {
    const row = await database.returnSettings.findUnique({
      where: { tenantId: this.tenantId },
    });
    return settingsView(row);
  }

  async updateSettings(
    input: ReturnSettingsInput,
    context: InternalRequestContext,
  ): Promise<ReturnSettingsView> {
    return this.prisma.$transaction(async (transaction) => {
      const previous = await this.settings(transaction);
      const windowStartMinutes = clockToMinutes(
        input.windowStart ?? previous.windowStart,
      );
      const windowEndMinutes = clockToMinutes(
        input.windowEnd ?? previous.windowEnd,
      );
      if (windowStartMinutes >= windowEndMinutes) {
        throw new AppError(
          "RETURN_WINDOW_INVALID",
          "The sending window must start before it ends.",
          400,
        );
      }
      const windowDays = [
        ...new Set(input.windowDays ?? previous.windowDays),
      ].sort((left, right) => left - right);
      if (windowDays.length === 0) {
        throw new AppError(
          "RETURN_WINDOW_INVALID",
          "The sending window needs at least one day.",
          400,
        );
      }
      const data = {
        dailyLimit: input.dailyLimit ?? previous.dailyLimit,
        windowDays,
        windowStartMinutes,
        windowEndMinutes,
        leadDays: input.leadDays ?? previous.leadDays,
        winbackDays: input.winbackDays ?? previous.winbackDays,
        winbackIncentive:
          emptyToNull(input.winbackIncentive) === undefined
            ? previous.winbackIncentive
            : (emptyToNull(input.winbackIncentive) as string | null),
        renewalMessage:
          emptyToNull(input.renewalMessage) === undefined
            ? previous.renewalMessage
            : (emptyToNull(input.renewalMessage) as string | null),
        winbackMessage:
          emptyToNull(input.winbackMessage) === undefined
            ? previous.winbackMessage
            : (emptyToNull(input.winbackMessage) as string | null),
      };
      const row = await transaction.returnSettings.upsert({
        where: { tenantId: this.tenantId },
        create: { tenantId: this.tenantId, ...data },
        update: data,
      });
      const next = settingsView(row);
      const changes = diffFields(
        settingsActivityFields(previous),
        settingsActivityFields(next),
        Object.keys(settingsActivityFields(next)),
      );
      if (changes.length > 0) {
        await recordActivity(transaction, this.tenantId, {
          actor: actorFromContext(context),
          area: "SETTINGS",
          action: "settings.customer_return_updated",
          entityType: "settings",
          changes,
        });
      }
      return next;
    });
  }

  // --- Lista pre-selecionada -------------------------------------------------

  private async timezone(database: Database = this.prisma): Promise<string> {
    const calendar = await database.calendarSettings.findUnique({
      where: { tenantId: this.tenantId },
    });
    if (!calendar) {
      throw new AppError(
        "CALENDAR_SETTINGS_NOT_FOUND",
        "Calendar settings were not found for this tenant.",
        404,
      );
    }
    return calendar.timezone;
  }

  /** Historico de todas as clientes do negocio, no fuso dele. */
  private async histories(
    database: Database,
    timezone: string,
    now: Date,
  ): Promise<{
    customers: CustomerReturnHistory[];
    services: Map<string, ReturnServiceInfo>;
  }> {
    const [customers, completed, future, sent, queued, services] =
      await Promise.all([
        database.customer.findMany({
          where: { tenantId: this.tenantId },
          select: {
            id: true,
            name: true,
            phone: true,
            deactivatedAt: true,
            returnBlockedAt: true,
            returnBlockedUntil: true,
          },
        }),
        database.appointment.findMany({
          where: { tenantId: this.tenantId, status: "COMPLETED" },
          select: {
            customerId: true,
            startAt: true,
            items: { select: { serviceId: true, serviceNameSnapshot: true } },
          },
          orderBy: { startAt: "asc" },
        }),
        database.appointment.findMany({
          where: {
            tenantId: this.tenantId,
            status: "CONFIRMED",
            startAt: { gt: now },
          },
          select: { customerId: true },
        }),
        database.returnCampaignTarget.groupBy({
          by: ["customerId"],
          where: { tenantId: this.tenantId, sentAt: { not: null } },
          _max: { sentAt: true },
        }),
        database.returnCampaignTarget.findMany({
          where: {
            tenantId: this.tenantId,
            state: { in: [...PENDING_TARGET_STATES] },
            campaign: { state: { in: [...LIVE_CAMPAIGN_STATES] } },
          },
          select: { customerId: true },
        }),
        database.service.findMany({
          where: { tenantId: this.tenantId },
          select: { id: true, name: true, recurrenceIntervalDays: true },
        }),
      ]);

    const visits = new Map<string, CompletedVisit[]>();
    for (const appointment of completed) {
      const local = instantToLocalDateTime(appointment.startAt, timezone);
      const list = visits.get(appointment.customerId) ?? [];
      list.push({
        date: local.date,
        time: local.time,
        services: appointment.items.map((item) => ({
          id: item.serviceId,
          name: item.serviceNameSnapshot,
        })),
      });
      visits.set(appointment.customerId, list);
    }
    const futureSet = new Set(future.map((row) => row.customerId));
    const queuedSet = new Set(queued.map((row) => row.customerId));
    const lastSent = new Map(
      sent.map((row) => [row.customerId, row._max.sentAt ?? null]),
    );

    return {
      customers: customers
        .filter((customer) => visits.has(customer.id))
        .map((customer) => {
          const last = lastSent.get(customer.id) ?? null;
          return {
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone,
            deactivated: customer.deactivatedAt !== null,
            blocked: isBlocked(customer, now),
            hasFutureAppointment: futureSet.has(customer.id),
            lastReturnMessageDate: last
              ? instantToLocalDateTime(last, timezone).date
              : null,
            queued: queuedSet.has(customer.id),
            completed: visits.get(customer.id) ?? [],
          };
        }),
      services: new Map(services.map((service) => [service.id, service])),
    };
  }

  async candidates(query: ReturnCandidateQuery): Promise<ReturnCandidateList> {
    const timezone = await this.timezone();
    const now = await databaseNow(this.prisma);
    const today = instantToLocalDateTime(now, timezone).date;
    const settings = await this.settings();
    const { customers, services } = await this.histories(
      this.prisma,
      timezone,
      now,
    );
    if (query.kind === "RENEWAL") {
      const weekStart = addDays(mondayOf(today), query.week === "next" ? 7 : 0);
      const selection = selectRenewalCandidates({
        customers,
        services,
        today,
        weekStart,
      });
      return {
        kind: "RENEWAL",
        timezone,
        today,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        days: null,
        candidates: selection.candidates.map((candidate) => ({
          ...candidate,
          sendBy: sendByFor(candidate.expectedDate, settings.leadDays, today),
        })),
        excluded: selection.excluded,
      };
    }
    const days = query.days ?? settings.winbackDays;
    const selection = selectWinbackCandidates({
      customers,
      services,
      today,
      days,
    });
    return {
      kind: "WINBACK",
      timezone,
      today,
      weekStart: null,
      weekEnd: null,
      days,
      candidates: selection.candidates.map((candidate) => ({
        ...candidate,
        sendBy: null,
      })),
      excluded: selection.excluded,
    };
  }

  // --- Ritmo -----------------------------------------------------------------

  private async pacingContext(timezone: string, now: Date) {
    const local = instantToLocalDateTime(now, timezone);
    const dayStart = localDateTimeToInstant(local.date, "00:00", timezone);
    const [sentToday, followUpsToday, queuedAhead] = await Promise.all([
      this.prisma.returnCampaignTarget.count({
        where: { tenantId: this.tenantId, sentAt: { gte: dayStart } },
      }),
      this.prisma.returnCampaignTarget.count({
        where: { tenantId: this.tenantId, followUpSentAt: { gte: dayStart } },
      }),
      this.prisma.returnCampaignTarget.count({
        where: {
          tenantId: this.tenantId,
          state: { in: [...PENDING_TARGET_STATES] },
          campaign: { state: "ACTIVE" },
        },
      }),
    ]);
    return {
      today: local.date,
      nowMinutes: minutesFromTime(local.time),
      sentToday: sentToday + followUpsToday,
      queuedAhead,
    };
  }

  private async buildPlan(input: ReturnPlanInput): Promise<{
    list: ReturnCandidateList;
    selected: ReturnCandidateView[];
    rules: PacingRules;
    plan: PacingPlan;
    settings: ReturnSettingsView;
  }> {
    const list = await this.candidates(input);
    const wanted = new Set(input.customerIds);
    const selected = list.candidates.filter((candidate) =>
      wanted.has(candidate.customerId),
    );
    const settings = await this.settings();
    const rules: PacingRules = {
      dailyLimit: input.dailyLimit ?? settings.dailyLimit,
      windowDays: settings.windowDays,
      windowStartMinutes: clockToMinutes(settings.windowStart),
      windowEndMinutes: clockToMinutes(settings.windowEnd),
      leadDays: settings.leadDays,
    };
    const now = await databaseNow(this.prisma);
    const context = await this.pacingContext(list.timezone, now);
    const plan = planSchedule({
      targets: selected.map((candidate) => ({
        customerId: candidate.customerId,
        sendBy: candidate.sendBy,
      })),
      rules,
      today: context.today,
      nowMinutes: context.nowMinutes,
      sentToday: context.sentToday,
      queuedAhead: context.queuedAhead,
    });
    return { list, selected, rules, plan, settings };
  }

  async plan(input: ReturnPlanInput): Promise<ReturnPlanView> {
    const { selected, rules, plan } = await this.buildPlan(input);
    return planView(rules.dailyLimit, selected.length, plan);
  }

  async createCampaign(
    input: CreateReturnCampaignInput,
    context: InternalRequestContext,
  ): Promise<ReturnCampaignDetail> {
    const { list, selected, rules, plan, settings } =
      await this.buildPlan(input);
    if (selected.length === 0) {
      throw new AppError(
        RETURN_NO_CANDIDATES,
        "None of the selected customers can receive a return message now.",
        409,
      );
    }
    if (plan.notFitting.length > 0 && !input.acceptNotFitting) {
      throw new AppError(
        RETURN_PLAN_DOES_NOT_FIT,
        "Some customers do not fit the daily limit before their date.",
        409,
        planView(rules.dailyLimit, selected.length, plan),
      );
    }
    const plannedById = new Map(
      plan.targets.map((target, index) => [
        target.customerId,
        { ...target, position: index },
      ]),
    );
    const campaignId = await this.prisma.$transaction(async (transaction) => {
      const campaign = await transaction.returnCampaign.create({
        data: {
          tenantId: this.tenantId,
          kind: input.kind,
          state: "ACTIVE",
          dailyLimit: rules.dailyLimit,
          windowDays: rules.windowDays,
          windowStartMinutes: rules.windowStartMinutes,
          windowEndMinutes: rules.windowEndMinutes,
          leadDays: rules.leadDays,
          incentive:
            input.kind === "WINBACK" ? settings.winbackIncentive : null,
          messageTemplate:
            input.kind === "WINBACK"
              ? settings.winbackMessage
              : settings.renewalMessage,
          weekStart: asDate(list.weekStart),
          winbackDays: list.days,
          createdBy: context.userId,
        },
      });
      await transaction.returnCampaignTarget.createMany({
        data: selected.map((candidate) => {
          const planned = plannedById.get(candidate.customerId);
          return {
            tenantId: this.tenantId,
            campaignId: campaign.id,
            customerId: candidate.customerId,
            serviceId: candidate.serviceId,
            serviceName: candidate.serviceName,
            expectedDate: asDate(candidate.expectedDate),
            intervalDays: candidate.intervalDays,
            intervalSource: candidate.intervalSource,
            lastVisitDate: asDate(candidate.lastVisitDate),
            // Quem nao cabia e foi aceita mesmo assim sai sem prazo; o dia
            // da data esperada continua proibido na reivindicacao.
            sendBy: planned?.fits ? asDate(candidate.sendBy) : null,
            plannedDate: asDate(planned?.plannedDate ?? null),
            position: planned?.position ?? 0,
          };
        }),
      });
      await recordActivity(transaction, this.tenantId, {
        actor: actorFromContext(context),
        area: "CUSTOMERS",
        action: "customer_return.campaign_approved",
        entityType: "return_campaign",
        entityId: campaign.id,
        details: {
          kind: input.kind,
          customers: selected.length,
          dailyLimit: rules.dailyLimit,
          incentive: campaign.incentive,
        },
      });
      return campaign.id;
    });
    return this.campaign(campaignId);
  }

  // --- Acompanhamento --------------------------------------------------------

  /**
   * Agendou depois da mensagem: o primeiro atendimento nao cancelado criado
   * depois do envio (e para depois dele), em ate 30 dias, liga o envio ao
   * agendamento. Lido aqui,
   * e nao no caminho de escrita da agenda, para que nenhuma mutacao de
   * atendimento dependa do retorno.
   */
  async reconcileBookings(database: Database = this.prisma): Promise<number> {
    const now = await databaseNow(database);
    const open = await database.returnCampaignTarget.findMany({
      where: {
        tenantId: this.tenantId,
        state: { in: ["SENT", "REPLIED"] },
        appointmentId: null,
        sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
      select: { id: true, customerId: true, sentAt: true },
    });
    let linked = 0;
    for (const target of open) {
      const appointment = await database.appointment.findFirst({
        where: {
          tenantId: this.tenantId,
          customerId: target.customerId,
          status: { not: "CANCELLED" },
          // Marcado depois da mensagem e para depois dela: atendimento
          // passado lançado agora não é volta pela rodada.
          createdAt: { gte: target.sentAt as Date },
          startAt: { gte: target.sentAt as Date },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      });
      if (!appointment) continue;
      const updated = await database.returnCampaignTarget.updateMany({
        where: {
          tenantId: this.tenantId,
          id: target.id,
          state: { in: ["SENT", "REPLIED"] },
        },
        data: {
          state: "BOOKED",
          appointmentId: appointment.id,
          bookedAt: appointment.createdAt,
        },
      });
      linked += updated.count;
    }
    return linked;
  }

  async listCampaigns(): Promise<ReturnCampaignSummary[]> {
    await this.reconcileBookings();
    const campaigns = await this.prisma.returnCampaign.findMany({
      where: { tenantId: this.tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const counts = await this.countsFor(
      campaigns.map((campaign) => campaign.id),
    );
    return campaigns.map((campaign) =>
      campaignSummary(campaign, counts.get(campaign.id) ?? emptyCounts()),
    );
  }

  async campaign(id: string): Promise<ReturnCampaignDetail> {
    await this.reconcileBookings();
    const campaign = await this.prisma.returnCampaign.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id } },
      include: {
        targets: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: { customer: { select: { name: true } } },
        },
      },
    });
    if (!campaign) {
      throw new AppError(
        RETURN_CAMPAIGN_NOT_FOUND,
        "Return campaign was not found.",
        404,
      );
    }
    const counts = await this.countsFor([campaign.id]);
    return {
      ...campaignSummary(campaign, counts.get(campaign.id) ?? emptyCounts()),
      messageTemplate: campaign.messageTemplate,
      targets: campaign.targets.map((target) => ({
        id: target.id,
        customerId: target.customerId,
        customerName: target.customer?.name ?? null,
        state: target.state,
        reason: target.reason,
        serviceName: target.serviceName,
        expectedDate: dateOnly(target.expectedDate),
        lastVisitDate: dateOnly(target.lastVisitDate),
        sendBy: dateOnly(target.sendBy),
        plannedDate: dateOnly(target.plannedDate),
        sentAt: iso(target.sentAt),
        repliedAt: iso(target.repliedAt),
        bookedAt: iso(target.bookedAt),
        appointmentId: target.appointmentId,
        followUpState: target.followUpState,
        followUpSentAt: iso(target.followUpSentAt),
        offeredSlots: parseSlots(target.offeredSlots),
        messageBody: target.messageBody,
      })),
    };
  }

  private async countsFor(
    campaignIds: string[],
  ): Promise<Map<string, ReturnCampaignCounts>> {
    const result = new Map<string, ReturnCampaignCounts>();
    if (campaignIds.length === 0) return result;
    const targets = await this.prisma.returnCampaignTarget.findMany({
      where: { tenantId: this.tenantId, campaignId: { in: campaignIds } },
      select: {
        campaignId: true,
        state: true,
        sentAt: true,
        repliedAt: true,
        appointmentId: true,
      },
    });
    const appointmentIds = targets
      .map((target) => target.appointmentId)
      .filter((id): id is string => Boolean(id));
    const appointments =
      appointmentIds.length === 0
        ? []
        : await this.prisma.appointment.findMany({
            where: {
              tenantId: this.tenantId,
              id: { in: appointmentIds },
              status: "COMPLETED",
            },
            select: {
              id: true,
              finalValue: true,
              items: {
                select: { priceTypeSnapshot: true, priceSnapshot: true },
              },
            },
          });
    const valueById = new Map(
      appointments.map((appointment) => [
        appointment.id,
        appointmentValueCents({
          finalValue: appointment.finalValue,
          items: appointment.items.map((item) => ({
            priceType: item.priceTypeSnapshot,
            price: item.priceSnapshot,
          })),
        } as unknown as RevenueAppointmentRow) ?? 0,
      ]),
    );
    for (const target of targets) {
      const counts = result.get(target.campaignId) ?? emptyCounts();
      counts.total += 1;
      if (target.state === "QUEUED" || target.state === "CLAIMED")
        counts.queued += 1;
      if (target.sentAt) counts.sent += 1;
      if (target.repliedAt) counts.replied += 1;
      if (target.state === "BOOKED") counts.booked += 1;
      if (target.state === "DECLINED") counts.declined += 1;
      if (target.state === "SKIPPED") counts.skipped += 1;
      if (target.state === "FAILED") counts.failed += 1;
      if (target.appointmentId) {
        counts.revenue += (valueById.get(target.appointmentId) ?? 0) / 100;
      }
      result.set(target.campaignId, counts);
    }
    return result;
  }

  async changeCampaignState(
    id: string,
    action: "pause" | "resume" | "cancel",
    context: InternalRequestContext,
  ): Promise<ReturnCampaignDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const campaign = await transaction.returnCampaign.findUnique({
        where: { tenantId_id: { tenantId: this.tenantId, id } },
      });
      if (!campaign) {
        throw new AppError(
          RETURN_CAMPAIGN_NOT_FOUND,
          "Return campaign was not found.",
          404,
        );
      }
      const now = await databaseNow(transaction);
      const allowed =
        (action === "pause" && campaign.state === "ACTIVE") ||
        (action === "resume" && campaign.state === "PAUSED") ||
        (action === "cancel" &&
          (campaign.state === "ACTIVE" || campaign.state === "PAUSED"));
      if (!allowed) {
        throw new AppError(
          RETURN_CAMPAIGN_STATE_CONFLICT,
          `A ${campaign.state} campaign cannot be ${action}d.`,
          409,
          { state: campaign.state },
        );
      }
      if (action === "pause") {
        await transaction.returnCampaign.update({
          where: { id },
          data: { state: "PAUSED", pausedAt: now },
        });
      } else if (action === "resume") {
        await transaction.returnCampaign.update({
          where: { id },
          data: { state: "ACTIVE", pausedAt: null },
        });
      } else {
        await transaction.returnCampaign.update({
          where: { id },
          data: { state: "CANCELLED", cancelledAt: now },
        });
        // O que falta sai da fila com motivo; o que ja saiu fica como esta.
        await transaction.returnCampaignTarget.updateMany({
          where: { tenantId: this.tenantId, campaignId: id, state: "QUEUED" },
          data: {
            state: "SKIPPED",
            reason: "CAMPAIGN_CANCELLED",
            settledAt: now,
          },
        });
      }
      await recordActivity(transaction, this.tenantId, {
        actor: actorFromContext(context),
        area: "CUSTOMERS",
        action: `customer_return.campaign_${action === "pause" ? "paused" : action === "resume" ? "resumed" : "cancelled"}`,
        entityType: "return_campaign",
        entityId: id,
        details: { kind: campaign.kind },
      });
    });
    return this.campaign(id);
  }

  async skipTarget(
    campaignId: string,
    targetId: string,
    context: InternalRequestContext,
  ): Promise<ReturnCampaignDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.returnCampaignTarget.findUnique({
        where: { tenantId_id: { tenantId: this.tenantId, id: targetId } },
        include: { customer: { select: { name: true } } },
      });
      if (!target || target.campaignId !== campaignId) {
        throw new AppError(
          RETURN_TARGET_NOT_FOUND,
          "Return campaign target was not found.",
          404,
        );
      }
      if (target.state !== "QUEUED") {
        throw new AppError(
          RETURN_CAMPAIGN_STATE_CONFLICT,
          "Only a queued customer can be taken out of the round.",
          409,
          { state: target.state },
        );
      }
      const now = await databaseNow(transaction);
      await transaction.returnCampaignTarget.update({
        where: { id: targetId },
        data: { state: "SKIPPED", reason: "OWNER_SKIPPED", settledAt: now },
      });
      await completeIfDrained(transaction, this.tenantId, campaignId, now);
      await recordActivity(transaction, this.tenantId, {
        actor: actorFromContext(context),
        area: "CUSTOMERS",
        action: "customer_return.target_skipped",
        entityType: "customer",
        entityId: target.customerId,
        entityLabel: target.customer?.name ?? null,
        details: { campaignId },
      });
    });
    return this.campaign(campaignId);
  }

  // --- Bloqueio da cliente ---------------------------------------------------

  async customerStatus(customerId: string): Promise<CustomerReturnStatus> {
    const now = await databaseNow(this.prisma);
    const customer = await this.prisma.customer.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
      select: {
        id: true,
        returnBlockedAt: true,
        returnBlockedUntil: true,
        returnBlockReason: true,
      },
    });
    if (!customer) {
      throw new AppError("CUSTOMER_NOT_FOUND", "Customer was not found.", 404);
    }
    const last = await this.prisma.returnCampaignTarget.findFirst({
      where: { tenantId: this.tenantId, customerId, sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    const blocked = isBlocked(customer, now);
    return {
      customerId,
      blocked,
      permanent: blocked && customer.returnBlockedUntil === null,
      blockedUntil: blocked ? iso(customer.returnBlockedUntil) : null,
      reason: blocked ? customer.returnBlockReason : null,
      lastMessageAt: iso(last?.sentAt),
    };
  }

  /** A profissional bloqueia ou libera; liberar desfaz inclusive o "pare". */
  async setCustomerBlocked(
    customerId: string,
    blocked: boolean,
    context: InternalRequestContext,
  ): Promise<CustomerReturnStatus> {
    await this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
        select: { id: true, name: true, returnBlockedAt: true },
      });
      if (!customer) {
        throw new AppError(
          "CUSTOMER_NOT_FOUND",
          "Customer was not found.",
          404,
        );
      }
      const now = await databaseNow(transaction);
      await transaction.customer.update({
        where: { tenantId_id: { tenantId: this.tenantId, id: customerId } },
        data: blocked
          ? {
              returnBlockedAt: now,
              returnBlockedUntil: null,
              returnBlockReason: "OWNER",
            }
          : {
              returnBlockedAt: null,
              returnBlockedUntil: null,
              returnBlockReason: null,
            },
      });
      if (blocked) {
        await skipQueuedForCustomer(
          transaction,
          this.tenantId,
          customerId,
          now,
        );
      }
      await recordActivity(transaction, this.tenantId, {
        actor: actorFromContext(context),
        area: "CUSTOMERS",
        action: blocked
          ? "customer.return_messages_blocked"
          : "customer.return_messages_allowed",
        entityType: "customer",
        entityId: customerId,
        entityLabel: customer.name,
      });
    });
    return this.customerStatus(customerId);
  }

  // --- Respostas que a IA relata ---------------------------------------------

  async recordReply(targetId: string): Promise<{ applied: boolean }> {
    const now = await databaseNow(this.prisma);
    const target = await this.requireTarget(targetId);
    const updated = await this.prisma.returnCampaignTarget.updateMany({
      where: { tenantId: this.tenantId, id: target.id, repliedAt: null },
      data: {
        repliedAt: now,
        ...(target.state === "SENT" ? { state: "REPLIED" as const } : {}),
      },
    });
    return { applied: updated.count === 1 };
  }

  /**
   * Recusa ("agora nao"): sem retorno por 90 dias. Pedido para parar:
   * bloqueio permanente, que so a profissional desfaz. Em qualquer dos dois a
   * cliente sai da fila das outras rodadas.
   */
  async recordAnswer(
    targetId: string,
    answer: "DECLINED" | "STOPPED",
    context: InternalRequestContext,
  ): Promise<CustomerReturnStatus> {
    const target = await this.requireTarget(targetId);
    await this.prisma.$transaction(async (transaction) => {
      const now = await databaseNow(transaction);
      await transaction.returnCampaignTarget.update({
        where: { id: target.id },
        data: {
          state: target.state === "BOOKED" ? "BOOKED" : "DECLINED",
          reason: answer,
          declinedAt: now,
          repliedAt: target.repliedAt ?? now,
        },
      });
      const customer = await transaction.customer.findUnique({
        where: {
          tenantId_id: { tenantId: this.tenantId, id: target.customerId },
        },
        select: {
          name: true,
          returnBlockedAt: true,
          returnBlockedUntil: true,
        },
      });
      const alreadyPermanent =
        customer?.returnBlockedAt && customer.returnBlockedUntil === null;
      if (answer === "STOPPED" || !alreadyPermanent) {
        await transaction.customer.update({
          where: {
            tenantId_id: { tenantId: this.tenantId, id: target.customerId },
          },
          data: {
            returnBlockedAt: now,
            returnBlockedUntil:
              answer === "STOPPED"
                ? null
                : new Date(now.getTime() + DECLINE_BLOCK_DAYS * 86_400_000),
            returnBlockReason: answer,
          },
        });
      }
      await skipQueuedForCustomer(
        transaction,
        this.tenantId,
        target.customerId,
        now,
      );
      await recordActivity(transaction, this.tenantId, {
        actor: actorFromContext(context),
        area: "CUSTOMERS",
        action:
          answer === "STOPPED"
            ? "customer.return_stopped"
            : "customer.return_declined",
        entityType: "customer",
        entityId: target.customerId,
        entityLabel: customer?.name ?? null,
      });
    });
    return this.customerStatus(target.customerId);
  }

  private async requireTarget(targetId: string) {
    const target = await this.prisma.returnCampaignTarget.findUnique({
      where: { tenantId_id: { tenantId: this.tenantId, id: targetId } },
    });
    if (!target) {
      throw new AppError(
        RETURN_TARGET_NOT_FOUND,
        "Return campaign target was not found.",
        404,
      );
    }
    return target;
  }
}

function planView(
  dailyLimit: number,
  total: number,
  plan: PacingPlan,
): ReturnPlanView {
  const dates = plan.targets
    .map((target) => target.plannedDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  return {
    dailyLimit,
    total,
    notFitting: plan.notFitting,
    minimumDailyLimit: plan.minimumDailyLimit,
    lastPlannedDate: dates.at(-1) ?? null,
  };
}

function emptyCounts(): ReturnCampaignCounts {
  return {
    total: 0,
    queued: 0,
    sent: 0,
    replied: 0,
    booked: 0,
    declined: 0,
    skipped: 0,
    failed: 0,
    revenue: 0,
  };
}

function campaignSummary(
  campaign: {
    id: string;
    kind: string;
    state: string;
    dailyLimit: number;
    incentive: string | null;
    weekStart: Date | null;
    winbackDays: number | null;
    createdAt: Date;
    pausedAt: Date | null;
    cancelledAt: Date | null;
    completedAt: Date | null;
  },
  counts: ReturnCampaignCounts,
): ReturnCampaignSummary {
  return {
    id: campaign.id,
    kind: campaign.kind as ReturnKind,
    state: campaign.state,
    dailyLimit: campaign.dailyLimit,
    incentive: campaign.incentive,
    weekStart: dateOnly(campaign.weekStart),
    winbackDays: campaign.winbackDays,
    createdAt: campaign.createdAt.toISOString(),
    pausedAt: iso(campaign.pausedAt),
    cancelledAt: iso(campaign.cancelledAt),
    completedAt: iso(campaign.completedAt),
    counts: { ...counts, revenue: Math.round(counts.revenue * 100) / 100 },
  };
}

export function parseSlots(
  value: unknown,
): Array<{ date: string; time: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (slot): slot is { date: string; time: string } =>
      typeof slot === "object" &&
      slot !== null &&
      typeof (slot as { date?: unknown }).date === "string" &&
      typeof (slot as { time?: unknown }).time === "string",
  );
}

/** Rodada ativa sem ninguem na fila vira `DONE`. */
export async function completeIfDrained(
  database: Database,
  tenantId: string,
  campaignId: string,
  now: Date,
): Promise<void> {
  const pending = await database.returnCampaignTarget.count({
    where: {
      tenantId,
      campaignId,
      state: { in: [...PENDING_TARGET_STATES] },
    },
  });
  if (pending > 0) return;
  await database.returnCampaign.updateMany({
    where: { tenantId, id: campaignId, state: "ACTIVE" },
    data: { state: "DONE", completedAt: now },
  });
}

async function skipQueuedForCustomer(
  database: Database,
  tenantId: string,
  customerId: string,
  now: Date,
): Promise<void> {
  const queued = await database.returnCampaignTarget.findMany({
    where: { tenantId, customerId, state: "QUEUED" },
    select: { id: true, campaignId: true },
  });
  for (const target of queued) {
    await database.returnCampaignTarget.update({
      where: { id: target.id },
      data: { state: "SKIPPED", reason: "OPTED_OUT", settledAt: now },
    });
    await completeIfDrained(database, tenantId, target.campaignId, now);
  }
}
