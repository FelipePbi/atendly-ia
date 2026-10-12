"use client";

import clsx from "clsx";
import { useId, useRef, useState } from "react";

import { type Appointment, type SeriesOccurrencePreview } from "@/data";
import {
  schedulingRefusalCode,
  schedulingRefusalDetails,
} from "@/data/http/schedulingRefusal";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import { formatMoney } from "./AppointmentFlowShell";
import { newIdempotencyKey } from "./holdSession";
import { formatDate, parseDate, requestError } from "./occupancy";

/**
 * Recorrência dentro do novo agendamento (D-171, pedido de 2026-10-12): a
 * tela "Série de atendimentos" saiu; quem quer repetir liga "Repetir este
 * atendimento" no próprio formulário, escolhe quantos atendimentos e o
 * intervalo, e revisa a lista antes de confirmar.
 *
 * A API é a de sempre (Goal009): a prévia projeta as ocorrências e reserva um
 * hold por ocorrência encontrada, dizendo de cada uma se ficou no horário
 * pedido, se a agenda ofereceu outro (`adjusted`) ou se não havia horário
 * (`unavailable`); a confirmação é uma chamada só, com `Idempotency-Key`,
 * sobre os holds escolhidos. Pular uma data é não mandar o hold dela — a API
 * aceita, e é a única opção que ela dá para a ocorrência com conflito
 * (encaixe por cima não existe em série).
 */

/** Quantos atendimentos no total, contando o primeiro. */
export const REPEAT_COUNT_MIN = 2;
export const REPEAT_COUNT_MAX = 12;
export const REPEAT_COUNT_DEFAULT = 4;

/** A API recebe o intervalo em dias; "todo mês" exato não cabe nisso. */
export const REPEAT_INTERVALS = [
  { days: 7, label: "Toda semana" },
  { days: 14, label: "A cada 2 semanas" },
  { days: 21, label: "A cada 3 semanas" },
  { days: 28, label: "A cada 4 semanas" },
] as const;

export const DEFAULT_REPEAT_INTERVAL = 7;

export function repeatIntervalLabel(days: number): string {
  return (
    REPEAT_INTERVALS.find((option) => option.days === days)?.label ??
    `A cada ${days} dias`
  );
}

/**
 * O que a pessoa escolhe com "Repetir este atendimento" ligado: um passo de
 * quantos atendimentos (2 a 12) e o intervalo, com o do serviço sugerido
 * quando ele tem recorrência própria.
 */
