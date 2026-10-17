"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ActivityArea,
  ActivityEntry,
  ActivityKind,
  ActivityQuery,
} from "@/data";
import { zonedDateTimeParts } from "@/features/agenda/occupancy";
import { SettingsPage } from "@/features/settings/shared/SettingsPage";
import { Icon } from "@/shared/icons/Icon";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { BrandLoader } from "@/shared/ui/Brand";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { StatePanel } from "@/shared/ui/States";

import {
  activityHref,
  activityNote,
  activitySentence,
  changeLines,
} from "./activityCopy";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityPages,
  hasRememberedActivity,
  useActivityPages,
} from "./useActivityPages";

type Period = "ALL" | "TODAY" | "7" | "30" | "90";
type Actor = "ALL" | "AI" | "USER";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "ALL", label: "Todo o período" },
  { value: "TODAY", label: "Hoje" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

const ACTORS: Array<{ value: Actor; label: string }> = [
  { value: "ALL", label: "Você e a IA" },
  { value: "USER", label: "Só você" },
  { value: "AI", label: "Só a IA" },
];

const AREAS: Array<{ value: ActivityArea | "ALL"; label: string }> = [
  { value: "ALL", label: "Todas as áreas" },
  { value: "AGENDA", label: "Agenda" },
  { value: "CUSTOMERS", label: "Clientes" },
  { value: "SERVICES", label: "Serviços" },
  { value: "CONVERSATIONS", label: "Conversas" },
  { value: "SETTINGS", label: "Configurações" },
  { value: "IMPORT", label: "Importação" },
];

const KINDS: Array<{ value: ActivityKind | "ALL"; label: string }> = [
  { value: "ALL", label: "Todas as ações" },
  { value: "CREATED", label: "Criou ou marcou" },
  { value: "CHANGED", label: "Alterou" },
  { value: "REMOVED", label: "Cancelou ou removeu" },
];

const AREA_LABELS: Record<ActivityArea, string> = {
  AGENDA: "Agenda",
  CUSTOMERS: "Clientes",
  SERVICES: "Serviços",
  CONVERSATIONS: "Conversas",
  SETTINGS: "Configurações",
  IMPORT: "Importação",
};

const DAY_MS = 86_400_000;
const SEARCH_DELAY_MS = 300;

/**
 * Início do dia do negócio, `days` dias atrás (0 = hoje). Os minutos já
 * passados hoje no fuso do negócio voltam até a meia-noite dele.
 */
export function startOfBusinessDay(
  now: Date,
  timeZone: string,
  days = 0,
): Date {
  const { minutes } = zonedDateTimeParts(now.toISOString(), timeZone);
  const sinceMidnight =
    minutes * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight - days * DAY_MS);
}

function periodStart(period: Period, timeZone: string): string | undefined {
  if (period === "ALL") return undefined;
  const now = new Date();
  const days = period === "TODAY" ? 0 : Number(period) - 1;
  return startOfBusinessDay(now, timeZone, days).toISOString();
}

