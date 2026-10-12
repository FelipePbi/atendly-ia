"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  type Appointment,
  type AvailabilityException,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailLayout } from "@/shared/layout/ListDetail";
import { useSplashHold, useSplashPresenting } from "@/shared/motion/splash";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { monthAndYear } from "./AgendaBoard";
import {
  recalledAgendaWindow,
  recalledCalendar,
  recalledHiddenWeekdays,
  recalledServiceColors,
  rememberAgendaWindow,
  rememberHiddenWeekdays,
  rememberServiceColors,
} from "./agendaMemory";
import { DayView } from "./DayView";
import {
  addDays,
  buildAgendaEntries,
  isoDate,
  parseDate,
  type ServiceColorMap,
  serviceColorMap,
  startOfWeek,
} from "./occupancy";

/**
 * Coluna da Agenda ao lado de detalhe, cancelamento e remarcação, de 1024 px
 * em diante (D-110 (a) e (b), estendendo D-103): o Dia da data do agendamento
 * aberto, com a linha dele marcada. Quem decide montar isto é a tela da rota,
 * que também configura a casca — esta coluna nunca chama `useShellConfig`. O
 * invólucro existe nas duas larguras, para que o fluxo no painel continue o
 * mesmo nó ao cruzar 1024 px (Goal112); com `split` desligado a barra e a
 * coluna ficam de fora e nada é buscado para um painel que não aparece
 * (D-103 (f)).
 *
 * Vindo da própria Agenda, o calendário e a semana já lidos nesta aba
 * aparecem na hora e são revalidados em segundo plano (D-167); sem eles, a
 * barra e a coluna carregam na forma da barra e do Dia reais, para nada
 * pular quando os dados chegam (pedido de 2026-10-12).
 */
export function AgendaDayColumn({
  appointmentId,
  bar = true,
  calendar,
  children,
  date,
  panelFirst = false,
  split = true,
}: {
  appointmentId?: string;
  /**
   * Barra da Agenda (Dia/Semana/Mês, ‹ › e "+ Novo") acima da coluna. Os
   * fluxos de criar, remarcar e cancelar a desligam (D-170): só o detalhe a
   * mostra, e a coluna troca de dia pela própria faixa da semana.
   */
  bar?: boolean;
  /** Lido pela tela da rota; a coluna espera por ele em vez de pedir de novo. */
  calendar: CalendarState | null;
  children: ReactNode;
  /** Dia a mostrar; `null` enquanto a tela da rota ainda não sabe qual é. */
  date: string | null;
  /** O formulário vem antes da coluna no DOM, para que o foco e a leitura comecem nele. */
  panelFirst?: boolean;
  /** Divisão ligada (1024 px em diante): barra do dia e coluna ao lado do fluxo. */
  split?: boolean;
}) {
  // Enquanto a tela da rota não traz o calendário, vale o que a Agenda leu.
  const [rememberedCalendar] = useState(recalledCalendar);
  const knownCalendar = calendar ?? rememberedCalendar;
  const [anchor, setAnchor] = useState(date);
  const [cursor, setCursor] = useState<Date | null>(() =>
    date ? parseDate(date) : null,
  );
  // Outro agendamento aberto pela própria coluna traz outra data: a coluna
  // volta para o dia dele, sem remontar e sem reler o catálogo.
  if (date !== anchor) {
    setAnchor(date);
    setCursor(date ? parseDate(date) : null);
  }

  // Depois do splash da marca a tela se apresenta: barra, coluna, painel
  // (D-168, revisão de 2026-10-12). O splash espera a coluna saber o dia e o
  // calendário, para nunca sair em cima do esqueleto dela.
  const presenting = useSplashPresenting();
  useSplashHold(!cursor || !knownCalendar);

  const list = (
    <section className="agenda-appt-column" data-present="2">
      {cursor && knownCalendar ? (
        <AgendaDayColumnContent
          appointmentId={appointmentId}
          calendar={knownCalendar}
          cursor={cursor}
          onChangeDay={setCursor}
        />
      ) : (
        <AgendaDayColumnSkeleton />
      )}
    </section>
  );

  return (
    <div
      className={clsx(
        "agenda-appt-split",
        split ? !bar && "agenda-appt-split-barless" : "agenda-appt-split-flat",
        presenting && "is-presenting",
      )}
      data-presenting={presenting ? "true" : undefined}
    >
      {split &&
        bar &&
        (knownCalendar && cursor ? (
          knownCalendar.source && (
            <AgendaColumnBar
              calendar={knownCalendar}
              cursor={cursor}
              onChangeDay={setCursor}
            />
          )
        ) : (
          <AgendaColumnBarSkeleton />
        ))}
      <ListDetailLayout
        detail={children}
        list={list}
        listLabel="Agenda do dia"
        panelFirst={panelFirst}
        split={split}
      />
    </div>
  );
}

