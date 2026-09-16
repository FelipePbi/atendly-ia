import { randomUUID } from "node:crypto";

import { toErrorMessage } from "../../lib/errors.js";
import {
  type AccountPurgeLogger,
  type AccountPurgeOptions,
  type AccountPurgePorts,
  type AccountPurgePrisma,
  type AccountPurgeSummary,
  runAccountPurge,
  silentAccountPurgeLogger,
} from "./purge.js";

/**
 * Laço batido no processo do BFF (Goal025/WU-07).
 *
 * Mesmo formato do `RetentionSweepWorker` (Goal023/WU-05) e pelo mesmo motivo
 * (D-008): o trabalho durável já está no PostgreSQL, então aqui só há acordar,
 * chamar {@link runAccountPurge} e voltar a dormir. Não existe broker novo,
 * cron do sistema operacional nem serviço novo.
 *
 * O QUE ESTA CLASSE GARANTE ALÉM DE RODAR:
 *
 * - **Não sobe em teste.** Quem instancia é `buildApp`, e só quando
 *   `ACCOUNT_PURGE_ENABLED` está ligado — desligado por default, por variável
 *   própria, separada da varredura de retenção. As suítes chamam
 *   `runAccountPurge`/`purgeAccount` diretamente.
 * - **Não segura o desligamento.** O timer é `unref`, então nunca sozinho
 *   mantém o processo vivo, e `stop()` cancela o próximo tick e espera só o
 *   ciclo em voo, que por sua vez nunca lança.
 * - **Não lança para fora.** Um ciclo que falhar de forma inesperada vira log
 *   e reagendamento; nada escapa para um `setTimeout` sem dono, onde viraria
 *   `unhandledRejection` e derrubaria o processo inteiro do BFF por causa de
 *   trabalho de fundo — que aqui é a purga de contas vencidas, a coisa menos
 *   urgente e mais destrutiva do produto.
 */
export interface AccountPurgeWorkerOptions extends Omit<
  AccountPurgeOptions,
  "logger" | "owner"
> {
  /** Intervalo entre passadas quando a anterior não deixou trabalho. */
  pollIntervalMs: number;
  owner?: string;
}

export class AccountPurgeWorker {
  private readonly owner: string;
  private running = false;
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly prisma: AccountPurgePrisma,
    private readonly ports: AccountPurgePorts,
    private readonly options: AccountPurgeWorkerOptions,
    private readonly logger: AccountPurgeLogger = silentAccountPurgeLogger,
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

  /** Uma passada completa. Nunca lança; devolve o resumo da purga. */
  async runOnce(): Promise<AccountPurgeSummary> {
    if (this.running) {
      return {
        accountsClaimed: 0,
        accountsSkipped: 0,
        accountsPurged: 0,
        failed: 0,
        hasMore: false,
      };
    }
    this.running = true;
    try {
      return await runAccountPurge(this.prisma, this.ports, {
        owner: this.owner,
        leaseTtlSeconds: this.options.leaseTtlSeconds,
        accountBatchLimit: this.options.accountBatchLimit,
        maxRowsPerStore: this.options.maxRowsPerStore,
        logger: this.logger,
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Restou trabalho: a próxima passada vem imediatamente, porque o teto por
   * loja é do fôlego de uma passada, não do prazo da conta. Sem trabalho, o
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
            "Account purge worker cycle failed",
          );
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    // Trabalho de fundo nunca é motivo para o processo continuar vivo.
    this.timer.unref?.();
  }
}
