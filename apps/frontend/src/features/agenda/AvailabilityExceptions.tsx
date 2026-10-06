"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useState } from "react";

import { type AvailabilityException, type CalendarState } from "@/data";
import { schedulingRefusalCode } from "@/data/http/schedulingRefusal";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
} from "./AppointmentFlowShell";
import { readOccupancy } from "./AppointmentForm";
import { occupyingEntries } from "./ConflictPanel";
import {
  addDays,
  type AgendaEntry,
  describeEntry,
  formatDate,
  isoDate,
  MINUTES_PER_DAY,
  requestError,
  timeToMinutes,
} from "./occupancy";
import { canPerform, operationLabel } from "./sourceGuard";

type ExceptionKind = "extra" | "unavailable";

const KINDS: Array<{
  description: string;
  kind: ExceptionKind;
  title: string;
}> = [
  {
    description: "Oferece um horário adicional numa data normalmente fechada.",
    kind: "extra",
    title: "Disponibilidade extra",
  },
  {
    description: "Fecha o dia inteiro ou um intervalo dele, com motivo.",
    kind: "unavailable",
    title: "Indisponibilidade",
  },
];

interface Conflict {
  entries: AgendaEntry[] | null;
}

function isExceptionConflictError(caught: unknown): boolean {
  return schedulingRefusalCode(caught) === "EXCEPTION_APPOINTMENT_CONFLICT";
}

function sortExceptions(
  items: AvailabilityException[],
): AvailabilityException[] {
  return [...items].sort((left, right) =>
    left.date === right.date
      ? (left.startTime ?? "").localeCompare(right.startTime ?? "")
      : left.date.localeCompare(right.date),
  );
}

function exceptionRangeLabel(exception: AvailabilityException): string {
  if (!exception.startTime || !exception.endTime) return "Dia inteiro";
  return `${exception.startTime}–${exception.endTime}`;
}

/**
 * Exceções de disponibilidade por data (Goal016): disponibilidade extra e
 * indisponibilidade total ou parcial, criadas e removidas por data. A regra
 * semanal continua em Configurações — aqui só a exceção pontual.
 *
 * Indisponibilidade que cobre um atendimento confirmado é recusada pelo
 * contrato (`409 EXCEPTION_APPOINTMENT_CONFLICT`); a tela então mostra o que
 * será afetado e só reenvia com `decidedReason` explícito — o mesmo padrão
 * reativo do conflito de horário na criação de atendimento. `decidedBy` não é
 * campo de formulário: o ator vem sempre da sessão autenticada.
 */
