import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  addDays,
  instantToLocalDateTime,
  localDateTimeToInstant,
  minutesFromTime,
} from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AvenlyAvailability } from "../availability/avenly-availability.js";
import { databaseNow } from "../calendar/write-policy.js";
import {
  type CompletedVisit,
  computeHabit,
  type CustomerHabit,
  daysBetween,
  FOLLOW_UP_AFTER_DAYS,
  type OfferSlot,
  pickOfferedSlots,
  randomSendGapMinutes,
  RENEWAL_RECONTACT_DAYS,
  type ReturnKind,
  SLOT_SEARCH_DAYS_AFTER_EXPECTED,
  WINBACK_RECONTACT_DAYS,
  withinSendWindow,
} from "./return-rules.js";
import {
  completeIfDrained,
  CustomerReturnService,
  parseSlots,
  RETURN_FAIL_REASONS,
  RETURN_SKIP_REASONS,
  RETURN_TARGET_NOT_FOUND,
  type ReturnFailReason,
  type ReturnSkipReason,
} from "./return-service.js";

/**
 * Reivindicacao e liquidacao dos envios de retorno (D-202), no padrao das
 * intencoes de lembrete (Goal021): o dono escolhe **quem** e **quando**, com o
 * ritmo da rodada, e entrega os fatos prontos; a IA envia e liquida.
 *
 * O ritmo e por negocio: no maximo uma mensagem por varredura, nunca antes
 * do intervalo sorteado depois do envio anterior, so dentro da janela da
 * rodada e no maximo o limite do dia. Antes de cada envio as regras sao
 * conferidas de novo: quem marcou, foi desativada, pediu para parar ou ja
 * passou do prazo sai da rodada sem mensagem.
 */

export const RETURN_LEASE_LOST = "RETURN_LEASE_LOST";
export const RETURN_SETTLEMENT_INVALID = "RETURN_SETTLEMENT_INVALID";
const MAX_ATTEMPTS = 3;
/** Sem IA ou sem canal agora: o negocio tenta de novo daqui a 30 minutos. */
const DEFER_MINUTES = 30;

type DispatchDatabase = PrismaClient;

export type ReturnLeaseKind = "INITIAL" | "FOLLOW_UP";

/** Fatos prontos para a IA compor a mensagem. Nunca texto final. */
export interface ReturnMessageFacts {
  kind: ReturnKind;
  followUp: boolean;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  serviceName: string | null;
  timezone: string;
  /** Hoje no fuso do negocio, para "na quinta", "amanha". */
  today: string;
  expectedDate: string | null;
  intervalDays: number | null;
  intervalSource: string | null;
  lastVisitDate: string | null;
  daysSinceLastVisit: number | null;
  /** Dois horarios reais livres agora (so na primeira mensagem da Renovacao). */
  offeredSlots: OfferSlot[];
  habit: CustomerHabit | null;
  /** Incentivo do Resgate, texto da profissional. */
  incentive: string | null;
  /** Texto-base aprovado; nulo e o padrao pelo estilo. */
  messageTemplate: string | null;
}

export interface ClaimedReturnTarget {
  id: string;
  tenantId: string;
  campaignId: string;
  leaseKind: ReturnLeaseKind;
  leaseToken: string;
  leaseExpiresAt: string;
  correlationId: string;
  sentAt: string | null;
  facts: ReturnMessageFacts;
}

export interface ClaimReturnTargetsInput {
  owner?: string;
  leaseTtlSeconds?: number;
  /** Teto de negocios por varredura. */
  tenantLimit?: number;
}

export interface ClaimReturnTargetsResult {
  claimed: ClaimedReturnTarget[];
  /** Sairam da rodada na revalidacao, sem mensagem. */
  skipped: number;
  released: number;
}

export function returnCorrelationId(
  targetId: string,
  kind: ReturnLeaseKind,
): string {
  return `return:${targetId}:${kind === "INITIAL" ? "initial" : "followup"}`;
}

/** Dono e lease saem juntos. */
const RELEASED = {
  leaseToken: null,
  leaseKind: null,
  leaseExpiresAt: null,
} as const;