/**
 * A barra comum da Agenda (D-108) com "Dia" marcado: ‹ › trocam o dia da
 * coluna, "Semana" e "Mês" levam à Agenda e "Novo" ao novo agendamento.
 */
function AgendaColumnBar({
  calendar,
  cursor,
  onChangeDay,
}: {
  calendar: CalendarState;
  cursor: Date;
  onChangeDay: (date: Date) => void;
}) {
  const monthYear = monthAndYear(cursor);
  return (
    <section className="agenda-command-bar" data-present="1">
      <strong className="agenda-date-title">
        <span className="agenda-date-month">{monthYear.month}</span>{" "}
        <span className="agenda-date-year">{monthYear.year}</span>
      </strong>
      <div className="agenda-view-controls">
        <nav aria-label="Visualização da agenda" className="agenda-view-tabs">
          <div className="tab-list">
            <span aria-current="true" className="tab is-active">
              Dia
            </span>
            <Link className="tab" href="/agenda">
              Semana
            </Link>
            <Link className="tab" href="/agenda">
              Mês
            </Link>
          </div>
        </nav>
      </div>
      <div className="agenda-date-tools">
        <button
          aria-label="Dia anterior"
          className="icon-btn"
          onClick={() => onChangeDay(addDays(cursor, -1))}
          type="button"
        >
          <Icon name="chevron-left" />
        </button>
        <button
          aria-label="Próximo dia"
          className="icon-btn"
          onClick={() => onChangeDay(addDays(cursor, 1))}
          type="button"
        >
          <Icon name="chevron-right" />
        </button>
      </div>
      {calendar.capabilities.createAppointments && (
        <div className="agenda-new-menu">
          <Link className="btn agenda-new-trigger" href="/agenda/novo">
            <Icon name="plus" />
            <span>Novo</span>
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * A barra carregando, no lugar e na altura da real: as abas e as setas são as
 * mesmas, o mês e o "Novo" esperam pelo calendário. Fica fora da árvore
 * acessível; quem anuncia o carregamento é a coluna. Invisível, sem
 * esqueleto (pedido de 2026-10-12): só guarda o lugar até a barra real.
 */
function AgendaColumnBarSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="agenda-command-bar agenda-command-bar-skeleton"
    >
      <strong className="agenda-date-title">
        <span className="agenda-date-month">Setembro</span>{" "}
        <span className="agenda-date-year">2026</span>
      </strong>
      <div className="agenda-view-controls">
        <div className="agenda-view-tabs">
          <div className="tab-list">
            <span className="tab is-active">Dia</span>
            <span className="tab">Semana</span>
            <span className="tab">Mês</span>
          </div>
        </div>
      </div>
      <div className="agenda-date-tools">
        <span className="icon-btn">
          <Icon name="chevron-left" />
        </span>
        <span className="icon-btn">
          <Icon name="chevron-right" />
        </span>
      </div>
      <div className="agenda-new-menu">
        <span className="agenda-command-bar-skeleton-new" />
      </div>
    </section>
  );
}

const SKELETON_ROWS = 3;

/**
 * A coluna carregando na forma do Dia real (pedido de 2026-10-12): a faixa
 * com os dias da semana, o resumo do dia e linhas de atendimento, com as
 * mesmas classes e um texto de exemplo, para cada altura ser a da coluna
 * carregada; tudo invisível (`visibility: hidden`). Antes, a coluna mostrava
 * o esqueleto da grade inteira da Agenda espremido em 380 px.
 */
export function AgendaDayColumnSkeleton({ days }: { days?: number }) {
  const [rememberedHidden] = useState(recalledHiddenWeekdays);
  const dayCount = days ?? 7 - (rememberedHidden?.length ?? 0);
  // Reserva o lugar desde o primeiro quadro, invisível: nem brilho nem texto
  // de exemplo, nem depois do splash nem numa troca (pedido de 2026-10-12).
  return (
    <div
      aria-busy="true"
      aria-label="Carregando agenda"
      className="agenda-day-column-loading"
      role="status"
    >
      <div
        aria-hidden="true"
        className="agenda-calendar agenda-day-panel agenda-day-skeleton"
      >
        <div className="agenda-week-strip">
          {Array.from({ length: Math.max(1, dayCount) }, (_, index) => (
            <span className="agenda-week-strip-day" key={index}>
              <span className="agenda-week-strip-label">SEG</span>
              <span className="agenda-week-strip-number" />
              <span className="agenda-week-strip-gap" />
            </span>
          ))}
        </div>
        <div className="agenda-day-summary">
          <strong>Terça, 29</strong>
          <span>2 atendimentos</span>
        </div>
        <ul className="agenda-day-list">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <li className="agenda-day-item" key={index}>
              <span className="agenda-day-row is-readonly">
                <span className="agenda-day-time">00:00</span>
                <span className="agenda-day-stripe">
                  <span className="agenda-day-stripe-part" />
                </span>
                <span className="agenda-day-body">
                  <span className="agenda-day-main">
                    <strong className="agenda-day-name">
                      Nome da cliente
                    </strong>
                    <span className="agenda-day-meta">
                      Serviço · 1 h · R$ 00
                    </span>
                  </span>
                  <span className="agenda-day-status">Confirmado</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type ColumnWeek = {
  appointments: Appointment[];
  exceptions: AvailabilityException[];
  failed: boolean;
  timeBlocks: TimeBlock[];
  week: string;
};

function weekEnd(weekStart: string): string {
  return isoDate(addDays(parseDate(weekStart), 6));
}

/** A semana que a Agenda já leu nesta aba, se ela a cobre inteira (D-167). */
function rememberedWeek(
  source: string | null,
  weekStart: string,
): ColumnWeek | null {
  if (source === null) return null;
  const window = recalledAgendaWindow(source, weekStart, weekEnd(weekStart));
  return window
    ? {
        appointments: window.appointments,
        exceptions: window.exceptions,
        failed: false,
        timeBlocks: window.timeBlocks,
        week: weekStart,
      }
    : null;
}

function hasViewPreference(): boolean {
  const settings = getProductServices().settings;
  return typeof settings?.getAgendaViewPreference === "function";
}

/**
 * As leituras do Dia para uma semana (a faixa marca ponto nos dias com
 * agendamento): agendamentos, bloqueios e exceções, mais o catálogo para a
 * cor do serviço e a preferência de dias visíveis. Nada além disso.
 */
function AgendaDayColumnContent({
  appointmentId,
  calendar,
  cursor,
  onChangeDay,
}: {
  appointmentId?: string;
  calendar: CalendarState;
  cursor: Date;
  onChangeDay: (date: Date) => void;
}) {
  const weekStart = isoDate(startOfWeek(cursor));
  const source = calendar.source;
  const [loaded, setLoaded] = useState<ColumnWeek | null>(() =>
    rememberedWeek(source, weekStart),
  );
  // A semana lida pelo servidor vence; até ela chegar, vale a que a Agenda
  // já leu, se houver. Trocar a lembrada pela nova não remonta nada.
  const current =
    loaded?.week === weekStart ? loaded : rememberedWeek(source, weekStart);
  // `null` até a preferência chegar: a faixa só aparece com os dias certos.
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[] | null>(
    () => recalledHiddenWeekdays() ?? (hasViewPreference() ? null : []),
  );
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => recalledServiceColors() ?? new Map(),
  );
  // O Dia que chega depois do esqueleto entra com um fade curto; o que já
  // apareceu preenchido troca pelos dados novos sem animação.
  const [afterSkeleton, setAfterSkeleton] = useState(false);
  // No primeiro carregamento, o splash da marca espera a semana da coluna.
  useSplashHold(current === null || hiddenWeekdays === null);

  useEffect(() => {
    if (source === null) return;
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const queryWindow = { endDate: weekEnd(weekStart), startDate: weekStart };
    const avenly = source === "AVENLY";
    Promise.all([
      services.listAppointments(queryWindow, controller.signal),
      avenly
        ? services.listTimeBlocks(queryWindow, controller.signal)
        : Promise.resolve<TimeBlock[]>([]),
      avenly
        ? services.listAvailabilityExceptions(queryWindow, controller.signal)
        : Promise.resolve<AvailabilityException[]>([]),
    ])
      .then(([appointmentResult, blockResult, exceptionResult]) => {
        setLoaded({
          appointments: appointmentResult,
          exceptions: exceptionResult,
          failed: false,
          timeBlocks: blockResult,
          week: weekStart,
        });
        rememberAgendaWindow({
          appointments: appointmentResult,
          endDate: queryWindow.endDate,
          exceptions: exceptionResult,
          source,
          startDate: weekStart,
          timeBlocks: blockResult,
        });
      })
      .catch(() => {
        // A coluna é contexto: falhar aqui não derruba o fluxo ao lado.
        if (!controller.signal.aborted) {
          setLoaded({
            appointments: [],
            exceptions: [],
            failed: true,
            timeBlocks: [],
            week: weekStart,
          });
        }
      });
    return () => controller.abort();
  }, [source, weekStart]);

  useEffect(() => {
    const controller = new AbortController();
    const catalog = getProductServices().serviceCatalog;
    if (!catalog || typeof catalog.list !== "function") return;
    Promise.resolve()
      .then(() => catalog.list(controller.signal))
      .then((result) => {
        const colors = serviceColorMap(result.items);
        setServiceColors(colors);
        rememberServiceColors(colors);
      })
      .catch(() => {
        /* Sem catálogo, o traço fica neutro e a coluna continua. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!hasViewPreference()) return;
    const controller = new AbortController();
    getProductServices()
      .settings.getAgendaViewPreference(controller.signal)
      .then((preference) => {
        setHiddenWeekdays(preference.hiddenWeekdays);
        rememberHiddenWeekdays(preference.hiddenWeekdays);
      })
      .catch(() => {
        // Todos os dias visíveis, como na Agenda.
        if (!controller.signal.aborted)
          setHiddenWeekdays((current) => current ?? []);
      });
    return () => controller.abort();
  }, []);

  const appointments = current?.appointments;
  const exceptions = current?.exceptions;
  const timeBlocks = current?.timeBlocks;
  const entries = useMemo(
    () =>
      buildAgendaEntries({
        appointments: appointments ?? [],
        exceptions: exceptions ?? [],
        timeBlocks: timeBlocks ?? [],
        timezone: calendar.timezone,
      }),
    [appointments, exceptions, timeBlocks, calendar.timezone],
  );

  if (source === null) {
    return (
      <p className="agenda-appt-column-note">Agenda ainda não configurada.</p>
    );
  }
  if (current === null || hiddenWeekdays === null) {
    if (!afterSkeleton) setAfterSkeleton(true);
    return (
      <AgendaDayColumnSkeleton
        days={hiddenWeekdays ? 7 - hiddenWeekdays.length : undefined}
      />
    );
  }
  if (current.failed) {
    return (
      <p className="agenda-appt-column-note">
        Não foi possível carregar a agenda deste dia.
      </p>
    );
  }
  return (
    <div className={clsx(afterSkeleton && "agenda-reveal")}>
      <DayView
        canCreateAppointment={calendar.capabilities.createAppointments}
        currentAppointmentId={appointmentId ?? null}
        date={isoDate(cursor)}
        entries={entries}
        hiddenWeekdays={hiddenWeekdays}
        onSelectDay={onChangeDay}
        serviceColors={serviceColors}
      />
    </div>
  );
}