export function AvailabilityExceptions() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ExceptionKind>("extra");
  const [date, setDate] = useState(isoDate(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [decidedReason, setDecidedReason] = useState("");
  const [decidedReasonError, setDecidedReasonError] = useState<string | null>(
    null,
  );
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const today = new Date();
    getProductServices()
      .calendar.getCalendar(controller.signal)
      .then((result) => {
        setCalendar(result);
        if (!canPerform(result, "manageAvailability")) return null;
        return getProductServices().calendar.listAvailabilityExceptions(
          { endDate: isoDate(addDays(today, 90)), startDate: isoDate(today) },
          controller.signal,
        );
      })
      .then((list) => {
        if (list) setExceptions(sortExceptions(list));
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function resetForm() {
    setReason("");
    setDecidedReason("");
    setDecidedReasonError(null);
    setConflict(null);
  }

  async function openConflict() {
    setConflictLoading(true);
    const entries = await readOccupancy(date, calendar?.timezone);
    const interval = allDay
      ? { date, durationMinutes: MINUTES_PER_DAY, startTime: "00:00" }
      : {
          date,
          durationMinutes: timeToMinutes(endTime) - timeToMinutes(startTime),
          startTime,
        };
    setConflict({
      entries: entries
        ? occupyingEntries(entries, interval).filter(
            (entry) => entry.kind === "appointment",
          )
        : null,
    });
    setConflictLoading(false);
  }

  async function submitExtra(event: FormEvent) {
    event.preventDefault();
    if (!calendar?.timezone || busy) return;
    if (startTime >= endTime) {
      setError("O fim deve ser posterior ao início.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created =
        await getProductServices().calendar.createExtraAvailability({
          date,
          endTime,
          startTime,
        });
      setExceptions((current) => sortExceptions([...current, created]));
      resetForm();
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível abrir a disponibilidade extra."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitUnavailable(event: FormEvent) {
    event.preventDefault();
    if (!calendar?.timezone || busy) return;
    if (!allDay && startTime >= endTime) {
      setError("O fim deve ser posterior ao início.");
      return;
    }
    if (conflict && !decidedReason.trim()) {
      setDecidedReasonError(
        "Descreva o motivo da decisão. Sem motivo, a indisponibilidade não é enviada.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setDecidedReasonError(null);
    try {
      const created = await getProductServices().calendar.createUnavailability({
        date,
        decidedReason: conflict ? decidedReason.trim() : undefined,
        endTime: allDay ? undefined : endTime,
        reason: reason.trim() || undefined,
        startTime: allDay ? undefined : startTime,
      });
      setExceptions((current) => sortExceptions([...current, created]));
      resetForm();
    } catch (caught) {
      if (isExceptionConflictError(caught) && !conflict) {
        await openConflict();
        return;
      }
      setError(
        requestError(caught, "Não foi possível declarar a indisponibilidade."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(exception: AvailabilityException) {
    if (removingId) return;
    setRemovingId(exception.id);
    setError(null);
    try {
      await getProductServices().calendar.removeAvailabilityException(
        exception.id,
      );
      setExceptions((current) =>
        current.filter((item) => item.id !== exception.id),
      );
    } catch (caught) {
      setError(requestError(caught, "Não foi possível remover."));
    } finally {
      setRemovingId(null);
    }
  }

  const kindOption = KINDS.find((option) => option.kind === kind) ?? KINDS[0];
  const allowed = canPerform(calendar, "manageAvailability");

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Abra disponibilidade extra ou declare indisponibilidade por data, sem tocar a regra semanal de Configurações."
      loading={loading}
      title="Exceções de disponibilidade"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !allowed ? (
        <ReadOnlyState operation={operationLabel("manageAvailability")} />
      ) : (
        !loading &&
        calendar && (
          <div className="agenda-flow-layout">
            <form
              className="agenda-form-card"
              onSubmit={(event) =>
                void (kind === "extra"
                  ? submitExtra(event)
                  : submitUnavailable(event))
              }
            >
              <h2>Tipo</h2>
              <fieldset>
                <legend className="sr-only">Tipo de exceção</legend>
                <div
                  className="choice-grid"
                  role="radiogroup"
                  aria-label="Tipo"
                >
                  {KINDS.map((option) => (
                    <label
                      className={clsx(
                        "choice-card",
                        kind === option.kind && "is-selected",
                      )}
                      key={option.kind}
                    >
                      <input
                        checked={kind === option.kind}
                        className="sr-only"
                        name="kind"
                        onChange={() => {
                          setKind(option.kind);
                          resetForm();
                        }}
                        type="radio"
                        value={option.kind}
                      />
                      <h3>{option.title}</h3>
                      <p>{option.description}</p>
                    </label>
                  ))}
                </div>
              </fieldset>
              <h2>Data</h2>
              <div className="agenda-form-grid">
                <label className="field is-wide">
                  <span>Data</span>
                  <input
                    min={isoDate(new Date())}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setConflict(null);
                    }}
                    required
                    type="date"
                    value={date}
                  />
                </label>
                {kind === "unavailable" && (
                  <label className="field is-wide">
                    <span>Dia inteiro</span>
                    <input
                      checked={allDay}
                      onChange={(event) => {
                        setAllDay(event.target.checked);
                        setConflict(null);
                      }}
                      type="checkbox"
                    />
                  </label>
                )}
                {(kind === "extra" || !allDay) && (
                  <>
                    <label className="field">
                      <span>Início</span>
                      <input
                        onChange={(event) => {
                          setStartTime(event.target.value);
                          setConflict(null);
                        }}
                        required
                        type="time"
                        value={startTime}
                      />
                    </label>
                    <label className="field">
                      <span>Fim</span>
                      <input
                        onChange={(event) => {
                          setEndTime(event.target.value);
                          setConflict(null);
                        }}
                        required
                        type="time"
                        value={endTime}
                      />
                    </label>
                  </>
                )}
                {kind === "unavailable" && (
                  <label className="field is-wide">
                    <span>Motivo (opcional)</span>
                    <input
                      onChange={(event) => setReason(event.target.value)}
                      value={reason}
                    />
                  </label>
                )}
              </div>

              {kind === "unavailable" && conflictLoading && (
                <p>Consultando o que esta indisponibilidade afeta…</p>
              )}
              {kind === "unavailable" && conflict && !conflictLoading && (
                <section
                  aria-labelledby="exceptions-conflict-title"
                  className="agenda-conflict"
                >
                  <p className="eyebrow">Atendimento confirmado afetado</p>
                  <h3 id="exceptions-conflict-title">
                    Esta indisponibilidade cobre atendimento já confirmado
                  </h3>
                  {conflict.entries === null ? (
                    <p className="muted">
                      Não foi possível listar o que esta indisponibilidade
                      afeta. A agenda recusou o pedido mesmo assim.
                    </p>
                  ) : conflict.entries.length === 0 ? (
                    <p className="muted">
                      Nenhum atendimento desta agenda cobre o intervalo, mas a
                      agenda recusou o pedido: confirme com um motivo para
                      seguir mesmo assim.
                    </p>
                  ) : (
                    <ul className="agenda-conflict-list">
                      {conflict.entries.map((entry) => {
                        const presentation = describeEntry(entry);
                        return (
                          <li key={entry.key}>
                            <span className="agenda-item-kind">
                              <Icon name={presentation.icon} />
                              {presentation.typeLabel}
                            </span>
                            <strong>{presentation.title}</strong>
                            {presentation.detail && (
                              <span>{presentation.detail}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <label className="field">
                    <span>Motivo da decisão</span>
                    <textarea
                      aria-invalid={decidedReasonError ? true : undefined}
                      onChange={(event) => {
                        setDecidedReason(event.target.value);
                        setDecidedReasonError(null);
                      }}
                      rows={3}
                      value={decidedReason}
                    />
                  </label>
                  {decidedReasonError && (
                    <p className="form-error" role="alert">
                      {decidedReasonError}
                    </p>
                  )}
                </section>
              )}

              <div className="agenda-form-footer">
                <Button href="/agenda" variant="secondary">
                  Cancelar
                </Button>
                <Button loading={busy} type="submit">
                  {kind === "extra"
                    ? "Confirmar disponibilidade extra"
                    : conflict
                      ? "Confirmar mesmo assim"
                      : "Confirmar indisponibilidade"}
                </Button>
              </div>
            </form>
            <Summary title="Resumo">
              <SummaryRow label="Tipo" value={kindOption.title} />
              <SummaryRow label="Data" value={formatDate(date)} />
              <SummaryRow
                label="Horário"
                value={
                  kind === "unavailable" && allDay
                    ? "Dia inteiro"
                    : `${startTime}–${endTime}`
                }
              />
              <SummaryRow label="Fuso" value={calendar.timezone ?? "—"} />
            </Summary>
          </div>
        )
      )}

      {!loading && calendar && allowed && (
        <section className="agenda-form-card">
          <h2>Exceções abertas</h2>
          {exceptions.length === 0 ? (
            <p className="muted">
              Nenhuma disponibilidade extra ou indisponibilidade nos próximos 90
              dias.
            </p>
          ) : (
            <ol className="agenda-series-list">
              {exceptions.map((exception) => (
                <li className="agenda-series-item" key={exception.id}>
                  <strong>{formatDate(exception.date)}</strong>
                  <span>
                    {exception.available
                      ? "Disponibilidade extra"
                      : "Indisponível"}
                  </span>
                  <span>{exceptionRangeLabel(exception)}</span>
                  {exception.reason && <span>{exception.reason}</span>}
                  {exception.decidedReason && (
                    <span>Decisão: {exception.decidedReason}</span>
                  )}
                  <div className="agenda-series-actions">
                    <Button
                      loading={removingId === exception.id}
                      onClick={() => void remove(exception)}
                      type="button"
                      variant="danger"
                    >
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </AppointmentFlowShell>
  );
}
