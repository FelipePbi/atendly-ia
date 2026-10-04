"use client";

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
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { AgendaLoading, monthAndYear } from "./AgendaBoard";
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
 */
export function AgendaDayColumn({
  appointmentId,
  calendar,
  children,
  date,
  panelFirst = false,
  split = true,
}: {
  appointmentId?: string;
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

  const list = (
    <section className="agenda-appt-column">
      {cursor && calendar ? (
        <AgendaDayColumnContent
          appointmentId={appointmentId}
          calendar={calendar}
          cursor={cursor}
          onChangeDay={setCursor}
        />
      ) : (
        <AgendaLoading />
      )}
    </section>
  );

  return (
    <div
      className={
        split ? "agenda-appt-split" : "agenda-appt-split agenda-appt-split-flat"
      }
    >
      {split && calendar && cursor && calendar.source && (
        <AgendaColumnBar
          calendar={calendar}
          cursor={cursor}
          onChangeDay={setCursor}
        />
      )}
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
    <section className="agenda-command-bar">
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>([]);
  const [serviceColors, setServiceColors] = useState<ServiceColorMap>(
    () => new Map(),
  );
  const source = calendar.source;

  useEffect(() => {
    if (source === null) return;
    const controller = new AbortController();
    const services = getProductServices().calendar;
    const start = parseDate(weekStart);
    const queryWindow = {
      endDate: isoDate(addDays(start, 6)),
      startDate: weekStart,
    };
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
        setAppointments(appointmentResult);
        setTimeBlocks(blockResult);
        setExceptions(exceptionResult);
        setFailed(false);
        setLoadedWeek(weekStart);
      })
      .catch(() => {
        // A coluna é contexto: falhar aqui não derruba o fluxo ao lado.
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoadedWeek(weekStart);
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
      .then((result) => setServiceColors(serviceColorMap(result.items)))
      .catch(() => {
        /* Sem catálogo, o traço fica neutro e a coluna continua. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const settingsService = getProductServices().settings;
    if (!settingsService) return;
    settingsService
      .getAgendaViewPreference(controller.signal)
      .then((preference) => setHiddenWeekdays(preference.hiddenWeekdays))
      .catch(() => {
        /* Todos os dias visíveis, como na Agenda. */
      });
    return () => controller.abort();
  }, []);

  const entries = useMemo(
    () =>
      buildAgendaEntries({
        appointments,
        exceptions,
        timeBlocks,
        timezone: calendar.timezone,
      }),
    [appointments, exceptions, timeBlocks, calendar.timezone],
  );

  if (source === null) {
    return (
      <p className="agenda-appt-column-note">Agenda ainda não configurada.</p>
    );
  }
  if (loadedWeek !== weekStart) return <AgendaLoading />;
  if (failed) {
    return (
      <p className="agenda-appt-column-note">
        Não foi possível carregar a agenda deste dia.
      </p>
    );
  }
  return (
    <DayView
      canCreateAppointment={calendar.capabilities.createAppointments}
      currentAppointmentId={appointmentId ?? null}
      date={isoDate(cursor)}
      entries={entries}
      hiddenWeekdays={hiddenWeekdays}
      onSelectDay={onChangeDay}
      serviceColors={serviceColors}
    />
  );
}
