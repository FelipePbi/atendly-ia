import { randomUUID } from "node:crypto";

import type { DiagnosticLogger } from "../../lib/diagnostic-log.js";
import { noopDiagnosticLogger } from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import { sanitizeInboxError } from "./inbox-policy.js";
import type { InboxClaim, InboxPort } from "./InboxStore.js";

export interface InboxHandler {
  dispatch(claim: InboxClaim): Promise<{
    status: "DONE" | "IGNORED";
    result: Record<string, unknown>;
  }>;
}

export interface InboxWorkerOptions {
  pollIntervalMs: number;
  leaseMs: number;
  groupWindowMs: number;
  batchLimit: number;
  maxConcurrentConversations: number;
  /**
   * Intervalo do heartbeat do lease.
   *
   * O orcamento de um lote (modelo + tools + envio) nao cabe num lease fixo, e
   * dimensiona-lo para o pior caso deixaria um worker morto segurando trabalho
   * por muito tempo. O lease continua curto e e renovado enquanto o lote
   * executa; quando o processo morre, ele expira sozinho.
   */
  leaseHeartbeatMs?: number;
  owner?: string;
}

/**
 * Loop de processamento no próprio processo da IA.
 *
 * Não há broker novo nem serviço novo: o trabalho está no PostgreSQL do dono e
 * este loop apenas reivindica, executa e conclui. Conversas distintas correm em
 * paralelo até o limite configurado; a mesma conversa, nunca — a exclusão vem
 * do claim, não daqui.
 *
 * Capacidade de execução contínua (quantas instâncias, com que garantia de
 * disponibilidade) é decisão de operação, fora deste Goal.
 */
export class InboxWorker {
  private readonly owner: string;
  private running = false;
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly inbox: InboxPort,
    private readonly handler: InboxHandler,
    private readonly options: InboxWorkerOptions,
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

  /** Acorda o loop sem esperar o próximo tick. */
  nudge(): void {
    if (this.stopped || this.running) return;
    this.schedule(0);
  }

  /**
   * Uma passada completa: reivindica até o limite de conversas simultâneas e
   * espera todas terminarem. Devolve quantos lotes foram executados.
   */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const inFlight: Array<Promise<void>> = [];
      for (
        let index = 0;
        index < this.options.maxConcurrentConversations;
        index += 1
      ) {
        const claim = await this.inbox.claimNext({
          owner: this.owner,
          leaseMs: this.options.leaseMs,
          groupWindowMs: this.options.groupWindowMs,
          batchLimit: this.options.batchLimit,
        });
        if (!claim) break;
        inFlight.push(this.execute(claim));
      }
      await Promise.all(inFlight);
      return inFlight.length;
    } finally {
      this.running = false;
    }
  }

  private async execute(claim: InboxClaim): Promise<void> {
    const ids = claim.events.map((event) => event.id);
    const heartbeat = this.startLeaseHeartbeat(claim, ids);
    try {
      const outcome = await this.handler.dispatch(claim);
      const applied = await this.inbox.complete({
        ids,
        leaseToken: claim.leaseToken,
        status: outcome.status,
        result: outcome.result,
      });
      if (applied === 0) {
        // Fencing: o lease já não é nosso. Outro worker assumiu depois da
        // expiração e é dele a palavra final sobre estes eventos.
        this.logger.warn(
          { conversationKey: claim.conversationKey, events: ids.length },
          "Inbox worker finished with an expired lease and did not apply the result",
        );
      }
    } catch (error) {
      const outcome = await this.inbox.fail({
        ids,
        leaseToken: claim.leaseToken,
        error,
        retryable: true,
      });
      this.logger[outcome.deadLettered ? "error" : "warn"](
        {
          conversationKey: claim.conversationKey,
          events: ids.length,
          deadLettered: outcome.deadLettered,
          err: sanitizeInboxError(error),
        },
        outcome.deadLettered
          ? "Inbox event moved to dead-letter and will not be retried automatically"
          : "Inbox event failed and was scheduled for retry",
      );
    } finally {
      heartbeat();
    }
  }

  /**
   * Renova o lease enquanto o lote executa e devolve como parar.
   *
   * A renovacao carrega o token do claim: um worker cujo lease ja expirou e
   * foi recuperado por outro nao consegue trazer o trabalho de volta — nesse
   * caso o heartbeat apenas registra e para.
   */
  private startLeaseHeartbeat(claim: InboxClaim, ids: string[]): () => void {
    const intervalMs =
      this.options.leaseHeartbeatMs ??
      Math.max(1000, Math.floor(this.options.leaseMs / 3));
    const renewLease = this.inbox.renewLease?.bind(this.inbox);
    if (!renewLease || intervalMs <= 0) return () => undefined;

    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        if (stopped) return;
        try {
          const renewed = await renewLease({
            ids,
            leaseToken: claim.leaseToken,
            leaseMs: this.options.leaseMs,
          });
          if (renewed === 0) {
            stopped = true;
            clearInterval(timer);
            this.logger.warn(
              { conversationKey: claim.conversationKey, events: ids.length },
              "Inbox worker could not renew an expired lease and stopped the heartbeat",
            );
          }
        } catch (error) {
          this.logger.warn(
            {
              conversationKey: claim.conversationKey,
              err: sanitizeInboxError(error),
            },
            "Inbox worker failed to renew the lease",
          );
        }
      })();
    }, intervalMs);
    timer.unref?.();

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cycle = this.runOnce()
        .then((processed) => {
          this.schedule(processed > 0 ? 0 : this.options.pollIntervalMs);
        })
        .catch((error) => {
          this.logger.error(
            { err: toErrorMessage(error) },
            "Inbox worker cycle failed",
          );
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    this.timer.unref?.();
  }
}
