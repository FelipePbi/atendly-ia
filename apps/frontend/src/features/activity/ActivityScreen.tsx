"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ActivityArea,
  ActivityEntry,
  ActivityKind,
  ActivityQuery,
} from "@/data";
import { zonedDateTimeParts } from "@/features/agenda/occupancy";
import { SettingsPage } from "@/features/settings/shared/SettingsPage";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { swatchProps } from "@/shared/serviceColor";
import { BrandLoader } from "@/shared/ui/Brand";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { Field } from "@/shared/ui/Field";
import { StatePanel } from "@/shared/ui/States";

import {
  activityHref,
  activityNote,
  activitySentence,
  type ChangeLine,
  changeLines,
  type ChangeValue,
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

const AREA_ICONS: Record<ActivityArea, IconName> = {
  AGENDA: "calendar",
  CUSTOMERS: "users",
  SERVICES: "briefcase",
  CONVERSATIONS: "chat",
  SETTINGS: "settings",
  IMPORT: "import",
};

/** Os quatro filtros do menu "Filtros" (D-200). "ALL" é o filtro desligado. */
type Filters = {
  period: Period;
  actor: Actor;
  area: ActivityArea | "ALL";
  kind: ActivityKind | "ALL";
};

const NO_FILTERS: Filters = {
  period: "ALL",
  actor: "ALL",
  area: "ALL",
  kind: "ALL",
};

type FilterKey = keyof Filters;

const FILTER_GROUPS: ReadonlyArray<{
  key: FilterKey;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}> = [
  { key: "period", legend: "Período", options: PERIODS },
  { key: "actor", legend: "Quem fez", options: ACTORS },
  { key: "area", legend: "Área", options: AREAS },
  { key: "kind", legend: "Tipo de ação", options: KINDS },
];

/** Filtros ligados, na ordem do menu, com o rótulo da opção escolhida. */
function activeFilters(
  filters: Filters,
): Array<{ key: FilterKey; label: string }> {
  return FILTER_GROUPS.flatMap((group) => {
    const value = filters[group.key];
    if (value === "ALL") return [];
    const option = group.options.find((item) => item.value === value);
    return option ? [{ key: group.key, label: option.label }] : [];
  });
}

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
 * Configurações → Atividade (D-176, D-200): tudo o que você e a IA fizeram
 * no negócio, do mais recente para o mais antigo, com o antes e o depois de
 * cada alteração. A busca fica à vista; período, autor, área e tipo ficam no
 * menu "Filtros" (modal no centro), e os ligados aparecem como chips que se
 * removem com um toque. Scroll infinito como na lista de Clientes.
 */
export function ActivityScreen({ timeZone }: { timeZone: string }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
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
    if (filters.actor !== "ALL") value.actor = filters.actor;
    if (filters.area !== "ALL") value.areas = [filters.area];
    if (filters.kind !== "ALL") value.kinds = [filters.kind];
    if (q) value.q = q;
    return value;
  }, [filters.actor, filters.area, filters.kind, from, q]);

  const pages = useActivityPages(query);
  const filtered = Object.keys(query).length > 0;
  const chips = activeFilters(filters);

  function apply(next: Filters) {
    setFilters(next);
    // O início do período é calculado ao aplicar: "Hoje" é o hoje de agora.
    setFrom(periodStart(next.period, timeZone));
  }

  /** Chip removido some da tela: o foco vai para o botão "Filtros". */
  function removeChip(next: Filters) {
    apply(next);
    filterButton.current?.focus();
  }

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <SettingsPage title="Atividade">
      <div className="activity-page">
        <p className="activity-intro">
          Tudo o que você e a IA fizeram no seu negócio, com o que mudou.
        </p>
        <div className="activity-toolbar">
          <Field
            className="activity-search"
            icon="search"
            label="Buscar"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex.: Ana ou Corte"
            type="search"
            value={search}
          />
          <button
            aria-haspopup="dialog"
            aria-label={
              chips.length > 0
                ? `Filtros, ${chips.length} ${chips.length === 1 ? "ativo" : "ativos"}`
                : "Filtros"
            }
            className={clsx(
              "btn btn-secondary activity-filter-button",
              chips.length > 0 && "is-active",
            )}
            onClick={() => setMenuOpen(true)}
            ref={filterButton}
            type="button"
          >
            <Icon name="nav-sliders" />
            <span>Filtros</span>
            {chips.length > 0 && (
              <span aria-hidden="true" className="activity-filter-count">
                {chips.length}
              </span>
            )}
          </button>
        </div>
        {chips.length > 0 && (
          <ul aria-label="Filtros ativos" className="activity-chips">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  aria-label={`Remover filtro: ${chip.label}`}
                  className="activity-chip"
                  onClick={() => removeChip({ ...filters, [chip.key]: "ALL" })}
                  type="button"
                >
                  <span>{chip.label}</span>
                  <Icon name="x" />
                </button>
              </li>
            ))}
            {chips.length > 1 && (
              <li>
                <button
                  className="activity-chip-clear"
                  onClick={() => removeChip(NO_FILTERS)}
                  type="button"
                >
                  Limpar filtros
                </button>
              </li>
            )}
          </ul>
        )}
        <ActivityList filtered={filtered} pages={pages} timeZone={timeZone} />
      </div>
      <Dialog
        onClose={closeMenu}
        open={menuOpen}
        title="Filtros"
        variant="modal"
      >
        {menuOpen && (
          <ActivityFiltersForm
            filters={filters}
            onApply={(next) => {
              apply(next);
              setMenuOpen(false);
            }}
          />
        )}
      </Dialog>
    </SettingsPage>
  );
}

