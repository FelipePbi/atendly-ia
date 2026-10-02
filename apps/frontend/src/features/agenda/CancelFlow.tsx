"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { type Appointment, type CalendarState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { longDayLabel } from "./AppointmentDetail";
import { AppointmentFlowShell, ReadOnlyState } from "./AppointmentFlowShell";
import { newIdempotencyKey } from "./holdSession";
import {
  customerLabel,
  parseDate,
  requestError,
  serviceNames,
} from "./occupancy";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Cancelamento em um passo (quadro A8, D-110 (e)): a própria sheet é a
 * confirmação — "Cancelar agendamento" cancela no toque. Abaixo de 1024 px ela
 * sobe sobre o detalhe, que fica inerte atrás; de 1024 px em diante é o
 * diálogo central do quadro de paisagem e desktop. O acordo comercial
 * gravado na criação (Goal007) é imutável e não é tocado aqui.
 */
export function CancelFlow({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter();
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [comments, setComments] = useState("");
  // Cancelar é sempre uma alteração relevante para o cliente (Goal021):
  // marcado por padrão, e a interface manda o campo sempre explicitamente —
  // nunca se apoia no default do contrato, que é o oposto.
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [loading, setLoading] = useState(Boolean(appointmentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    appointmentId ? null : "O agendamento não foi informado.",
  );

  const detailHref = appointmentId
    ? `/agenda/agendamento?id=${encodeURIComponent(appointmentId)}`
    : "/agenda";

  useEffect(() => {
    if (!appointmentId) return;
    const controller = new AbortController();
    Promise.all([
      getProductServices().calendar.getAppointment(
        appointmentId,
        controller.signal,
      ),
      getProductServices().calendar.getCalendar(controller.signal),
    ])
      .then(([appointmentResult, calendarResult]) => {
        setAppointment(appointmentResult);
        setCalendar(calendarResult);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível preparar o cancelamento."),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId]);

  const sheetOpen = Boolean(
    appointment && calendar?.capabilities.createAppointments,
  );

  // Foco preso na sheet, Esc volta ao detalhe e o foco retorna a quem estava
  // com ele — o que o diálogo compartilhado já faz, sem o cabeçalho dele.
  useEffect(() => {
    if (!sheetOpen) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = sheetRef.current;
    panel?.focus();
    document.body.classList.add("has-overlay");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busy) router.replace(detailHref);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("has-overlay");
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [busy, detailHref, router, sheetOpen]);

  async function cancel() {
    if (!appointment || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProductServices().calendar.cancelAppointment(
        appointment.id,
        { comments: comments.trim() || undefined, notifyCustomer },
        newIdempotencyKey(),
      );
      router.replace(`/agenda/agendamento?id=${encodeURIComponent(result.id)}`);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível cancelar o agendamento."));
    } finally {
      setBusy(false);
    }
  }

  const readOnly = !loading && calendar && !calendar.capabilities.createAppointments;

  return (
    <AppointmentFlowShell
      appointmentRoute={{ date: appointment?.date ?? null, id: appointmentId }}
      bare
      calendar={calendar}
      loading={loading}
      title="Cancelar agendamento"
    >
      <div className="agenda-appt agenda-cancel">
        <div
          aria-hidden={sheetOpen ? "true" : undefined}
          className={clsx("agenda-cancel-behind", sheetOpen && "is-dimmed")}
          inert={sheetOpen}
        >
          <PushedBar
            backHref={detailHref}
            backLabel="Voltar ao agendamento"
          />
          <div className="agenda-appt-body">
            {loading ? (
              <>
                <span className="skeleton skeleton-title" />
                <span className="skeleton skeleton-line" />
              </>
            ) : (
              <>
                {error && !sheetOpen && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {readOnly && <ReadOnlyState operation="cancelar agendamentos" />}
                {appointment && (
                  <>
                    <div className="agenda-appt-when">
                      <span className="agenda-appt-label">
                        {longDayLabel(appointment.date)}
                      </span>
                      <span className="agenda-appt-hero">
                        {appointment.startTime}
                        <span> – {appointment.endTime}</span>
                      </span>
                    </div>
                    <div className="agenda-cancel-card" />
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {sheetOpen && appointment && (
          <div className="agenda-cancel-layer">
            <h1 className="sr-only">Cancelar agendamento</h1>
            <Link
              aria-hidden="true"
              className="agenda-cancel-scrim"
              href={detailHref}
              replace
              tabIndex={-1}
            />
            <section
              aria-labelledby={titleId}
              aria-modal="true"
              className="agenda-cancel-sheet"
              ref={sheetRef}
              role="dialog"
              tabIndex={-1}
            >
              <div aria-hidden="true" className="agenda-cancel-handle" />
              <div className="agenda-cancel-head">
                <h2 id={titleId}>Cancelar este agendamento?</h2>
                <p>
                  {customerLabel(appointment)} · {serviceNames(appointment)}
                  <br />
                  {shortWhen(appointment)}
                </p>
              </div>
              <div className="agenda-cancel-fields">
                <label className="agenda-cancel-notify">
                  <span className="agenda-cancel-check">
                    <input
                      checked={notifyCustomer}
                      type="checkbox"
                      onChange={(event) =>
                        setNotifyCustomer(event.target.checked)
                      }
                    />
                    <span aria-hidden="true" className="agenda-cancel-check-box">
                      <Icon name="check" />
                    </span>
                  </span>
                  <span className="agenda-cancel-notify-text">
                    <strong>Avisar a cliente pelo WhatsApp</strong>
                    <small>
                      Cancelamento é uma alteração relevante: recomendamos
                      avisar o cliente.
                    </small>
                  </span>
                </label>
                <input
                  aria-label="Motivo (opcional, só para você)"
                  className="agenda-cancel-reason"
                  maxLength={500}
                  placeholder="Motivo (opcional, só para você)"
                  type="text"
                  value={comments}
                  onChange={(event) => setComments(event.target.value)}
                />
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="agenda-cancel-actions">
                <button
                  aria-busy={busy}
                  className="agenda-cancel-danger"
                  disabled={busy}
                  type="button"
                  onClick={() => void cancel()}
                >
                  Cancelar agendamento
                </button>
                <Link className="agenda-cancel-back" href={detailHref} replace>
                  Voltar
                </Link>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppointmentFlowShell>
  );
}

/** "sexta, 19/09 às 15:30", como no quadro. */
function shortWhen(appointment: Appointment): string {
  const parsed = parseDate(appointment.date);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(parsed)
    .replace("-feira", "");
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
  return `${weekday}, ${day} às ${appointment.startTime}`;
}
