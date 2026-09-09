import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import { toErrorMessage } from "../../shared/errors/app-error.js";
import { databaseNow } from "../calendar/write-policy.js";
import { completeAppointmentWithin } from "./appointment-lifecycle-service.js";

/**
 * Conclusão automática (Goal008, D-008): job no banco do dono, sem fila nem
 * serviço novo. O lease é `pg_try_advisory_xact_lock`, não bloqueante e preso
 * à transação da própria varredura — libera sozinho no commit ou rollback,
 * então uma instância que trava não segura o lease para sempre. Duas
 * instâncias correndo o loop ao mesmo tempo nunca processam a mesma janela:
 * quem não consegue o lock devolve sem tocar em nada.
 */
const AUTO_COMPLETE_LOCK_KEY = "scheduling:auto-complete";

export interface AutoCompleteSweepResult {
  /** `false` quando outra instância já segurava o lease nesta rodada. */
  locked: boolean;
  completed: number;
}

/**
 * Varre, em uma única transação, os atendimentos confirmados cujo término
 * venceu há `graceMinutes` (relógio do banco) e os conclui com origem
 * `AUTO`. Nunca toca `CANCELLED` nem `NO_SHOW` — o filtro é `status =
 * 'CONFIRMED'`, o mesmo que `completeAppointmentWithin` já exige — e repetir
 * a varredura sobre o mesmo atendimento não duplica efeito nem evento.
 */
export async function runAutoCompleteSweep(
  prisma: PrismaClient,
  options: { graceMinutes: number },
): Promise<AutoCompleteSweepResult> {
  return prisma.$transaction(async (transaction) => {
    const lockRows = await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${AUTO_COMPLETE_LOCK_KEY})) AS locked`,
    );
    if (!lockRows[0]?.locked) return { locked: false, completed: 0 };

    const now = await databaseNow(transaction);
    const cutoff = new Date(now.getTime() - options.graceMinutes * 60_000);
    const due = await transaction.appointment.findMany({
      where: { status: "CONFIRMED", endAt: { lte: cutoff } },
    });

    let completed = 0;
    for (const appointment of due) {
      const outcome = await completeAppointmentWithin(transaction, {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        origin: "AUTO",
        actor: null,
        now,
      });
      if (outcome.applied) completed += 1;
    }
    return { locked: true, completed };
  });
}

export interface AutoCompleteLoopLogger {
  error(details: unknown, message?: string): void;
}

const noopLogger: AutoCompleteLoopLogger = { error: () => undefined };

export interface AutoCompleteLoopOptions {
  pollIntervalMs: number;
  graceMinutes: number;
}

/**
 * Loop no próprio processo do Scheduling (D-008): sem broker nem serviço
 * novo. `runOnce` é a rotina invocável isoladamente — por teste ou por rota
 * interna — sem depender do agendamento do timer.
 */
export class AutoCompleteLoop {
  private stopped = true;
  private timer?: NodeJS.Timeout;
  private cycle?: Promise<void>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: AutoCompleteLoopOptions,
    private readonly logger: AutoCompleteLoopLogger = noopLogger,
  ) {}

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

  async runOnce(): Promise<AutoCompleteSweepResult> {
    return runAutoCompleteSweep(this.prisma, {
      graceMinutes: this.options.graceMinutes,
    });
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cycle = this.runOnce()
        .catch((error) => {
          this.logger.error(
            { err: toErrorMessage(error) },
            "Auto-complete sweep failed",
          );
        })
        .then(() => {
          this.schedule(this.options.pollIntervalMs);
        });
    }, delayMs);
    this.timer.unref?.();
  }
}
