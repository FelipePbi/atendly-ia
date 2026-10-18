"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useState } from "react";

import { type AvailabilityException, type CalendarState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { DateField, TimeField } from "@/shared/ui/pickers/PickerFields";

import { AppointmentFlowShell, ReadOnlyState } from "./AppointmentFlowShell";
import { addDays, formatDate, isoDate, requestError } from "./occupancy";
import { canPerform, operationLabel } from "./sourceGuard";

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
  return `${exception.startTime} às ${exception.endTime}`;
}

/**
 * Horário extra (D-169): a disponibilidade extra por data, que abre horário
 * fora dos dias e horários de sempre. Não é bloqueio, então saiu do "+ Novo"
 * da Agenda e fica em Configurações > Agenda > "Quando você atende", ao lado
 * de "Dias e horários". O dia ou período fechado (indisponibilidade por data)
 * passou a ser criado em "Bloquear horário"; esta tela continua listando as
 * duas exceções dos próximos 90 dias para que qualquer uma possa ser removida.
 * A regra semanal continua em Configurações; aqui só a exceção pontual.
 * Layout (D-191): coluna centrada de leitura, cartões com respiro entre si,
 * campos lado a lado onde cabem e cada item com data, tipo e horário.
 */
export function AvailabilityExceptions() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [loading, setLoading] = useState(true);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(isoDate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
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
    } catch (caught) {
      setError(
        requestError(caught, "Não foi possível liberar o horário extra."),
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

  const allowed = canPerform(calendar, "manageAvailability");

  return (
    <AppointmentFlowShell
      backHref="/configuracoes/agenda"
      calendar={calendar}
      description="Atenda numa data fora dos seus dias e horários de sempre. Para fechar um dia, use Bloquear horário na Agenda."
      loading={loading}
      title="Horário extra"
    >
      <div className="agenda-exceptions">
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
            <form
              className="agenda-form-card"
              onSubmit={(event) => void submitExtra(event)}
            >
              <h2>Liberar horário</h2>
              <div className="agenda-form-grid agenda-exceptions-fields">
                <label className="field is-wide">
                  <span>Data</span>
                  <DateField
                    min={isoDate(new Date())}
                    onValueChange={(value) => setDate(value)}
                    required
                    value={date}
                  />
                </label>
                <label className="field">
                  <span>Início</span>
                  <TimeField
                    onValueChange={(value) => setStartTime(value)}
                    required
                    value={startTime}
                  />
                </label>
                <label className="field">
                  <span>Fim</span>
                  <TimeField
                    onValueChange={(value) => setEndTime(value)}
                    required
                    value={endTime}
                  />
                </label>
              </div>
              <div className="agenda-form-footer">
                <Button loading={busy} type="submit">
                  Liberar horário extra
                </Button>
              </div>
            </form>
          )
        )}

        {!loading && calendar && allowed && (
          <section className="agenda-form-card">
            <h2>Horários extras e dias fechados</h2>
            {exceptions.length === 0 ? (
              <div className="empty-state agenda-exceptions-empty">
                <div className="state-icon">
                  <Icon name="calendar" />
                </div>
                <p>Nenhum horário extra ou dia fechado nos próximos 90 dias.</p>
              </div>
            ) : (
              <ol className="agenda-exceptions-list">
                {exceptions.map((exception) => (
                  <li
                    className={clsx(
                      "agenda-exception-item",
                      exception.available ? "is-extra" : "is-closed",
                    )}
                    key={exception.id}
                  >
                    <div className="agenda-exception-main">
                      <div className="agenda-exception-head">
                        <time dateTime={exception.date}>
                          {formatDate(exception.date)}
                        </time>
                        <span
                          className={clsx(
                            "badge",
                            exception.available
                              ? "badge-success"
                              : "badge-danger",
                          )}
                        >
                          {exception.available ? "Horário extra" : "Fechado"}
                        </span>
                      </div>
                      <span className="agenda-exception-range">
                        <Icon name="clock" />
                        <span>{exceptionRangeLabel(exception)}</span>
                      </span>
                      {exception.reason && (
                        <span className="agenda-exception-note">
                          {exception.reason}
                        </span>
                      )}
                      {exception.decidedReason && (
                        <span className="agenda-exception-note">
                          Decisão: {exception.decidedReason}
                        </span>
                      )}
                    </div>
                    <Button
                      className="agenda-exception-remove"
                      loading={removingId === exception.id}
                      onClick={() => void remove(exception)}
                      type="button"
                      variant="danger"
                    >
                      Remover
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </AppointmentFlowShell>
  );
}