async function recoverExpiredLeases(prisma: DispatchDatabase): Promise<number> {
  const now = await databaseNow(prisma);
  const exhausted = await prisma.returnCampaignTarget.updateMany({
    where: {
      state: "CLAIMED",
      leaseExpiresAt: { lte: now },
      attemptCount: { gte: MAX_ATTEMPTS - 1 },
    },
    data: {
      state: "FAILED",
      reason: "ATTEMPTS_EXHAUSTED",
      attemptCount: { increment: 1 },
      settledAt: now,
      ...RELEASED,
    },
  });
  const released = await prisma.returnCampaignTarget.updateMany({
    where: { state: "CLAIMED", leaseExpiresAt: { lte: now } },
    data: { state: "QUEUED", attemptCount: { increment: 1 }, ...RELEASED },
  });
  // Lembrete com lease vencido: o lease sai, o lembrete continua pendente.
  const followUps = await prisma.returnCampaignTarget.updateMany({
    where: {
      leaseKind: "FOLLOW_UP",
      leaseExpiresAt: { lte: now },
    },
    data: { ...RELEASED },
  });
  return exhausted.count + released.count + followUps.count;
}

interface CampaignRow {
  id: string;
  tenantId: string;
  kind: ReturnKind;
  state: string;
  dailyLimit: number;
  windowDays: number[];
  windowStartMinutes: number;
  windowEndMinutes: number;
  leadDays: number;
  incentive: string | null;
  messageTemplate: string | null;
  nextSendNotBefore: Date | null;
}

/**
 * Varre os negocios com rodada ativa (ou lembrete pendente) e reivindica no
 * maximo um envio por negocio. Atravessa negocios de proposito, como a fila
 * de lembretes: quem entrega atende todos.
 */
