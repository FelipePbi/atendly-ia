import type { InternalRequestContext } from "../clients/internal-http-client.js";
import type { SchedulingClient } from "../clients/scheduling/index.js";
import { toErrorMessage } from "./errors.js";

/**
 * O que a reconciliação de fuso fez nesta requisição.
 *
 * Conjunto fechado e legível: quem lê o estado precisa saber se houve efeito e
 * qual, e "nada a fazer" é resposta, não ausência de resposta.
 */
export type TimezoneReconciliationOutcome =
  /** As duas cópias já concordavam: nenhuma escrita foi emitida. */
  | "NOOP"
  /** Havia divergência e a única tentativa desta passada a resolveu. */
  | "CONVERGED"
  /** Havia divergência e a tentativa de convergir não deu certo. */
  | "FAILED"
  /**
   * Não há réplica: o negócio nunca escolheu agenda, e `CalendarSettings` não
   * existe para este tenant. Nada foi escrito — ver a propriedade 5.
   */
  | "ABSENT"
  /** Faltou leitura para decidir: nada foi mudado. */
  | "UNKNOWN";

/**
 * O resultado completo de uma passada, do jeito que um chamador de leitura
 * precisa para responder sem mentir: o valor do dono, o valor da réplica
 * **depois** desta passada e se a convergência é fato observado, não intenção.
 */
export interface TimezoneReconciliationResult {
  outcome: TimezoneReconciliationOutcome;
  /** Fuso do dono (`BusinessProfile.timezone`), ou `null` se não há dono gravado. */
  businessTimezone: string | null;
  /**
   * Fuso da réplica ao fim desta passada, ou `null` quando ilegível/ausente.
   * `null` numa leitura do calendário significa `CalendarSettings` inexistente:
   * a coluna é `NOT NULL`, então o valor nulo só vem de "não há linha".
   */
  calendarTimezone: string | null;
  /** `true` só quando as duas cópias foram observadas iguais ao fim desta passada. */
  converged: boolean;
}

/** O mínimo de cliente que a reconciliação precisa. */
export interface TimezoneReconciliationDeps {
  scheduling: Pick<SchedulingClient, "calendar" | "configureCalendar">;
  log: TimezoneReconciliationLogger;
}

/** O mínimo de log que a reconciliação precisa; existe para não arrastar a request. */
export interface TimezoneReconciliationLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

export interface TimezoneReconciliationInput {
  /**
   * O dono já lido pelo chamador. `null` quando o negócio ainda não tem
   * `BusinessProfile` gravado — caminho real no onboarding.
   */
  businessTimezone: string | null;
  /**
   * A réplica já lida pelo chamador. Omitir faz o módulo ler o calendário uma
   * vez; passar evita consulta nova em quem já carregou o calendário (é o caso
   * de toda leitura de estado que hoje lê as duas cópias na mesma função).
   */
  calendarTimezone?: string | null;
}

/**
 * A decisão do dono do fuso do negócio, num ponto só.
 *
 * `BusinessProfile.timezone` é o dono; `CalendarSettings.timezone` é **réplica
 * derivada**. A réplica continua sendo a fonte da matemática de data do
 * Scheduling e continua sendo lida por todo mundo que já a lê — o que ela
 * deixa de ser é uma **decisão própria**. Duas bases sem transação comum não
 * podem ter dois decisores: se as duas decidissem, a divergência seria estado
 * válido e nenhuma leitura saberia qual das duas é o fuso do negócio.
 *
 * A direção é sempre BFF → Scheduling. O Scheduling não passa a consultar o
 * BFF: uma leitura de agenda que dependesse de uma chamada nova ao BFF trocaria
 * duplicação de dado por acoplamento de disponibilidade entre os dois serviços.
 */
export function businessTimezoneOwner(
  profile: { timezone: string } | null | undefined,
): string | null {
  return profile?.timezone ?? null;
}