/** "Hoje", "Ontem" ou "Quinta, 16 de outubro", no fuso do negócio. */
function dayTitle(date: string, today: string, yesterday: string): string {
  if (date === today) return "Hoje";
  if (date === yesterday) return "Ontem";
  const [year, month, day] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  })
    .format(new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12)))
    .replace("-feira", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type DayGroup = { date: string; items: ActivityEntry[] };

function groupByDay(items: ActivityEntry[], timeZone: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const { date } = zonedDateTimeParts(item.occurredAt, timeZone);
    const last = groups.at(-1);
    if (last?.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

/**
 * Configurações → Atividade (D-176): tudo o que você e a IA fizeram no
 * negócio, do mais recente para o mais antigo, com o antes e o depois de
 * cada alteração. Filtros de período, autor, área e tipo, busca por nome e
 * scroll infinito como na lista de Clientes.
 */
export function ActivityScreen({ timeZone }: { timeZone: string }) {
  const [period, setPeriod] = useState<Period>("ALL");
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [actor, setActor] = useState<Actor>("ALL");
  const [area, setArea] = useState<ActivityArea | "ALL">("ALL");
  const [kind, setKind] = useState<ActivityKind | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // A busca vai ao servidor depois de uma pausa na digitação.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const value: Omit<ActivityQuery, "cursor" | "limit"> = {};
    if (from) value.from = from;
    if (actor !== "ALL") value.actor = actor;
    if (area !== "ALL") value.areas = [area];
    if (kind !== "ALL") value.kinds = [kind];
    if (q) value.q = q;
    return value;
  }, [actor, area, from, kind, q]);

  const pages = useActivityPages(query);
  const filtered = Object.keys(query).length > 0;

  return (
    <SettingsPage title="Atividade">
      <div className="activity-page">
        <p className="activity-intro">
          Tudo o que você e a IA fizeram no seu negócio, com o que mudou.
        </p>
        <div className="activity-filters">
          <Field
            className="activity-search"
            icon="search"
            label="Buscar"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome do cliente, serviço ou contato"
            type="search"
            value={search}
          />
          <div className="activity-selects">
            <FilterSelect
              label="Período"
              onChange={(value) => {
                setPeriod(value);
                setFrom(periodStart(value, timeZone));
              }}
              options={PERIODS}
              value={period}
            />
            <FilterSelect
              label="Quem fez"
              onChange={setActor}
              options={ACTORS}
              value={actor}
            />
            <FilterSelect
              label="Área"
              onChange={setArea}
              options={AREAS}
              value={area}
            />
            <FilterSelect
              label="Tipo de ação"
              onChange={setKind}
              options={KINDS}
              value={kind}
            />
          </div>
        </div>
        <ActivityList filtered={filtered} pages={pages} timeZone={timeZone} />
      </div>
    </SettingsPage>
  );
}

function FilterSelect<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  value: T;
}) {
  return (
    <label className="field activity-select">
      <span className="label">{label}</span>
      <span className="input-wrap">
        <select
          className="input select"
          onChange={(event) => onChange(event.target.value as T)}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="select-icon">
          <Icon name="chevron-down" />
        </span>
      </span>
    </label>
  );
}

function ActivityList({
  filtered,
  pages,
  timeZone,
}: {
  filtered: boolean;
  pages: ActivityPages;
  timeZone: string;
}) {
  // Sem esqueleto (D-168): a área fica vazia e o "A" animado só aparece se
  // a primeira leva passar de ~150 ms.
  const showLoader = useDeferredLoading(pages.loading);
  const groups = useMemo(
    () => groupByDay(pages.items, timeZone),
    [pages.items, timeZone],
  );
  // Só a primeira leitura da aba entra com fade (D-173); a lembrada, não.
  const [arriving] = useState(() => !hasRememberedActivity());
  // "Hoje" e "Ontem" contam a partir de quando a tela abriu.
  const [openedAt] = useState(() => Date.now());
  const today = zonedDateTimeParts(
    new Date(openedAt).toISOString(),
    timeZone,
  ).date;
  const yesterday = zonedDateTimeParts(
    new Date(openedAt - DAY_MS).toISOString(),
    timeZone,
  ).date;

  if (pages.loading) {
    return showLoader ? (
      <BrandLoader inline label="Carregando atividade" />
    ) : (
      <p className="sr-only" role="status">
        Carregando atividade
      </p>
    );
  }
  if (pages.error) {
    return (
      <StatePanel
        actionLabel="Tentar novamente"
        description="Não foi possível carregar a atividade agora. Nada foi alterado."
        icon="alert"
        onAction={pages.retry}
        title="Atividade indisponível"
        tone="error"
      />
    );
  }
  if (pages.items.length === 0) {
    return filtered ? (
      <StatePanel
        description="Nada aconteceu com esses filtros. Tente outro período ou outra área."
        icon="search"
        title="Nenhuma atividade encontrada"
      />
    ) : (
      <StatePanel
        description="Quando você ou a IA marcarem um horário, cadastrarem um cliente ou mudarem uma configuração, aparece aqui."
        icon="clock"
        title="Ainda não há atividade"
      />
    );
  }
  return (
    <div className={clsx("activity-days", arriving && "is-arriving")}>
      {groups.map((group) => (
        <section className="activity-day" key={group.date}>
          <h2 className="activity-day-title">
            {dayTitle(group.date, today, yesterday)}
          </h2>
          <ol className="activity-list">
            {group.items.map((entry) => (
              <ActivityRow entry={entry} key={entry.id} timeZone={timeZone} />
            ))}
          </ol>
        </section>
      ))}
      <ActivityMore pages={pages} />
    </div>
  );
}

