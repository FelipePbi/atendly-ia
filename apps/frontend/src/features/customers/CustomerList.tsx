"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  BffHttpError,
  type Customer,
  type CustomerAppointmentSummary,
  type CustomerList as CustomerListResult,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { displayPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Field } from "@/shared/ui/Field";
import { ListItem } from "@/shared/ui/ListItem";
import { Skeleton, StatePanel } from "@/shared/ui/States";

export function CustomerList() {
  const [result, setResult] = useState<CustomerListResult | null>(null);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices();
    Promise.all([
      services.customers.list(controller.signal),
      businessTimezone(services, controller.signal),
    ])
      .then(([list, zone]) => {
        setTimezone(zone);
        setResult(list);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar os clientes."),
          );
      });
    return () => controller.abort();
  }, [reload]);

  const customers = result?.items ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return result?.items ?? [];
    return (result?.items ?? []).filter((customer) =>
      `${customer.name ?? ""} ${customer.phone ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [result, query]);
  const groups = useMemo(() => groupAlphabetically(filtered), [filtered]);
  const today = todayWallDate(timezone);

  const canCreate = Boolean(result) && !result?.managedExternally;
  const loading = !result && !error;
  useShellConfig({
    action: canCreate
      ? { href: "/clientes/novo", icon: "plus", label: "Novo cliente" }
      : undefined,
    active: "clientes",
    loading,
    module: "directory",
    title: "Clientes",
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p>
            Encontre quem você já atende e cadastre quem chega agora, sem
            depender de telefone.
          </p>
        </div>
        {canCreate && (
          <Link className="btn btn-primary" href="/clientes/novo">
            <Icon name="plus" />
            <span>Novo cliente</span>
          </Link>
        )}
      </div>

      {error ? (
        <StatePanel
          actionLabel="Tentar novamente"
          description={error}
          icon="alert"
          onAction={() => {
            setError(null);
            setReload((value) => value + 1);
          }}
          title="Não foi possível carregar clientes"
          tone="error"
        />
      ) : loading ? (
        <CustomerListSkeleton />
      ) : customers.length === 0 ? (
        <StatePanel
          actionHref={canCreate ? "/clientes/novo" : undefined}
          actionLabel={canCreate ? "Cadastrar cliente" : undefined}
          description="Depois do primeiro cadastro ou agendamento, os clientes aparecerão aqui."
          icon="users"
          title="Seus clientes aparecerão aqui"
        />
      ) : (
        <>
          <Field
            className="customer-search"
            icon="search"
            label="Buscar cliente"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou telefone"
            type="search"
            value={query}
          />
          <div className="customer-list-meta">
            <strong>Clientes cadastrados</strong>
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "cliente" : "clientes"}
            </span>
          </div>
          {filtered.length === 0 ? (
            <p className="customer-no-results" role="status">
              Nenhum cliente corresponde à busca.
            </p>
          ) : (
            <div aria-label="Clientes" className="list" role="list">
              {groups.map((group) => (
                <div className="list-group" key={group.letter}>
                  <p className="list-separator">{group.letter}</p>
                  {group.customers.map((customer) => (
                    <ListItem
                      copy={displayPhone(
                        customer.phone,
                        "Telefone não informado",
                      )}
                      href={`/clientes/detalhes?id=${encodeURIComponent(customer.id)}`}
                      key={customer.id}
                      leading={
                        <span className="avatar" aria-hidden="true">
                          {initials(customer.name)}
                        </span>
                      }
                      title={customer.name || "Cliente sem nome"}
                      trailing={
                        <>
                          <span className="list-item-meta">
                            {appointmentText(customer, today)}
                          </span>
                          <Icon name="chevron-right" />
                        </>
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerListSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Carregando clientes
      </p>
      <div aria-hidden="true" className="list">
        {[0, 1, 2, 3].map((item) => (
          <div className="list-item" key={item}>
            <Skeleton className="avatar" />
            <div className="list-item-main customer-list-loading-copy">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** O mesmo padrão do perfil quando o calendário não traz fuso. */
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Fuso do calendário do negócio (D-045): "hoje" na linha é o dia do negócio,
 * não o do navegador. Sem calendário, a lista continua com o fuso padrão.
 */
async function businessTimezone(
  services: ReturnType<typeof getProductServices>,
  signal: AbortSignal,
): Promise<string> {
  try {
    const calendar = await services.calendar.getCalendar(signal);
    return calendar.timezone ?? DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function initials(name: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}

type CustomerGroup = { letter: string; customers: Customer[] };

const NO_NAME_LABEL = "Sem nome";

/** Letra do agrupamento: primeira letra sem acento, para Á cair em A. */
function groupLetter(name: string): string {
  return (
    name
      .trim()[0]
      ?.normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleUpperCase("pt-BR") ?? ""
  );
}

/**
 * Ordem alfabética pt-BR por `localeCompare`, sem acento distinguindo letra;
 * cadastro sem nome vai para um separador próprio no fim (Goal075 CL-01).
 */
function groupAlphabetically(customers: Customer[]): CustomerGroup[] {
  const named = customers
    .filter((customer) => customer.name?.trim())
    .sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
  const unnamed = customers.filter((customer) => !customer.name?.trim());

  const groups: CustomerGroup[] = [];
  for (const customer of named) {
    const letter = groupLetter(customer.name ?? "");
    const current = groups.at(-1);
    if (current?.letter === letter) current.customers.push(customer);
    else groups.push({ customers: [customer], letter });
  }
  if (unnamed.length > 0)
    groups.push({ customers: unnamed, letter: NO_NAME_LABEL });
  return groups;
}

/** Data `YYYY-MM-DD` (wall-clock do negócio) tratada como UTC, como nos eventos de agenda. */
function parseWallDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** Data de hoje no fuso do negócio, no mesmo formato de `parseWallDate`. */
function todayWallDate(timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return parseWallDate(`${parts.year}-${parts.month}-${parts.day}`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function shortWeekday(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" })
    .format(date)
    .replace(/\.$/, "");
}

function dayMonth(date: string): string {
  const [, month = "--", day = "--"] = date.split("-");
  return `${day}/${month}`;
}

/** "hoje 15:00" / "amanhã 10:00" / "sex 15:30" (3 semanas) / "19/10 15:30" depois disso. */
function nextAppointmentText(
  appointment: CustomerAppointmentSummary,
  today: Date,
): string {
  const diff = daysBetween(today, parseWallDate(appointment.date));
  const day =
    diff === 0
      ? "hoje"
      : diff === 1
        ? "amanhã"
        : diff > 1 && diff <= 20
          ? shortWeekday(parseWallDate(appointment.date))
          : dayMonth(appointment.date);
  return `próximo ${day} ${appointment.startTime}`;
}

/** "hoje" / "ontem" / "há 5 dias" / "há 3 sem" / "há 1 mês" / "há 4 meses", com "faltou ·" para NO_SHOW. */
function lastAppointmentText(
  appointment: CustomerAppointmentSummary,
  today: Date,
): string {
  const daysAgo = daysBetween(parseWallDate(appointment.date), today);
  const months = Math.round(daysAgo / 30);
  const ago =
    daysAgo <= 0
      ? "hoje"
      : daysAgo === 1
        ? "ontem"
        : daysAgo < 7
          ? `há ${daysAgo} dias`
          : daysAgo < 30
            ? `há ${Math.round(daysAgo / 7)} sem`
            : `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const prefix = appointment.status === "NO_SHOW" ? "faltou · " : "";
  return `último ${prefix}${ago}`;
}

/** Texto à direita da linha (Goal075 CL-01): próximo, último ou "sem atendimentos". */
function appointmentText(customer: Customer, today: Date): string {
  if (customer.nextAppointment)
    return nextAppointmentText(customer.nextAppointment, today);
  if (customer.lastAppointment)
    return lastAppointmentText(customer.lastAppointment, today);
  return "sem atendimentos";
}
