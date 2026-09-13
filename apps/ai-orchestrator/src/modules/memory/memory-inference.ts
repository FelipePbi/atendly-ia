import type { AppointmentDraft } from "../assistant/assistant.service.js";
import type { CustomerMemoryKind } from "./customer-memory.js";

/**
 * Evidencia **verificavel** do que o turno confirmou.
 *
 * Nao sai do que o modelo afirmou no JSON da decisao (`status: "confirmed"` e
 * texto, nao fato): sai das `AiToolCall` concluidas com sucesso neste `AiRun`.
 * Rascunho nao confirmado e hipotese de conversa, e hipotese nao vira memoria
 * da pessoa.
 */
export interface TurnAppointmentEvidence {
  /** `create_appointment` com `action = confirm` concluida com sucesso. */
  appointmentConfirmed: boolean;
  /**
   * `confirm_recurring_appointments` concluida com sucesso: a repeticao foi
   * combinada de forma explicita, entao o servico e recorrente de fato.
   */
  recurringSeriesConfirmed: boolean;
}

/**
 * Candidato a memoria da pessoa, extraido de **um** atendimento confirmado.
 *
 * A inferencia le apenas o atendimento que o turno de fato criou, nunca texto
 * livre da conversa nem o acumulado da `ConversationMemory`: o que entra na
 * memoria da pessoa precisa ter saido de um efeito verificavel deste turno,
 * com as mensagens de origem.
 */
export interface CustomerMemoryCandidate {
  kind: CustomerMemoryKind;
  value: string;
  confidence: number;
  /**
   * Candidato que so **reforca** memoria ja registrada para a pessoa e nunca
   * cria linha nova.
   *
   * E o caso do servico de um atendimento avulso: um atendimento e uma
   * ocorrencia, e uma ocorrencia nao e recorrencia. Ele rejuvenesce a
   * preferencia que ja existia — cadastrada pela profissional, afirmada pela
   * cliente ou inferida de uma serie recorrente — e nada mais.
   */
  reinforceOnly?: boolean;
}

const PERIOD_LABELS: Record<
  NonNullable<AppointmentDraft["desiredPeriod"]>,
  string
> = {
  morning: "manha",
  afternoon: "tarde",
  evening: "noite",
};

const WEEKDAY_LABELS = [
  "domingo",
  "segunda-feira",
  "terca-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sabado",
] as const;

/**
 * Confianca da inferencia por tipo. Nao e calibragem estatistica: e a ordem de
 * quanto o produto confia em cada sinal quando a profissional revisar a lista.
 */
const CONFIDENCE: Record<CustomerMemoryKind, number> = {
  PREFERRED_PERIOD: 0.6,
  PREFERRED_DAY: 0.5,
  RECURRING_SERVICE: 0.6,
  OBSERVATION: 0.4,
};

/** Observacao longa demais nao e preferencia: e conversa. */
const MAX_OBSERVATION_LENGTH = 280;

export function inferCustomerMemoryCandidates(input: {
  /** Rascunho do turno ja mesclado ao estado, que descreve o atendimento. */
  appointment: Partial<AppointmentDraft> | undefined;
  evidence: TurnAppointmentEvidence;
}): CustomerMemoryCandidate[] {
  const { appointment, evidence } = input;
  // Porta unica: sem atendimento confirmado neste turno nao existe candidato
  // nenhum. Periodo, dia e observacao de um rascunho em construcao sao o que a
  // conversa estava tentando marcar, nao o que a pessoa prefere.
  if (!evidence.appointmentConfirmed && !evidence.recurringSeriesConfirmed) {
    return [];
  }
  if (!appointment) return [];

  const candidates: CustomerMemoryCandidate[] = [];

  const period = appointment.desiredPeriod;
  if (period && period in PERIOD_LABELS) {
    candidates.push({
      kind: "PREFERRED_PERIOD",
      value: PERIOD_LABELS[period],
      confidence: CONFIDENCE.PREFERRED_PERIOD,
    });
  }

  const weekday = weekdayLabel(appointment.desiredDate);
  if (weekday) {
    candidates.push({
      kind: "PREFERRED_DAY",
      value: weekday,
      confidence: CONFIDENCE.PREFERRED_DAY,
    });
  }

  for (const service of appointment.services ?? []) {
    const name = service?.name?.trim();
    if (!name) continue;
    candidates.push({
      kind: "RECURRING_SERVICE",
      value: name,
      confidence: CONFIDENCE.RECURRING_SERVICE,
      // Serie recorrente confirmada e repeticao combinada; atendimento avulso
      // so reforca o que ja estava registrado.
      reinforceOnly: !evidence.recurringSeriesConfirmed,
    });
  }

  const notes = appointment.notes?.trim();
  if (notes && notes.length <= MAX_OBSERVATION_LENGTH) {
    candidates.push({
      kind: "OBSERVATION",
      value: notes,
      confidence: CONFIDENCE.OBSERVATION,
    });
  }

  return candidates;
}

/**
 * Dia da semana de uma data `YYYY-MM-DD` do atendimento.
 *
 * Lida ao meio-dia UTC de proposito: a data do atendimento e um dia civil, e
 * interpretar "2026-09-14" a meia-noite UTC faz o dia virar no fuso do
 * negocio.
 */
function weekdayLabel(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date.trim());
  if (!match) return undefined;
  const parsed = new Date(`${match[0]}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return WEEKDAY_LABELS[parsed.getUTCDay()];
}
