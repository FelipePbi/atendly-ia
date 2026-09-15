import { randomUUID } from "node:crypto";

import { toErrorMessage } from "../../lib/errors.js";
import {
  type RetentionPurgePorts,
  type RetentionSweepLogger,
  type RetentionSweepOptions,
  type RetentionSweepPrisma,
  type RetentionSweepSummary,
  runRetentionSweep,
  silentSweepLogger,
} from "./sweep.js";

/**
 * Laço batido no processo do BFF (Goal023/WU-05, G-29).
 *
 * Mesmo formato do entregador de lembretes do Goal021 e pelo mesmo motivo
 * (D-008): o trabalho durável já está no PostgreSQL, então aqui só há acordar,
 * chamar {@link runRetentionSweep} e voltar a dormir. Não existe broker novo,
 * cron do sistema operacional nem serviço novo.
 *
 * O QUE ESTA CLASSE GARANTE ALÉM DE RODAR:
 *
 * - **Não sobe em teste.** Quem instancia é `buildApp`, e só quando
 *   `RETENTION_SWEEP_ENABLED` está ligado — desligado por default. As suítes
 *   chamam `runRetentionSweep`/`sweepTenant` diretamente.
 * - **Não segura o desligamento.** O timer é `unref`, então nunca sozinho
 *   mantém o processo vivo, e `stop()` cancela o próximo tick e espera só o
 *   ciclo em voo, que por sua vez nunca lança.
 * - **Não lança para fora.** Um ciclo que falhar de forma inesperada vira log
 *   e reagendamento; nada escapa para um `setTimeout` sem dono, onde viraria
 *   `unhandledRejection` e derrubaria o processo inteiro do BFF por causa de
 *   trabalho de fundo.
 */
export interface RetentionSweepWorkerOptions extends Omit<
  RetentionSweepOptions,
  "logger" | "now" | "owner"
> {
  /** Intervalo entre passadas quando a anterior não deixou trabalho. */
  pollIntervalMs: number;
  owner?: string;
}

export class RetentionSweepWorker {
  private readonly owner: string;
  private running = false;
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly prisma: RetentionSweepPrisma,
    private readonly ports: RetentionPurgePorts,
    private readonly options: RetentionSweepWorkerOptions,
    private readonly logger: RetentionSweepLogger = silentSweepLogger,
  ) {
    this.owner = options.owner ?? `bff:${randomUUID()}`;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(this.options.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.cycle?.catch(() => undefined);
  }

  /** Uma passada completa. Nunca lança; devolve o resumo da varredura. */
  async runOnce(): Promise<RetentionSweepSummary> {
    if (this.running) {
      return {
        tenantsClaimed: 0,
        tenantsSkipped: 0,
        rows: 0,
        hasMore: false,
        failed: 0,
      };
    }
    this.running = true;
    try {
      return await runRetentionSweep(this.prisma, this.ports, {
        owner: this.owner,
        leaseTtlSeconds: this.options.leaseTtlSeconds,
        tenantBatchLimit: this.options.tenantBatchLimit,
        maxRowsPerStore: this.options.maxRowsPerStore,
        minTenantIntervalSeconds: this.options.minTenantIntervalSeconds,
        logger: this.logger,
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Restou trabalho: a próxima passada vem imediatamente, porque o teto por
   * store é do fôlego de uma passada, não do prazo do negócio. Sem trabalho, o
   * laço volta ao intervalo configurado.
   */
  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cycle = this.runOnce()
        .then((summary) => {
          this.schedule(summary.hasMore ? 0 : this.options.pollIntervalMs);
        })
        .catch((error) => {
          this.logger.error(
            { err: toErrorMessage(error) },
            "Retention sweep worker cycle failed",
          );
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    // Trabalho de fundo nunca é motivo para o processo continuar vivo.
    this.timer.unref?.();
  }
}