/**
 * Menu "Filtros": os quatro grupos em chips de escolha única. Nada muda na
 * lista até "Aplicar"; fechar descarta o rascunho. "Limpar filtros" volta o
 * rascunho para "tudo".
 */
function ActivityFiltersForm({
  filters,
  onApply,
}: {
  filters: Filters;
  onApply: (filters: Filters) => void;
}) {
  // O rascunho nasce dos filtros aplicados a cada abertura.
  const [draft, setDraft] = useState<Filters>(filters);
  const draftCount = activeFilters(draft).length;
  return (
    <form
      className="activity-filters-form"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      {FILTER_GROUPS.map((group) => (
        <fieldset className="activity-filter-group" key={group.key}>
          <legend>{group.legend}</legend>
          <div className="activity-filter-options">
            {group.options.map((option) => (
              <label
                className={clsx(
                  "activity-filter-option",
                  draft[group.key] === option.value && "is-selected",
                )}
                key={option.value}
              >
                <input
                  checked={draft[group.key] === option.value}
                  name={`activity-${group.key}`}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      [group.key]: option.value,
                    }))
                  }
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="modal-actions activity-filters-actions">
        <Button
          disabled={draftCount === 0}
          onClick={() => setDraft(NO_FILTERS)}
          type="button"
          variant="tertiary"
        >
          Limpar filtros
        </Button>
        <Button type="submit">Aplicar</Button>
      </div>
    </form>
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
        <section
          aria-labelledby={`activity-day-${group.date}`}
          className="activity-day"
          key={group.date}
        >
          <div className="activity-day-head">
            <h2
              className="activity-day-title"
              id={`activity-day-${group.date}`}
            >
              {dayTitle(group.date, today, yesterday)}
            </h2>
            <span className="activity-day-count">
              {group.items.length === 1
                ? "1 registro"
                : `${group.items.length} registros`}
            </span>
          </div>
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
  const ai = entry.actor === "AI";
  return (
    <li className="activity-row">
      <span
        aria-hidden="true"
        className={clsx("activity-actor", ai ? "is-ai" : "is-user")}
      >
        <Icon name={ai ? "spark" : "user"} />
      </span>
      <div className="activity-row-body">
        <div className="activity-row-head">
          <p className="activity-sentence">
            {href ? (
              <Link className="activity-link" href={href}>
                {sentence}
              </Link>
            ) : (
              sentence
            )}
          </p>
          <time className="activity-time" dateTime={entry.occurredAt}>
            {time}
          </time>
        </div>
        {lines.length > 0 && (
          <dl className="activity-changes">
            {lines.map((line, index) => (
              <ActivityChangeRow key={`${line.field}-${index}`} line={line} />
            ))}
          </dl>
        )}
        {note && <p className="activity-note">{note}</p>}
        <p className="activity-meta">
          <span className="activity-area">
            <Icon name={AREA_ICONS[entry.area]} />
            {AREA_LABELS[entry.area]}
          </span>
        </p>
      </div>
    </li>
  );
}

function ActivityChangeRow({ line }: { line: ChangeLine }) {
  return (
    <div className={clsx("activity-change", !line.before && "is-single")}>
      <dt>{line.label}</dt>
      <dd>
        {line.before && (
          <>
            <ChangeSide side="before" value={line.before} />
            <span aria-hidden="true" className="activity-arrow">
              →
            </span>
          </>
        )}
        <ChangeSide side={line.before ? "after" : "only"} value={line.after} />
      </dd>
    </div>
  );
}

function ChangeSide({
  side,
  value,
}: {
  side: "before" | "after" | "only";
  value: ChangeValue;
}) {
  return (
    <span
      className={clsx(
        "activity-value",
        side === "before" && "activity-before",
        side === "after" && "activity-after",
        value.muted && "is-muted",
      )}
    >
      {side === "before" && <span className="sr-only">de </span>}
      {side === "after" && <span className="sr-only"> para </span>}
      {value.color !== undefined && (
        <span
          aria-hidden="true"
          className={clsx(
            "activity-swatch",
            value.color === null && "is-empty",
          )}
          {...swatchProps(value.color)}
        />
      )}
      {value.items && value.items.length > 1 ? (
        <span className="activity-value-items">
          {value.items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </span>
      ) : (
        <span className="activity-value-text">{value.text}</span>
      )}
    </span>
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
