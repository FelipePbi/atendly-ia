import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import {
  conversationWindowMs,
  type ConversationWindowPolicy,
  type InboxRetryPolicy,
  isAmbiguousFirstContact,
  isDeadLettered,
  nextRetryDelayMs,
  sanitizeInboxError,
} from "./inbox-policy.js";

/** Politica de retry da inbox, lida da configuracao do processo. */
export function inboxRetryPolicyFromEnv(): InboxRetryPolicy {
  return {
    maxAttempts: env.INBOX_MAX_ATTEMPTS,
    baseSeconds: env.INBOX_RETRY_BASE_SECONDS,
    maxSeconds: env.INBOX_RETRY_MAX_SECONDS,
  };
}

/** Janela de conversa da inbox, lida da configuracao do processo. */
export function conversationWindowPolicyFromEnv(): ConversationWindowPolicy {
  return {
    minSeconds: env.AI_DEBOUNCE_MIN_SECONDS,
    maxSeconds: Math.max(env.AI_DEBOUNCE_MIN_SECONDS, env.AI_DEBOUNCE_MAX_SECONDS),
    maxWaitSeconds: Math.max(
      env.AI_DEBOUNCE_MIN_SECONDS,
      env.AI_DEBOUNCE_MAX_WAIT_SECONDS,
    ),
    ambiguousSeconds: env.AI_AMBIGUOUS_WAIT_SECONDS,
    ambiguousMaxWaitSeconds: Math.max(
      env.AI_AMBIGUOUS_WAIT_SECONDS,
      env.AI_AMBIGUOUS_MAX_WAIT_SECONDS,
    ),
  };
}

export type InboxEventStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "DONE"
  | "FAILED"
  | "IGNORED"
  | "LEGACY";

export interface InboxRecordInput {
  tenantId: string;
  channelId: string;
  eventKey: string;
  messageId: string;
  eventType: string;
  conversationKey: string | null;
  rawPayload: unknown;
  /** Janela de fragmentos: o evento só fica reclamável depois dela. */
  availableInMs?: number;
  /** Evento técnico que só precisa de registro já nasce concluído. */
  status?: Extract<InboxEventStatus, "RECEIVED" | "IGNORED">;
}

export interface InboxRecordResult {
  stored: boolean;
  duplicate: boolean;
  id?: string;
}

export interface InboxEvent {
  id: string;
  tenantId: string;
  channelId: string;
  eventKey: string;
  eventType: string | null;
  conversationKey: string | null;
  messageId: string;
  rawPayload: unknown;
  receivedAt: Date;
  attempts: number;
}

export interface InboxClaim {
  leaseToken: string;
  leaseExpiresAt: Date;
  conversationKey: string | null;
  events: InboxEvent[];
}

export interface InboxClaimOptions {
  owner: string;
  leaseMs: number;
  /** Quanto adiante da hora atual ainda conta como "dentro da janela". */
  groupWindowMs: number;
  batchLimit: number;
  /**
   * Quantos eventos pendentes o claim varre antes de desistir do ciclo. Existe
   * para que uma conversa ocupada nao pare a fila: o claim segue para a
   * proxima conversa livre dentro do mesmo ciclo.
   */
  candidateScanLimit?: number;
  now?: Date;
}

export interface ConversationWindowInput {
  tenantId: string;
  channelId: string;
  externalContactId: string;
  conversationKey: string;
  /** Texto do fragmento que acabou de chegar. */
  text: string;
  policy: ConversationWindowPolicy;
  now?: Date;
}

export interface ConversationWindowResult {
  availableAt: Date;
  pendingFragments: number;
  ambiguousFirstContact: boolean;
}

export interface InboxPort {
  record(input: InboxRecordInput): Promise<InboxRecordResult>;
  applyConversationWindow(
    input: ConversationWindowInput,
  ): Promise<ConversationWindowResult | null>;
  claimNext(options: InboxClaimOptions): Promise<InboxClaim | null>;
  complete(input: {
    ids: string[];
    leaseToken: string;
    status: Extract<InboxEventStatus, "DONE" | "IGNORED">;
    result?: unknown;
  }): Promise<number>;
  fail(input: {
    ids: string[];
    leaseToken: string;
    error: unknown;
    retryable: boolean;
  }): Promise<{ retrying: boolean; deadLettered: boolean }>;
  requestSupersede(conversationKey: string): Promise<number>;
  isSupersedeRequested(ids: string[]): Promise<boolean>;
  countDeadLetters(tenantId: string): Promise<number>;
}

