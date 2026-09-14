"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  type Appointment,
  type AvailabilityException,
  type CalendarState,
  isActiveAppointmentStatus,
  type TimeBlock,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { StatePanel } from "@/shared/ui/States";

import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import {
  addDays,
  addMonths,
  buildAgendaEntries,
  compareAppointments,
  customerLabel,
  endOfMonth,
  formatAppointmentDate,
  formatDate,
  isoDate,
  requestError,
  serviceNames,
  sourceLabel,
  startOfMonth,
  startOfWeek,
  statusLabel,
  timeBlockKindLabel,
} from "./occupancy";
import { OccurrenceActions } from "./OccurrenceActions";
import { WeekView } from "./WeekView";

export {
  customerLabel,
  formatAppointmentDate,
  formatDate,
  isoDate,
  requestError,
  serviceNames,
  sourceLabel,
  statusLabel,
};

type AgendaView = "day" | "week" | "month";

function rangeForView(
  view: AgendaView,
  cursor: Date,
): { endDate: string; startDate: string } {
  if (view === "day") {
    const date = isoDate(cursor);
    return { endDate: date, startDate: date };
  }
  if (view === "week") {
    const start = startOfWeek(cursor);
    return { endDate: isoDate(addDays(start, 6)), startDate: isoDate(start) };
  }
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = addDays(startOfWeek(endOfMonth(cursor)), 6);
  return { endDate: isoDate(gridEnd), startDate: isoDate(gridStart) };
}

