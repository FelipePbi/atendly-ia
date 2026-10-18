import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type { SchedulingRequestContext } from "../scheduling-service/types.js";
import type { ClaimedReturnTarget } from "./return-types.js";

/**
 * Loop do retorno de clientes no proprio processo da IA (D-206), no desenho
 * do loop de lembretes (Goal021): sem broker, sem cron, sem servico novo.
 *
 * Cada passada faz duas coisas, nesta ordem:
 *
 * 1. **Respostas.** Convite enviado cuja conversa recebeu mensagem da cliente
 *    depois do envio vira "respondido" aqui e no dono — e e isso que impede
 *    o lembrete unico de sair para quem ja respondeu;
 * 2. **Envios.** Reivindica no dono (no maximo um por negocio, pelo ritmo da
 *    rodada) e entrega.
 */

export const RETURN_SWEEP_SCOPE = "customer-return-sweep";
/** Respostas so contam dentro de 30 dias do envio. */
const REPLY_WINDOW_DAYS = 30;

export interface ReturnClaimPort {
  claimReturnTargets(
    input: { owner: string; leaseTtlSeconds: number; tenantLimit: number },
    context: SchedulingRequestContext,
  ): Promise<ClaimedReturnTarget[]>;
  reportReturnReply(tenantId: string, targetId: string): Promise<void>;
}

export interface ReturnDeliveryHandler {
  deliver(target: ClaimedReturnTarget): Promise<unknown>;
}

export interface ReturnDeliveryWorkerOptions {
  pollIntervalMs: number;
  leaseTtlSeconds: number;
  tenantLimit: number;
  owner?: string;
}

export type ReturnReplyPrisma = Pick<
  PrismaClient,
  "returnInvitation" | "message"
>;

/**
 * Marca como respondido o convite cuja conversa recebeu mensagem da cliente
 * depois do envio, e relata ao dono. Devolve quantos foram marcados.
 */
export async function reconcileReturnReplies(
  prisma: ReturnReplyPrisma,
  scheduling: Pick<ReturnClaimPort, "reportReturnReply">,
  now: Date = new Date(),
  logger: DiagnosticLogger = noopDiagnosticLogger,
): Promise<number> {
  const pending = await prisma.returnInvitation.findMany({
    where: {
      repliedAt: null,
      sentAt: { gte: new Date(now.getTime() - REPLY_WINDOW_DAYS * 86_400_000) },
    },
    orderBy: { sentAt: "asc" },
    take: 200,
  });
  let marked = 0;
  for (const invitation of pending) {
    const reply = await prisma.message.findFirst({
      where: {
        tenantId: invitation.tenantId,
        conversationId: invitation.conversationId,
        direction: "INBOUND",
        createdAt: { gt: invitation.sentAt },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (!reply) continue;
    try {
      await scheduling.reportReturnReply(
        invitation.tenantId,
        invitation.targetId,
      );
      await prisma.returnInvitation.update({
        where: { id: invitation.id },
        data: { repliedAt: reply.createdAt },
      });
      marked += 1;
    } catch (error) {
      // O dono fora do ar so adia: a proxima passada tenta de novo.
      logger.warn(
        {
          tenantId: invitation.tenantId,
          targetId: invitation.targetId,
          err: toErrorMessage(error),
        },
        "Return reply could not be reported yet",
      );
    }
  }
  return marked;
}

export class ReturnDeliveryWorker {
  private readonly owner: string;
  private running = false;
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly prisma: ReturnReplyPrisma,
    private readonly scheduling: ReturnClaimPort,
    private readonly handler: ReturnDeliveryHandler,
    private readonly options: ReturnDeliveryWorkerOptions,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
  ) {
    this.owner = options.owner ?? `ai-orchestrator:${randomUUID()}`;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.cycle?.catch(() => undefined);
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      await reconcileReturnReplies(
        this.prisma,
        this.scheduling,
        new Date(),
        this.logger,
      );
      const claimed = await this.scheduling.claimReturnTargets(
        {
          owner: this.owner,
          leaseTtlSeconds: this.options.leaseTtlSeconds,
          tenantLimit: this.options.tenantLimit,
        },
        {
          tenantId: RETURN_SWEEP_SCOPE,
          userId: "ai-orchestrator",
          requestId: `return-sweep-${randomUUID()}`,
        },
      );
      for (const target of claimed) {
        try {
          await this.handler.deliver(target);
        } catch (error) {
          // O lease vence e a cliente volta para a fila com tentativa contada.
          this.logger.error(
            {
              tenantId: target.tenantId,
              targetId: target.id,
              err: toErrorMessage(error),
            },
            "Return delivery failed and will wait for the lease to expire",
          );
        }
      }
      return claimed.length;
    } finally {
      this.running = false;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cycle = this.runOnce()
        .then(() => this.schedule(this.options.pollIntervalMs))
        .catch((error) => {
          this.logger.error(
            { err: toErrorMessage(error) },
            "Return delivery worker cycle failed",
          );
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    this.timer.unref?.();
  }
}