/**
 * Reconciliação dono/réplica do fuso do negócio, no padrão de `ai-activation.ts`
 * e prevista em **D-010**. Quatro propriedades sustentam isso, e nenhuma é
 * opcional:
 *
 * 1. **Limitada.** No máximo uma tentativa de escrita no Scheduling por
 *    requisição. Não há laço, não há retentativa interna e não há processo de
 *    fundo — a continuidade vem da próxima requisição, não de um job novo.
 *    (`configureCalendar` é `PATCH`, e o cliente interno só reexecuta `GET`.)
 * 2. **Idempotente.** Sobre um tenant já convergido não há escrita nova nem
 *    efeito novo: dono igual à réplica devolve `NOOP` sem tocar no Scheduling.
 * 3. **Nunca lança.** Toda falha vira `FAILED` com log; leitura não pode virar
 *    `500` por causa de um efeito que ela tentou de favor.
 * 4. **Honesta.** `converged` só é `true` com as duas cópias observadas iguais
 *    nesta mesma passada, e `UNKNOWN` é dito quando faltou leitura para
 *    decidir. Nenhum caminho aqui afirma convergência que não aconteceu.
 * 5. **Só converge réplica que existe.** Tenant sem `CalendarSettings` sai
 *    como `ABSENT`, sem escrita nenhuma. Reconciliação replica valor; criar a
 *    linha não seria replicar. Criar seria escrever dado novo que o Goal não
 *    autoriza ("o único dado que muda de valor é `CalendarSettings.timezone`,
 *    e só quando ele divergia do dono") e, pior, mudaria a resposta de rota
 *    pública: a linha é o que faz `calendar.source` virar `ATENDLY` e as
 *    `capabilities` de agenda virarem `true`. Uma leitura passaria a ligar
 *    agenda para um negócio que nunca a escolheu.
 *
 * Fuso IANA inválido **não** é conferido aqui de propósito: a validação já
 * existe nas entradas públicas que escrevem o dono e no próprio Scheduling, que
 * recusa o `PATCH`. Recusar aqui seria um terceiro parser de fuso dizendo a
 * mesma coisa; deixar o Scheduling recusar faz a recusa aparecer como
 * `FAILED` legível, que é o que o chamador precisa saber.
 */
export async function reconcileBusinessTimezone(
  context: InternalRequestContext,
  deps: TimezoneReconciliationDeps,
  input: TimezoneReconciliationInput,
): Promise<TimezoneReconciliationResult> {
  const businessTimezone = input.businessTimezone;
  try {
    return await reconcile(context, deps, businessTimezone, input);
  } catch (error) {
    deps.log.warn(
      { err: toErrorMessage(error), tenantId: context.tenantId },
      "Business timezone reconciliation failed; calendar timezone stays as read.",
    );
    return {
      outcome: "FAILED",
      businessTimezone,
      calendarTimezone: input.calendarTimezone ?? null,
      converged: false,
    };
  }
}

async function reconcile(
  context: InternalRequestContext,
  deps: TimezoneReconciliationDeps,
  businessTimezone: string | null,
  input: TimezoneReconciliationInput,
): Promise<TimezoneReconciliationResult> {
  // Sem dono gravado não há o que replicar, e adivinhar o dono a partir da
  // réplica inverteria a direção que este módulo existe para fixar.
  if (businessTimezone === null) {
    return {
      outcome: "UNKNOWN",
      businessTimezone: null,
      calendarTimezone: input.calendarTimezone ?? null,
      converged: false,
    };
  }

  const calendarTimezone =
    input.calendarTimezone !== undefined
      ? input.calendarTimezone
      : (await deps.scheduling.calendar(context)).timezone;

  // Réplica ausente não é réplica divergente (propriedade 5). `null` aqui é
  // "não há `CalendarSettings`", não "há e vale nulo": a coluna é `NOT NULL`
  // no Scheduling, e a leitura do calendário devolve `timezone: null` no
  // mesmo caso em que devolve `source: null` e todas as `capabilities` de
  // agenda em `false`. Escrever agora criaria a linha e mudaria as três
  // coisas de uma vez, numa requisição que só lê.
  if (calendarTimezone === null) {
    return {
      outcome: "ABSENT",
      businessTimezone,
      calendarTimezone: null,
      converged: false,
    };
  }

  if (calendarTimezone === businessTimezone) {
    return {
      outcome: "NOOP",
      businessTimezone,
      calendarTimezone,
      converged: true,
    };
  }

  // A única escrita desta passada. `source` vai `ATENDLY` e nada mais: o valor
  // está travado pela `CalendarSettings_source_atendly_check` (Goal027).
  const calendar = await deps.scheduling.configureCalendar(context, {
    source: "ATENDLY",
    timezone: businessTimezone,
  });
  const converged = calendar.timezone === businessTimezone;
  return {
    outcome: converged ? "CONVERGED" : "FAILED",
    businessTimezone,
    calendarTimezone: calendar.timezone,
    converged,
  };
}