export function AgendaBoard() {
  const [view, setView] = useState<AgendaView>("day");
  const [cursor, setCursor] = useState(() => new Date());
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const range = useMemo(() => rangeForView(view, cursor), [view, cursor]);

  // A fonte oficial decide o que pode ser lido, e decide ANTES da leitura:
  // bloqueio e exceção de disponibilidade só existem na Agenda Atendly, e o
  // Scheduling recusa as duas rotas com 409 OPERATION_MANAGED_EXTERNALLY em
  // tenant EXTERNAL (`requireAtendlyCalendar`). Pedi-las junto num
  // `Promise.all` derrubava a agenda inteira para quem usa fonte externa — e
  // também para quem ainda não escolheu fonte, onde nem calendário há.
  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const queryWindow = { endDate: range.endDate, startDate: range.startDate };

    async function load() {
      const calendarResult = await services.getCalendar(controller.signal);
      setCalendar(calendarResult);
      if (calendarResult.source === null) {
        setAppointments([]);
        setTimeBlocks([]);
        setExceptions([]);
        return;
      }
      const atendly = calendarResult.source === "ATENDLY";
      const [appointmentResult, blockResult, exceptionResult] =
        await Promise.all([
          services.listAppointments(queryWindow, controller.signal),
          atendly
            ? services.listTimeBlocks(queryWindow, controller.signal)
            : Promise.resolve<TimeBlock[]>([]),
          atendly
            ? services.listAvailabilityExceptions(queryWindow, controller.signal)
            : Promise.resolve<AvailabilityException[]>([]),
        ]);
      setAppointments(appointmentResult);
      setTimeBlocks(blockResult);
      setExceptions(exceptionResult);
    }

    load()
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range.endDate, range.startDate, reload]);

  const entries = useMemo(
    () =>
      buildAgendaEntries({
        appointments,
        exceptions,
        timeBlocks,
        timezone: calendar?.timezone,
      }),
    [appointments, exceptions, timeBlocks, calendar?.timezone],
  );

  const next = [...appointments]
    .filter((item) => isActiveAppointmentStatus(item.status))
    .sort(compareAppointments)[0];
  const external = calendar?.source === "EXTERNAL";
  useShellConfig({
    action: calendar?.capabilities.createAppointments
      ? { href: "/agenda/novo", icon: "plus", label: "Novo agendamento" }
      : undefined,
    active: "agenda",
    loading,
    module: "agenda",
    source: external ? "external" : "atendly",
    title: "Agenda",
  });

  function retry() {
    setError(null);
    setLoading(true);
    setSelectedBlock(null);
    setReload((value) => value + 1);
  }

  /** Uma ocorrência removida, movida ou substituída pela edição da série deixa
   *  de existir como a tela a conhecia: recarrega a janela em vez de remendar
   *  o estado local. */
  function occurrenceChanged() {
    setSelectedBlock(null);
    retry();
  }

  function goToAdjacent(direction: -1 | 1) {
    setLoading(true);
    setSelectedBlock(null);
    if (view === "day") return setCursor((value) => addDays(value, direction));
    if (view === "week")
      return setCursor((value) => addDays(value, direction * 7));
    return setCursor((value) => addMonths(value, direction));
  }

  function changeView(nextView: AgendaView) {
    if (nextView === view) return;
    setLoading(true);
    setSelectedBlock(null);
    setView(nextView);
  }

  function selectDay(date: Date) {
    setLoading(true);
    setSelectedBlock(null);
    setCursor(date);
    setView("day");
  }

  return (
    <>
      <div className="agenda-page">
        <header className="agenda-page-header">
          <div>
            <p className="eyebrow">Operação diária</p>
            <h1>Agenda</h1>
            <p>Agendamentos reais da fonte oficial do negócio.</p>
          </div>
          {calendar && (
            <div className="agenda-page-actions">
              {calendar.capabilities.manageAvailability && (
                <>
                  <Button href="/agenda/excecoes" variant="secondary">
                    Exceções do dia
                  </Button>
                  <Button href="/agenda/bloquear" variant="secondary">
                    Bloquear horário
                  </Button>
                </>
              )}
              {calendar.capabilities.createAppointments && (
                <Button href="/agenda/novo">Novo agendamento</Button>
              )}
            </div>
          )}
        </header>

        {calendar && <SourceStrip calendar={calendar} />}
        {error && (
          <div className="agenda-state-surface">
            <StatePanel
              actionLabel="Tentar novamente"
              description={error}
              icon="alert"
              onAction={retry}
              title="Agenda indisponível"
              tone="error"
            />
          </div>
        )}
        {!error && !calendar && <AgendaLoading />}
        {!error && calendar && calendar.source === null && (
          <div className="agenda-state-surface">
            <StatePanel
              actionHref="/configuracoes/agenda"
              actionLabel="Configurar agenda"
              description="Conclua a escolha da fonte oficial antes de operar agendamentos."
              title="Fonte oficial não configurada"
            />
          </div>
        )}
        {!error && calendar && calendar.source && (
          <>
            {next && (
              <Link
                className="agenda-next"
                href={`/agenda/agendamento?id=${encodeURIComponent(next.id)}`}
              >
                <span className="agenda-next-icon">
                  <Icon name="clock" />
                </span>
                <span className="agenda-next-copy">
                  <span>Próximo agendamento</span>
                  <strong>{customerLabel(next)}</strong>
                  <small>
                    {formatAppointmentDate(next)} · {serviceNames(next)}
                  </small>
                </span>
                <Icon name="chevron-right" />
              </Link>
            )}
            <section className="agenda-command-bar">
              <div className="agenda-date-tools">
                <button
                  aria-label={previousLabel(view)}
                  className="icon-btn"
                  onClick={() => goToAdjacent(-1)}
                  type="button"
                >
                  <Icon name="chevron-left" />
                </button>
                <strong className="agenda-date-title">
                  {periodLabel(view, cursor, range)}
                </strong>
                <button
                  aria-label={nextLabel(view)}
                  className="icon-btn"
                  onClick={() => goToAdjacent(1)}
                  type="button"
                >
                  <Icon name="chevron-right" />
                </button>
              </div>
              <div
                aria-label="Visualização da agenda"
                className="agenda-view-tabs"
                role="tablist"
              >
                <div className="tab-list">
                  <ViewTab
                    active={view === "day"}
                    onClick={() => changeView("day")}
                  >
                    Dia
                  </ViewTab>
                  <ViewTab
                    active={view === "week"}
                    onClick={() => changeView("week")}
                  >
                    Semana
                  </ViewTab>
                  <ViewTab
                    active={view === "month"}
                    onClick={() => changeView("month")}
                  >
                    Mês
                  </ViewTab>
                </div>
              </div>
            </section>
            {loading && <AgendaLoading />}
            {!loading && view === "day" && (
              <>
                <DayView
                  date={isoDate(cursor)}
                  entries={entries}
                  onSelectBlock={
                    calendar.capabilities.manageAvailability
                      ? (block) =>
                          setSelectedBlock((current) =>
                            current?.id === block.id ? null : block,
                          )
                      : undefined
                  }
                  selectedBlockId={selectedBlock?.id ?? null}
                />
                {selectedBlock && (
                  <section
                    aria-label={`Ações de ${timeBlockKindLabel(selectedBlock.kind)}`}
                    className="agenda-occurrence-panel"
                  >
                    <OccurrenceActions
                      block={selectedBlock}
                      onChanged={occurrenceChanged}
                      timezone={calendar.timezone}
                    />
                  </section>
                )}
              </>
            )}
            {!loading && view === "week" && (
              <WeekView
                entries={entries}
                onSelectDay={selectDay}
                start={range.startDate}
              />
            )}
            {!loading && view === "month" && (
              <MonthView
                entries={entries}
                month={cursor}
                onSelectDay={selectDay}
                selectedDate={isoDate(cursor)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

export function SourceStrip({ calendar }: { calendar: CalendarState }) {
  const external = calendar.source === "EXTERNAL";
  const integrationFailed =
    external && calendar.integration?.status !== "CONNECTED";
  return (
    <section className="agenda-source-strip">
      <div className="agenda-source-copy">
        <span className="agenda-source-icon">
          <Icon name={external ? "link" : "calendar"} />
        </span>
        <div>
          <strong>
            {external ? "Minha Agenda" : "Agenda Atendly"} é a fonte oficial
          </strong>
          <span>
            {external
              ? "A Atendly exibe e altera apenas o que a conexão permite."
              : "Disponibilidade e alterações são controladas aqui."}
          </span>
        </div>
      </div>
      <span
        className={clsx(
          "badge",
          !external && "badge-success",
          integrationFailed && "badge-danger",
        )}
      >
        {integrationFailed
          ? "Conexão requer atenção"
          : external
            ? lastSyncLabel(calendar)
            : "Operacional"}
      </span>
    </section>
  );
}

function ViewTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={clsx("tab", active && "is-active")}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

export function AgendaLoading() {
  return (
    <div className="agenda-loading-shell" aria-label="Carregando agenda">
      <div className="skeleton agenda-loading-header" />
      <div className="agenda-loading-grid">
        <div className="skeleton agenda-loading-column" />
        <div className="skeleton agenda-loading-column" />
      </div>
    </div>
  );
}

function previousLabel(view: AgendaView): string {
  if (view === "day") return "Dia anterior";
  if (view === "week") return "Semana anterior";
  return "Mês anterior";
}

function nextLabel(view: AgendaView): string {
  if (view === "day") return "Próximo dia";
  if (view === "week") return "Próxima semana";
  return "Próximo mês";
}

function periodLabel(
  view: AgendaView,
  cursor: Date,
  range: { endDate: string; startDate: string },
): string {
  if (view === "day") return formatDate(isoDate(cursor));
  if (view === "month") {
    return capitalize(
      new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(cursor),
    );
  }
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  return `${formatter.format(new Date(`${range.startDate}T12:00:00`))} – ${formatter.format(new Date(`${range.endDate}T12:00:00`))}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lastSyncLabel(calendar: CalendarState): string {
  const value = calendar.integration?.lastSuccessfulSyncAt;
  if (!value) return "Conectada";
  return `Atualizada ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}`;
}