export function RepeatFields({
  count,
  intervalDays,
  onCount,
  onInterval,
  suggestedDays,
}: {
  count: number;
  intervalDays: number;
  onCount: (count: number) => void;
  onInterval: (days: number) => void;
  /** `recurrenceIntervalDays` do serviço escolhido, quando há. */
  suggestedDays: number | null;
}) {
  const countId = useId();
  const intervalId = useId();
  const options: Array<{ days: number; label: string; hint?: string }> = [
    ...(suggestedDays &&
    !REPEAT_INTERVALS.some((option) => option.days === suggestedDays)
      ? [
          {
            days: suggestedDays,
            hint: "do serviço",
            label: `A cada ${suggestedDays} dias`,
          },
        ]
      : []),
    ...REPEAT_INTERVALS.map((option) => ({
      ...option,
      hint: option.days === suggestedDays ? "do serviço" : undefined,
    })),
  ];
  return (
    <div className="agenda-new-repeat-fields">
      <div className="agenda-new-block">
        <span className="label" id={countId}>
          Quantos atendimentos, contando este
        </span>
        <div
          aria-labelledby={countId}
          className="agenda-new-stepper"
          role="group"
        >
          <button
            aria-label="Menos um atendimento"
            className="agenda-new-stepper-button"
            disabled={count <= REPEAT_COUNT_MIN}
            onClick={() => onCount(count - 1)}
            type="button"
          >
            <span aria-hidden="true">−</span>
          </button>
          <output aria-live="polite" className="agenda-new-stepper-value">
            {count}
          </output>
          <button
            aria-label="Mais um atendimento"
            className="agenda-new-stepper-button"
            disabled={count >= REPEAT_COUNT_MAX}
            onClick={() => onCount(count + 1)}
            type="button"
          >
            <Icon name="plus" />
          </button>
        </div>
      </div>
      <fieldset aria-labelledby={intervalId} className="agenda-new-block">
        <legend className="label" id={intervalId}>
          Intervalo
        </legend>
        <div className="agenda-new-chips">
          {options.map((option) => (
            <label className="agenda-new-chip" key={option.days}>
              <input
                checked={intervalDays === option.days}
                name="repeat-interval"
                onChange={() => onInterval(option.days)}
                type="radio"
              />
              <span>
                {option.label}
                {option.hint && (
                  <>
                    <span className="sr-only"> · </span>
                    <small>{option.hint}</small>
                  </>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export interface SeriesAlternative {
  date: string;
  endTime: string;
  startTime: string;
}

export interface SeriesFailure {
  /** Horários que o servidor ofereceu no lugar do que falhou; pode vir vazio. */
  alternatives: SeriesAlternative[];
  message: string;
}

/** Quem é agendado, do jeito que a criação de série recebe. */
export interface RepeatCustomer {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}

function occurrenceDay(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(parseDate(value));
}

/**
 * O resumo para confirmar de novo: cada agendamento que será criado, com a
 * data, o dia da semana, o horário e o serviço; as ocorrências com horário
 * ajustado ou sem horário em destaque, nunca só por cor; o total; e
 * "Confirmar N agendamentos" ou "Voltar". Na folha padrão (D-166): embaixo
 * no celular, diálogo centrado de 768 px em diante.
 */
export function RepeatReviewSheet({
  comments,
  customer,
  customerLabel,
  intervalDays,
  occurrences,
  onBack,
  onConfirmed,
  onRetry,
  serviceIds,
  serviceLabel,
  unitPrice,
}: {
  comments?: string;
  customer: RepeatCustomer;
  customerLabel: string;
  intervalDays: number;
  occurrences: SeriesOccurrencePreview[];
  /** Voltar ao formulário: quem chama libera as reservas da revisão. */
  onBack: () => void;
  /** Criados; `leftover` são reservas de datas puladas, a liberar. */
  onConfirmed: (created: Appointment[], leftover: string[]) => void;
  /** Refazer a revisão depois de uma recusa da confirmação. */
  onRetry: () => void;
  serviceIds: string[];
  serviceLabel: string;
  /** Preço de um atendimento (soma dos serviços); `null` sem valor fechado. */
  unitPrice: { amount: number; startingAt: boolean } | null;
}) {
  const titleId = useId();
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SeriesFailure | null>(null);
  const included = occurrences.filter(
    (item) => !item.unavailable && item.holdId && !skipped.has(item.index),
  );
  // Uma chave por conjunto de holds: repetir a confirmação do mesmo conjunto
  // devolve a série já criada, em vez de criar outra.
  const holdsKey = included.map((item) => item.holdId).join("|");
  const key = useRef<{ holds: string; value: string } | null>(null);
  const count = included.length;
  const noun = count === 1 ? "agendamento" : "agendamentos";

  function toggleSkip(index: number) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function confirm() {
    if (busy || count === 0) return;
    if (key.current?.holds !== holdsKey) {
      key.current = { holds: holdsKey, value: newIdempotencyKey() };
    }
    setBusy(true);
    setFailure(null);
    try {
      const created =
        await getProductServices().calendar.confirmAppointmentSeries(
          {
            comments,
            customerId: customer.customerId,
            customerName: customer.customerName,
            customerPhone: customer.customerPhone,
            intervalDays,
            occurrences: included.map((item) => ({
              holdId: item.holdId as string,
            })),
            serviceIds,
          },
          key.current.value,
        );
      const leftover = occurrences
        .filter((item) => item.holdId && !included.includes(item))
        .map((item) => item.holdId as string);
      onConfirmed(created, leftover);
    } catch (caught) {
      setFailure(seriesFailure(caught));
      setBusy(false);
    }
  }

  return (
    <ChatSheetShell
      className="is-agenda-repeat"
      onClose={() => {
        if (!busy) onBack();
      }}
      title={`Revisar ${occurrences.length} agendamentos`}
      titleId={titleId}
    >
      <div className="agenda-repeat-head">
        <h2 className="agenda-repeat-title" id={titleId}>
          Revisar {occurrences.length} agendamentos
        </h2>
        <p className="agenda-repeat-lead">
          {customerLabel} · {repeatIntervalLabel(intervalDays).toLowerCase()}
        </p>
      </div>
      <ol aria-label="Agendamentos" className="agenda-repeat-list">
        {occurrences.map((occurrence) => {
          const unavailable =
            occurrence.unavailable || !occurrence.date || !occurrence.startTime;
          const isSkipped = skipped.has(occurrence.index);
          return (
            <li
              className={clsx(
                "agenda-repeat-item",
                occurrence.adjusted && "is-adjusted",
                unavailable && "is-unavailable",
                isSkipped && "is-skipped",
              )}
              key={occurrence.index}
            >
              <span className="agenda-repeat-when">
                <strong>
                  {occurrenceDay(occurrence.date ?? occurrence.requestedDate)}
                </strong>
                {!unavailable && <span>{occurrence.startTime}</span>}
              </span>
              <span className="agenda-repeat-service">{serviceLabel}</span>
              {unavailable ? (
                <span className="agenda-repeat-note">
                  <Icon name="alert" /> Sem horário livre perto desta data. Fica
                  de fora.
                </span>
              ) : occurrence.adjusted ? (
                <span className="agenda-repeat-note">
                  <Icon name="alert" /> Conflito em{" "}
                  {formatDate(occurrence.requestedDate)}: a agenda ofereceu este
                  horário.
                  {isSkipped && " Fica de fora."}
                </span>
              ) : null}
              {occurrence.adjusted && !unavailable && (
                <button
                  aria-pressed={isSkipped}
                  className="agenda-repeat-skip"
                  disabled={busy}
                  onClick={() => toggleSkip(occurrence.index)}
                  type="button"
                >
                  {isSkipped ? "Incluir de novo" : "Pular esta data"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="agenda-repeat-total">
        <span>
          {count} {count === 1 ? "atendimento" : "atendimentos"}
        </span>
        {unitPrice && count > 0 && (
          <strong>
            {unitPrice.startingAt ? "A partir de " : ""}
            {formatMoney(unitPrice.amount * count)}
          </strong>
        )}
      </p>
      {failure && (
        <div className="agenda-repeat-failure">
          <p className="form-error" role="alert">
            {failure.message}
          </p>
          {failure.alternatives.length > 0 && (
            <>
              <p className="muted">Horários livres oferecidos pela agenda:</p>
              <ul className="agenda-conflict-list">
                {failure.alternatives.map((item) => (
                  <li key={`${item.date}-${item.startTime}`}>
                    <strong>
                      {formatDate(item.date)} às {item.startTime}
                    </strong>
                    <span>Termina às {item.endTime}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button onClick={onRetry} type="button" variant="secondary">
            Revisar de novo
          </Button>
        </div>
      )}
      <div className="agenda-repeat-actions">
        <Button
          disabled={busy}
          onClick={onBack}
          type="button"
          variant="secondary"
        >
          Voltar
        </Button>
        <Button
          disabled={count === 0}
          loading={busy}
          onClick={() => void confirm()}
          type="button"
        >
          Confirmar {count} {noun}
        </Button>
      </div>
    </ChatSheetShell>
  );
}

/**
 * Recusa da confirmação, dita pelo que o contrato garante: qual ocorrência
 * falhou e por quê. Hold vencido e horário tomado são coisas diferentes, e
 * nos dois casos nada foi criado — é isso que a pessoa precisa ler primeiro.
 */
export function seriesFailure(caught: unknown): SeriesFailure {
  const details = failureDetails(caught);
  const occurrence = describeFailedOccurrence(details);
  const code = schedulingRefusalCode(caught);
  if (code === "APPOINTMENT_HOLD_EXPIRED") {
    return {
      alternatives: readAlternatives(details),
      message: `A reserva ${occurrence} venceu antes da confirmação. Nada foi agendado: revise os agendamentos de novo.`,
    };
  }
  if (code === "SLOT_UNAVAILABLE") {
    return {
      alternatives: readAlternatives(details),
      message: `O horário ${occurrence} foi tomado depois da revisão. Nada foi agendado: revise os agendamentos de novo.`,
    };
  }
  if (code === "APPOINTMENT_SERIES_TOO_LONG") {
    const cap = readCap(details);
    return {
      alternatives: [],
      message: cap
        ? `Esta agenda aceita no máximo ${cap} atendimentos repetidos de uma vez. Nada foi agendado.`
        : "A repetição passou do limite desta agenda. Nada foi agendado.",
    };
  }
  return {
    alternatives: readAlternatives(details),
    message: requestError(
      caught,
      "Não foi possível confirmar os agendamentos. Nada foi agendado.",
    ),
  };
}

/**
 * Detalhe da recusa pelo leitor; um `upstreamDetails` que sobrar dentro dele
 * (adaptador que mistura o código cru com o embrulho) também é lido.
 */
function failureDetails(caught: unknown): Record<string, unknown> {
  const details = schedulingRefusalDetails(caught);
  const nested = details.upstreamDetails;
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? { ...details, ...(nested as Record<string, unknown>) }
    : details;
}

function describeFailedOccurrence(details: Record<string, unknown>): string {
  const index = details.occurrenceIndex;
  const date = details.occurrenceDate;
  const position =
    typeof index === "number"
      ? `do ${index + 1}º atendimento`
      : "de um atendimento";
  return typeof date === "string"
    ? `${position} (${formatDate(date)})`
    : position;
}

function readAlternatives(
  details: Record<string, unknown>,
): SeriesAlternative[] {
  const value = details.alternatives;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SeriesAlternative =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as SeriesAlternative).date === "string" &&
      typeof (item as SeriesAlternative).startTime === "string" &&
      typeof (item as SeriesAlternative).endTime === "string",
  );
}

function readCap(details: Record<string, unknown>): number | null {
  return typeof details.cap === "number" ? details.cap : null;
}

/** Liberação em melhor esforço: se falhar, o TTL do banco fecha o caso. */
export function releaseHolds(holdIds: string[]) {
  for (const holdId of holdIds) {
    void getProductServices()
      .calendar.releaseHold(holdId)
      .catch(() => undefined);
  }
}
