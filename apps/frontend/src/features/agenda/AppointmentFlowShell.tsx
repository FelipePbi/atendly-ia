"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { type CalendarState } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useAgendaSplitLayout } from "@/shared/layout/useWideLayout";
import { useSplashPresenting } from "@/shared/motion/splash";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { StatePanel } from "@/shared/ui/States";

import { AgendaLoading } from "./AgendaBoard";
import { AgendaDayColumn } from "./AgendaDayColumn";
import { recalledAppointment } from "./agendaMemory";
import { isoDate } from "./occupancy";

/**
 * Rota com a coluna da Agenda ao lado: tela empurrada abaixo de 1024 px e, a
 * partir dela, a coluna à esquerda (D-110 (a), estendendo D-103). A estrutura
 * da coluna é montada nas duas larguras e só a divisão liga e desliga: o
 * fluxo não é remontado ao cruzar 1024 px (Goal112). `date` vem
 * da tela da rota e fica `null` enquanto o agendamento não chegou; `id` marca
 * a linha do agendamento aberto e falta no novo agendamento, onde nada está
 * aberto.
 */
export type AppointmentRoute = { date: string | null; id?: string };

export function AppointmentFlowShell({
  agendaBar = true,
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
  /**
   * Barra da Agenda acima da coluna do Dia, de 1024 px em diante. Criar,
   * remarcar e cancelar a desligam (D-170, pedido de 2026-10-12): a pessoa
   * já está num fluxo, e só a barra própria dele ("×" ou voltar) fica.
   */
  agendaBar?: boolean;
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
  const wide = useAgendaSplitLayout();
  // Esqueleto só se a carga passar de ~150 ms (D-168): o que chega antes
  // entra direto, sem piscar.
  const showSkeleton = useDeferredLoading(loading);
  // O dia do agendamento que a Agenda já leu nesta aba posiciona a coluna
  // enquanto a tela da rota ainda lê o seu (D-167).
  const routeId = appointmentRoute?.id;
  const [rememberedDate] = useState(() =>
    routeId ? (recalledAppointment(routeId)?.date ?? null) : null,
  );
  // Uma chamada por árvore (D-030, D-031, D-103 (f)): a coluna ao lado não
  // configura a casca.
  useShellConfig({
    active: "agenda",
    loading,
    module: "agenda",
    ...(appointmentRoute ? { pushed: true, pushedWide: !wide } : {}),
    title,
  });
  // Depois do splash da marca a tela se apresenta (D-168, revisão de
  // 2026-10-12): com a coluna ao lado, quem apresenta é a divisão
  // (`AgendaDayColumn`); sem ela, a própria página — barra, depois o corpo.
  const presenting = useSplashPresenting() && !appointmentRoute;
  const page = bare ? (
    children
  ) : closeLabel ? (
    <div
      className={clsx("agenda-new-screen", presenting && "is-presenting")}
      data-presenting={presenting ? "true" : undefined}
    >
      <PushedBar
        backHref={backHref}
        backIcon="x"
        backLabel={closeLabel}
        title={title}
      />
      <div className="agenda-new-screen-body">
        {loading ? showSkeleton && <AgendaLoading /> : children}
      </div>
    </div>
  ) : (
    <div
      className={clsx("agenda-flow-page", presenting && "is-presenting")}
      data-presenting={presenting ? "true" : undefined}
    >
      <header className="agenda-flow-header">
        <Link className="agenda-flow-back" href={backHref}>
          <Icon name="chevron-left" /> Voltar
        </Link>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </header>
      {loading ? showSkeleton && <AgendaLoading /> : children}
    </div>
  );
  if (!appointmentRoute) return page;
  return (
    <AgendaDayColumn
      appointmentId={appointmentRoute.id}
      bar={agendaBar}
      calendar={calendar}
      date={
        appointmentRoute.date ??
        rememberedDate ??
        (loading ? null : isoDate(new Date()))
      }
      panelFirst={Boolean(closeLabel)}
      split={wide}
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

export function Summary({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
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
