"use client";

import { useState } from "react";

import { type TimeBlock } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { DateField, TimeField } from "@/shared/ui/pickers/PickerFields";

import { zonedDateTimeToIso } from "./AppointmentFlowShell";
import { SeriesConflictPanel } from "./BlockSeriesForm";
import {
  formatDate,
  formatDuration,
  requestError,
  seriesConflicts,
  type SeriesOccurrenceConflict,
  timeBlockKindLabel,
  zonedDateTimeParts,
} from "./occupancy";

/**
 * Uma ocorrência de bloco pode pertencer a uma série (`seriesId` != null).
 * Remover/mover **esta ocorrência** (`.../occurrence`) nunca toca a série;
 * editar/remover **a série a partir daqui** encerra a série atual e afeta só
 * as ocorrências futuras — duas famílias de ação, duas chamadas distintas
 * (Goal016). Confundi-las apaga trabalho da profissional.
 */
export function OccurrenceActions({
  block,
  onChanged,
  timezone,
}: {
  block: TimeBlock;
  onChanged?: (block: TimeBlock | null) => void;
  timezone?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [editingSeries, setEditingSeries] = useState(false);

  const startParts = zonedDateTimeParts(block.startAt, timezone);
  const endParts = zonedDateTimeParts(block.endAt, timezone);
  const [moveDate, setMoveDate] = useState(startParts.date);
  const [moveStart, setMoveStart] = useState(startParts.time);
  const [moveEnd, setMoveEnd] = useState(endParts.time);

  const [seriesTitle, setSeriesTitle] = useState(block.title ?? "");
  const [seriesStart, setSeriesStart] = useState(startParts.time);
  const [seriesEnd, setSeriesEnd] = useState(endParts.time);
  const [conflict, setConflict] = useState<{
    conflicts: SeriesOccurrenceConflict[];
    reason: string;
    reasonError: string | null;
  } | null>(null);

  async function removeOccurrence() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await getProductServices().calendar.removeBlockOccurrence(block.id);
      onChanged?.(null);
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível remover esta ocorrência."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function moveOccurrence() {
    if (busy || !timezone) return;
    const startAt = zonedDateTimeToIso(moveDate, moveStart, timezone);
    const endAt = zonedDateTimeToIso(moveDate, moveEnd, timezone);
    if (new Date(endAt) <= new Date(startAt)) {
      setError("O fim deve ser posterior ao início.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const moved = await getProductServices().calendar.moveBlockOccurrence(
        block.id,
        { endAt, startAt },
      );
      setMoving(false);
      onChanged?.(moved);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível mover esta ocorrência."));
    } finally {
      setBusy(false);
    }
  }

  async function removeSeriesFromHere() {
    if (busy || !block.seriesId) return;
    setBusy(true);
    setError(null);
    try {
      await getProductServices().calendar.removeBlockSeries(block.seriesId);
      onChanged?.(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível remover a série."));
    } finally {
      setBusy(false);
    }
  }

  async function editSeriesFromHere(decision?: {
    forceOverlapReason?: string;
    skipConflicts?: boolean;
  }) {
    if (busy || !block.seriesId) return;
    if (seriesStart >= seriesEnd) {
      setError("O fim deve ser posterior ao início.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Edita "a partir daqui" encerra a série atual e cria outra: esta
      // própria ocorrência é substituída por uma nova linha, então quem chama
      // deve recarregar em vez de reaproveitar o `block` recebido.
      await getProductServices().calendar.editBlockSeriesFromDate(
        block.seriesId,
        {
          forceOverlapReason: decision?.forceOverlapReason,
          fromDate: startParts.date,
          rule: {
            endTime: seriesEnd,
            startTime: seriesStart,
            title: seriesTitle.trim() || null,
          },
          skipConflicts: decision?.skipConflicts,
        },
      );
      setEditingSeries(false);
      setConflict(null);
      onChanged?.(null);
    } catch (caught) {
      const conflicts = seriesConflicts(caught);
      if (conflicts) {
        setConflict({ conflicts, reason: "", reasonError: null });
        return;
      }
      setError(requestError(caught, "Não foi possível editar a série."));
    } finally {
      setBusy(false);
    }
  }

  if (conflict) {
    return (
      <SeriesConflictPanel
        busy={busy}
        conflicts={conflict.conflicts}
        onChooseAnother={() => setConflict(null)}
        onForce={() => {
          const reason = conflict.reason.trim();
          if (!reason) {
            setConflict({
              ...conflict,
              reasonError: "Informe o motivo da sobreposição.",
            });
            return;
          }
          void editSeriesFromHere({ forceOverlapReason: reason });
        }}
        onReasonChange={(value) =>
          setConflict({ ...conflict, reason: value, reasonError: null })
        }
        onSkip={() => void editSeriesFromHere({ skipConflicts: true })}
        reason={conflict.reason}
        reasonError={conflict.reasonError}
      />
    );
  }

  return (
    <div className="agenda-detail-grid">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <OccurrenceDetails block={block} timezone={timezone} />
      <section
        aria-labelledby="occurrence-scope-title"
        className="agenda-detail-section"
      >
        <h3 id="occurrence-scope-title">Esta ocorrência</h3>
        <p className="muted">
          Afeta só {formatDate(startParts.date)}; a série continua como está.
        </p>
        {moving ? (
          <>
            <div className="agenda-form-grid">
              <label className="field">
                <span>Data</span>
                <DateField
                  onValueChange={(value) => setMoveDate(value)}
                  value={moveDate}
                />
              </label>
              <label className="field">
                <span>Início</span>
                <TimeField
                  onValueChange={(value) => setMoveStart(value)}
                  value={moveStart}
                />
              </label>
              <label className="field">
                <span>Fim</span>
                <TimeField
                  onValueChange={(value) => setMoveEnd(value)}
                  value={moveEnd}
                />
              </label>
            </div>
            <div className="agenda-form-footer">
              <Button
                disabled={busy}
                onClick={() => setMoving(false)}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button
                loading={busy}
                onClick={() => void moveOccurrence()}
                type="button"
              >
                Confirmar novo horário
              </Button>
            </div>
          </>
        ) : (
          <div className="agenda-form-footer">
            <Button
              disabled={busy}
              onClick={() => setMoving(true)}
              type="button"
              variant="secondary"
            >
              Mover esta ocorrência
            </Button>
            <Button
              loading={busy}
              onClick={() => void removeOccurrence()}
              type="button"
              variant="danger"
            >
              Remover esta ocorrência
            </Button>
          </div>
        )}
      </section>

      {block.seriesId && (
        <section
          aria-labelledby="series-scope-title"
          className="agenda-detail-section"
        >
          <h3 id="series-scope-title">A série a partir daqui</h3>
          <p className="muted">
            Editar ou remover a partir de {formatDate(startParts.date)} encerra
            a série atual nesta data e, se editada, cria outra a partir dela. As
            ocorrências passadas nunca são tocadas.
          </p>
          {editingSeries ? (
            <>
              <div className="agenda-form-grid">
                <label className="field is-wide">
                  <span>Título</span>
                  <input
                    onChange={(event) => setSeriesTitle(event.target.value)}
                    value={seriesTitle}
                  />
                </label>
                <label className="field">
                  <span>Início</span>
                  <TimeField
                    onValueChange={(value) => setSeriesStart(value)}
                    value={seriesStart}
                  />
                </label>
                <label className="field">
                  <span>Fim</span>
                  <TimeField
                    onValueChange={(value) => setSeriesEnd(value)}
                    value={seriesEnd}
                  />
                </label>
              </div>
              <div className="agenda-form-footer">
                <Button
                  disabled={busy}
                  onClick={() => setEditingSeries(false)}
                  type="button"
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button
                  loading={busy}
                  onClick={() => void editSeriesFromHere()}
                  type="button"
                >
                  Salvar a partir daqui
                </Button>
              </div>
            </>
          ) : (
            <div className="agenda-form-footer">
              <Button
                disabled={busy}
                onClick={() => setEditingSeries(true)}
                type="button"
                variant="secondary"
              >
                Editar a série a partir daqui
              </Button>
              <Button
                loading={busy}
                onClick={() => void removeSeriesFromHere()}
                type="button"
                variant="danger"
              >
                Remover a série a partir daqui
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const WEEKDAYS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** "Terça, 14 de outubro": o dia local da ocorrência, no fuso da agenda. */
export function occurrenceDayLabel(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = WEEKDAYS[value.getUTCDay()] ?? "";
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(value);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
}

/** "Repete toda terça", "Repete todo sábado" ou "Repete toda semana: segunda e quarta". */
export function seriesPatternLabel(
  series: NonNullable<TimeBlock["series"]>,
): string {
  const days = series.daysOfWeek
    .map((day) => WEEKDAYS[day])
    .filter((day): day is string => Boolean(day));
  let pattern: string;
  if (days.length === 1) {
    const [only = ""] = days;
    pattern = `Repete ${only === "sábado" || only === "domingo" ? "todo" : "toda"} ${only}`;
  } else if (days.length === 7) {
    pattern = "Repete todo dia";
  } else {
    const last = days.at(-1) ?? "";
    pattern = `Repete toda semana: ${days.slice(0, -1).join(", ")} e ${last}`;
  }
  if (series.seriesEndDate) {
    const [, month = "", day = ""] = series.seriesEndDate.split("-");
    return `${pattern}, até ${day}/${month}`;
  }
  if (series.occurrenceCount) {
    return `${pattern}, ${series.occurrenceCount} vezes`;
  }
  return pattern;
}

/** "11/10 às 18:59", no fuso da agenda. */
function createdAtLabel(iso: string, timezone?: string | null): string {
  const parts = zonedDateTimeParts(iso, timezone);
  const [, month = "", day = ""] = parts.date.split("-");
  return `${day}/${month} às ${parts.time}`;
}

/**
 * Detalhes do bloqueio no topo da folha de ações (pedido de 2026-10-12), no
 * padrão do detalhe de atendimento A5: rótulo pequeno em caixa alta e o valor
 * embaixo. Motivo, série e criação só aparecem quando existem; o bloco não
 * guarda quem o criou, então não há autor.
 */
function OccurrenceDetails({
  block,
  timezone,
}: {
  block: TimeBlock;
  timezone?: string | null;
}) {
  const start = zonedDateTimeParts(block.startAt, timezone);
  const end = zonedDateTimeParts(block.endAt, timezone);
  const minutes = Math.round(
    (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) /
      60000,
  );
  const kind = timeBlockKindLabel(block.kind);
  const facts: Array<{ label: string; value: string }> = [
    {
      label: "Quando",
      value: `${occurrenceDayLabel(start.date)} · ${start.time} às ${end.time} (${formatDuration(minutes)})`,
    },
  ];
  if (block.reason?.trim())
    facts.push({ label: "Motivo", value: block.reason });
  if (block.series) {
    facts.push({ label: "Repetição", value: seriesPatternLabel(block.series) });
  } else if (block.seriesId) {
    facts.push({ label: "Repetição", value: "Faz parte de uma série" });
  }
  if (block.createdAt) {
    facts.push({
      label: "Criado em",
      value: createdAtLabel(block.createdAt, timezone),
    });
  }
  return (
    <section
      aria-labelledby="occurrence-details-title"
      className="agenda-occurrence-details"
    >
      <p className="eyebrow">{kind}</p>
      <h3 className="agenda-occurrence-title" id="occurrence-details-title">
        {block.title?.trim() || kind}
      </h3>
      <dl className="agenda-occurrence-facts">
        {facts.map((fact) => (
          <div className="agenda-appt-block" key={fact.label}>
            <dt className="agenda-appt-label">{fact.label}</dt>
            <dd className="agenda-appt-text">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
