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
import { StatePanel } from "@/shared/ui/States";

import { AppointmentHistory } from "./AppointmentHistory";
import { DaySummaryCard } from "./DaySummaryCard";
import { DayView } from "./DayView";
import { LifecycleActions } from "./LifecycleActions";
import { MonthView } from "./MonthView";
import {
  addDays,
  addMonths,
  type AvailabilityRuleLike,
  buildAgendaEntries,
  customerLabel,
  endOfMonth,
  formatAppointmentDate,
  formatDate,
  isoDate,
  requestError,
  type ServiceColorMap,
  serviceColorMap,
  serviceNames,
  sourceLabel,
  startOfMonth,
  startOfWeek,
  statusLabel,
  timeBlockKindLabel,
  visibleDaysLabel,
} from "./occupancy";
import { OccurrenceActions } from "./OccurrenceActions";
import { WeekView } from "./WeekView";

/** A partir daqui, o Dia mostra a lista e o painel de detalhe em duas colunas (Goal069 §2). */
const TWO_COLUMN_MIN_WIDTH = 1024;

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
  // Mesmas regras, inteiras: a Semana rebaixa as horas fora do horário de cada
  // dia da semana a partir delas. `null` até a leitura chegar ou se falhar.
  const [availabilityRules, setAvailabilityRules] = useState<
    AvailabilityRuleLike[] | null
  >(null);
  // Vazio enquanto o catálogo não chega ou quando a leitura falha: o traço
  // fica neutro e a lista segue inteira, sem mensagem de erro.
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
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
        setAvailabilityRules(
          rules.map((rule) => ({
            active: Boolean(rule.active),
            dayOfWeek: rule.dayOfWeek,
            endTime: rule.endTime,
            startTime: rule.startTime,
          })),
        );
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

  // O catálogo é lido uma vez por carga (e de novo após uma mutação), não a
  // cada navegação de dia/semana/mês: só a cor do serviço depende dele.
  useEffect(() => {
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((list) => setServiceColors(serviceColorMap(list.items)))
      .catch(() => {
        /* Sem catálogo, o traço fica neutro e a Agenda continua. */
      });
    return () => controller.abort();
  }, [reload]);

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

  const monthYear = monthAndYear(cursor);
  const selectedAppointment = selectedAppointmentId
    ? (appointments.find((item) => item.id === selectedAppointmentId) ?? null)
    : null;
  const hasAvailability =
    view === "day" && availableWeekdays !== null
      ? availableWeekdays.has(cursor.getDay())
      : null;
  // O botão de criar é do próprio `AgendaNewMenu` (flutuante abaixo de
  // 1024 px, "Novo" na barra a partir dele): publicar uma ação de FAB da
  // casca aqui duplicaria o mesmo destino no celular.
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
            <section className="agenda-command-bar">
              <strong className="agenda-date-title">
                <span className="agenda-date-month">{monthYear.month}</span>{" "}
                <span className="agenda-date-year">{monthYear.year}</span>
              </strong>
              <div className="agenda-view-controls">
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
              {view !== "day" && (
                <Link
                  className="agenda-visible-days"
                  href="/configuracoes/agenda"
                >
                  <Icon name="eye" />
                  {visibleDaysLabel(hiddenWeekdays)}
                </Link>
              )}
              </div>
              <div className="agenda-date-tools">
                <button
                  aria-label={previousLabel(view)}
                  className="icon-btn"
                  onClick={() => goToAdjacent(-1)}
                  type="button"
                >
                  <Icon name="chevron-left" />
                </button>
                <button
                  aria-label={nextLabel(view)}
                  className="icon-btn"
                  onClick={() => goToAdjacent(1)}
                  type="button"
                >
                  <Icon name="chevron-right" />
                </button>
              </div>
              <AgendaNewMenu capabilities={calendar.capabilities} />
            </section>
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
                    serviceColors={serviceColors}
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
              <>
                <WeekView
                  availabilityRules={availabilityRules}
                  entries={entries}
                  hiddenWeekdays={hiddenWeekdays}
                  onSelectDay={selectDay}
                  serviceColors={serviceColors}
                  start={range.startDate}
                />
                <DaySummaryCard
                  date={isoDate(cursor)}
                  entries={entries}
                  hasAvailability={
                    availableWeekdays !== null
                      ? availableWeekdays.has(cursor.getDay())
                      : null
                  }
                  isToday={isoDate(cursor) === isoDate(new Date())}
                  onOpenDay={selectDay}
                  serviceColors={serviceColors}
                />
              </>
            )}
            {!loading && view === "month" && (
              <MonthView
                availableWeekdays={availableWeekdays}
                entries={entries}
                hiddenWeekdays={hiddenWeekdays}
                key={isoDate(cursor)}
                month={cursor}
                onSelectDay={selectDay}
                selectedDate={isoDate(cursor)}
                serviceColors={serviceColors}
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
      <aside
        aria-label="Detalhe do agendamento"
        className="agenda-day-detail is-empty"
      >
        <p className="agenda-day-detail-empty">
          Selecione um atendimento para ver os detalhes
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
 * Único ponto de entrada de criação da Agenda (AG-02): os quatro itens
 * governados pela capacidade que já os regia como botões soltos
 * (`createAppointments` para Agendamento, `manageAvailability` para
 * Compromisso pessoal, Bloqueio e Exceção do dia). Sem nenhuma das duas, o
 * botão não existe. O mesmo botão é flutuante abaixo de 1024 px e fica na
 * barra a partir dele (quadro A1); só o CSS muda a posição.
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
        aria-label="Novo"
        className="btn agenda-new-trigger"
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
          {capabilities.manageAvailability && (
            <Link
              className="menu-item"
              href="/agenda/excecoes"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              Exceção do dia
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

export function monthAndYear(cursor: Date): { month: string; year: string } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).formatToParts(cursor);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return { month: capitalize(part("month")), year: part("year") };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
