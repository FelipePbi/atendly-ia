import { AppError } from "../../lib/errors.js";

/**
 * Vocabulario da execucao do teste real (Goal019).
 *
 * O que este arquivo declara e contrato de produto, nao detalhe interno: os
 * estados que a tela pode mostrar, os seis marcos do vault, a natureza do fato
 * que sustenta cada marco e o limite de tentativas. Nada disso pode viver so
 * dentro de uma funcao.
 */

/** Espelha o enum Prisma `ActivationTestRunState` (schema.prisma). */
export type ActivationTestRunState =
  "RUNNING" | "PAUSED_BY_HUMAN" | "SUCCEEDED" | "FAILED" | "DISCARDED";

/**
 * Estados terminais.
 *
 * Terminal e nao terminal sao conjuntos disjuntos e explicitos: pausada nao e
 * falha, falha nao e sucesso, e nenhuma tela precisa interpretar o mesmo valor
 * de duas formas. `DISCARDED` e a execucao pausada que a pessoa mandou
 * reiniciar — termina sem ser falha.
 */
export const TERMINAL_ACTIVATION_TEST_STATES = [
  "SUCCEEDED",
  "FAILED",
  "DISCARDED",
] as const satisfies readonly ActivationTestRunState[];

/** Estados nao terminais: a execucao continua viva e ocupa o tenant. */
export const LIVE_ACTIVATION_TEST_STATES = [
  "RUNNING",
  "PAUSED_BY_HUMAN",
] as const satisfies readonly ActivationTestRunState[];

export function isTerminalActivationTestState(
  state: ActivationTestRunState,
): boolean {
  return (TERMINAL_ACTIVATION_TEST_STATES as readonly string[]).includes(state);
}

export function isLiveActivationTestState(
  state: ActivationTestRunState,
): boolean {
  return (LIVE_ACTIVATION_TEST_STATES as readonly string[]).includes(state);
}

/** Espelha o enum Prisma `ActivationTestStep` (schema.prisma). */
export type ActivationTestStep =
  | "TEST_NOTICE"
  | "CLIENT_ASKS_PRICE"
  | "AI_IDENTIFIES_SERVICE"
  | "AI_ANSWERS_PRICE"
  | "CLIENT_ASKS_SLOT"
  | "AI_CHECKS_AVAILABILITY"
  | "CLIENT_ACCEPTS_SLOT"
  | "AI_CONFIRMS_APPOINTMENT";

/**
 * O caminho feliz do vault, na ordem do vault.
 *
 * O aviso de conversa de teste e o primeiro passo e e **separado**: ele avisa
 * que a conversa e de teste, nao demonstra nada e por isso nao tem marco.
 */
export const ACTIVATION_TEST_STEPS = [
  "TEST_NOTICE",
  "CLIENT_ASKS_PRICE",
  "AI_IDENTIFIES_SERVICE",
  "AI_ANSWERS_PRICE",
  "CLIENT_ASKS_SLOT",
  "AI_CHECKS_AVAILABILITY",
  "CLIENT_ACCEPTS_SLOT",
  "AI_CONFIRMS_APPOINTMENT",
] as const satisfies readonly ActivationTestStep[];

/** Espelha o enum Prisma `ActivationTestMilestoneName` (schema.prisma). */
export type ActivationTestMilestoneName =
  | "MESSAGE_SENT"
  | "SERVICE_IDENTIFIED"
  | "PRICE_INFORMED"
  | "AVAILABILITY_CHECKED"
  | "SLOT_SELECTED"
  | "APPOINTMENT_CONFIRMED";

/**
 * Os seis marcos do vault, na ordem em que a tela os le.
 *
 * Esta lista e fechada: progresso que nao esta aqui nao existe, e marco daqui
 * so aparece concluido se houver linha em `ActivationTestMilestone`.
 */
export const ACTIVATION_TEST_MILESTONES = [
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
] as const satisfies readonly ActivationTestMilestoneName[];

/** Espelha o enum Prisma `ActivationTestFactKind` (schema.prisma). */
export type ActivationTestFactKind =
  "MESSAGE" | "SERVICE" | "AVAILABILITY" | "APPOINTMENT";

/**
 * Fato observado que sustenta um marco.
 *
 * `id` e obrigatorio e nao pode ser vazio: e o ponteiro verificavel para a
 * linha gravada (mensagem, servico lido da agenda, consulta de
 * disponibilidade, agendamento criado). Nao existe fato "tempo decorrido".
 */
export interface ActivationTestFact {
  kind: ActivationTestFactKind;
  id: string;
  detail?: Record<string, unknown>;
}

/** Recusa: marco sem fonte nao e gravado, nem parcialmente. */
export const ACTIVATION_TEST_MILESTONE_FACT_REQUIRED =
  "ACTIVATION_TEST_MILESTONE_FACT_REQUIRED";

