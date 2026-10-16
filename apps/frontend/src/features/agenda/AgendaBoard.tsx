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
  type AppointmentLifecycle,
  type AvailabilityException,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useSplashPresenting } from "@/shared/motion/splash";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import {
  runViewTransition,
  type ViewTransitionType,
} from "@/shared/motion/viewTransition";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { StatePanel } from "@/shared/ui/States";

import { AgendaCalendarSheet } from "./AgendaCalendarSheet";
import { agendaDayHref, agendaDayParam } from "./agendaLinks";
import {
  forgetAgendaChanges,
  recalledAgendaWindow,
  recalledCalendar,
  recalledCustomers,
  recalledHiddenWeekdays,
  recalledServiceCatalog,
  recalledServiceColors,
  rememberAgendaWindow,
  rememberCalendar,
  rememberCustomers,
  rememberHiddenWeekdays,
  rememberServiceCatalog,
  rememberServiceColors,
} from "./agendaMemory";
import { AgendaVisibleDaysSheet } from "./AgendaVisibleDaysSheet";
import {
  type DateRange,
  prefetchAgendaWindows,
  readAgendaWindow,
} from "./agendaWindows";
import {
  AppointmentDetailBody,
  useAppointmentDetail,
  withLifecycle,
} from "./AppointmentDetail";
import { DaySummaryCard } from "./DaySummaryCard";
import { DayView } from "./DayView";
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
  parseDate,
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

/**
 * A última visualização escolhida nas abas fica lembrada neste aparelho
 * (pedido do usuário, 2026-10-12): vence a automática por largura e a
 * preferência gravada do negócio. Sem storage (navegação privada, bloqueio)
 * ou com valor estranho, vale o comportamento de antes.
 */
export const AGENDA_VIEW_STORAGE_KEY = "avenly.agenda.view";

function storedView(): AgendaView | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(AGENDA_VIEW_STORAGE_KEY);
    return value === "day" || value === "week" || value === "month"
      ? value
      : null;
  } catch {
    return null;
  }
}

