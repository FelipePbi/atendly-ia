import { randomUUID } from "node:crypto";

import type { DiagnosticLogger } from "../../lib/diagnostic-log.js";
import { noopDiagnosticLogger } from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type {
  ClaimedNotificationIntent,
  ClaimNotificationIntentsInput,
  NotificationClaimResult,
  SchedulingRequestContext,
} from "../scheduling-service/types.js";

/**
 * Reivindicacao das intencoes vencidas. E a unica chamada da plataforma que
 * atravessa negocios, de proposito: quem entrega atende todos, e a fila vence
 * por `dueAt`.
 */
export interface NotificationClaimPort {
  claimDueNotificationIntents(
    input: ClaimNotificationIntentsInput,
    context?: SchedulingRequestContext,
  ): Promise<NotificationClaimResult>;
}

/** O que a varredura faz com cada intencao reivindicada. */
export interface NotificationDeliveryHandler {
  deliver(intent: ClaimedNotificationIntent): Promise<unknown>;
}

export interface NotificationDeliveryWorkerOptions {
  pollIntervalMs: number;
  leaseTtlSeconds: number;
  batchLimit: number;
  perTenantLimit: number;
  owner?: string;
}

/**
 * Tenant declarado no cabecalho da reivindicacao.
 *
 * A rota de claim atravessa negocios e **nao** le este valor para decidir
 * nada: quem autoriza e a credencial do entregador (`requireDeliveryCaller` no
 * dono). O cabecalho e contexto de requisicao, e um nome fixo e honesto e
 * melhor do que um tenant real escolhido ao acaso, que pareceria escopo.
 */
export const NOTIFICATION_SWEEP_SCOPE = "notification-delivery-sweep";

/**
 * Loop de entrega no proprio processo da IA (Goal021).
 *
 * Mesmo formato do `InboxWorker` e pelo mesmo motivo (D-008): o trabalho
 * duravel ja esta no PostgreSQL do dono da agenda, entao aqui so ha
 * reivindicar, entregar e liquidar. Nao existe broker novo, fila externa,
 * cron do sistema operacional nem servico novo.
 *
 * Nao ha heartbeat de lease como no `InboxWorker`: o orcamento de uma entrega
 * e um envio de texto, nao um lote de modelo com tools. Lease vencido nao se
 * perde — a varredura seguinte o devolve para pendente com tentativa contada,
 * e a saida com `correlationId` deterministico impede que essa devolucao vire
 * uma segunda mensagem.
 *
 * As intencoes do lote correm em sequencia: elas ja vem espalhadas entre
 * negocios pelo teto por tenant do dono, e o ganho de paralelizar um envio de
 * texto nao paga o risco de rajada num unico numero.
 */
export class NotificationDeliveryWorker {
  private readonly owner: string;
  private running = false;
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly claims: NotificationClaimPort,
    private readonly handler: NotificationDeliveryHandler,
    private readonly options: NotificationDeliveryWorkerOptions,
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

  /** Acorda o loop sem esperar o proximo tick. */
  nudge(): void {
    if (this.stopped || this.running) return;
    this.schedule(0);
  }

  /**
   * Uma passada completa: reivindica o lote e entrega tudo o que veio.
   * Devolve quantas intencoes foram entregues.
   */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const claim = await this.claims.claimDueNotificationIntents(
        {
          owner: this.owner,
          limit: this.options.batchLimit,
          perTenantLimit: this.options.perTenantLimit,
          leaseTtlSeconds: this.options.leaseTtlSeconds,
        },
        {
          tenantId: NOTIFICATION_SWEEP_SCOPE,
          userId: "ai-orchestrator",
          requestId: `notification-sweep-${randomUUID()}`,
        },
      );
      if (
        claim.settled.length > 0 ||
        claim.released > 0 ||
        claim.exhausted > 0 ||
        claim.skipped > 0
      ) {
        this.logger.info(
          {
            claimed: claim.claimed.length,
            settledByOwner: claim.settled.length,
            released: claim.released,
            exhausted: claim.exhausted,
            skipped: claim.skipped,
          },
          "Notification sweep claimed a batch",
        );
      }
      for (const intent of claim.claimed) {
        await this.execute(intent);
      }
      return claim.claimed.length;
    } finally {
      this.running = false;
    }
  }

  /**
   * Uma intencao nunca derruba a varredura.
   *
   * O servico de entrega ja liquida cada desfecho, inclusive falha de
   * transporte; o que chega aqui como excecao e falha inesperada, e deixar o
   * lease vencer e a resposta certa — a intencao volta para pendente com
   * tentativa contada, em vez de sumir junto com o ciclo.
   */
  private async execute(intent: ClaimedNotificationIntent): Promise<void> {
    try {
      await this.handler.deliver(intent);
    } catch (error) {
      this.logger.error(
        {
          tenantId: intent.tenantId,
          intentId: intent.id,
          appointmentId: intent.appointmentId,
          err: toErrorMessage(error),
        },
        "Notification intent delivery failed and will wait for the lease to expire",
      );
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cycle = this.runOnce()
        .then((delivered) => {
          this.schedule(delivered > 0 ? 0 : this.options.pollIntervalMs);
        })
        .catch((error) => {
          this.logger.error(
            { err: toErrorMessage(error) },
            "Notification delivery worker cycle failed",
          );
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    this.timer.unref?.();
  }
}
