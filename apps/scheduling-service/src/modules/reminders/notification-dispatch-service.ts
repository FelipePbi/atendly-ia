import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type {
  AppointmentNotificationKind,
  AppointmentNotificationReason,
  AppointmentNotificationSlot,
  AppointmentNotificationState,
  ReminderPricePolicy,
} from "../../generated/prisma/enums.js";
import { instantToLocalDateTime } from "../../shared/date-time/calendar-date-time.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  computeAgreementTotal,
  type ServicePriceType,
} from "../calendar/calendar-provider.js";
import { databaseNow } from "../calendar/write-policy.js";
import { ReminderService } from "./reminder-service.js";

/**
 * Reivindicacao e liquidacao das intencoes de envio (Goal021).
 *
 * O dono da agenda entrega trabalho pronto e recebe o resultado de volta; ele
 * nunca envia nada. Sao dois atos, e os dois sao decididos pelo **banco**:
 *
 * 1. **Reivindicar** — um `UPDATE` condicional por intencao (`state =
 *    'PENDING'`) que toma o lease. A exclusao vem do proprio claim, no padrao
 *    de D-008 e do lease da importacao (`migrations/import-lease.ts`): quem
 *    faz `count = 1` leva, quem faz `count = 0` desiste sem tocar em nada.
 *    Nao existe leitura-antes-de-escrever decidindo o direito, entao duas
 *    varreduras simultaneas nunca levam a mesma intencao.
 * 2. **Liquidar** — idempotente e sem volta de estado terminal: liquidar duas
 *    vezes a mesma intencao nao muda o resultado nem soma tentativa.
 *
 * A revalidacao acontece **dentro da transacao do claim**, contra o estado do
 * momento: a versao do compromisso, o estado dele, o inicio ainda no futuro e
 * o telefone do cliente. O que foi agendado para a versao 3 nao vale mais
 * quando o compromisso esta na versao 4 — e a intencao divergente e
 * **cancelada**, nunca enviada.
 *
 * O conteudo tambem e composto aqui, pelo dono: nome, telefone, servicos e a
 * data e a hora **ja formatadas no fuso do tenant**
 * (`CalendarSettings.timezone`), com o instante junto. A IA nunca formata
 * instante, e aqui nunca ha texto de lembrete — a composicao por estilo e da
 * entrega.
 *
 * O relogio e sempre `now()` do banco (`databaseNow`), nunca o do processo: o
 * vencimento da intencao e a vigencia do lease nao podem depender de qual
 * instancia perguntou a hora.
 */

/** Intencao inexistente para o negocio do chamador. */
export const NOTIFICATION_INTENT_NOT_FOUND = "NOTIFICATION_INTENT_NOT_FOUND";
/** Liquidacao de quem nao detem mais o lease: o trabalho mudou de dono. */
export const NOTIFICATION_INTENT_LEASE_LOST = "NOTIFICATION_INTENT_LEASE_LOST";
/** Liquidacao cujo motivo nao casa com o desfecho declarado. */
export const NOTIFICATION_SETTLEMENT_INVALID =
  "NOTIFICATION_SETTLEMENT_INVALID";

/** Recorte do Prisma que a varredura usa; casa com o cliente e com a transacao. */
type DispatchPrisma = Pick<
  PrismaClient,
  | "$transaction"
  | "$queryRaw"
  | "appointmentNotificationIntent"
  | "calendarSettings"
  | "reminderSettings"
>;

/** Estados de que nao se volta: liquidar de novo e inocuo. */
const TERMINAL_STATES: readonly AppointmentNotificationState[] = [
  "SENT",
  "FAILED",
  "DISMISSED",
  "CANCELLED",
];

/** Desfechos que a entrega pode declarar. Cancelar e decisao do dono, nao dela. */
export type NotificationSettlementOutcome = "SENT" | "FAILED" | "DISMISSED";

/**
 * Fatos prontos que a intencao carrega para a entrega. **Sem endereco**: o
 * vault pede que o endereco nao seja repetido automaticamente, e o jeito de
 * isso nao acontecer e ele nao existir aqui. Tambem sem texto de mensagem.
 */