function rememberView(view: AgendaView) {
  try {
    window.localStorage.setItem(AGENDA_VIEW_STORAGE_KEY, view);
  } catch {
    /* Sem storage, a escolha vale só nesta visita. */
  }
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

export function AgendaBoard({
  initialDate,
}: {
  /** `?dia=AAAA-MM-DD` da URL: o dia em que a Agenda abre (volta do detalhe). */
  initialDate?: string;
} = {}) {
  // A escolha lembrada no aparelho é lida uma vez, no primeiro render do
  // cliente: a Agenda só desenha as abas depois de carregar o calendário, então
  // o HTML do servidor (o carregamento) não depende dela.
  const [rememberedView] = useState<AgendaView | null>(() => storedView());
  const [view, setView] = useState<AgendaView>(
    () => rememberedView ?? automaticView(),
  );
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>(
    () => recalledHiddenWeekdays() ?? [],
  );
  // Uma escolha manual da visualização — feita agora ou lembrada de outra
  // visita — não pode ser desfeita por uma preferência gravada que ainda
  // estava em voo.
  const viewLockedRef = useRef(rememberedView !== null);
  const [cursor, setCursor] = useState(() => {
    const day = agendaDayParam(initialDate);
    return day ? parseDate(day) : new Date();
  });
  // Voltar à Agenda (do detalhe, de um fluxo, de outra seção) remonta a tela:
  // ela começa pelo calendário e pela janela que esta aba já leu (D-167,
  // revisão de D-168 em 2026-10-12) e revalida em segundo plano — nunca o
  // esqueleto da grade em cima de uma Agenda que a pessoa acabou de ver.
  const [seed] = useState(() => {
    const rememberedCalendar = recalledCalendar();
    if (!rememberedCalendar?.source) return null;
    const initialRange = rangeForView(view, cursor);
    const window = recalledAgendaWindow(
      rememberedCalendar.source,
      initialRange.startDate,
      initialRange.endDate,
    );
    return { calendar: rememberedCalendar, window };
  });
  const [calendar, setCalendar] = useState<CalendarState | null>(
    seed?.calendar ?? null,
  );
  const [appointments, setAppointments] = useState<Appointment[]>(
    () => seed?.window?.appointments ?? [],
  );
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(
    () => seed?.window?.timeBlocks ?? [],
  );
  const [exceptions, setExceptions] = useState<AvailabilityException[]>(
    () => seed?.window?.exceptions ?? [],
  );
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  // Só até a primeira janela chegar: depois disso a grade nunca volta ao
  // esqueleto — uma troca de visão ou de período mantém o conteúdo atual até
  // o novo chegar (pedido do usuário, 2026-10-12; D-168). Semeada pela
  // memória da aba, a Agenda já nasce carregada.
  const [loading, setLoading] = useState(seed?.window === null || !seed);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // A visão e o período pedidos cuja janela ainda não chegou: as abas já
  // mostram o pedido, o conteúdo antigo fica na tela com `aria-busy`, e a
  // troca de verdade (conteúdo → conteúdo, numa View Transition) acontece
  // quando a leitura termina.
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // Chave `início:fim` da última janela que veio do servidor para a visão na
  // tela; `null` quando o que está na tela veio da memória ou precisa ser
  // relido (gravação, "Tentar novamente").
  const freshKeyRef = useRef<string | null>(null);
  // O esqueleto da grade só aparece se a primeira carga passar de ~150 ms:
  // dado que chega antes entra direto, sem piscar (D-168).
  const showGridSkeleton = useDeferredLoading(!calendar || loading);
  // `null` enquanto a disponibilidade não terminou de carregar ou a leitura
  // falhou: o motivo do dia vazio some, e o resto da tela continua (AG-03).
  const [availableWeekdays, setAvailableWeekdays] =
    useState<Set<number> | null>(null);
  // Mesmas regras, inteiras: a Semana rebaixa as horas fora do horário de cada
  // dia da semana a partir delas. `null` até a leitura chegar ou se falhar.
  const [availabilityRules, setAvailabilityRules] = useState<
    AvailabilityRuleLike[] | null
  >(null);
  // Vazio enquanto o catálogo não chega ou quando a leitura falha: o traço
  // fica neutro e a lista segue inteira, sem mensagem de erro.
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => recalledServiceColors() ?? new Map(),
  );
  // Depois do splash da marca a Agenda se apresenta: barra, depois a grade,
  // depois o painel (D-168, revisão de 2026-10-12). Só nesse momento.
  const presenting = useSplashPresenting();
  const [wideLayout, setWideLayout] = useState(
    () =>
      typeof window !== "undefined" &&
      window.innerWidth >= TWO_COLUMN_MIN_WIDTH,
  );
  // As folhas do calendário (A3) e dos dias visíveis (A12) abrem pela própria barra.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleDaysOpen, setVisibleDaysOpen] = useState(false);
  // Folha do "Novo" (A4): aberta pelo botão (sem horário) ou por uma hora
  // vazia da Semana (com dia e hora); `null` fechada.
  const [newSheet, setNewSheet] = useState<{ slot: NewSlot | null } | null>(
    null,
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
        rememberHiddenWeekdays(preference.hiddenWeekdays);
        if (!viewLockedRef.current)
          setView(resolveView(preference.initialView));
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
  // A janela a ler: a do pedido em espera, ou a da visão na tela.
  const targetRange = useMemo(
    () => (pending ? rangeForView(pending.view, pending.cursor) : range),
    [pending, range],
  );

  // A fonte oficial decide o que pode ser lido, e decide ANTES da leitura:
  // bloqueio e exceção de disponibilidade exigem calendário configurado
  // (`requireCalendar`). Pedi-las junto num `Promise.all` incondicional
  // derrubava a agenda inteira para quem ainda não escolheu fonte, onde nem
  // calendário há.
  //
  // A leitura é da janela pedida (`targetRange`). Quando ela chega: se era um
  // pedido em espera, a visão, o período e os dados trocam juntos numa View
  // Transition (conteúdo → conteúdo); se era a janela já na tela (vinda da
  // memória, ou relida depois de uma gravação), os dados trocam no lugar, sem
  // animação nem esqueleto. Uma janela que já veio do servidor para a visão
  // na tela não é relida.
  useEffect(() => {
    const key = `${targetRange.startDate}:${targetRange.endDate}`;
    if (freshKeyRef.current === key) return;
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const queryWindow = {
      endDate: targetRange.endDate,
      startDate: targetRange.startDate,
    };

    async function load() {
      const calendarResult = await services.getCalendar(controller.signal);
      setCalendar(calendarResult);
      rememberCalendar(calendarResult);
      if (calendarResult.source === null) {
        setAppointments([]);
        setTimeBlocks([]);
        setExceptions([]);
        setPending(null);
        return;
      }
      const loaded = await readAgendaWindow(
        services,
        calendarResult.source,
        queryWindow,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // A rota do detalhe e a coluna do Dia ao lado começam daqui (D-167).
      rememberAgendaWindow(loaded);
      const apply = () => {
        setAppointments(loaded.appointments);
        setTimeBlocks(loaded.timeBlocks);
        setExceptions(loaded.exceptions);
        freshKeyRef.current = key;
      };
      const waiting = pendingRef.current;
      if (waiting) {
        void runViewTransition(
          () => {
            apply();
            setSelectedBlock(null);
            setSelectedAppointmentId(null);
            setView(waiting.view);
            setCursor(waiting.cursor);
            setPending(null);
          },
          { types: waiting.step ? [`step-${waiting.step}`] : [] },
        );
      } else {
        apply();
      }
      prefetchAgendaWindows(
        services,
        calendarResult.source,
        neighbourRanges(waiting ?? { cursor, view }),
        controller.signal,
      );
    }

    load()
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPending(null);
        setError(requestError(caught, "Não foi possível carregar a agenda."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `cursor` e `view` só nomeiam a visão na tela para a pré-leitura das
    // vizinhas; a leitura em si é da `targetRange`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRange.endDate, targetRange.startDate, reload]);

  // O catálogo é lido uma vez por carga (e de novo após uma mutação), não a
  // cada navegação de dia/semana/mês: só a cor do serviço depende dele.
  useEffect(() => {
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((list) => {
        const colors = serviceColorMap(list.items);
        setServiceColors(colors);
        rememberServiceColors(colors);
      })
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
  const weekDay = weekSelectedDay(cursor, hiddenWeekdays);
  // As abas respondem ao clique na hora; o conteúdo segue `view` até a
  // janela pedida chegar.
  const activeView = pending?.view ?? view;
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

  /** Relê a janela na tela. O conteúdo que já existe fica até o novo chegar. */
  function retry() {
    freshKeyRef.current = null;
    setError(null);
    setSelectedBlock(null);
    setReload((value) => value + 1);
  }

  /** Uma ocorrência removida, movida ou substituída pela edição da série deixa
   *  de existir como a tela a conhecia: recarrega a janela em vez de remendar
   *  o estado local. */
  function occurrenceChanged() {
    forgetAgendaChanges();
    setSelectedBlock(null);
    retry();
  }

  /** Ciclo do atendimento mudou no painel de duas colunas: a linha da lista
   *  recebe os mesmos eixos, sem recarregar a janela nem remontar o painel. */
  function appointmentUpdated(id: string, lifecycle: AppointmentLifecycle) {
    setAppointments((current) =>
      current.map((item) =>
        item.id === id ? withLifecycle(item, lifecycle) : item,
      ),
    );
  }

  /**
   * O Dia e a Semana compartilham a mesma janela lida (a semana inteira,
   * para a faixa ter pontos). Navegar dentro dela não precisa recarregar —
   * só cruzar para outra janela precisa (Goal069 §2).
   */
  function navigateTo(
    nextView: AgendaView,
    nextCursor: Date,
    step?: AgendaStep,
  ) {
    const nextRange = rangeForView(nextView, nextCursor);
    const types: ViewTransitionType[] = step ? [`step-${step}`] : [];
    const sameWindow =
      nextRange.startDate === range.startDate &&
      nextRange.endDate === range.endDate;
    // A janela já lida (a mesma, ou uma lembrada nesta aba, D-167) troca na
    // hora, numa View Transition (D-168): o conteúdo desliza 16 px na direção
    // do passo ou, sem passo (abas, calendário), só troca com fade; a barra
    // de comando fica parada. A lembrada é revalidada em segundo plano.
    const remembered =
      !sameWindow && calendar?.source
        ? recalledAgendaWindow(
            calendar.source,
            nextRange.startDate,
            nextRange.endDate,
          )
        : null;
    if (sameWindow || remembered) {
      void runViewTransition(
        () => {
          if (remembered) {
            setAppointments(remembered.appointments);
            setTimeBlocks(remembered.timeBlocks);
            setExceptions(remembered.exceptions);
            freshKeyRef.current = null;
          }
          setSelectedBlock(null);
          setSelectedAppointmentId(null);
          setView(nextView);
          setCursor(nextCursor);
          setPending(null);
        },
        { types },
      );
      return;
    }
    // Janela nova: o conteúdo atual fica na tela, com `aria-busy`, até ela
    // chegar — nunca o esqueleto da grade (pedido do usuário, 2026-10-12).
    setPending({ cursor: nextCursor, step, view: nextView });
  }

  function goToAdjacent(direction: -1 | 1) {
    const step: AgendaStep = direction === 1 ? "next" : "prev";
    // Duas setas seguidas antes da janela chegar: a segunda parte do pedido.
    const base = pending ?? { cursor, view };
    if (base.view === "day")
      return navigateTo("day", addDays(base.cursor, direction), step);
    // Ancorado à segunda-feira da semana exibida, não ao `cursor` bruto: sem
    // isso, sete somas sucessivas o deixam num dia de outro mês que o da
    // semana à vista, e o Mês aberto a partir dali pula de mês (AG-05).
    // A Semana mantém o dia da semana escolhido (pedido de 2026-10-12) quando
    // ele fica no mesmo mês do começo da semana nova; senão, vai para o
    // começo dela, e o Mês aberto dali não pula de mês (AG-05). Dia escondido
    // vira o primeiro dia exibido (`weekSelectedDay`).
    if (base.view === "week") {
      const kept = addDays(
        weekSelectedDay(base.cursor, hiddenWeekdays),
        direction * 7,
      );
      const weekStart = startOfWeek(kept);
      return navigateTo(
        "week",
        kept.getMonth() === weekStart.getMonth() ? kept : weekStart,
        step,
      );
    }
    return navigateTo("month", addMonths(base.cursor, direction), step);
  }

  function changeView(nextView: AgendaView) {
    viewLockedRef.current = true;
    rememberView(nextView);
    if (nextView === (pending?.view ?? view)) return;
    navigateTo(nextView, pending?.cursor ?? cursor);
  }

  function selectDay(date: Date) {
    viewLockedRef.current = true;
    // Na faixa do Dia, a lista desliza na direção do dia escolhido.
    const step: AgendaStep | undefined =
      view === "day" && isoDate(date) !== isoDate(cursor)
        ? date > cursor
          ? "next"
          : "prev"
        : undefined;
    navigateTo("day", date, step);
  }

  /** O cabeçalho de um dia na Semana só o escolhe para o resumo (pedido de 2026-10-12). */
  function focusWeekDay(date: Date) {
    // O destaque da coluna e o resumo trocam com fade (D-168).
    void runViewTransition(() => {
      setSelectedAppointmentId(null);
      setCursor(date);
    });
  }

  /** Na lista do Dia a partir de 1024 px, a escolha troca o painel ao lado com fade. */
  function toggleSelectedAppointment(appointment: Appointment) {
    void runViewTransition(() => {
      setSelectedAppointmentId((current) =>
        current === appointment.id ? null : appointment.id,
      );
    });
  }

  /** Bloqueio e compromisso pessoal abrem as ações da ocorrência no Dia e na Semana. */
  const selectBlock = calendar?.capabilities.manageAvailability
    ? (block: TimeBlock) =>
        setSelectedBlock((current) => (current?.id === block.id ? null : block))
    : undefined;
  // As ações abrem na mesma folha do "Novo", nunca embutidas abaixo da grade
  // (pedido de 2026-10-12): o foco entra nela e volta ao bloco ao fechar.
  const occurrencePanel =
    selectedBlock && calendar ? (
      <ChatSheetShell
        className="is-agenda-occurrence"
        key={selectedBlock.id}
        onClose={() => setSelectedBlock(null)}
        title={`Ações de ${timeBlockKindLabel(selectedBlock.kind)}`}
      >
        <button
          aria-label="Fechar"
          className="agenda-occurrence-close"
          onClick={() => setSelectedBlock(null)}
          type="button"
        >
          <Icon name="x" />
        </button>
        <OccurrenceActions
          block={selectedBlock}
          onChanged={occurrenceChanged}
          timezone={calendar.timezone}
        />
      </ChatSheetShell>
    ) : null;

  /** O mini-calendário move a Agenda para a data, sem trocar a visualização. */
  function pickCalendarDate(date: Date) {
    setCalendarOpen(false);
    navigateTo(view, date);
  }

  return (
    <>
      <div
        className={clsx("agenda-page", presenting && "is-presenting")}
        data-presenting={presenting ? "true" : undefined}
      >
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
        {!error && !calendar && showGridSkeleton && <AgendaLoading />}
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
            <section className="agenda-command-bar" data-present="1">
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
                      active={activeView === "day"}
                      onClick={() => changeView("day")}
                    >
                      Dia
                    </ViewTab>
                    <ViewTab
                      active={activeView === "week"}
                      onClick={() => changeView("week")}
                    >
                      Semana
                    </ViewTab>
                    <ViewTab
                      active={activeView === "month"}
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
              <AgendaNewMenu
                capabilities={calendar.capabilities}
                onClose={() => setNewSheet(null)}
                onToggle={() =>
                  setNewSheet((current) => (current ? null : { slot: null }))
                }
                sheet={newSheet}
              />
            </section>
            {calendarOpen && (
              <AgendaCalendarSheet
                avenly={calendar.source === "AVENLY"}
                focusedDate={cursor}
                source={calendar.source}
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
                  rememberHiddenWeekdays(next);
                  setVisibleDaysOpen(false);
                }}
              />
            )}
            {/* O conteúdo que muda de dia, semana, mês ou visualização é um
                grupo só da View Transition (`agenda-content`, D-168). */}
            <div
              aria-busy={pending ? true : undefined}
              className={clsx(
                "agenda-content motion-stepped",
                pending && "is-waiting",
              )}
            >
              {loading && showGridSkeleton && <AgendaLoading />}
              {!loading && view === "day" && (
                <>
                  <div className="agenda-day-layout">
                    <DayView
                      canCreateAppointment={
                        calendar.capabilities.createAppointments
                      }
                      date={isoDate(cursor)}
                      entries={entries}
                      hasAvailability={hasAvailability}
                      hiddenWeekdays={hiddenWeekdays}
                      onSelectAppointment={
                        wideLayout ? toggleSelectedAppointment : undefined
                      }
                      onSelectBlock={selectBlock}
                      onSelectDay={selectDay}
                      selectedAppointmentId={
                        wideLayout ? selectedAppointmentId : null
                      }
                      selectedBlockId={selectedBlock?.id ?? null}
                      serviceColors={serviceColors}
                    />
                    {wideLayout && (
                      <DayDetailPanel
                        appointmentId={selectedAppointment?.id ?? null}
                        calendar={calendar}
                        seed={selectedAppointment}
                        closedDay={
                          hasAvailability === false &&
                          entriesForDate(entries, isoDate(cursor)).length === 0
                        }
                        onUpdated={appointmentUpdated}
                        returnTo={agendaDayHref(isoDate(cursor))}
                      />
                    )}
                  </div>
                  {occurrencePanel}
                </>
              )}
              {!loading && view === "week" && (
                <>
                  <WeekView
                    availabilityRules={availabilityRules}
                    entries={entries}
                    hiddenWeekdays={hiddenWeekdays}
                    onCreateAt={
                      calendar.capabilities.createAppointments ||
                      calendar.capabilities.manageAvailability
                        ? (date, time) => setNewSheet({ slot: { date, time } })
                        : undefined
                    }
                    onSelectBlock={selectBlock}
                    onSelectDay={focusWeekDay}
                    selectedBlockId={selectedBlock?.id ?? null}
                    selectedDate={isoDate(weekDay)}
                    serviceColors={serviceColors}
                    start={range.startDate}
                  />
                  {occurrencePanel}
                  <DaySummaryCard
                    date={isoDate(weekDay)}
                    entries={entries}
                    hasAvailability={
                      availableWeekdays !== null
                        ? availableWeekdays.has(weekDay.getDay())
                        : null
                    }
                    isToday={isoDate(weekDay) === isoDate(new Date())}
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
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Direção de um passo de dia, semana ou mês, para o conteúdo deslizar (D-168). */
type AgendaStep = "next" | "prev";

/** Visão e período pedidos cuja janela ainda está sendo lida. */
type PendingNavigation = { cursor: Date; step?: AgendaStep; view: AgendaView };

function neighbourRanges(shown: {
  cursor: Date;
  view: AgendaView;
}): DateRange[] {
  const { cursor, view } = shown;
  const ranges: DateRange[] = [];
  if (view === "month") {
    ranges.push(rangeForView("week", cursor));
    ranges.push(rangeForView("month", addMonths(cursor, -1)));
    ranges.push(rangeForView("month", addMonths(cursor, 1)));
  } else {
    ranges.push(rangeForView("month", cursor));
    ranges.push(rangeForView("week", addDays(startOfWeek(cursor), -7)));
    ranges.push(rangeForView("week", addDays(startOfWeek(cursor), 7)));
  }
  return ranges;
}

/**
 * Painel de detalhe do Dia, a partir de 1024 px: sem seleção, a frase do
 * quadro A1; com um atendimento selecionado, o mesmo corpo do quadro A5 da
 * rota `/agenda/agendamento` (D-165, que substitui o conteúdo de D-089), com
 * as ações do ciclo no "•••" e sem o voltar, porque a lista já está ao lado.
 */
function DayDetailPanel({
  appointmentId,
  calendar,
  closedDay,
  onUpdated,
  returnTo,
  seed,
}: {
  appointmentId: string | null;
  calendar: CalendarState;
  /** O atendimento como a lista o conhece: o painel começa por ele (D-168). */
  seed: Appointment | null;
  /** O dia da Agenda em que o painel está: Remarcar e Cancelar voltam a ele. */
  returnTo: string;
  /** Dia vazio em que o negócio não atende (quadro A2): não há o que selecionar. */
  closedDay: boolean;
  onUpdated: (appointmentId: string, lifecycle: AppointmentLifecycle) => void;
}) {
  if (!appointmentId) {
    return (
      <aside
        aria-label="Detalhe do agendamento"
        className="agenda-day-detail is-empty"
        data-present="3"
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
    <aside
      aria-label="Detalhe do agendamento"
      className="agenda-day-detail is-appointment"
      data-present="3"
    >
      <DayAppointmentDetail
        appointmentId={appointmentId}
        calendar={calendar}
        onUpdated={(lifecycle) => onUpdated(appointmentId, lifecycle)}
        seed={seed}
        returnTo={returnTo}
      />
    </aside>
  );
}

function DayAppointmentDetail({
  appointmentId,
  calendar,
  onUpdated,
  returnTo,
  seed,
}: {
  appointmentId: string;
  calendar: CalendarState;
  onUpdated: (lifecycle: AppointmentLifecycle) => void;
  returnTo: string;
  seed: Appointment | null;
}) {
  // Trocar de atendimento começa pelo que a lista já sabe dele (`seed`) e a
  // leitura completa o resto; sem esqueleto (decisão do usuário, 2026-10-12).
  const detail = useAppointmentDetail(appointmentId, {
    calendar,
    seed,
    onLifecycle: onUpdated,
  });
  return (
    <div aria-busy={detail.busy || undefined} className="agenda-appt">
      <PushedBar
        menuItems={detail.lifecycle.menuItems}
        menuLabel="Mais ações do agendamento"
      />
      <AppointmentDetailBody detail={detail} returnTo={returnTo} />
    </div>
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
 * Único ponto de entrada de criação da Agenda (AG-02): os dois itens
 * governados pela capacidade que já os regia como botões soltos
 * (`createAppointments` para Agendamento, `manageAvailability` para
 * Bloquear horário, que reúne pausa, compromisso e dia fechado, D-169).
 * Sem nenhuma das duas, o botão não existe. O mesmo botão é flutuante abaixo de 1024 px e fica na
 * barra a partir dele (quadro A1); a escolha abre a folha do quadro A4.
 */
function AgendaNewMenu({
  capabilities,
  onClose,
  onToggle,
  sheet,
}: {
  capabilities: CalendarState["capabilities"];
  onClose: () => void;
  onToggle: () => void;
  /** Aberta pelo botão (`slot: null`) ou por uma hora vazia da Semana. */
  sheet: { slot: NewSlot | null } | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!capabilities.createAppointments && !capabilities.manageAvailability) {
    return null;
  }

  function close() {
    // Aberta por uma hora da Semana, o foco volta para ela (a folha devolve
    // o foco a quem a abriu); aberta pelo botão, volta para o botão.
    if (!sheet?.slot) buttonRef.current?.focus();
    onClose();
  }

  return (
    <div className="agenda-new-menu">
      <button
        aria-expanded={sheet !== null}
        aria-haspopup="dialog"
        aria-label="Novo"
        className="btn agenda-new-trigger"
        onClick={onToggle}
        ref={buttonRef}
        type="button"
      >
        <Icon name="plus" />
        <span>Novo</span>
      </button>
      {sheet && (
        <AgendaNewSheet
          capabilities={capabilities}
          onClose={close}
          slot={sheet.slot}
        />
      )}
    </div>
  );
}

/** Dia e hora escolhidos numa hora vazia da Semana, levados ao formulário. */
type NewSlot = { date: string; time: string };

function withSlot(
  href: string,
  slot: NewSlot | null,
  fields: Array<keyof NewSlot>,
): string {
  if (!slot) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  for (const field of fields) params.set(field, slot[field]);
  return `${path}?${params.toString()}`;
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
  slot,
}: {
  capabilities: CalendarState["capabilities"];
  onClose: () => void;
  slot: NewSlot | null;
}) {
  const titleId = useId();
  // Abrir a folha já pré-lê o que o novo agendamento precisa (serviços e
  // clientes), para a tela abrir pronta (D-168); o calendário a Agenda já
  // lembrou. Falha aqui não importa: a tela lê de novo.
  useEffect(() => {
    if (!capabilities.createAppointments) return;
    const controller = new AbortController();
    const { customers, serviceCatalog } = getProductServices();
    if (
      !recalledServiceCatalog() &&
      typeof serviceCatalog?.list === "function"
    ) {
      serviceCatalog
        .list(controller.signal)
        .then((list) => {
          if (!controller.signal.aborted) rememberServiceCatalog(list);
        })
        .catch(() => undefined);
    }
    if (!recalledCustomers() && typeof customers?.list === "function") {
      customers
        .list({}, controller.signal)
        .then((list) => {
          if (!controller.signal.aborted) rememberCustomers(list);
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [capabilities.createAppointments]);
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
            href={withSlot("/agenda/novo", slot, ["date"])}
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
        {/* Pausa, compromisso pessoal e dia fechado são um só "Bloquear
            horário", com o tipo escolhido na primeira etapa (D-169). */}
        {capabilities.manageAvailability && (
          <AgendaNewRow
            description="Pausa, compromisso ou dia fechado"
            href={withSlot("/agenda/bloquear", slot, ["date", "time"])}
            onNavigate={onClose}
            title="Bloquear horário"
            tone="block"
          >
            <svg aria-hidden="true" {...NEW_ROW_ICON_PROPS}>
              <circle cx="12" cy="12" r="8" />
              <path d="M6.5 6.5l11 11" />
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
      <span
        aria-hidden="true"
        className={clsx("agenda-new-row-icon", `is-${tone}`)}
      >
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

/**
 * O dia escolhido na Semana: o do cursor (hoje ao abrir, o de `?dia=` ou o
 * que a pessoa tocou), ou o primeiro dia exibido quando o cursor cai num dia
 * escondido pela preferência.
 */
function weekSelectedDay(cursor: Date, hiddenWeekdays: number[]): Date {
  if (!hiddenWeekdays.includes(cursor.getDay())) return cursor;
  const start = startOfWeek(cursor);
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(start, index);
    if (!hiddenWeekdays.includes(day.getDay())) return day;
  }
  return cursor;
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
