"use client";

import { useState } from "react";

import { type TimeBlock } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import { zonedDateTimeToIso } from "./AppointmentFlowShell";
import { SeriesConflictPanel } from "./BlockSeriesForm";
import {
  formatDate,
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
      setError(requestError(caught, "Não foi possível remover esta ocorrência."));
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
      <section aria-labelledby="occurrence-scope-title" className="agenda-detail-section">
        <p className="eyebrow">{timeBlockKindLabel(block.kind)}</p>
        <h3 id="occurrence-scope-title">Esta ocorrência</h3>
        <p className="muted">
          Afeta só {formatDate(startParts.date)}; a série continua como está.
        </p>
        {moving ? (
          <>
            <div className="agenda-form-grid">
              <label className="field">
                <span>Data</span>
                <input
                  onChange={(event) => setMoveDate(event.target.value)}
                  type="date"
                  value={moveDate}
                />
              </label>
              <label className="field">
                <span>Início</span>
                <input
                  onChange={(event) => setMoveStart(event.target.value)}
                  type="time"
                  value={moveStart}
                />
              </label>
              <label className="field">
                <span>Fim</span>
                <input
                  onChange={(event) => setMoveEnd(event.target.value)}
                  type="time"
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
              <Button loading={busy} onClick={() => void moveOccurrence()} type="button">
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
        <section aria-labelledby="series-scope-title" className="agenda-detail-section">
          <h3 id="series-scope-title">A série a partir daqui</h3>
          <p className="muted">
            Editar ou remover a partir de {formatDate(startParts.date)} encerra
            a série atual nesta data e, se editada, cria outra a partir dela —
            as ocorrências passadas nunca são tocadas.
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
                  <input
                    onChange={(event) => setSeriesStart(event.target.value)}
                    type="time"
                    value={seriesStart}
                  />
                </label>
                <label className="field">
                  <span>Fim</span>
                  <input
                    onChange={(event) => setSeriesEnd(event.target.value)}
                    type="time"
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
