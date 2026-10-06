"use client";

import { useRef, useState } from "react";

import { type Appointment, type SeriesOccurrencePreview } from "@/data";
import {
  schedulingRefusalCode,
  schedulingRefusalDetails,
} from "@/data/http/schedulingRefusal";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import { newIdempotencyKey } from "./holdSession";
import { formatDate, requestError } from "./occupancy";

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

export const SERIES_ATOMIC_NOTICE =
  "A série é confirmada de uma vez: se qualquer ocorrência falhar, nada é criado.";

export const SERIES_INCOMPLETE_NOTICE =
  "A série só é confirmada inteira. Como a confirmação não pode ser parcial, ajuste o intervalo, a data inicial ou o número de ocorrências e pré-visualize de novo.";

/**
 * Confirmação atômica da série de atendimento (Goal009, consumida no Goal016).
 *
 * Duas regras do contrato mandam aqui, e a tela não tem opinião própria sobre
 * nenhuma delas. A primeira: a confirmação é **uma só** chamada, com
 * `Idempotency-Key`, que consome os holds da pré-visualização — ou a série
 * inteira nasce, ou nada nasce. A segunda decorre da primeira: série
 * parcialmente confirmada não é resultado válido, então pré-visualização com
 * ocorrência `unavailable` **não** ganha um botão de confirmar "as que deram
 * certo". O caminho honesto nesse caso é ajustar a série e pré-visualizar de
 * novo — e é o único que esta tela oferece.
 */
export function SeriesConfirm({
  comments,
  customerId,
  customerName,
  customerPhone,
  intervalDays,
  occurrences,
  onConfirmed,
  onGiveUp,
  onRestart,
  serviceIds,
}: {
  comments?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  intervalDays: number;
  occurrences: SeriesOccurrencePreview[];
  onConfirmed: (created: Appointment[]) => void;
  /** Abandonar a série: quem chama libera os holds da pré-visualização. */
  onGiveUp: () => void;
  /** Voltar ao formulário para pré-visualizar de novo, liberando o reservado. */
  onRestart: () => void;
  serviceIds: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SeriesFailure | null>(null);
  // Uma chave por conjunto de holds: repetir a confirmação do mesmo conjunto
  // devolve a série já criada, em vez de criar uma segunda.
  const holdsKey = occurrences.map((item) => item.holdId ?? "-").join("|");
  const key = useRef<{ holds: string; value: string } | null>(null);

  const confirmable = occurrences.filter(
    (item) => !item.unavailable && item.holdId,
  );
  const complete =
    occurrences.length > 0 && confirmable.length === occurrences.length;
  const adjusted = occurrences.filter((item) => item.adjusted).length;
  const missing = occurrences.length - confirmable.length;

  async function confirm() {
    if (busy || !complete) return;
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
            customerId,
            customerName,
            customerPhone,
            intervalDays,
            occurrences: confirmable.map((item) => ({
              holdId: item.holdId as string,
            })),
            serviceIds,
          },
          key.current.value,
        );
      onConfirmed(created);
    } catch (caught) {
      setFailure(seriesFailure(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!complete) {
    return (
      <section
        aria-labelledby="series-incomplete-title"
        className="agenda-conflict"
      >
        <p className="eyebrow">Série incompleta</p>
        <h2 id="series-incomplete-title">
          {occurrences.length === 0
            ? "Nenhuma ocorrência para confirmar"
            : `${missing} de ${occurrences.length} ocorrência(s) ficaram sem horário`}
        </h2>
        <p>{SERIES_INCOMPLETE_NOTICE}</p>
        <div className="agenda-form-footer">
          <Button onClick={onGiveUp} type="button" variant="secondary">
            Desistir da série
          </Button>
          <Button onClick={onRestart} type="button">
            Ajustar a série
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="series-confirm-title" className="agenda-conflict">
      <p className="eyebrow">Confirmação da série</p>
      <h2 id="series-confirm-title">
        Confirmar as {occurrences.length} ocorrências de uma vez
      </h2>
      <p>{SERIES_ATOMIC_NOTICE}</p>
      {adjusted > 0 && (
        <p className="muted">
          {adjusted} ocorrência(s) ficaram em horário diferente do pedido, como
          a pré-visualização mostra acima.
        </p>
      )}
      <p className="muted">
        As reservas da pré-visualização são temporárias e caem sozinhas pelo
        relógio do servidor: confirme ou desista.
      </p>
      {failure && (
        <div className="agenda-inline-error">
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
          <Button onClick={onRestart} type="button" variant="secondary">
            Refazer a pré-visualização
          </Button>
        </div>
      )}
      <div className="agenda-form-footer">
        <Button
          disabled={busy}
          onClick={onGiveUp}
          type="button"
          variant="secondary"
        >
          Desistir da série
        </Button>
        <Button loading={busy} onClick={() => void confirm()} type="button">
          Confirmar série
        </Button>
      </div>
    </section>
  );
}

/**
 * Recusa da confirmação, dita pelo que o contrato garante: qual ocorrência
 * falhou e por quê. Hold vencido e horário tomado são coisas diferentes — a
 * primeira é a reserva que caiu, a segunda é a agenda que mudou —, e a tela
 * não junta as duas numa mensagem genérica. Nos dois casos nada foi criado, e
 * é isso que a pessoa precisa ler primeiro.
 */
export function seriesFailure(caught: unknown): SeriesFailure {
  const details = failureDetails(caught);
  const occurrence = describeFailedOccurrence(details);
  const code = schedulingRefusalCode(caught);
  if (code === "APPOINTMENT_HOLD_EXPIRED") {
    return {
      alternatives: readAlternatives(details),
      message: `A reserva ${occurrence} venceu antes da confirmação. Nada foi agendado: pré-visualize a série de novo.`,
    };
  }
  if (code === "SLOT_UNAVAILABLE") {
    return {
      alternatives: readAlternatives(details),
      message: `O horário ${occurrence} foi tomado depois da pré-visualização. Nada foi agendado: pré-visualize a série de novo.`,
    };
  }
  if (code === "APPOINTMENT_SERIES_TOO_LONG") {
    const cap = readCap(details);
    return {
      alternatives: [],
      message: cap
        ? `Esta agenda aceita no máximo ${cap} ocorrências por série. Nada foi agendado.`
        : "A série passou do limite de ocorrências desta agenda. Nada foi agendado.",
    };
  }
  return {
    alternatives: readAlternatives(details),
    message: requestError(
      caught,
      "Não foi possível confirmar a série. Nada foi agendado.",
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
      ? `da ${index + 1}ª ocorrência`
      : "de uma ocorrência";
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
