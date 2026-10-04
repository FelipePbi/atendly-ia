"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { type CalendarState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { StatePanel } from "@/shared/ui/States";

import { AgendaLoading } from "./AgendaBoard";
import { AgendaDayColumn } from "./AgendaDayColumn";
import { isoDate } from "./occupancy";

/**
 * Rota com a coluna da Agenda ao lado: tela empurrada abaixo de 1024 px e, a
 * partir dela, a coluna à esquerda (D-110 (a), estendendo D-103). `date` vem
 * da tela da rota e fica `null` enquanto o agendamento não chegou; `id` marca
 * a linha do agendamento aberto e falta no novo agendamento, onde nada está
 * aberto.
 */
export type AppointmentRoute = { date: string | null; id?: string };

export function AppointmentFlowShell({
  appointmentRoute,
  backHref = "/agenda",
  bare = false,
  calendar = null,
  children,
  closeLabel,
  description,
  loading,
  title,
}: {
  appointmentRoute?: AppointmentRoute;
  backHref?: string;
  /** A tela traz a própria barra (`PushedBar`) e cuida do carregamento. */
  bare?: boolean;
  calendar?: CalendarState | null;
  children: ReactNode;
  /** Troca o cabeçalho "Voltar" pela barra empurrada com "×" (nome acessível) e o título. */
  closeLabel?: string;
  description?: string;
  loading: boolean;
  title: string;
}) {
  const wide = useWideLayout();
  // Uma chamada por árvore (D-030, D-031, D-103 (f)): a coluna ao lado não
  // configura a casca.
  useShellConfig({
    active: "agenda",
    loading,
    module: "agenda",
    ...(appointmentRoute ? { pushed: true } : {}),
    title,
  });
  const page = bare ? (
    children
  ) : closeLabel ? (
    <div className="agenda-new-screen">
      <PushedBar
        backHref={backHref}
        backIcon="x"
        backLabel={closeLabel}
        title={title}
      />
      <div className="agenda-new-screen-body">
        {loading ? <AgendaLoading /> : children}
      </div>
    </div>
  ) : (
    <div className="agenda-flow-page">
      <header className="agenda-flow-header">
        <Link className="agenda-flow-back" href={backHref}>
          <Icon name="chevron-left" /> Voltar
        </Link>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {loading ? <AgendaLoading /> : children}
    </div>
  );
  if (!appointmentRoute || !wide) return page;
  return (
    <AgendaDayColumn
      appointmentId={appointmentRoute.id}
      calendar={calendar}
      date={
        appointmentRoute.date ?? (loading ? null : isoDate(new Date()))
      }
      panelFirst={Boolean(closeLabel)}
    >
      {page}
    </AgendaDayColumn>
  );
}

export function ReadOnlyState({ operation }: { operation: string }) {
  return (
    <div className="agenda-state-surface">
      <StatePanel
        actionHref="/agenda"
        actionLabel="Voltar à agenda"
        description={`A configuração atual de Agenda Avenly não permite ${operation} por aqui.`}
        icon="lock"
        title="Operação indisponível"
      />
    </div>
  );
}

export function Summary({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="agenda-summary-card">
      <h2>{title}</h2>
      <div className="agenda-summary-list">{children}</div>
    </aside>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="agenda-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function formatMoney(value: number | null): string {
  if (value === null) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}


export function zonedDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, Number(part.value)]),
    );
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess += target - actual;
  }
  return new Date(guess).toISOString();
}