function ActivityRow({
  entry,
  timeZone,
}: {
  entry: ActivityEntry;
  timeZone: string;
}) {
  const lines = changeLines(entry);
  const note = activityNote(entry);
  const href = activityHref(entry);
  const time = zonedDateTimeParts(entry.occurredAt, timeZone).time;
  const sentence = activitySentence(entry);
  return (
    <li className="activity-row">
      <span
        aria-hidden="true"
        className={clsx(
          "activity-actor",
          entry.actor === "AI" ? "is-ai" : "is-user",
        )}
      >
        {entry.actor === "AI" ? "IA" : <Icon name="user" />}
      </span>
      <div className="activity-row-body">
        <p className="activity-sentence">
          {href ? (
            <Link className="activity-link" href={href}>
              {sentence}
            </Link>
          ) : (
            sentence
          )}
        </p>
        {lines.length > 0 && (
          <dl className="activity-changes">
            {lines.map((line, index) => (
              <div className="activity-change" key={`${line.label}-${index}`}>
                <dt>{line.label}</dt>
                <dd>
                  <span className="activity-before">
                    <span className="sr-only">de </span>
                    {line.before}
                  </span>
                  <span aria-hidden="true" className="activity-arrow">
                    →
                  </span>
                  <span className="activity-after">
                    <span className="sr-only"> para </span>
                    {line.after}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {note && <p className="activity-note">{note}</p>}
        <p className="activity-meta">
          <time dateTime={entry.occurredAt}>{time}</time>
          <span aria-hidden="true"> · </span>
          {AREA_LABELS[entry.area]}
        </p>
      </div>
    </li>
  );
}

/** Distância do fim da lista em que a próxima leva já começa a ser pedida. */
const PREFETCH_MARGIN = "0px 0px 480px 0px";

/** Rodapé do scroll infinito, no mesmo comportamento da lista de Clientes. */
function ActivityMore({ pages }: { pages: ActivityPages }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const observable = typeof IntersectionObserver !== "undefined";
  const { hasMore, items, loadMore, loadingMore, moreError } = pages;
  const waiting = hasMore && !loadingMore && !moreError;

  useEffect(() => {
    const element = sentinel.current;
    if (!waiting || !element || !observable) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: scrollParent(element), rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [waiting, items.length, loadMore, observable]);

  return (
    <div className="activity-more">
      <div aria-hidden="true" className="activity-sentinel" ref={sentinel} />
      <p className="sr-only" role="status">
        {loadingMore ? "Carregando mais atividade" : ""}
      </p>
      {loadingMore && (
        <p aria-hidden="true" className="activity-more-loading">
          Carregando…
        </p>
      )}
      {moreError && (
        <div className="activity-more-error" role="alert">
          <p>Não foi possível carregar mais atividade.</p>
          <Button onClick={pages.retry} type="button" variant="secondary">
            Tentar novamente
          </Button>
        </div>
      )}
      {waiting && !observable && (
        <Button onClick={loadMore} type="button" variant="tertiary">
          Carregar mais
        </Button>
      )}
      {!hasMore && items.length > ACTIVITY_PAGE_SIZE && (
        <p className="activity-end">Fim da lista</p>
      )}
    </div>
  );
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}
