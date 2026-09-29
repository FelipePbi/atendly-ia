"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useState } from "react";

import { type CalendarState, type TimeBlock, type TimeBlockKind } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
  zonedDateTimeToIso,
} from "./AppointmentFlowShell";
import {
  formatDate,
  isoDate,
  requestError,
  timeBlockKindLabel,
} from "./occupancy";

const KINDS: Array<{
  description: string;
  kind: TimeBlockKind;
  title: string;
}> = [
  {
    description: "Impede novos agendamentos neste intervalo.",
    kind: "BLOCK",
    title: "Bloqueio operacional",
  },
  {
    description: "Reserva o intervalo para um compromisso seu, fora do atendimento.",
    kind: "PERSONAL",
    title: "Compromisso pessoal",
  },
];

/**
 * O tipo pedido por `?type=` no "+ Novo" da Agenda (Goal069 §1) decide só a
 * seleção inicial; o que é gravado continua vindo do que a pessoa escolhe (ou
 * confirma) no formulário.
 */
function initialKindFromLocation(): TimeBlockKind {
  if (typeof window === "undefined") return "BLOCK";
  const requested = new URLSearchParams(window.location.search).get("type");
  return requested === "PERSONAL" ? "PERSONAL" : "BLOCK";
}

/**
 * Bloqueio operacional e compromisso pessoal (Goal016): mesmo contrato
 * (`POST /v1/time-blocks`), `kind` distinto — nunca apresentados como a mesma
 * coisa com uma cor diferente.
 */
export function BlockForm() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [kind, setKind] = useState<TimeBlockKind>(() =>
    initialKindFromLocation(),
  );
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const [created, setCreated] = useState<TimeBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .calendar.getCalendar(controller.signal)
      .then(setCalendar)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!calendar?.timezone || busy) return;
    const startAt = zonedDateTimeToIso(date, startTime, calendar.timezone);
    const endAt = zonedDateTimeToIso(date, endTime, calendar.timezone);
    if (new Date(endAt) <= new Date(startAt)) {
      setError("O fim deve ser posterior ao início.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await getProductServices().calendar.createTimeBlock({
          endAt,
          kind,
          reason: reason.trim() || null,
          startAt,
          title: title.trim() || null,
        }),
      );
    } catch (caught) {
      setError(
        requestError(
          caught,
          kind === "PERSONAL"
            ? "Não foi possível criar o compromisso pessoal."
            : "Não foi possível bloquear o horário.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!created || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getProductServices().calendar.deleteTimeBlock(created.id);
      setCreated(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível remover."));
    } finally {
      setBusy(false);
    }
  }

  const kindOption = KINDS.find((option) => option.kind === kind) ?? KINDS[0];

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Reserve um intervalo na Agenda Atendly para impedir novos agendamentos ou marcar um compromisso seu."
      loading={loading}
      title="Bloquear horário"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.manageAvailability ? (
        <ReadOnlyState operation="bloquear horários" />
      ) : created ? (
        <div className="agenda-flow-layout">
          <section className="agenda-form-card">
            <p className="eyebrow">{timeBlockKindLabel(created.kind)} confirmado</p>
            <h2>{created.title ?? timeBlockKindLabel(created.kind)}</h2>
            <div className="agenda-summary-list">
              <SummaryRow
                label="Início"
                value={formatIsoDateTime(created.startAt, calendar?.timezone)}
              />
              <SummaryRow
                label="Fim"
                value={formatIsoDateTime(created.endAt, calendar?.timezone)}
              />
              <SummaryRow
                label="Motivo"
                value={created.reason ?? "Não informado"}
              />
            </div>
            <div className="agenda-form-footer">
              <Button href="/agenda">Voltar à agenda</Button>
              <Button
                loading={busy}
                onClick={() => void remove()}
                type="button"
                variant="danger"
              >
                Remover
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="agenda-flow-layout">
          <form
            className="agenda-form-card"
            onSubmit={(event) => void create(event)}
          >
            <h2>Tipo</h2>
            <fieldset>
              <legend className="sr-only">Tipo de bloqueio</legend>
              <div className="choice-grid" role="radiogroup" aria-label="Tipo">
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
                      onChange={() => setKind(option.kind)}
                      type="radio"
                      value={option.kind}
                    />
                    <h3>{option.title}</h3>
                    <p>{option.description}</p>
                  </label>
                ))}
              </div>
            </fieldset>
            <h2>Intervalo</h2>
            <div className="agenda-form-grid">
              <label className="field is-wide">
                <span>Título (opcional)</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={
                    kind === "PERSONAL" ? "Ex.: Consulta médica" : "Ex.: Almoço"
                  }
                  value={title}
                />
              </label>
              <label className="field is-wide">
                <span>Data</span>
                <input
                  min={isoDate(new Date())}
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Início</span>
                <input
                  required
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Fim</span>
                <input
                  required
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </label>
              <label className="field is-wide">
                <span>Motivo (opcional)</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>
            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              <Button href="/agenda/bloquear/serie" variant="secondary">
                Repetir em dias fixos
              </Button>
              <Button loading={busy} type="submit">
                {kind === "PERSONAL"
                  ? "Confirmar compromisso"
                  : "Confirmar bloqueio"}
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow label="Tipo" value={kindOption.title} />
            <SummaryRow label="Data" value={formatDate(date)} />
            <SummaryRow label="Horário" value={`${startTime}–${endTime}`} />
            <SummaryRow label="Fuso" value={calendar?.timezone ?? "—"} />
          </Summary>
        </div>
      )}
    </AppointmentFlowShell>
  );
}

function formatIsoDateTime(value: string, timezone?: string | null): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone ?? undefined,
  }).format(new Date(value));
}