export interface NotificationFacts {
  kind: AppointmentNotificationKind;
  /** Estado do compromisso no momento da reivindicacao. */
  appointmentStatus: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  /** Nomes dos servicos, pelo snapshot do acordo — nunca pelo catalogo de hoje. */
  services: string[];
  /** Titulo do atendimento manual sem servico cadastrado; nulo quando ha itens. */
  title: string | null;
  timezone: string;
  /** Data local no fuso do tenant (`AAAA-MM-DD`). */
  date: string;
  /** Hora local no fuso do tenant (`HH:MM`). */
  time: string;
  /** O instante junto, para quem precisar recalcular sem reformatar. */
  startAt: string;
  /** Preco somente quando a politica e mostrar E o acordo tem preco fixo. */
  price: number | null;
  /** O negocio pede confirmacao pela resposta ao lembrete. */
  confirmationRequested: boolean;
}

export interface ClaimedNotificationIntent {
  id: string;
  tenantId: string;
  appointmentId: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  appointmentVersion: number;
  dueAt: string;
  attemptCount: number;
  /** Prova de posse do lease; exigida na liquidacao. */
  leaseToken: string;
  leaseExpiresAt: string;
  /** `correlationId` deterministico da saida, derivado da identidade. */
  correlationId: string;
  facts: NotificationFacts;
}

export interface SettledNotificationIntentSummary {
  id: string;
  tenantId: string;
  appointmentId: string;
  state: AppointmentNotificationState;
  reason: AppointmentNotificationReason | null;
}

export interface ClaimNotificationIntentsInput {
  /** Identidade da instancia que varre; uma nova e gerada quando ausente. */
  owner?: string;
  /** Teto de lote por varredura. */
  limit?: number;
  /** Teto por negocio dentro da mesma varredura. */
  perTenantLimit?: number;
  leaseTtlSeconds?: number;
  maxAttempts?: number;
}

export interface ClaimNotificationIntentsResult {
  owner: string;
  claimed: ClaimedNotificationIntent[];
  /** Liquidadas pela revalidacao, em vez de entregues. */
  settled: SettledNotificationIntentSummary[];
  /** Leases vencidos devolvidos para pendente, com tentativa contada. */
  released: number;
  /** Tentativas esgotadas viradas falha auditavel. */
  exhausted: number;
  /** Intencoes deixadas como estavam por o negocio nao ter agenda configurada. */
  skipped: number;
}