/**
 * Valida o fato antes de qualquer escrita.
 *
 * O banco ja recusa `factId` nulo; esta funcao recusa antes, com codigo
 * proprio, o caso de string vazia — que passaria pelo NOT NULL e viraria marco
 * sem fonte legivel.
 */
export function assertActivationTestFact(
  milestone: ActivationTestMilestoneName,
  fact: ActivationTestFact,
): ActivationTestFact {
  const id = fact?.id?.trim();
  if (!id) {
    throw new AppError(
      `Activation test milestone ${milestone} requires the recorded fact that supports it.`,
      {
        statusCode: 500,
        code: ACTIVATION_TEST_MILESTONE_FACT_REQUIRED,
        details: { milestone },
      },
    );
  }
  return { ...fact, id };
}

/**
 * Limite de tentativas por passo, **declarado no codigo** e copiado para a
 * linha da execucao na criacao.
 *
 * Tres: a primeira tentativa mais duas repeticoes. Falha transitoria repete;
 * falha de negocio (servico sumiu, horario nao existe mais) nao repete, porque
 * repetir nao muda a resposta.
 */
export const ACTIVATION_TEST_MAX_ATTEMPTS = 3;

/**
 * Codigos de recusa do inicio do teste.
 *
 * Cada causa tem codigo proprio e nenhuma delas e `500`: recusar o teste e
 * resultado, nao erro de servidor. O codigo do numero da plataforma vive em
 * `config/platform-whatsapp.ts` (`PLATFORM_NUMBER_NOT_CONFIGURED`), onde a
 * configuracao e resolvida.
 */
export const ACTIVATION_TEST_REFUSALS = {
  /** Nao ha vinculo de WhatsApp ativo para o tenant. */
  WHATSAPP_NOT_CONNECTED: "ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED",
  /** O vinculo existe mas o numero do tenant nao e conhecido/valido. */
  TENANT_PHONE_UNKNOWN: "ACTIVATION_TEST_TENANT_PHONE_UNKNOWN",
  /** Nenhum servico apto a agendamento normal na agenda do tenant. */
  NO_ELIGIBLE_SERVICE: "ACTIVATION_TEST_NO_ELIGIBLE_SERVICE",
  /** A agenda nao oferece nenhum horario: corrigir a agenda antes de testar. */
  NO_AVAILABILITY: "ACTIVATION_TEST_NO_AVAILABILITY",
  /** Ja existe execucao viva (em andamento ou pausada) para o tenant. */
  ALREADY_RUNNING: "ACTIVATION_TEST_ALREADY_RUNNING",

  /*
   * Codigos do que a **IA** deixou de fazer durante a execucao (Goal019,
   * blocker 4 da rodada 2).
   *
   * Eles existem porque a execucao reutilizava `NO_ELIGIBLE_SERVICE` — "nenhum
   * servico apto a agendamento" — para dizer que a IA nao tinha consultado a
   * agenda ou nao tinha confirmado o agendamento. O codigo viaja ate o
   * consumidor em `failureCode`, e mandava a pessoa mexer no catalogo por um
   * problema que nao estava no catalogo. Cada causa passa a ter nome proprio.
   */

  /** A IA nao registrou a chamada de ferramenta que o passo exige. */
  AI_DID_NOT_ACT: "ACTIVATION_TEST_AI_DID_NOT_ACT",
  /** A IA nao gravou resposta nenhuma na conversa de teste. */
  AI_DID_NOT_REPLY: "ACTIVATION_TEST_AI_DID_NOT_REPLY",
  /**
   * A IA respondeu, mas a resposta nao saiu pelo canal do negocio.
   *
   * Separado de `AI_DID_NOT_REPLY` de proposito: uma coisa e a IA nao ter
   * atendido, outra e o WhatsApp do negocio nao ter entregue o que ela
   * respondeu. As duas falham o teste; a segunda nao e culpa da IA.
   */
  AI_REPLY_NOT_DELIVERED: "ACTIVATION_TEST_AI_REPLY_NOT_DELIVERED",
  /** A ferramenta de agendamento rodou sem confirmar agendamento nenhum. */
  AI_DID_NOT_CONFIRM_APPOINTMENT:
    "ACTIVATION_TEST_AI_DID_NOT_CONFIRM_APPOINTMENT",
} as const;

export type ActivationTestRefusalCode =
  (typeof ACTIVATION_TEST_REFUSALS)[keyof typeof ACTIVATION_TEST_REFUSALS];

/** Recusa de inicio: sempre 409, nunca 500. */
export function activationTestRefusal(
  code: ActivationTestRefusalCode,
  message: string,
  details?: Record<string, unknown>,
): AppError {
  return new AppError(message, { statusCode: 409, code, details });
}

