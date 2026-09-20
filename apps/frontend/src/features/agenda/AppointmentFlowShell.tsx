"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { type CalendarState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { StatePanel } from "@/shared/ui/States";

import { AgendaLoading, SourceStrip } from "./AgendaBoard";

export function AppointmentFlowShell({
  calendar,
  children,
  description,
  loading,
  title,
}: {
  calendar: CalendarState | null;
  children: ReactNode;
  description: string;
  loading: boolean;
  title: string;
}) {
  useShellConfig({
    active: "agenda",
    loading,
    module: "agenda",
    source: "atendly",
    title,
  });
  return (
    <>
      <div className="agenda-flow-page">
        <header className="agenda-flow-header">
          <Link className="back-link" href="/agenda">
            <Icon name="chevron-left" /> Voltar à agenda
          </Link>
          <p className="eyebrow">Agenda</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {calendar && <SourceStrip />}
        {loading ? <AgendaLoading /> : children}
      </div>
    </>
  );
}

export function ReadOnlyState({ operation }: { operation: string }) {
  return (
    <div className="agenda-state-surface">
      <StatePanel
        actionHref="/agenda"
        actionLabel="Voltar à agenda"
        description={`A configuração atual de Agenda Atendly não permite ${operation} por aqui.`}
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