export async function claimDueReturnTargets(
  prisma: DispatchDatabase,
  input: ClaimReturnTargetsInput = {},
): Promise<ClaimReturnTargetsResult> {
  const ttlSeconds = input.leaseTtlSeconds ?? 120;
  const tenantLimit = input.tenantLimit ?? 50;
  const released = await recoverExpiredLeases(prisma);

  const now = await databaseNow(prisma);
  // Rodada `DONE` so interessa enquanto pode haver lembrete pendente.
  const campaigns = (await prisma.returnCampaign.findMany({
    where: {
      OR: [
        { state: "ACTIVE" },
        {
          state: "DONE",
          completedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  })) as unknown as CampaignRow[];
  const byTenant = new Map<string, CampaignRow[]>();
  for (const campaign of campaigns) {
    const list = byTenant.get(campaign.tenantId) ?? [];
    list.push(campaign);
    byTenant.set(campaign.tenantId, list);
  }

  const claimed: ClaimedReturnTarget[] = [];
  let skipped = 0;
  let visited = 0;
  for (const [tenantId, tenantCampaigns] of byTenant) {
    if (visited >= tenantLimit) break;
    visited += 1;
    const outcome = await claimForTenant(prisma, tenantId, tenantCampaigns, {
      ttlSeconds,
    });
    skipped += outcome.skipped;
    if (outcome.claimed) claimed.push(outcome.claimed);
  }
  return { claimed, skipped, released };
}

async function claimForTenant(
  prisma: DispatchDatabase,
  tenantId: string,
  campaigns: CampaignRow[],
  options: { ttlSeconds: number },
): Promise<{ claimed: ClaimedReturnTarget | null; skipped: number }> {
  const calendar = await prisma.calendarSettings.findUnique({
    where: { tenantId },
  });
  if (!calendar) return { claimed: null, skipped: 0 };
  const timezone = calendar.timezone;
  const service = new CustomerReturnService(prisma, tenantId);
  await service.reconcileBookings();

  const now = await databaseNow(prisma);
  // Ritmo do negocio: o intervalo sorteado vale entre rodadas tambem.
  const notBefore = campaigns
    .map((campaign) => campaign.nextSendNotBefore?.getTime() ?? 0)
    .reduce((max, value) => Math.max(max, value), 0);
  if (notBefore > now.getTime()) return { claimed: null, skipped: 0 };

  const local = instantToLocalDateTime(now, timezone);
  const nowMinutes = minutesFromTime(local.time);
  const dayStart = localDateTimeToInstant(local.date, "00:00", timezone);
  const [sentToday, followUpsToday] = await Promise.all([
    prisma.returnCampaignTarget.count({
      where: { tenantId, sentAt: { gte: dayStart } },
    }),
    prisma.returnCampaignTarget.count({
      where: { tenantId, followUpSentAt: { gte: dayStart } },
    }),
  ]);
  const usedToday = sentToday + followUpsToday;
  const open = campaigns.filter(
    (campaign) =>
      withinSendWindow(campaign, local.date, nowMinutes) &&
      usedToday < campaign.dailyLimit,
  );
  if (open.length === 0) return { claimed: null, skipped: 0 };

  let skipped = 0;
  const activeIds = open
    .filter((campaign) => campaign.state === "ACTIVE")
    .map((campaign) => campaign.id);
  const queued = await prisma.returnCampaignTarget.findMany({
    where: { tenantId, campaignId: { in: activeIds }, state: "QUEUED" },
    orderBy: [{ sendBy: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    take: 20,
  });
  for (const target of queued) {
    const campaign = open.find((item) => item.id === target.campaignId);
    if (!campaign) continue;
    const result = await claimOne(prisma, {
      tenantId,
      targetId: target.id,
      campaign,
      timezone,
      today: local.date,
      leaseKind: "INITIAL",
      ttlSeconds: options.ttlSeconds,
    });
    if (result === "skipped") skipped += 1;
    else if (result) return { claimed: result, skipped };
  }

  // Lembrete unico: 3 dias sem resposta, mesma janela e mesmo ritmo.
  const followUpCutoff = new Date(
    now.getTime() - FOLLOW_UP_AFTER_DAYS * 86_400_000,
  );
  const followUps = await prisma.returnCampaignTarget.findMany({
    where: {
      tenantId,
      campaignId: { in: open.map((campaign) => campaign.id) },
      state: "SENT",
      repliedAt: null,
      followUpState: null,
      leaseToken: null,
      sentAt: { lte: followUpCutoff },
    },
    orderBy: { sentAt: "asc" },
    take: 20,
  });
  for (const target of followUps) {
    const campaign = open.find((item) => item.id === target.campaignId);
    if (!campaign) continue;
    const result = await claimOne(prisma, {
      tenantId,
      targetId: target.id,
      campaign,
      timezone,
      today: local.date,
      leaseKind: "FOLLOW_UP",
      ttlSeconds: options.ttlSeconds,
    });
    if (result === "skipped") skipped += 1;
    else if (result) return { claimed: result, skipped };
  }
  return { claimed: null, skipped };
}

interface TargetRow {
  id: string;
  tenantId: string;
  campaignId: string;
  customerId: string;
  state: string;
  serviceId: string | null;
  serviceName: string | null;
  expectedDate: Date | null;
  intervalDays: number | null;
  intervalSource: string | null;
  lastVisitDate: Date | null;
  sendBy: Date | null;
  sentAt: Date | null;
  offeredSlots: unknown;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Revalidacao contra o estado do momento: desativada, sem telefone, com
 * agendamento futuro, bloqueada, chamada ha pouco por outra rodada ou com o
 * prazo vencido sai sem mensagem, com motivo.
 */
async function refusalFor(
  transaction: Prisma.TransactionClient,
  target: TargetRow,
  kind: ReturnKind,
  today: string,
  now: Date,
  leaseKind: ReturnLeaseKind,
  timezone: string,
): Promise<ReturnSkipReason | null> {
  const customer = await transaction.customer.findUnique({
    where: {
      tenantId_id: { tenantId: target.tenantId, id: target.customerId },
    },
    select: {
      phone: true,
      deactivatedAt: true,
      returnBlockedAt: true,
      returnBlockedUntil: true,
    },
  });
  if (!customer || customer.deactivatedAt) return "DEACTIVATED";
  if (!customer.phone?.trim()) return "NO_PHONE";
  if (
    customer.returnBlockedAt &&
    (customer.returnBlockedUntil === null ||
      customer.returnBlockedUntil.getTime() > now.getTime())
  ) {
    return "OPTED_OUT";
  }
  const future = await transaction.appointment.count({
    where: {
      tenantId: target.tenantId,
      customerId: target.customerId,
      status: "CONFIRMED",
      startAt: { gt: now },
    },
  });
  if (future > 0) return "HAS_APPOINTMENT";
  if (leaseKind === "FOLLOW_UP") return null;

  const sendBy = dateOnly(target.sendBy);
  if (sendBy && today > sendBy) return "DEADLINE_PASSED";
  const expected = dateOnly(target.expectedDate);
  // O dia da data esperada nunca recebe, nem para quem entrou sem prazo,
  // a nao ser que a data ja tivesse chegado quando a rodada foi aprovada.
  if (expected && !sendBy && today === expected && kind === "RENEWAL") {
    const campaign = await transaction.returnCampaign.findUnique({
      where: { id: target.campaignId },
      select: { createdAt: true },
    });
    const approvedOn = campaign
      ? instantToLocalDateTime(campaign.createdAt, timezone).date
      : today;
    if (approvedOn < expected) return "DEADLINE_PASSED";
  }
  const recontactDays =
    kind === "RENEWAL" ? RENEWAL_RECONTACT_DAYS : WINBACK_RECONTACT_DAYS;
  const recent = await transaction.returnCampaignTarget.count({
    where: {
      tenantId: target.tenantId,
      customerId: target.customerId,
      id: { not: target.id },
      sentAt: { gte: new Date(now.getTime() - recontactDays * 86_400_000) },
    },
  });
  if (recent > 0) return "RECENTLY_CONTACTED";
  return null;
}

async function claimOne(
  prisma: DispatchDatabase,
  input: {
    tenantId: string;
    targetId: string;
    campaign: CampaignRow;
    timezone: string;
    today: string;
    leaseKind: ReturnLeaseKind;
    ttlSeconds: number;
  },
): Promise<ClaimedReturnTarget | "skipped" | null> {
  const prepared = await prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + input.ttlSeconds * 1_000);
    const claim =
      input.leaseKind === "INITIAL"
        ? await transaction.returnCampaignTarget.updateMany({
            where: {
              tenantId: input.tenantId,
              id: input.targetId,
              state: "QUEUED",
            },
            data: {
              state: "CLAIMED",
              leaseToken,
              leaseKind: "INITIAL",
              leaseExpiresAt,
            },
          })
        : await transaction.returnCampaignTarget.updateMany({
            where: {
              tenantId: input.tenantId,
              id: input.targetId,
              state: "SENT",
              followUpState: null,
              leaseToken: null,
            },
            data: { leaseToken, leaseKind: "FOLLOW_UP", leaseExpiresAt },
          });
    if (claim.count !== 1) return null;
    const target = (await transaction.returnCampaignTarget.findUnique({
      where: { id: input.targetId },
    })) as unknown as TargetRow;
    const refusal = await refusalFor(
      transaction,
      target,
      input.campaign.kind,
      input.today,
      now,
      input.leaseKind,
      input.timezone,
    );
    if (refusal) {
      await transaction.returnCampaignTarget.update({
        where: { id: target.id },
        data:
          input.leaseKind === "INITIAL"
            ? { state: "SKIPPED", reason: refusal, settledAt: now, ...RELEASED }
            : { followUpState: "SKIPPED", ...RELEASED },
      });
      await completeIfDrained(
        transaction,
        input.tenantId,
        target.campaignId,
        now,
      );
      return "skipped" as const;
    }
    return { target, leaseToken, leaseExpiresAt, now };
  });
  if (prepared === null || prepared === "skipped") return prepared;

  const { target, leaseToken, leaseExpiresAt } = prepared;
  const customer = await prisma.customer.findUnique({
    where: { tenantId_id: { tenantId: input.tenantId, id: target.customerId } },
    select: { name: true, phone: true },
  });
  const visits = await completedVisits(
    prisma,
    input.tenantId,
    target.customerId,
    input.timezone,
  );
  const habit = computeHabit(visits);
  const expectedDate = dateOnly(target.expectedDate);
  let offeredSlots = parseSlots(target.offeredSlots);
  if (
    input.leaseKind === "INITIAL" &&
    input.campaign.kind === "RENEWAL" &&
    target.serviceId
  ) {
    offeredSlots = await offerSlots(prisma, {
      tenantId: input.tenantId,
      timezone: input.timezone,
      serviceId: target.serviceId,
      today: input.today,
      expectedDate,
      habit,
    });
    await prisma.returnCampaignTarget.update({
      where: { id: target.id },
      data: { offeredSlots: offeredSlots },
    });
  }
  const correlationId = returnCorrelationId(target.id, input.leaseKind);
  if (input.leaseKind === "INITIAL") {
    await prisma.returnCampaignTarget.update({
      where: { id: target.id },
      data: { outboundCorrelationId: correlationId },
    });
  }
  const lastVisitDate = dateOnly(target.lastVisitDate);
  return {
    id: target.id,
    tenantId: input.tenantId,
    campaignId: target.campaignId,
    leaseKind: input.leaseKind,
    leaseToken,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
    correlationId,
    sentAt: target.sentAt ? target.sentAt.toISOString() : null,
    facts: {
      kind: input.campaign.kind,
      followUp: input.leaseKind === "FOLLOW_UP",
      customerId: target.customerId,
      customerName: customer?.name ?? null,
      customerPhone: (customer?.phone ?? "").trim(),
      serviceName: target.serviceName,
      timezone: input.timezone,
      today: input.today,
      expectedDate,
      intervalDays: target.intervalDays,
      intervalSource: target.intervalSource,
      lastVisitDate,
      daysSinceLastVisit: lastVisitDate
        ? daysBetween(lastVisitDate, input.today)
        : null,
      offeredSlots,
      habit,
      incentive: input.campaign.incentive,
      messageTemplate: input.campaign.messageTemplate,
    },
  };
}

async function completedVisits(
  prisma: DispatchDatabase,
  tenantId: string,
  customerId: string,
  timezone: string,
): Promise<CompletedVisit[]> {
  const rows = await prisma.appointment.findMany({
    where: { tenantId, customerId, status: "COMPLETED" },
    orderBy: { startAt: "desc" },
    take: 10,
    select: {
      startAt: true,
      items: { select: { serviceId: true, serviceNameSnapshot: true } },
    },
  });
  return rows.map((row) => {
    const local = instantToLocalDateTime(row.startAt, timezone);
    return {
      date: local.date,
      time: local.time,
      services: row.items.map((item) => ({
        id: item.serviceId,
        name: item.serviceNameSnapshot,
      })),
    };
  });
}

/**
 * Dois horarios reais livres agora, da manha seguinte ate 7 dias depois da
 * data esperada. Servico inativo ou sem duracao nao tem oferta: a mensagem
 * pergunta em vez de inventar horario.
 */
async function offerSlots(
  prisma: DispatchDatabase,
  input: {
    tenantId: string;
    timezone: string;
    serviceId: string;
    today: string;
    expectedDate: string | null;
    habit: CustomerHabit | null;
  },
): Promise<OfferSlot[]> {
  const start = addDays(input.today, 1);
  const anchor =
    input.expectedDate && input.expectedDate > start
      ? input.expectedDate
      : start;
  const end = addDays(anchor, SLOT_SEARCH_DAYS_AFTER_EXPECTED);
  try {
    const slots = await new AvenlyAvailability(
      prisma,
      input.tenantId,
      input.timezone,
    ).getAvailableSlots({
      serviceIds: [input.serviceId],
      startDate: start,
      days: daysBetween(start, end) + 1,
      maxSlots: 2_000,
    });
    return pickOfferedSlots({
      slots: slots.map((slot) => ({ date: slot.date, time: slot.startTime })),
      habit: input.habit,
      anchorDate: anchor,
    });
  } catch {
    return [];
  }
}

export type ReturnSettlementOutcome =
  "SENT" | "FAILED" | "SKIPPED" | "DEFERRED";

export interface SettleReturnTargetInput {
  tenantId: string;
  targetId: string;
  leaseToken: string;
  outcome: ReturnSettlementOutcome;
  reason?: string | null;
  messageBody?: string | null;
}

export interface SettleReturnTargetResult {
  applied: boolean;
  state: string;
  followUpState: string | null;
}

/**
 * Liquidacao idempotente: quem nao detem mais o lease e recusado, e motivo
 * fora do vocabulario fechado tambem.
 */
export async function settleReturnTarget(
  prisma: DispatchDatabase,
  input: SettleReturnTargetInput,
  random: () => number = Math.random,
): Promise<SettleReturnTargetResult> {
  assertReason(input);
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const target = await transaction.returnCampaignTarget.findUnique({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.targetId } },
    });
    if (!target) {
      throw new AppError(
        RETURN_TARGET_NOT_FOUND,
        "Return campaign target was not found.",
        404,
      );
    }
    if (target.leaseToken !== input.leaseToken) {
      if (!target.leaseToken && target.state !== "CLAIMED") {
        return {
          applied: false,
          state: target.state,
          followUpState: target.followUpState,
        };
      }
      throw new AppError(
        RETURN_LEASE_LOST,
        "The lease for this return target is no longer held by the caller.",
        409,
        { state: target.state },
      );
    }
    const followUp = target.leaseKind === "FOLLOW_UP";
    const pace = (minutes: number) =>
      transaction.returnCampaign.update({
        where: { id: target.campaignId },
        data: { nextSendNotBefore: new Date(now.getTime() + minutes * 60_000) },
      });

    if (input.outcome === "DEFERRED") {
      await transaction.returnCampaignTarget.update({
        where: { id: target.id },
        data: followUp ? { ...RELEASED } : { state: "QUEUED", ...RELEASED },
      });
      await pace(DEFER_MINUTES);
    } else if (followUp) {
      await transaction.returnCampaignTarget.update({
        where: { id: target.id },
        data: {
          followUpState: input.outcome,
          followUpSentAt: input.outcome === "SENT" ? now : null,
          ...RELEASED,
        },
      });
      if (input.outcome === "SENT") await pace(randomSendGapMinutes(random));
    } else {
      await transaction.returnCampaignTarget.update({
        where: { id: target.id },
        data: {
          state: input.outcome,
          reason: input.outcome === "SENT" ? null : (input.reason ?? null),
          attemptCount: { increment: 1 },
          sentAt: input.outcome === "SENT" ? now : null,
          messageBody:
            input.outcome === "SENT" ? (input.messageBody ?? null) : null,
          settledAt: now,
          ...RELEASED,
        },
      });
      if (input.outcome === "SENT") await pace(randomSendGapMinutes(random));
      await completeIfDrained(
        transaction,
        input.tenantId,
        target.campaignId,
        now,
      );
    }
    const settled = await transaction.returnCampaignTarget.findUnique({
      where: { id: target.id },
      select: { state: true, followUpState: true },
    });
    return {
      applied: true,
      state: settled?.state ?? target.state,
      followUpState: settled?.followUpState ?? null,
    };
  });
}

function assertReason(input: SettleReturnTargetInput): void {
  const reason = input.reason ?? null;
  const valid =
    (input.outcome === "SENT" && reason === null) ||
    (input.outcome === "DEFERRED" && reason === null) ||
    (input.outcome === "SKIPPED" &&
      reason !== null &&
      (RETURN_SKIP_REASONS as readonly string[]).includes(reason)) ||
    (input.outcome === "FAILED" &&
      reason !== null &&
      (RETURN_FAIL_REASONS as readonly string[]).includes(reason));
  if (!valid) {
    throw new AppError(
      RETURN_SETTLEMENT_INVALID,
      "Return settlement reason does not match the outcome.",
      400,
    );
  }
}

export type { ReturnFailReason, ReturnSkipReason };