interface RawInboxRow {
  id: string;
  tenantId: string;
  channelId: string;
  eventKey: string;
  eventType: string | null;
  conversationKey: string | null;
  messageId: string;
  rawPayload: unknown;
  receivedAt: Date;
  attempts: number;
}

/**
 * Inbox durável sobre `ProcessedEvent`.
 *
 * A tabela deixou de ser só prova de recebimento: além do dedupe único
 * `(tenantId, provider, eventKey)` ela guarda estado de execução, tentativas,
 * lease e resultado. O claim usa `FOR UPDATE SKIP LOCKED`, para não serializar
 * conversas distintas, e um lock consultivo por conversa, porque a checagem de
 * "conversa ocupada" não enxerga o `PROCESSING` que outra transação ainda não
 * commitou.
 *
 * Toda transição carrega o `leaseToken` do claim (fencing): um worker cujo
 * lease expirou e foi recuperado por outro não consegue mais concluir nem
 * falhar aquele evento.
 */
export class InboxStore implements InboxPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly retry: InboxRetryPolicy,
  ) {}

  async record(input: InboxRecordInput): Promise<InboxRecordResult> {
    const status = input.status ?? "RECEIVED";
    const now = new Date();
    try {
      const created = await this.prisma.processedEvent.create({
        data: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          eventKey: input.eventKey,
          provider: "EVOLUTION_GO",
          messageId: input.messageId,
          eventType: input.eventType,
          conversationKey: input.conversationKey,
          rawPayload: input.rawPayload as object,
          status,
          completedAt: status === "IGNORED" ? now : null,
          nextAttemptAt:
            status === "RECEIVED" && input.availableInMs
              ? new Date(now.getTime() + input.availableInMs)
              : null,
        },
        select: { id: true },
      });
      return { stored: true, duplicate: false, id: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { stored: false, duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Recalcula a janela da conversa sobre o que esta gravado e a aplica a todos
   * os fragmentos ainda nao tentados.
   *
   * E aqui que a janela deixa de ser um valor fixo por evento: um fragmento
   * novo estende a espera do grupo inteiro (limitada pelo maximo desde o
   * primeiro evento), e a primeira mensagem ambigua de um contato sem historico
   * fica adiada por volta de dois minutos — ate cerca de cinco desde a primeira
   * — para que a pessoa diga o que quer antes da resposta.
   *
   * Eventos que ja falharam (`attempts > 0`) ficam de fora: o `nextAttemptAt`
   * deles e backoff de retry, nao janela de fragmento, e nao pode ser
   * sobrescrito.
   */
  async applyConversationWindow(
    input: ConversationWindowInput,
  ): Promise<ConversationWindowResult | null> {
    const now = input.now ?? new Date();
    const pending = await this.prisma.processedEvent.findMany({
      where: {
        conversationKey: input.conversationKey,
        status: "RECEIVED",
        attempts: 0,
      },
      select: { id: true, receivedAt: true },
      orderBy: { receivedAt: "asc" },
    });
    if (pending.length === 0) return null;

    const firstEventAt = pending[0].receivedAt;
    const firstContact = !(await this.hasConversationHistory(input));
    const windowInput = {
      text: input.text,
      pendingFragments: pending.length,
      firstEventAt,
      firstContact,
      now,
      policy: input.policy,
    };
    const availableAt = new Date(
      now.getTime() + conversationWindowMs(windowInput),
    );

    await this.prisma.processedEvent.updateMany({
      where: { id: { in: pending.map((row) => row.id) } },
      data: { nextAttemptAt: availableAt },
    });

    return {
      availableAt,
      pendingFragments: pending.length,
      ambiguousFirstContact: isAmbiguousFirstContact(windowInput),
    };
  }

  /**
   * Historico do contato, do ponto de vista do transporte: existe conversa e
   * ela ja trocou alguma mensagem. Nao interpreta o conteudo — so responde se
   * este numero e novo.
   */
  private async hasConversationHistory(input: {
    tenantId: string;
    channelId: string;
    externalContactId: string;
  }): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          externalContactId: input.externalContactId,
        },
      },
      select: { id: true },
    });
    if (!conversation) return false;
    const earlier = await this.prisma.message.findFirst({
      where: {
        tenantId: input.tenantId,
        channelId: input.channelId,
        conversationId: conversation.id,
      },
      select: { id: true },
    });
    return earlier !== null;
  }

  async claimNext(options: InboxClaimOptions): Promise<InboxClaim | null> {
    const now = options.now ?? new Date();
    await this.recoverExpiredLeases(now);

    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + options.leaseMs);
    const groupUntil = new Date(now.getTime() + options.groupWindowMs);
    const limit = Math.max(1, options.batchLimit);
    const scanLimit = Math.max(1, options.candidateScanLimit ?? 20);

    const claimed = await this.prisma.$transaction(async (tx) => {
      // Candidatos, e nao "o mais antigo".
      //
      // Selecionar so a cabeca global bloqueava a fila inteira: se a conversa
      // dela ja estivesse PROCESSING com lease vivo, o ciclo terminava sem
      // reivindicar nada e as outras conversas ficavam paradas atras dela
      // enquanto a ocupada rodava LLM, tools e envio. O `NOT EXISTS` remove do
      // conjunto as conversas ocupadas por lease vivo, e a iteracao abaixo
      // cobre a corrida — outra transacao pode ter commitado um PROCESSING
      // entre esta leitura e o lock consultivo.
      const candidates = await tx.$queryRaw<
        Array<{ id: string; conversationKey: string | null }>
      >`
        SELECT candidate."id", candidate."conversationKey"
        FROM "ProcessedEvent" AS candidate
        WHERE candidate."status" = 'RECEIVED'
          AND (candidate."nextAttemptAt" IS NULL OR candidate."nextAttemptAt" <= ${now})
          AND (
            candidate."conversationKey" IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM "ProcessedEvent" AS busy
              WHERE busy."conversationKey" = candidate."conversationKey"
                AND busy."status" = 'PROCESSING'
                AND busy."leaseExpiresAt" > ${now}
            )
          )
        ORDER BY candidate."receivedAt" ASC, candidate."id" ASC
        LIMIT ${scanLimit}
      `;

      const visited = new Set<string>();
      for (const candidate of candidates) {
        const conversationKey = candidate.conversationKey;
        if (conversationKey !== null) {
          if (visited.has(conversationKey)) continue;
          visited.add(conversationKey);
        }

        // SKIP LOCKED preservado: a linha e fixada aqui, e um worker que ja a
        // tenha travada apenas nos manda para o proximo candidato.
        const pinned = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ProcessedEvent"
          WHERE "id" = ${candidate.id}
            AND "status" = 'RECEIVED'
            AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
          FOR UPDATE SKIP LOCKED
        `;
        if (pinned.length === 0) continue;

        if (conversationKey === null) {
          return tx.$queryRaw<RawInboxRow[]>`
            UPDATE "ProcessedEvent" SET
              "status" = 'PROCESSING',
              "leaseOwner" = ${options.owner},
              "leaseToken" = ${leaseToken},
              "leaseExpiresAt" = ${leaseExpiresAt},
              "attempts" = "attempts" + 1,
              "supersedeRequestedAt" = NULL
            WHERE "id" = ${candidate.id}
            RETURNING "id", "tenantId", "channelId", "eventKey", "eventType",
                      "conversationKey", "messageId", "rawPayload", "receivedAt",
                      "attempts"
          `;
        }

        // Serializacao por conversa: o lock consultivo vale ate o fim desta
        // transacao; depois do commit o PROCESSING ja e visivel para as outras.
        // A variante `try` nao bloqueia — outra transacao reivindicando esta
        // conversa agora so nos empurra para o proximo candidato, em vez de
        // segurar o ciclo inteiro.
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext(${conversationKey})) AS "acquired"
        `;
        if (!lock?.acquired) continue;

        const busy = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ProcessedEvent"
          WHERE "conversationKey" = ${conversationKey}
            AND "status" = 'PROCESSING'
            AND "leaseExpiresAt" > ${now}
          LIMIT 1
        `;
        if (busy.length > 0) continue;

        // O claim agrupa os pendentes da conversa dentro da janela: os
        // fragmentos que chegaram enquanto o primeiro evento esperava saem
        // juntos, em ordem.
        return tx.$queryRaw<RawInboxRow[]>`
          UPDATE "ProcessedEvent" SET
            "status" = 'PROCESSING',
            "leaseOwner" = ${options.owner},
            "leaseToken" = ${leaseToken},
            "leaseExpiresAt" = ${leaseExpiresAt},
            "attempts" = "attempts" + 1,
            "supersedeRequestedAt" = NULL
          WHERE "id" IN (
            SELECT "id" FROM "ProcessedEvent"
            WHERE "conversationKey" = ${conversationKey}
              AND "status" = 'RECEIVED'
              AND "receivedAt" <= ${now}
              AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${groupUntil})
            ORDER BY "receivedAt" ASC, "id" ASC
            LIMIT ${limit}
          )
          RETURNING "id", "tenantId", "channelId", "eventKey", "eventType",
                    "conversationKey", "messageId", "rawPayload", "receivedAt",
                    "attempts"
        `;
      }

      return [] as RawInboxRow[];
    });

    if (claimed.length === 0) return null;
    const events = [...claimed]
      .map(toInboxEvent)
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
    return {
      leaseToken,
      leaseExpiresAt,
      conversationKey: events[0].conversationKey,
      events,
    };
  }

  async complete(input: {
    ids: string[];
    leaseToken: string;
    status: Extract<InboxEventStatus, "DONE" | "IGNORED">;
    result?: unknown;
  }): Promise<number> {
    if (input.ids.length === 0) return 0;
    const updated = await this.prisma.processedEvent.updateMany({
      where: { id: { in: input.ids }, leaseToken: input.leaseToken },
      data: {
        status: input.status,
        completedAt: new Date(),
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        error: null,
        result: (input.result ?? undefined),
      },
    });
    return updated.count;
  }

  async fail(input: {
    ids: string[];
    leaseToken: string;
    error: unknown;
    retryable: boolean;
  }): Promise<{ retrying: boolean; deadLettered: boolean }> {
    if (input.ids.length === 0) {
      return { retrying: false, deadLettered: false };
    }
    const message = sanitizeInboxError(input.error);
    const rows = await this.prisma.processedEvent.findMany({
      where: { id: { in: input.ids }, leaseToken: input.leaseToken },
      select: { id: true, attempts: true },
    });
    if (rows.length === 0) return { retrying: false, deadLettered: false };

    const attempts = Math.max(...rows.map((row) => row.attempts));
    const exhausted = !input.retryable || isDeadLettered(attempts, this.retry);
    if (exhausted) {
      // Dead-letter: para de tentar e fica visível como atenção. Não existe
      // reenvio em massa; retomar é decisão explícita, evento a evento.
      await this.prisma.processedEvent.updateMany({
        where: { id: { in: input.ids }, leaseToken: input.leaseToken },
        data: {
          status: "FAILED",
          error: message,
          completedAt: new Date(),
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
        },
      });
      return { retrying: false, deadLettered: true };
    }

    await this.prisma.processedEvent.updateMany({
      where: { id: { in: input.ids }, leaseToken: input.leaseToken },
      data: {
        status: "RECEIVED",
        error: message,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date(
          Date.now() + nextRetryDelayMs(attempts, this.retry),
        ),
      },
    });
    return { retrying: true, deadLettered: false };
  }

  /**
   * Mensagem nova numa conversa que já está executando: marca o pedido de
   * reavaliação para que a resposta ainda não enviada seja cancelada.
   */
  async requestSupersede(conversationKey: string): Promise<number> {
    const updated = await this.prisma.processedEvent.updateMany({
      where: { conversationKey, status: "PROCESSING" },
      data: { supersedeRequestedAt: new Date() },
    });
    return updated.count;
  }

  async isSupersedeRequested(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    const found = await this.prisma.processedEvent.findFirst({
      where: { id: { in: ids }, supersedeRequestedAt: { not: null } },
      select: { id: true },
    });
    return Boolean(found);
  }

  async countDeadLetters(tenantId: string): Promise<number> {
    return this.prisma.processedEvent.count({
      where: { tenantId, status: "FAILED" },
    });
  }

  /**
   * Só lease expirado é recuperado. Um lease vivo nunca é roubado: a linha
   * volta a `RECEIVED` apenas quando `leaseExpiresAt` já passou, e o token
   * anterior deixa de valer para concluir ou falhar o evento.
   */
  private async recoverExpiredLeases(now: Date): Promise<number> {
    const recovered = await this.prisma.processedEvent.updateMany({
      where: { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      data: {
        status: "RECEIVED",
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
      },
    });
    return recovered.count;
  }
}

function toInboxEvent(row: RawInboxRow): InboxEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    eventKey: row.eventKey,
    eventType: row.eventType,
    conversationKey: row.conversationKey,
    messageId: row.messageId,
    rawPayload: row.rawPayload,
    receivedAt: row.receivedAt,
    attempts: row.attempts,
  };
}
