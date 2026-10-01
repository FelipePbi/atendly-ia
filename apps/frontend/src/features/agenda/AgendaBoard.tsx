"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import {
  type AgendaInitialView,
  type Appointment,
  type AvailabilityException,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { StatePanel } from "@/shared/ui/States";

import { AppointmentHistory } from "./AppointmentHistory";
import { DayView } from "./DayView";
import { LifecycleActions } from "./LifecycleActions";
import { MonthView } from "./MonthView";
import {
  addDays,
  addMonths,
  buildAgendaEntries,
  customerLabel,
  endOfMonth,
  formatAppointmentDate,
  formatDate,
  isoDate,
  nextActiveAppointment,
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

/** A partir daqui, o Dia mostra a lista e o painel de detalhe em duas colunas (Goal069 §2). */
const TWO_COLUMN_MIN_WIDTH = 1024;
/** Janela da leitura própria de "Próximo agendamento": hoje em diante, independente da data navegada (Goal069 AG-06). */
const UPCOMING_WINDOW_DAYS = 60;

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

/** Semana a partir de 1024 px, Dia abaixo (regra mobile-first do produto). */
function automaticView(): AgendaView {
  if (typeof window === "undefined") return "day";
  return window.innerWidth >= 1024 ? "week" : "day";
}

function resolveView(initialView: AgendaInitialView | null): AgendaView {
  if (initialView === "DAY") return "day";
  if (initialView === "WEEK") return "week";
  if (initialView === "MONTH") return "month";
  return automaticView();
}

function rangeForView(
  view: AgendaView,
  cursor: Date,
): { endDate: string; startDate: string } {
  // O Dia lê a semana inteira, não só o dia: é o que a faixa da semana
  // precisa para marcar ponto nos dias com agendamento ativo (Goal069 §2).
  if (view === "day" || view === "week") {
    const start = startOfWeek(cursor);
    return { endDate: isoDate(addDays(start, 6)), startDate: isoDate(start) };
  }
  const gridStart = startOfWeek(startOfMonth(cursor));
  const gridEnd = addDays(startOfWeek(endOfMonth(cursor)), 6);
  return { endDate: isoDate(gridEnd), startDate: isoDate(gridStart) };
}

export function AgendaBoard() {
  const [view, setView] = useState<AgendaView>(() => automaticView());
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>([]);
  // Uma escolha manual da visualização não pode ser desfeita por uma
  // preferência gravada que ainda estava em voo quando o clique aconteceu.
  const viewLockedRef = useRef(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // `null` enquanto a disponibilidade não terminou de carregar ou a leitura
  // falhou: o motivo do dia vazio some, e o resto da tela continua (AG-03).
  const [availableWeekdays, setAvailableWeekdays] = useState<Set<
    number
  > | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    Appointment[]
  >([]);
  const [wideLayout, setWideLayout] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= TWO_COLUMN_MIN_WIDTH,
  );

  // Leitura falhada (ou serviço ausente) mantém a Agenda em Automática, com
  // todos os dias visíveis e sem mensagem de erro (Goal073).
  useEffect(() => {
    const controller = new AbortController();
    const settingsService = getProductServices().settings;
    if (!settingsService) return;
    settingsService
      .getAgendaViewPreference(controller.signal)
      .then((preference) => {
        setHiddenWeekdays(preference.hiddenWeekdays);
        if (!viewLockedRef.current) setView(resolveView(preference.initialView));
      })
      .catch(() => {
        /* Automática já é o estado inicial; nada a fazer aqui. */
      });
    return () => controller.abort();
  }, []);

  // Dia vazio explica o motivo quando a disponibilidade diz que o negócio
  // não atende naquele dia da semana (Goal069 AG-03).
  useEffect(() => {
    const controller = new AbortController();
    const settingsService = getProductServices().settings;
    if (!settingsService || typeof settingsService.get !== "function") return;
    settingsService
      .get(controller.signal)
      .then((state) => {
        const rules = state.availability?.rules ?? [];
        setAvailableWeekdays(
          new Set(
            rules.filter((rule) => rule.active).map((rule) => rule.dayOfWeek),
          ),
        );
      })
      .catch(() => {
        /* Motivo some, o resto da Agenda continua (Goal069 AG-03). */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function handleResize() {
      setWideLayout(window.innerWidth >= TWO_COLUMN_MIN_WIDTH);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const range = useMemo(() => rangeForView(view, cursor), [view, cursor]);

  // A fonte oficial decide o que pode ser lido, e decide ANTES da leitura:
  // bloqueio e exceção de disponibilidade exigem calendário configurado
  // (`requireCalendar`). Pedi-las junto num `Promise.all` incondicional
  // derrubava a agenda inteira para quem ainda não escolheu fonte, onde nem
  // calendário há.
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

  // "Próximo agendamento" é relativo a agora, por leitura própria de hoje em
  // diante — não o primeiro agendamento da janela navegada, que pode já ter
  // passado (Goal069 AG-06). Roda uma vez que a fonte é conhecida e de novo
  // só quando algo muda (`reload`), nunca a cada navegação de dia/semana/mês.
  useEffect(() => {
    if (!calendar || calendar.source === null) return;
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const today = isoDate(new Date());
    const horizon = isoDate(addDays(new Date(), UPCOMING_WINDOW_DAYS));
    services
      .listAppointments({ endDate: horizon, startDate: today }, controller.signal)
      .then(setUpcomingAppointments)
      .catch(() => {
        /* "Próximo agendamento" só some; o resto da Agenda continua. */
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `calendar.source` (não o objeto, novo a cada navegação) decide se a leitura roda; `reload` a repete após uma mutação.
  }, [calendar?.source, reload]);

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

  const next = nextActiveAppointment(upcomingAppointments);
  const selectedAppointment = selectedAppointmentId
    ? (appointments.find((item) => item.id === selectedAppointmentId) ?? null)
    : null;
  const hasAvailability =
    view === "day" && availableWeekdays !== null
      ? availableWeekdays.has(cursor.getDay())
      : null;
  // "+ Novo", na barra superior, é o único ponto de entrada de criação em
  // qualquer largura (Goal069 §1) — publicar uma ação de FAB aqui duplicaria
  // o mesmo destino no celular.
  useShellConfig({
    active: "agenda",
    loading,
    module: "agenda",
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

  /** Ciclo do atendimento mudou no painel de duas colunas: recarrega a janela
   *  para refletir o novo estado, igual a uma ocorrência de bloqueio. */
  function appointmentUpdated() {
    retry();
  }

  /**
   * O Dia e a Semana compartilham a mesma janela lida (a semana inteira,
   * para a faixa ter pontos). Navegar dentro dela não precisa recarregar —
   * só cruzar para outra janela precisa (Goal069 §2).
   */
  function navigateTo(nextView: AgendaView, nextCursor: Date) {
    const nextRange = rangeForView(nextView, nextCursor);
    if (nextRange.startDate !== range.startDate || nextRange.endDate !== range.endDate) {
      setLoading(true);
    }
    setSelectedBlock(null);
    setSelectedAppointmentId(null);
    setView(nextView);
    setCursor(nextCursor);
  }

  function goToAdjacent(direction: -1 | 1) {
    if (view === "day") return navigateTo("day", addDays(cursor, direction));
    // Ancorado à segunda-feira da semana exibida, não ao `cursor` bruto: sem
    // isso, sete somas sucessivas o deixam num dia de outro mês que o da
    // semana à vista, e o Mês aberto a partir dali pula de mês (AG-05).
    if (view === "week")
      return navigateTo("week", addDays(startOfWeek(cursor), direction * 7));
    return navigateTo("month", addMonths(cursor, direction));
  }

  function changeView(nextView: AgendaView) {
    viewLockedRef.current = true;
    if (nextView === view) return;
    navigateTo(nextView, cursor);
  }

  function selectDay(date: Date) {
    viewLockedRef.current = true;
    navigateTo("day", date);
  }

  return (
    <>
      <div className="agenda-page">
        <h1 className="agenda-page-title">Agenda</h1>
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
              description="Conclua a configuração da Agenda antes de criar agendamentos."
              title="Agenda ainda não configurada"
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
              <AgendaNewMenu capabilities={calendar.capabilities} />
            </section>
            {calendar.capabilities.manageAvailability && (
              <Button
                className="agenda-exceptions-link"
                href="/agenda/excecoes"
                variant="secondary"
              >
                Exceções do dia
              </Button>
            )}
            {loading && <AgendaLoading />}
            {!loading && view === "day" && (
              <>
                <div className="agenda-day-layout">
                  <DayView
                    canCreateAppointment={calendar.capabilities.createAppointments}
                    date={isoDate(cursor)}
                    entries={entries}
                    hasAvailability={hasAvailability}
                    hiddenWeekdays={hiddenWeekdays}
                    onSelectAppointment={
                      wideLayout
                        ? (appointment) =>
                            setSelectedAppointmentId((current) =>
                              current === appointment.id ? null : appointment.id,
                            )
                        : undefined
                    }
                    onSelectBlock={
                      calendar.capabilities.manageAvailability
                        ? (block) =>
                            setSelectedBlock((current) =>
                              current?.id === block.id ? null : block,
                            )
                        : undefined
                    }
                    onSelectDay={selectDay}
                    selectedAppointmentId={wideLayout ? selectedAppointmentId : null}
                    selectedBlockId={selectedBlock?.id ?? null}
                  />
                  {wideLayout && (
                    <DayDetailPanel
                      appointment={selectedAppointment}
                      lifecycleAvailable={calendar.source === "ATENDLY"}
                      onUpdated={appointmentUpdated}
                    />
                  )}
                </div>
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
                hiddenWeekdays={hiddenWeekdays}
                onSelectDay={selectDay}
                start={range.startDate}
              />
            )}
            {!loading && view === "month" && (
              <MonthView
                entries={entries}
                hiddenWeekdays={hiddenWeekdays}
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

/**
 * Painel de detalhe do Dia, a partir de 1024px (Goal069 §2): reusa
 * `LifecycleActions` e `AppointmentHistory` do detalhe do agendamento, sem
 * duplicar regra de ciclo de vida ou de histórico.
 */
function DayDetailPanel({
  appointment,
  lifecycleAvailable,
  onUpdated,
}: {
  appointment: Appointment | null;
  lifecycleAvailable: boolean;
  onUpdated: () => void;
}) {
  if (!appointment) {
    return (
      <aside aria-label="Detalhe do agendamento" className="agenda-day-detail">
        <p className="agenda-no-results">
          Selecione um agendamento para ver os detalhes.
        </p>
      </aside>
    );
  }
  return (
    <aside aria-label="Detalhe do agendamento" className="agenda-day-detail">
      <header className="agenda-detail-hero">
        <p className="eyebrow">{statusLabel(appointment.status)}</p>
        <h2>{customerLabel(appointment)}</h2>
        <p className="agenda-detail-date">
          {formatAppointmentDate(appointment)}
        </p>
        <p className="agenda-detail-service">{serviceNames(appointment)}</p>
      </header>
      <Link
        className="btn btn-secondary"
        href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
      >
        Ver detalhes completos
      </Link>
      {lifecycleAvailable && (
        <section className="agenda-detail-section">
          <h2>Ciclo do atendimento</h2>
          <LifecycleActions appointment={appointment} onUpdated={onUpdated} />
        </section>
      )}
      {lifecycleAvailable && (
        <section className="agenda-detail-section">
          <h2>Histórico</h2>
          <AppointmentHistory appointmentId={appointment.id} />
        </section>
      )}
    </aside>
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

/**
 * Único ponto de entrada de criação da Agenda (AG-02): os três tipos
 * governados pela capacidade que já os regia como botões soltos
 * (`createAppointments` para Agendamento, `manageAvailability` para
 * Compromisso pessoal e Bloqueio). Sem nenhuma das duas, o botão não existe.
 */
function AgendaNewMenu({
  capabilities,
}: {
  capabilities: CalendarState["capabilities"];
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!capabilities.createAppointments && !capabilities.manageAvailability) {
    return null;
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div
      className="dropdown agenda-new-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        close();
      }}
    >
      <button
        aria-controls="agenda-new-menu-list"
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <Icon name="plus" />
        <span>Novo</span>
      </button>
      {open && (
        <div className="menu" id="agenda-new-menu-list" role="menu">
          {capabilities.createAppointments && (
            <Link
              className="menu-item"
              href="/agenda/novo"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              Agendamento
            </Link>
          )}
          {capabilities.manageAvailability && (
            <Link
              className="menu-item"
              href="/agenda/bloquear?type=PERSONAL"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              Compromisso pessoal
            </Link>
          )}
          {capabilities.manageAvailability && (
            <Link
              className="menu-item"
              href="/agenda/bloquear?type=BLOCK"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              Bloqueio
            </Link>
          )}
        </div>
      )}
    </div>
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