/**
 * Execucao abandonada: ninguem a levou a termo.
 *
 * O inicio do teste responde `202` e a execucao segue no processo do servidor.
 * Se o processo reiniciar ou morrer no meio, a linha fica `RUNNING` com
 * `finishedAt: null` e o indice unico parcial trava o tenant para sempre — o
 * negocio nunca mais consegue testar, e nada no produto percebe.
 *
 * A saida honesta nao e apagar a linha nem fingir que ela terminou bem: a
 * execucao **falhou**, com codigo proprio, e o passo onde ela parou continua
 * legivel. A pessoa ve que o teste nao terminou e pode tentar de novo.
 */
export const ACTIVATION_TEST_ABANDONED = "ACTIVATION_TEST_ABANDONED";

/**
 * Silencio a partir do qual uma execucao `RUNNING` e considerada abandonada.
 *
 * Declarado aqui, e nao dentro de uma funcao, porque e limite de produto: e o
 * tempo que o produto espera antes de dizer que ninguem esta mais tocando
 * aquela execucao. Cada passo concluido, cada tentativa e cada erro gravado
 * atualizam a linha, entao uma execucao viva de verdade nunca fica cinco
 * minutos parada — nem quando esta esperando o backoff da ultima tentativa.
 */
export const ACTIVATION_TEST_STALE_AFTER_MS = 5 * 60_000;

/**
 * A execucao esta `RUNNING` mas ninguem a esta tocando?
 *
 * Funcao pura sobre o que a linha ja grava (`state` e `updatedAt`): nao ha
 * aqui leitura de processo, de lock nem de heartbeat proprio. `PAUSED_BY_HUMAN`
 * **nunca** e abandonada — ela esta parada de proposito, esperando a pessoa
 * decidir reiniciar, e expira-la seria descartar a decisao dela.
 */
export function isAbandonedActivationTestRun(
  run: { state: ActivationTestRunState; updatedAt: Date },
  now: Date,
  staleAfterMs: number = ACTIVATION_TEST_STALE_AFTER_MS,
): boolean {
  if (run.state !== "RUNNING") return false;
  return now.getTime() - run.updatedAt.getTime() >= staleAfterMs;
}

/** Falha da execucao no passo: a execucao termina em falha, a rota nao. */
export const ACTIVATION_TEST_STEP_FAILED = "ACTIVATION_TEST_STEP_FAILED";

/**
 * Passo em linguagem do negocio, para a tela nomear o que falhou sem traduzir
 * enum por conta propria.
 */
export const ACTIVATION_TEST_STEP_LABELS: Record<ActivationTestStep, string> = {
  TEST_NOTICE: "avisar que esta e uma conversa de teste",
  CLIENT_ASKS_PRICE: "enviar a primeira mensagem do cliente de teste",
  AI_IDENTIFIES_SERVICE: "identificar o servico perguntado",
  AI_ANSWERS_PRICE: "informar o preco do servico",
  CLIENT_ASKS_SLOT: "pedir o proximo horario disponivel",
  AI_CHECKS_AVAILABILITY: "consultar a agenda",
  CLIENT_ACCEPTS_SLOT: "aceitar o horario oferecido",
  AI_CONFIRMS_APPOINTMENT: "confirmar o agendamento",
};

/** Marco alcancado, como a leitura devolve. */
export interface ActivationTestMilestoneRecord {
  milestone: ActivationTestMilestoneName;
  reachedAt: Date;
  factKind: ActivationTestFactKind;
  factId: string;
}

export interface ActivationTestProgressItem {
  milestone: ActivationTestMilestoneName;
  reached: boolean;
  reachedAt: Date | null;
  /** Fonte do fato. `null` **so** quando o marco nao foi alcancado. */
  source: { kind: ActivationTestFactKind; id: string } | null;
}

/**
 * Progresso: os seis marcos, um a um, derivados **exclusivamente** dos fatos
 * gravados.
 *
 * Nao recebe relogio, nao recebe o estado da execucao e nao recebe o passo
 * corrente — de proposito. Nao ha entrada aqui que permita afirmar um marco
 * por tempo decorrido, por animacao ou porque "a essa altura ja deve ter
 * acontecido"; a unica forma de um marco ficar `reached` e existir uma linha
 * de fato para ele.
 */
export function activationTestProgress(
  milestones: readonly ActivationTestMilestoneRecord[],
): ActivationTestProgressItem[] {
  const byName = new Map(
    milestones.map((record) => [record.milestone, record] as const),
  );
  return ACTIVATION_TEST_MILESTONES.map((milestone) => {
    const record = byName.get(milestone);
    if (!record) {
      return { milestone, reached: false, reachedAt: null, source: null };
    }
    return {
      milestone,
      reached: true,
      reachedAt: record.reachedAt,
      source: { kind: record.factKind, id: record.factId },
    };
  });
}
