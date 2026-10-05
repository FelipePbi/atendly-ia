"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AgendaInitialView,
  type Appointment,
  type AvailabilityException,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { AgendaCalendarSheet } from "./AgendaCalendarSheet";
import { AgendaVisibleDaysSheet } from "./AgendaVisibleDaysSheet";
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
  entriesForDate,
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
  // As folhas do calendário (A3) e dos dias visíveis (A12) abrem pela própria barra.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleDaysOpen, setVisibleDaysOpen] = useState(false);

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
      const avenly = calendarResult.source === "AVENLY";
      const [appointmentResult, blockResult, exceptionResult] =
        await Promise.all([
          services.listAppointments(queryWindow, controller.signal),
          avenly
            ? services.listTimeBlocks(queryWindow, controller.signal)
            : Promise.resolve<TimeBlock[]>([]),
          avenly
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

  /** O mini-calendário move a Agenda para a data, sem trocar a visualização. */
  function pickCalendarDate(date: Date) {
    setCalendarOpen(false);
    navigateTo(view, date);
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
              <button
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
                aria-label={`Abrir calendário, ${monthYear.month} de ${monthYear.year}`}
                className="agenda-date-title"
                onClick={() => setCalendarOpen(true)}
                type="button"
              >
                <span className="agenda-date-month">{monthYear.month}</span>{" "}
                <span className="agenda-date-year">{monthYear.year}</span>
                <svg
                  aria-hidden="true"
                  className="agenda-date-chevron"
                  fill="none"
                  height="16"
                  stroke="#716859"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
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
                <button
                  aria-expanded={visibleDaysOpen}
                  aria-haspopup="dialog"
                  className="agenda-visible-days"
                  onClick={() => setVisibleDaysOpen(true)}
                  type="button"
                >
                  <Icon name="eye" />
                  {visibleDaysLabel(hiddenWeekdays)}
                </button>
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
            {calendarOpen && (
              <AgendaCalendarSheet
                avenly={calendar.source === "AVENLY"}
                focusedDate={cursor}
                onClose={() => setCalendarOpen(false)}
                onPick={pickCalendarDate}
                timezone={calendar.timezone ?? undefined}
              />
            )}
            {visibleDaysOpen && (
              <AgendaVisibleDaysSheet
                availableWeekdays={availableWeekdays}
                hiddenWeekdays={hiddenWeekdays}
                onClose={() => setVisibleDaysOpen(false)}
                onSaved={(next) => {
                  setHiddenWeekdays(next);
                  setVisibleDaysOpen(false);
                }}
              />
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
                    serviceColors={serviceColors}
                  />
                  {wideLayout && (
                    <DayDetailPanel
                      appointment={selectedAppointment}
                      closedDay={
                        hasAvailability === false &&
                        entriesForDate(entries, isoDate(cursor)).length === 0
                      }
                      lifecycleAvailable={calendar.source === "AVENLY"}
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
  closedDay,
  lifecycleAvailable,
  onUpdated,
}: {
  appointment: Appointment | null;
  /** Dia vazio em que o negócio não atende (quadro A2): não há o que selecionar. */
  closedDay: boolean;
  lifecycleAvailable: boolean;
  onUpdated: () => void;
}) {
  if (!appointment) {
    return (
      <aside
        aria-label="Detalhe do agendamento"
        className="agenda-day-detail is-empty"
      >
        {!closedDay && (
          <p className="agenda-day-detail-empty">
            Selecione um atendimento para ver os detalhes
          </p>
        )}
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
 * barra a partir dele (quadro A1); a escolha abre a folha do quadro A4.
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
    <div className="agenda-new-menu">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Novo"
        className="btn agenda-new-trigger"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        type="button"
      >
        <Icon name="plus" />
        <span>Novo</span>
      </button>
      {open && <AgendaNewSheet capabilities={capabilities} onClose={close} />}
    </div>
  );
}

const NEW_ROW_ICON_PROPS = {
  fill: "none",
  height: 22,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.75,
  viewBox: "0 0 24 24",
  width: 22,
} as const;

function AgendaNewSheet({
  capabilities,
  onClose,
}: {
  capabilities: CalendarState["capabilities"];
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <ChatSheetShell
      className="is-agenda-new"
      onClose={onClose}
      title="O que você quer adicionar?"
      titleId={titleId}
    >
      <h2 className="agenda-new-sheet-title" id={titleId}>
        O que você quer adicionar?
      </h2>
      <div className="agenda-new-sheet-list">
        {capabilities.createAppointments && (
          <AgendaNewRow
            description="Atendimento para um cliente"
            href="/agenda/novo"
            onNavigate={onClose}
            title="Agendamento"
            tone="appointment"
          >
            <svg aria-hidden="true" {...NEW_ROW_ICON_PROPS}>
              <circle cx="12" cy="8.5" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </AgendaNewRow>
        )}
        {capabilities.manageAvailability && (
          <AgendaNewRow
            description="Ocupa a agenda sem cliente — a IA não marca por cima"
            href="/agenda/bloquear?type=PERSONAL"
            onNavigate={onClose}
            title="Compromisso pessoal"
            tone="personal"
          >
            <svg aria-hidden="true" {...NEW_ROW_ICON_PROPS}>
              <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
              <path d="M4 10h16M8 3.5v4M16 3.5v4" />
              <circle cx="12" cy="15" fill="currentColor" r="1.5" stroke="none" />
            </svg>
          </AgendaNewRow>
        )}
        {capabilities.manageAvailability && (
          <AgendaNewRow
            description="Horário indisponível, uma vez ou toda semana"
            href="/agenda/bloquear?type=BLOCK"
            onNavigate={onClose}
            title="Bloqueio"
            tone="block"
          >
            <svg aria-hidden="true" {...NEW_ROW_ICON_PROPS}>
              <circle cx="12" cy="12" r="8" />
              <path d="M6.5 6.5l11 11" />
            </svg>
          </AgendaNewRow>
        )}
        {capabilities.manageAvailability && (
          <AgendaNewRow
            description="Atender ou fechar um dia fora do horário de sempre"
            href="/agenda/excecoes"
            onNavigate={onClose}
            title="Exceção do dia"
            tone="exception"
          >
            <svg aria-hidden="true" {...NEW_ROW_ICON_PROPS}>
              <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
              <path d="M4 10h16M8 3.5v4M16 3.5v4" />
              <path d="M12 12.5v2.5l1.75 1" />
            </svg>
          </AgendaNewRow>
        )}
      </div>
    </ChatSheetShell>
  );
}

function AgendaNewRow({
  children,
  description,
  href,
  onNavigate,
  title,
  tone,
}: {
  children: ReactNode;
  description: string;
  href: string;
  onNavigate: () => void;
  title: string;
  tone: "appointment" | "block" | "exception" | "personal";
}) {
  const id = useId();
  return (
    <Link
      aria-describedby={`${id}-description`}
      aria-labelledby={`${id}-title`}
      className="agenda-new-row"
      href={href}
      onClick={onNavigate}
    >
      <span aria-hidden="true" className={clsx("agenda-new-row-icon", `is-${tone}`)}>
        {children}
      </span>
      <span className="agenda-new-row-copy">
        <span className="agenda-new-row-title" id={`${id}-title`}>
          {title}
        </span>
        <span className="agenda-new-row-description" id={`${id}-description`}>
          {description}
        </span>
      </span>
      <svg
        aria-hidden="true"
        className="agenda-new-row-chevron"
        fill="none"
        height="20"
        stroke="#716859"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
        width="20"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
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