/** Identidade da instancia que varre. Nunca reusada entre processos. */
export function newNotificationSweepOwner(prefix = "scheduling"): string {
  return `${prefix}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

/**
 * `correlationId` **deterministico** a partir da identidade da intencao
 * (compromisso, especie, posicao e versao) — a mesma identidade do indice
 * unico. E por ele que a reivindicacao repetida depois de uma queda do
 * processo nao vira uma segunda mensagem ao cliente: a entrega verifica a
 * saida antes de enviar.
 */
export function notificationCorrelationId(intent: {
  appointmentId: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  appointmentVersion: number;
}): string {
  return `notify:${intent.appointmentId}:${intent.kind}:${intent.slot}:v${intent.appointmentVersion}`;
}

/**
 * Varre as intencoes vencidas e reivindica o lote.
 *
 * A varredura nao tem tenant na frente, de proposito: quem entrega atende
 * todos os negocios, e a fila vence por `dueAt` (indice
 * `AppointmentNotificationIntent_state_dueAt_idx`). A justica entre negocios
 * e o **teto por tenant** aplicado aqui, para que uma importacao recem
 * concluida nao vire rajada de um negocio so.
 */
export async function claimDueNotificationIntents(
  prisma: DispatchPrisma,
  input: ClaimNotificationIntentsInput = {},
): Promise<ClaimNotificationIntentsResult> {
  const owner = input.owner ?? newNotificationSweepOwner();
  const limit = input.limit ?? env.NOTIFICATION_CLAIM_BATCH_LIMIT;
  const perTenantLimit =
    input.perTenantLimit ?? env.NOTIFICATION_CLAIM_TENANT_LIMIT;
  const ttlSeconds =
    input.leaseTtlSeconds ?? env.NOTIFICATION_LEASE_TTL_SECONDS;
  const maxAttempts = input.maxAttempts ?? env.NOTIFICATION_MAX_ATTEMPTS;

  const recovered = await recoverExpiredLeases(prisma, maxAttempts);
  const candidates = await selectDueIntents(prisma, {
    limit,
    perTenantLimit,
    maxAttempts,
  });

  const claimed: ClaimedNotificationIntent[] = [];
  const settled: SettledNotificationIntentSummary[] = [];
  const contexts = new Map<string, TenantDispatchContext | null>();
  let skipped = 0;

  for (const candidate of candidates) {
    if (!contexts.has(candidate.tenantId)) {
      contexts.set(
        candidate.tenantId,
        await loadTenantContext(prisma, candidate.tenantId),
      );
    }
    const context = contexts.get(candidate.tenantId) ?? null;
    // Negocio sem `CalendarSettings` nao tem fuso para formatar data e hora, e
    // formatar no fuso errado seria pior do que nao enviar: a intencao fica
    // pendente, exatamente como estava.
    if (!context) {
      skipped += 1;
      continue;
    }
    const outcome = await claimOne(prisma, candidate, context, {
      owner,
      ttlSeconds,
    });
    if (outcome?.kind === "claimed") claimed.push(outcome.intent);
    if (outcome?.kind === "settled") settled.push(outcome.summary);
  }

  return { owner, claimed, settled, ...recovered, skipped };
}

/**
 * Lease devolvido. Dono, token e expiracao saem **juntos**, porque o banco os
 * amarra como um bloco (`AppointmentNotificationIntent_lifecycle_check`) e
 * porque `CLAIMED` existe se e somente se ha dono.
 */
const RELEASED_LEASE = {
  leaseOwner: null,
  leaseToken: null,
  leaseAcquiredAt: null,
  leaseExpiresAt: null,
} as const;

/**
 * Lease vencido volta para pendente **com tentativa contada**, e tentativa
 * esgotada vira falha com motivo — a intencao nunca desaparece. Os dois
 * `updateMany` sao ordenados de proposito: quem ja gastou a ultima tentativa
 * sai de `CLAIMED` antes de o segundo comando rodar, entao nenhuma linha e
 * devolvida e falhada na mesma passada.
 */
async function recoverExpiredLeases(
  prisma: DispatchPrisma,
  maxAttempts: number,
): Promise<{ released: number; exhausted: number }> {
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const exhausted =
      await transaction.appointmentNotificationIntent.updateMany({
        where: {
          state: "CLAIMED",
          leaseExpiresAt: { lte: now },
          attemptCount: { gte: maxAttempts - 1 },
        },
        data: {
          state: "FAILED",
          reason: "ATTEMPTS_EXHAUSTED",
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          settledAt: now,
          ...RELEASED_LEASE,
        },
      });
    const released =
      await transaction.appointmentNotificationIntent.updateMany({
        where: { state: "CLAIMED", leaseExpiresAt: { lte: now } },
        data: {
          state: "PENDING",
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          ...RELEASED_LEASE,
        },
      });
    return { released: released.count, exhausted: exhausted.count };
  });
}

interface DueIntentRow {
  id: string;
  tenantId: string;
  appointmentId: string;
  kind: AppointmentNotificationKind;
  slot: AppointmentNotificationSlot;
  appointmentVersion: number;
  dueAt: Date;
  attemptCount: number;
  outboundCorrelationId: string | null;
}

/**
 * Candidatas da varredura: vencidas pelo relogio do banco, ainda pendentes e
 * com tentativa sobrando. O teto por tenant e aplicado sobre a fila ordenada
 * por vencimento — o negocio que passou do teto espera a proxima varredura em
 * vez de ocupar o lote inteiro.
 */
async function selectDueIntents(
  prisma: DispatchPrisma,
  limits: { limit: number; perTenantLimit: number; maxAttempts: number },
): Promise<DueIntentRow[]> {
  const now = await databaseNow(prisma);
  const rows = (await prisma.appointmentNotificationIntent.findMany({
    where: {
      state: "PENDING",
      dueAt: { lte: now },
      attemptCount: { lt: limits.maxAttempts },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: limits.limit,
  })) as unknown as DueIntentRow[];

  const perTenant = new Map<string, number>();
  const selected: DueIntentRow[] = [];
  for (const row of rows) {
    if (selected.length >= limits.limit) break;
    const used = perTenant.get(row.tenantId) ?? 0;
    if (used >= limits.perTenantLimit) continue;
    perTenant.set(row.tenantId, used + 1);
    selected.push(row);
  }
  return selected;
}

/**
 * O que o negocio decide e que nao muda entre duas intencoes da mesma
 * varredura: fuso, politica de preco, confirmacao e quais posicoes de
 * lembrete ainda existem. Lido uma vez por negocio, fora da transacao do
 * claim — nao e estado disputado; o que a revalidacao precisa ver no instante
 * exato e a linha do compromisso, e essa e lida dentro da transacao.
 */
interface TenantDispatchContext {
  timezone: string;
  pricePolicy: ReminderPricePolicy;
  confirmationEnabled: boolean;
  slots: Set<string>;
}

async function loadTenantContext(
  prisma: DispatchPrisma,
  tenantId: string,
): Promise<TenantDispatchContext | null> {
  const calendar = await prisma.calendarSettings.findUnique({
    where: { tenantId },
  });
  if (!calendar) return null;
  const config = await new ReminderService(
    prisma as unknown as PrismaClient,
    tenantId,
  ).get();
  return {
    timezone: calendar.timezone,
    pricePolicy: config.pricePolicy,
    confirmationEnabled: config.confirmationEnabled,
    slots: new Set(config.rules.map((rule) => rule.slot as string)),
  };
}

interface DispatchAppointmentRow {
  id: string;
  status: string;
  startAt: Date;
  title: string | null;
  notifiableVersion: number;
  customerId: string;
  customer: { id: string; name: string | null; phone: string | null } | null;
  items: Array<{
    serviceNameSnapshot: string;
    priceTypeSnapshot: ServicePriceType;
    priceSnapshot: unknown;
  }>;
}

type ClaimOutcome =
  | { kind: "claimed"; intent: ClaimedNotificationIntent }
  | { kind: "settled"; summary: SettledNotificationIntentSummary }
  | null;

/**
 * Uma intencao, uma transacao. O claim e a primeira escrita e a revalidacao
 * vem em seguida, na mesma transacao: a intencao divergente nunca chega a ser
 * vista como reivindicada por ninguem, porque o commit leva o estado final.
 */
async function claimOne(
  prisma: DispatchPrisma,
  candidate: DueIntentRow,
  context: TenantDispatchContext,
  options: { owner: string; ttlSeconds: number },
): Promise<ClaimOutcome> {
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + options.ttlSeconds * 1_000);
    const key = {
      tenantId_id: { tenantId: candidate.tenantId, id: candidate.id },
    };

    // A exclusao esta aqui, no `WHERE`: `state = 'PENDING'` e a condicao que a
    // segunda varredura nao satisfaz mais.
    const claimed = await transaction.appointmentNotificationIntent.updateMany({
      where: {
        tenantId: candidate.tenantId,
        id: candidate.id,
        state: "PENDING",
      },
      data: {
        state: "CLAIMED",
        leaseOwner: options.owner,
        leaseToken,
        leaseAcquiredAt: now,
        leaseExpiresAt,
        leaseHeartbeatAt: now,
      },
    });
    if (claimed.count !== 1) return null;

    const appointment = (await transaction.appointment.findUnique({
      where: {
        tenantId_id: {
          tenantId: candidate.tenantId,
          id: candidate.appointmentId,
        },
      },
      include: { items: true, customer: true },
    })) as unknown as DispatchAppointmentRow | null;

    const refusal = revalidateIntent(candidate, appointment, context, now);
    if (refusal) {
      await transaction.appointmentNotificationIntent.update({
        where: key,
        data: {
          state: refusal.state,
          reason: refusal.reason,
          detail: refusal.detail ?? null,
          settledAt: now,
          ...RELEASED_LEASE,
        },
      });
      return {
        kind: "settled",
        summary: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          appointmentId: candidate.appointmentId,
          state: refusal.state,
          reason: refusal.reason,
        },
      };
    }

    const facts = composeFacts(
      candidate,
      appointment as DispatchAppointmentRow,
      context,
    );
    const correlationId =
      candidate.outboundCorrelationId ?? notificationCorrelationId(candidate);
    await transaction.appointmentNotificationIntent.update({
      where: key,
      data: {
        facts: facts as unknown as Prisma.InputJsonValue,
        outboundCorrelationId: correlationId,
      },
    });

    return {
      kind: "claimed",
      intent: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        appointmentId: candidate.appointmentId,
        kind: candidate.kind,
        slot: candidate.slot,
        appointmentVersion: candidate.appointmentVersion,
        dueAt: candidate.dueAt.toISOString(),
        attemptCount: candidate.attemptCount,
        leaseToken,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        correlationId,
        facts,
      },
    };
  });
}

interface IntentRefusal {
  state: Extract<AppointmentNotificationState, "CANCELLED" | "DISMISSED">;
  reason: AppointmentNotificationReason;
  detail?: string;
}

/**
 * Revalidacao contra o estado **do momento**, dentro da transacao do claim.
 *
 * - versao divergente vira **cancelada**, nunca enviada;
 * - lembrete exige `CONFIRMED` e inicio ainda no futuro;
 * - aviso de alteracao aceita compromisso cancelado, porque e disso que ele
 *   fala;
 * - posicao de lembrete que a configuracao do negocio deixou de prever e
 *   **dispensada** com motivo, nao cancelada: nada mudou no compromisso;
 * - cliente sem telefone e **dispensada** com motivo, nunca erro
 *   (`Customer.phone` e nulavel desde o Goal006).
 */
function revalidateIntent(
  intent: DueIntentRow,
  appointment: DispatchAppointmentRow | null,
  context: TenantDispatchContext,
  now: Date,
): IntentRefusal | null {
  if (!appointment) {
    // A cascata do FK apaga a intencao junto com o compromisso, entao aqui so
    // se chega por corrida com a remocao definitiva do Goal019.
    return {
      state: "CANCELLED",
      reason: "APPOINTMENT_CANCELLED",
      detail: "appointment no longer exists",
    };
  }
  if (appointment.notifiableVersion !== intent.appointmentVersion) {
    return { state: "CANCELLED", reason: "APPOINTMENT_VERSION_SUPERSEDED" };
  }
  if (intent.kind === "REMINDER") {
    if (appointment.status === "CANCELLED") {
      return { state: "CANCELLED", reason: "APPOINTMENT_CANCELLED" };
    }
    if (appointment.status !== "CONFIRMED") {
      return { state: "CANCELLED", reason: "APPOINTMENT_NOT_CONFIRMED" };
    }
    if (appointment.startAt.getTime() <= now.getTime()) {
      return { state: "CANCELLED", reason: "APPOINTMENT_ALREADY_STARTED" };
    }
    if (!context.slots.has(intent.slot)) {
      return { state: "DISMISSED", reason: "REMINDER_CONFIGURATION_CHANGED" };
    }
  }
  if (!appointment.customer?.phone?.trim()) {
    return { state: "DISMISSED", reason: "CUSTOMER_WITHOUT_PHONE" };
  }
  return null;
}

/**
 * Fatos compostos pelo dono. Data e hora saem **ja formatadas** no fuso do
 * tenant, com o instante junto; preco so entra quando a politica e mostrar e
 * o acordo inteiro tem preco fixo, pela regra unica do total (Goal007) —
 * "a partir de", "sob consulta" e "nao informado" nunca viram numero numa
 * mensagem que sai sozinha.
 */
function composeFacts(
  intent: DueIntentRow,
  appointment: DispatchAppointmentRow,
  context: TenantDispatchContext,
): NotificationFacts {
  const local = instantToLocalDateTime(appointment.startAt, context.timezone);
  const items = appointment.items.map((item) => ({
    name: item.serviceNameSnapshot,
    priceType: item.priceTypeSnapshot,
    price: item.priceSnapshot === null ? null : Number(item.priceSnapshot),
  }));
  const total = computeAgreementTotal(items);
  const showsPrice =
    context.pricePolicy === "WHEN_FIXED" && total.type === "FIXED";
  return {
    kind: intent.kind,
    appointmentStatus: appointment.status,
    customerId: appointment.customerId,
    customerName: appointment.customer?.name ?? null,
    customerPhone: (appointment.customer?.phone ?? "").trim(),
    services: items.map((item) => item.name),
    title: appointment.title,
    timezone: context.timezone,
    date: local.date,
    time: local.time,
    startAt: appointment.startAt.toISOString(),
    price: showsPrice ? total.amount : null,
    confirmationRequested:
      intent.kind === "REMINDER" && context.confirmationEnabled,
  };
}

export interface SettleNotificationIntentInput {
  tenantId: string;
  intentId: string;
  /** Prova de posse do lease devolvida pela reivindicacao. */
  leaseToken: string;
  outcome: NotificationSettlementOutcome;
  reason?: AppointmentNotificationReason | null;
  detail?: string | null;
  correlationId?: string | null;
}

export interface NotificationIntentSettlement {
  id: string;
  tenantId: string;
  appointmentId: string;
  state: AppointmentNotificationState;
  reason: AppointmentNotificationReason | null;
  detail: string | null;
  attemptCount: number;
  sentAt: string | null;
  settledAt: string | null;
  correlationId: string | null;
}

export interface SettleNotificationIntentResult {
  /** `false` quando a intencao ja estava liquidada: repetir e inocuo. */
  applied: boolean;
  intent: NotificationIntentSettlement;
}

/**
 * Liquidacao idempotente.
 *
 * Estado terminal nao volta e nao soma tentativa: a segunda liquidacao da
 * mesma intencao le a linha e devolve o que ja esta gravado, sem escrever.
 * Quem chega com lease alheio — ou com a intencao ja devolvida para pendente
 * por vencimento — e recusado, porque sobrescrever o trabalho de quem assumiu
 * e exatamente o que o lease existe para impedir.
 */
export async function settleNotificationIntent(
  prisma: DispatchPrisma,
  input: SettleNotificationIntentInput,
): Promise<SettleNotificationIntentResult> {
  assertSettlementReason(input);
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const key = {
      tenantId_id: { tenantId: input.tenantId, id: input.intentId },
    };
    const current = (await transaction.appointmentNotificationIntent.findUnique(
      { where: key },
    )) as unknown as SettlementRow | null;
    if (!current) {
      throw new AppError(
        NOTIFICATION_INTENT_NOT_FOUND,
        "Notification intent was not found.",
        404,
      );
    }
    if (TERMINAL_STATES.includes(current.state)) {
      return { applied: false, intent: toSettlement(current) };
    }
    if (current.state !== "CLAIMED" || current.leaseToken !== input.leaseToken) {
      throw new AppError(
        NOTIFICATION_INTENT_LEASE_LOST,
        "The lease for this notification intent is no longer held by the caller.",
        409,
        { state: current.state },
      );
    }

    const updated = (await transaction.appointmentNotificationIntent.update({
      where: key,
      data: {
        state: input.outcome,
        reason: input.outcome === "SENT" ? null : (input.reason ?? null),
        detail: input.detail ?? current.detail,
        // A tentativa e contada **uma vez**, na liquidacao que aplicou.
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        sentAt: input.outcome === "SENT" ? now : null,
        settledAt: now,
        outboundCorrelationId:
          input.correlationId ?? current.outboundCorrelationId,
        ...RELEASED_LEASE,
      },
    })) as unknown as SettlementRow;
    return { applied: true, intent: toSettlement(updated) };
  });
}

interface SettlementRow {
  id: string;
  tenantId: string;
  appointmentId: string;
  state: AppointmentNotificationState;
  reason: AppointmentNotificationReason | null;
  detail: string | null;
  attemptCount: number;
  leaseToken: string | null;
  sentAt: Date | null;
  settledAt: Date | null;
  outboundCorrelationId: string | null;
}

function toSettlement(row: SettlementRow): NotificationIntentSettlement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    appointmentId: row.appointmentId,
    state: row.state,
    reason: row.reason,
    detail: row.detail,
    attemptCount: row.attemptCount,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    correlationId: row.outboundCorrelationId,
  };
}

/**
 * Motivo obrigatorio no que nao saiu e proibido no que saiu — a mesma regra
 * que a constraint `AppointmentNotificationIntent_reason_check` impoe no
 * banco, recusada aqui com codigo proprio antes de virar erro de banco.
 */
function assertSettlementReason(input: SettleNotificationIntentInput): void {
  const hasReason = Boolean(input.reason);
  if (input.outcome === "SENT" && hasReason) {
    throw new AppError(
      NOTIFICATION_SETTLEMENT_INVALID,
      "A delivered notification has no reason.",
      400,
    );
  }
  if (input.outcome !== "SENT" && !hasReason) {
    throw new AppError(
      NOTIFICATION_SETTLEMENT_INVALID,
      "A notification that was not delivered requires a named reason.",
      400,
    );
  }
}

/**
 * Renova o lease enquanto o trabalho corre. Exige o mesmo token **e** lease
 * ainda vigente pelo relogio do banco: um lease vencido nao e renovado nem
 * pelo dono anterior, porque entre o vencimento e a renovacao a varredura
 * seguinte pode te-lo devolvido legitimamente. `null` e a perda do lease.
 */
export async function renewNotificationIntentLease(
  prisma: DispatchPrisma,
  input: {
    tenantId: string;
    intentId: string;
    leaseToken: string;
    ttlSeconds?: number;
  },
): Promise<Date | null> {
  const ttlSeconds = input.ttlSeconds ?? env.NOTIFICATION_LEASE_TTL_SECONDS;
  return prisma.$transaction(async (transaction) => {
    const now = await databaseNow(transaction);
    const leaseExpiresAt = new Date(now.getTime() + ttlSeconds * 1_000);
    const renewed = await transaction.appointmentNotificationIntent.updateMany({
      where: {
        tenantId: input.tenantId,
        id: input.intentId,
        state: "CLAIMED",
        leaseToken: input.leaseToken,
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt, leaseHeartbeatAt: now },
    });
    return renewed.count === 1 ? leaseExpiresAt : null;
  });
}
