"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useState } from "react";

import {
  type BlockSeries,
  type BlockSeriesRuleInput,
  type CalendarState,
  type TimeBlockKind,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";

import {
  AppointmentFlowShell,
  ReadOnlyState,
  Summary,
  SummaryRow,
} from "./AppointmentFlowShell";
import {
  formatDate,
  isoDate,
  requestError,
  seriesConflicts,
  type SeriesOccurrenceConflict,
  timeBlockKindLabel,
} from "./occupancy";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Termination = "count" | "date";

const KINDS: Array<{ kind: TimeBlockKind; title: string }> = [
  { kind: "BLOCK", title: "Bloqueio operacional" },
  { kind: "PERSONAL", title: "Compromisso pessoal" },
];

/**
 * Série finita de bloqueio/compromisso (Goal009/Goal016). O contrato recusa
 * data final e contagem juntas (`400 INVALID_BLOCK_SERIES_TERMINATION`) — a
 * tela escolhe exatamente uma das duas, nunca as duas nem nenhuma.
 */
export function BlockSeriesForm() {
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [kind, setKind] = useState<TimeBlockKind>("BLOCK");
  const [title, setTitle] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [seriesStartDate, setSeriesStartDate] = useState(isoDate(new Date()));
  const [termination, setTermination] = useState<Termination>("date");
  const [seriesEndDate, setSeriesEndDate] = useState(isoDate(new Date()));
  const [occurrenceCount, setOccurrenceCount] = useState(4);
  const [created, setCreated] = useState<BlockSeries | null>(null);
  const [conflict, setConflict] = useState<{
    conflicts: SeriesOccurrenceConflict[];
    reason: string;
    reasonError: string | null;
  } | null>(null);
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

  function toggleDay(day: number) {
    setDaysOfWeek((value) =>
      value.includes(day)
        ? value.filter((item) => item !== day)
        : [...value, day].sort(),
    );
  }

  function buildRule(): BlockSeriesRuleInput | null {
    if (daysOfWeek.length === 0) {
      setError("Escolha pelo menos um dia da semana.");
      return null;
    }
    if (startTime >= endTime) {
      setError("O fim deve ser posterior ao início.");
      return null;
    }
    if (termination === "date" && seriesEndDate < seriesStartDate) {
      setError("A data final deve ser posterior ao início da série.");
      return null;
    }
    if (termination === "count" && occurrenceCount <= 0) {
      setError("O número de repetições deve ser maior que zero.");
      return null;
    }
    return {
      daysOfWeek,
      endTime,
      kind,
      occurrenceCount: termination === "count" ? occurrenceCount : undefined,
      seriesEndDate: termination === "date" ? seriesEndDate : undefined,
      seriesStartDate,
      startTime,
      title: title.trim() || null,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const rule = buildRule();
    if (!rule) return;
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await getProductServices().calendar.createBlockSeries({ rule }),
      );
      setConflict(null);
    } catch (caught) {
      const conflicts = seriesConflicts(caught);
      if (conflicts) {
        setConflict({ conflicts, reason: "", reasonError: null });
        return;
      }
      setError(requestError(caught, "Não foi possível criar a série."));
    } finally {
      setBusy(false);
    }
  }

  async function skipConflicts() {
    if (!conflict || busy) return;
    setBusy(true);
    setError(null);
    try {
      const rule = buildRule();
      if (!rule) return;
      setCreated(
        await getProductServices().calendar.createBlockSeries({
          rule,
          skipConflicts: true,
        }),
      );
      setConflict(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível criar a série."));
    } finally {
      setBusy(false);
    }
  }

  async function forceOverlap() {
    if (!conflict || busy) return;
    const reason = conflict.reason.trim();
    if (!reason) {
      setConflict({ ...conflict, reasonError: "Informe o motivo da sobreposição." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rule = buildRule();
      if (!rule) return;
      setCreated(
        await getProductServices().calendar.createBlockSeries({
          forceOverlapReason: reason,
          rule,
        }),
      );
      setConflict(null);
    } catch (caught) {
      setError(requestError(caught, "Não foi possível criar a série."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppointmentFlowShell
      calendar={calendar}
      description="Repita um bloqueio ou compromisso pessoal em dias fixos da semana, com início e fim definidos."
      loading={loading}
      title="Criar série de bloqueio"
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && calendar && !calendar.capabilities.manageAvailability ? (
        <ReadOnlyState calendar={calendar} operation="criar séries de bloqueio" />
      ) : created ? (
        <div className="agenda-flow-layout">
          <section className="agenda-form-card">
            <p className="eyebrow">Série criada</p>
            <h2>{created.title ?? timeBlockKindLabel(created.kind)}</h2>
            <div className="agenda-summary-list">
              <SummaryRow label="Tipo" value={timeBlockKindLabel(created.kind)} />
              <SummaryRow
                label="Dias"
                value={created.daysOfWeek
                  .map((day) => WEEKDAY_LABELS[day])
                  .join(", ")}
              />
              <SummaryRow
                label="Horário"
                value={`${created.startTime}–${created.endTime}`}
              />
              <SummaryRow
                label="Término"
                value={
                  created.seriesEndDate
                    ? `Até ${formatDate(created.seriesEndDate)}`
                    : `${created.occurrenceCount ?? "—"} ocorrências`
                }
              />
            </div>
            <div className="agenda-form-footer">
              <Button href="/agenda">Voltar à agenda</Button>
            </div>
          </section>
        </div>
      ) : conflict ? (
        <SeriesConflictPanel
          busy={busy}
          conflicts={conflict.conflicts}
          onChooseAnother={() => setConflict(null)}
          onForce={() => void forceOverlap()}
          onReasonChange={(value) =>
            setConflict({ ...conflict, reason: value, reasonError: null })
          }
          onSkip={() => void skipConflicts()}
          reason={conflict.reason}
          reasonError={conflict.reasonError}
        />
      ) : (
        <div className="agenda-flow-layout">
          <form className="agenda-form-card" onSubmit={(event) => void submit(event)}>
            <h2>Tipo</h2>
            <fieldset>
              <legend className="sr-only">Tipo de série</legend>
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
                      name="series-kind"
                      onChange={() => setKind(option.kind)}
                      type="radio"
                      value={option.kind}
                    />
                    <h3>{option.title}</h3>
                  </label>
                ))}
              </div>
            </fieldset>

            <h2>Dias e horário</h2>
            <fieldset>
              <legend className="sr-only">Dias da semana</legend>
              <div
                aria-label="Dias da semana"
                className="choice-grid"
                role="group"
              >
                {WEEKDAY_LABELS.map((label, day) => (
                  <label
                    className={clsx(
                      "choice-card",
                      daysOfWeek.includes(day) && "is-selected",
                    )}
                    key={label}
                  >
                    <input
                      checked={daysOfWeek.includes(day)}
                      className="sr-only"
                      onChange={() => toggleDay(day)}
                      type="checkbox"
                    />
                    <h3>{label}</h3>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="agenda-form-grid">
              <label className="field is-wide">
                <span>Título (opcional)</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
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
              <label className="field">
                <span>Início da série</span>
                <input
                  min={isoDate(new Date())}
                  required
                  type="date"
                  value={seriesStartDate}
                  onChange={(event) => setSeriesStartDate(event.target.value)}
                />
              </label>
            </div>

            <h2>Término</h2>
            <fieldset>
              <legend className="sr-only">Como a série termina</legend>
              <div className="agenda-form-grid">
                <div className="field">
                  <label>
                    <input
                      checked={termination === "date"}
                      name="termination"
                      onChange={() => setTermination("date")}
                      type="radio"
                    />{" "}
                    Até uma data
                  </label>
                  <input
                    aria-label="Data final da série"
                    disabled={termination !== "date"}
                    min={seriesStartDate}
                    type="date"
                    value={seriesEndDate}
                    onChange={(event) => setSeriesEndDate(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>
                    <input
                      checked={termination === "count"}
                      name="termination"
                      onChange={() => setTermination("count")}
                      type="radio"
                    />{" "}
                    Número de repetições
                  </label>
                  <input
                    aria-label="Número de repetições da série"
                    disabled={termination !== "count"}
                    min={1}
                    type="number"
                    value={occurrenceCount}
                    onChange={(event) =>
                      setOccurrenceCount(Number(event.target.value))
                    }
                  />
                </div>
              </div>
            </fieldset>

            <div className="agenda-form-footer">
              <Button href="/agenda" variant="secondary">
                Cancelar
              </Button>
              <Button loading={busy} type="submit">
                Criar série
              </Button>
            </div>
          </form>
          <Summary title="Resumo">
            <SummaryRow
              label="Tipo"
              value={KINDS.find((option) => option.kind === kind)?.title ?? ""}
            />
            <SummaryRow
              label="Dias"
              value={
                daysOfWeek.length
                  ? daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join(", ")
                  : "—"
              }
            />
            <SummaryRow label="Horário" value={`${startTime}–${endTime}`} />
            <SummaryRow
              label="Término"
              value={
                termination === "date"
                  ? `Até ${formatDate(seriesEndDate)}`
                  : `${occurrenceCount} ocorrências`
              }
            />
          </Summary>
        </div>
      )}
    </AppointmentFlowShell>
  );
}

/**
 * Conflito de série: cada ocorrência listada cobre um atendimento confirmado.
 * A tela mostra a lista antes de perguntar — pular só estas ocorrências ou
 * forçar a sobreposição com motivo — porque é uma decisão humana (Goal009).
 */
export function SeriesConflictPanel({
  busy,
  conflicts,
  onChooseAnother,
  onForce,
  onReasonChange,
  onSkip,
  reason,
  reasonError,
}: {
  busy: boolean;
  conflicts: SeriesOccurrenceConflict[];
  onChooseAnother: () => void;
  onForce: () => void;
  onReasonChange: (value: string) => void;
  onSkip: () => void;
  reason: string;
  reasonError: string | null;
}) {
  return (
    <section
      aria-labelledby="series-conflict-title"
      className="agenda-conflict"
    >
      <p className="eyebrow">Conflito na série</p>
      <h2 id="series-conflict-title">
        {conflicts.length} ocorrência(s) cobrem um atendimento confirmado
      </h2>
      {conflicts.length === 0 ? (
        <p className="muted">
          Não foi possível listar as ocorrências em conflito. A série foi
          recusada mesmo assim.
        </p>
      ) : (
        <ul className="agenda-conflict-list">
          {conflicts.map((item) => (
            <li key={`${item.date}-${item.appointmentId}`}>
              <span className="agenda-item-kind">
                <Icon name="alert" />
                Será pulada, salvo decisão de forçar
              </span>
              <strong>{formatDate(item.date)}</strong>
            </li>
          ))}
        </ul>
      )}
      <label className="field">
        <span>Motivo da sobreposição (para forçar)</span>
        <textarea
          aria-invalid={reasonError ? true : undefined}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={3}
          value={reason}
        />
      </label>
      {reasonError && (
        <p className="form-error" role="alert">
          {reasonError}
        </p>
      )}
      <p className="muted">
        Pular mantém as demais ocorrências e ignora as listadas acima. Forçar
        cria todas, inclusive as em conflito, com o motivo registrado.
      </p>
      <div className="agenda-form-footer">
        <Button
          disabled={busy}
          onClick={onChooseAnother}
          type="button"
          variant="secondary"
        >
          Ajustar a série
        </Button>
        <Button loading={busy} onClick={onSkip} type="button" variant="secondary">
          Pular estas ocorrências
        </Button>
        <Button loading={busy} onClick={onForce} type="button" variant="danger">
          Forçar sobreposição
        </Button>
      </div>
    </section>
  );
}
