"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CustomerAppointmentSummary,
  type CustomerListItem,
  type CustomerListSort,
  type CustomerListStatus,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailEmpty, ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { formatBrazilianPhone } from "@/shared/phone";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Button } from "@/shared/ui/Button";
import { ContactPhoto, customerPhotoUrl } from "@/shared/ui/ContactPhoto";
import { Dialog } from "@/shared/ui/Dialog";
import { Field } from "@/shared/ui/Field";

import { CustomerListMore } from "./CustomerListMore";
import { CustomerEmptyState, CustomerErrorState } from "./CustomerStates";
import {
  type CustomerListView,
  type CustomerPages,
  type CustomerPagesError,
  useCustomerPages,
} from "./useCustomerPages";

export type CustomerListData = {
  canCreate: boolean;
  /** Clientes já carregados da lista sem busca. */
  customers: CustomerListItem[];
  error: CustomerPagesError | null;
  /** Resultado já carregado da busca, feita no servidor. */
  filtered: CustomerListItem[];
  groups: CustomerGroup[];
  /** Lista sem busca, paginada. */
  list: CustomerPages;
  loading: boolean;
  query: string;
  /** Busca de novo o que está na tela, sem esqueleto (cadastro mudou). */
  refresh: () => void;
  /** Guarda onde a lista sem busca estava rolada. */
  rememberScroll: (top: number) => void;
  /** Busca paginada; vale enquanto há texto no campo. */
  results: CustomerPages;
  retry: () => void;
  /** Onde a lista sem busca estava rolada, para voltar ao mesmo ponto. */
  savedScroll: () => number;
  /** A busca digitada ainda não tem resposta. */
  searchPending: boolean;
  setQuery: (value: string) => void;
  today: Date;
  /** Total real de clientes do negócio, não só o carregado. */
  total: number;
  /** Aba Ativos/Inativos e ordem da lista (2026-10-18). */
  view: CustomerListView;
  setStatus: (status: CustomerListStatus) => void;
  setSort: (sort: CustomerListSort) => void;
};

/** Ordens da lista, na ordem da folha "Ordenar" (2026-10-18). */
export const CUSTOMER_SORT_OPTIONS: ReadonlyArray<{
  value: CustomerListSort;
  label: string;
  description: string;
}> = [
  { value: "name", label: "Nome", description: "De A a Z" },
  {
    value: "last",
    label: "Último atendimento",
    description: "Quem veio mais recentemente primeiro",
  },
  {
    value: "frequency",
    label: "Frequência",
    description: "Quem mais concluiu atendimentos primeiro",
  },
  {
    value: "next",
    label: "Próximos atendimentos",
    description: "Quem você atende primeiro, a partir de agora",
  },
];

/** Espera entre a digitação e a busca no servidor. */
const SEARCH_DEBOUNCE_MS = 250;

const CustomerListContext = createContext<CustomerListData | null>(null);

/**
 * Dados da lista mantidos acima das telas: o layout de `/clientes` os guarda
 * enquanto a pessoa vai da lista ao detalhe e volta, sem buscar de novo.
 */
export const CustomerListProvider = CustomerListContext.Provider;

/**
 * Dados da lista: os do layout de `/clientes`, quando a tela está dentro dele;
 * senão, próprios. `enabled=false` não busca nada: o painel que não cabe na
 * janela nunca consome o BFF.
 */
export function useCustomerListData(enabled = true): CustomerListData {
  const shared = useContext(CustomerListContext);
  const own = useCustomerListState(enabled && !shared);
  return shared ?? own;
}

/** Estado da lista: levas carregadas, busca, fuso e rolagem. */
export function useCustomerListState(enabled = true): CustomerListData {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [query, setQuery] = useState("");
  const searchText = query.trim();
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Limpar o campo volta à lista na hora; digitar espera uma pausa.
    const timer = setTimeout(
      () => setSearch(searchText),
      searchText ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void businessTimezone(getProductServices(), controller.signal).then(
      (zone) => {
        if (!controller.signal.aborted) setTimezone(zone);
      },
    );
    return () => controller.abort();
  }, [enabled]);

  const [view, setView] = useState<CustomerListView>({
    status: "active",
    sort: "name",
  });
  const setStatus = useCallback(
    (status: CustomerListStatus) =>
      setView((current) => ({ ...current, status })),
    [],
  );
  const setSort = useCallback(
    (sort: CustomerListSort) => setView((current) => ({ ...current, sort })),
    [],
  );
  const list = useCustomerPages("", enabled, view);
  const results = useCustomerPages(search, enabled && search !== "", view);
  // Letra só faz sentido na ordem de nome; nas outras, uma lista corrida.
  const groups = useMemo(
    () =>
      view.sort === "name"
        ? groupAlphabetically(list.items)
        : list.items.length > 0
          ? [{ customers: list.items, letter: NO_NAME_LABEL }]
          : [],
    [list.items, view.sort],
  );
  const scroll = useRef(0);
  const rememberScroll = useCallback((top: number) => {
    scroll.current = top;
  }, []);
  const savedScroll = useCallback(() => scroll.current, []);
  const { refresh: refreshList } = list;
  const { refresh: refreshResults } = results;
  const refresh = useCallback(() => {
    refreshList();
    refreshResults();
  }, [refreshList, refreshResults]);

  return {
    canCreate: !list.loading && !list.error && !list.managedExternally,
    customers: list.items,
    error: list.error,
    filtered: results.items,
    groups,
    list,
    loading: list.loading,
    query,
    refresh,
    rememberScroll,
    results,
    retry: list.retry,
    savedScroll,
    searchPending: searchText !== search || results.loading,
    setQuery,
    setSort,
    setStatus,
    today: todayWallDate(timezone),
    total: list.total,
    view,
  };
}

export function CustomerList() {
  const wide = useWideLayout();
  const data = useCustomerListData();
  const { canCreate, loading } = data;
  const emptyList = !loading && !data.error && data.customers.length === 0;
  const searching = data.query.trim() !== "";

  useShellConfig({
    action:
      canCreate && !wide && !emptyList && !searching
        ? { href: "/clientes/novo", icon: "plus", label: "Novo cliente" }
        : undefined,
    active: "clientes",
    loading,
    module: "directory",
    showBottomNav: !searching,
    title: "Clientes",
  });

  if (wide && !data.error && !emptyList) {
    return (
      <ListDetailLayout
        detail={
          <ListDetailEmpty>
            {loading ? null : "Selecione um cliente para ver o perfil"}
          </ListDetailEmpty>
        }
        list={<CustomerListPanelView data={data} />}
        listLabel="Clientes"
      />
    );
  }

  return (
    <div className="customer-list-screen">
      <CustomerListPanelView data={data} showAdd={false} />
    </div>
  );
}

/**
 * Lista em painel para as rotas de detalhe e criação: busca os próprios dados
 * e nunca chama `useShellConfig` (a tela que a hospeda já declarou a casca).
 */
export function CustomerListPanel({ openId }: { openId?: string }) {
  const data = useCustomerListData();
  return <CustomerListPanelView data={data} heading="h2" openId={openId} />;
}

export function CustomerListPanelView({
  data,
  heading: Heading = "h1",
  openId,
  showAdd = true,
}: {
  data: CustomerListData;
  heading?: "h1" | "h2";
  openId?: string;
  showAdd?: boolean;
}) {
  const { canCreate, customers, error, filtered, groups, loading, today } =
    data;
  // Esqueleto só se a primeira leva passar de ~150 ms (D-168): carga rápida
  // entra direto, sem piscar (2026-10-16).
  const showSkeleton = useDeferredLoading(loading);
  const inactiveTab = data.view.status === "inactive";
  const [sortOpen, setSortOpen] = useState(false);
  const closeSort = useCallback(() => setSortOpen(false), []);
  // Aba Inativos vazia não é "nenhum cliente": as abas ficam para voltar.
  const showingState =
    Boolean(error) || (!loading && customers.length === 0 && !inactiveTab);
  const searchText = data.query.trim();
  const searching = !showingState && !loading && searchText !== "";
  // Só os itens rolam (o cabeçalho e a busca ficam parados); a lista volta ao
  // ponto em que estava quando a área de itens é montada de novo — ao sair da
  // busca ou voltar do detalhe no celular.
  const { savedScroll } = data;
  const restoreScroll = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) element.scrollTop = savedScroll();
    },
    [savedScroll],
  );
  return (
    <div
      className={clsx(
        "customer-panel",
        showingState && "has-state",
        loading && !error && "is-loading",
      )}
    >
      {!searching && (
        <div className="customer-panel-header">
          <Heading>Clientes</Heading>
          <div className="customer-panel-tools">
            {!loading && !error && customers.length > 0 && (
              <span className="customer-panel-count">
                {data.total}
                <span className="sr-only">
                  {data.total === 1 ? " cliente" : " clientes"}
                </span>
              </span>
            )}
            {showAdd && (loading || (canCreate && customers.length > 0)) && (
              <Link
                aria-label="Novo cliente"
                className="customer-panel-add"
                href="/clientes/novo"
              >
                <Icon name="plus" />
              </Link>
            )}
          </div>
        </div>
      )}
      {!searching && !error && (
        <div className="customer-panel-view">
          <div
            aria-label="Mostrar clientes"
            className="customer-status-tabs"
            role="group"
          >
            {(
              [
                ["active", "Ativos"],
                ["inactive", "Inativos"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={data.view.status === value}
                className={clsx(
                  "customer-status-tab",
                  data.view.status === value && "is-active",
                )}
                key={value}
                onClick={() => data.setStatus(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            aria-haspopup="dialog"
            className="customer-sort-button"
            onClick={() => setSortOpen(true)}
            type="button"
          >
            <span className="sr-only">Ordenar por </span>
            {CUSTOMER_SORT_OPTIONS.find(
              (option) => option.value === data.view.sort,
            )?.label ?? "Nome"}
            <Icon name="chevron-down" />
          </button>
        </div>
      )}
      <Dialog onClose={closeSort} open={sortOpen} title="Ordenar clientes">
        <div
          aria-label="Ordenar clientes por"
          className="customer-sort-options"
          role="radiogroup"
        >
          {CUSTOMER_SORT_OPTIONS.map((option) => (
            <label className="customer-sort-option" key={option.value}>
              <input
                checked={data.view.sort === option.value}
                name="customer-sort"
                type="radio"
                value={option.value}
                onChange={() => data.setSort(option.value)}
                // Tocar em qualquer opção fecha, mesmo na que já estava
                // marcada (onde `onChange` não dispara).
                onClick={closeSort}
              />
              <span className="customer-sort-option-text">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Dialog>

      {error ? (
        <CustomerErrorState onRetry={data.retry} reference={error.reference} />
      ) : !loading && customers.length === 0 && !inactiveTab ? (
        <CustomerEmptyState canCreate={canCreate} />
      ) : !loading && customers.length === 0 ? (
        <p className="customer-inactive-empty">
          Nenhum cliente inativo. Quem você desativar no perfil aparece aqui,
          fora da lista principal.
        </p>
      ) : (
        <>
          <div
            className={clsx(
              "customer-panel-searchbar",
              searching && "is-searching",
            )}
          >
            <Field
              className="customer-panel-search"
              icon="search"
              label="Buscar cliente"
              onChange={(event) => data.setQuery(event.target.value)}
              placeholder="Buscar por nome ou telefone"
              type="search"
              value={data.query}
            />
            {searching && (
              <button
                className="customer-search-cancel"
                onClick={() => data.setQuery("")}
                type="button"
              >
                Cancelar
              </button>
            )}
          </div>
          {loading ? (
            <div className="customer-panel-scroll" key="loading">
              {showSkeleton ? (
                <CustomerListSkeleton />
              ) : (
                <p className="sr-only" role="status">
                  Carregando clientes
                </p>
              )}
            </div>
          ) : searching ? (
            <div className="customer-panel-scroll" key="search">
              <CustomerSearchResults
                canCreate={canCreate}
                customers={filtered}
                open={openId}
                pages={data.results}
                pending={data.searchPending}
                query={searchText}
                today={today}
              />
            </div>
          ) : (
            <div
              className="customer-panel-scroll"
              key="list"
              onScroll={(event) =>
                data.rememberScroll(event.currentTarget.scrollTop)
              }
              ref={restoreScroll}
            >
              <div
                aria-label="Clientes"
                className="customer-panel-list"
                role="list"
              >
                {groups.map((group, index) => (
                  <div
                    className="customer-panel-group"
                    key={`${group.letter}-${index}`}
                  >
                    {group.letter !== NO_NAME_LABEL && (
                      <p className="customer-panel-letter">{group.letter}</p>
                    )}
                    {group.customers.map((customer) => (
                      <CustomerRow
                        customer={customer}
                        key={customer.id}
                        open={customer.id === openId}
                        today={today}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <CustomerListMore pages={data.list} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerSearchResults({
  canCreate,
  customers,
  open,
  pages,
  pending,
  query,
  today,
}: {
  canCreate: boolean;
  customers: CustomerListItem[];
  open?: string;
  pages: CustomerPages;
  pending: boolean;
  query: string;
  today: Date;
}) {
  const create = canCreate ? <CustomerCreateRow query={query} /> : null;
  if (pages.error) {
    return (
      <div className="customer-search-results">
        <div className="customer-list-more-error" role="alert">
          <p>Não foi possível buscar agora.</p>
          <Button onClick={pages.retry} type="button" variant="secondary">
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
  if (pending) return <CustomerListSkeleton label="Buscando clientes" />;
  return (
    <div className="customer-search-results">
      {customers.length === 0 ? (
        <>
          <p className="customer-no-results" role="status">
            Nenhum cliente corresponde à busca.
          </p>
          {create && <div className="customer-panel-row">{create}</div>}
        </>
      ) : (
        <div aria-label="Clientes" role="list">
          {customers.map((customer) => (
            <CustomerRow
              customer={customer}
              highlight={query}
              key={customer.id}
              open={customer.id === open}
              today={today}
            />
          ))}
          {create && !pages.hasMore && (
            <div className="customer-panel-row" role="listitem">
              {create}
            </div>
          )}
        </div>
      )}
      {customers.length > 0 && <CustomerListMore pages={pages} />}
    </div>
  );
}

function CustomerCreateRow({ query }: { query: string }) {
  const hasLetter = /\p{L}/u.test(query);
  const href = hasLetter
    ? `/clientes/novo?nome=${encodeURIComponent(query)}`
    : `/clientes/novo?telefone=${query.replace(/\D/g, "")}`;
  const label = `${query.charAt(0).toLocaleUpperCase("pt-BR")}${query.slice(1)}`;
  return (
    <Link className="customer-panel-item customer-create-row" href={href}>
      <span className="customer-create-icon" aria-hidden="true">
        <Icon name="plus" />
      </span>
      <span className="customer-create-label">
        Adicionar novo cliente “{label}…”
      </span>
    </Link>
  );
}

function highlightName(name: string, query: string): ReactNode {
  const index = name
    .toLocaleLowerCase("pt-BR")
    .indexOf(query.toLocaleLowerCase("pt-BR"));
  if (index < 0) return name;
  const end = index + query.length;
  return (
    <>
      {name.slice(0, index)}
      <mark className="customer-search-mark">{name.slice(index, end)}</mark>
      {name.slice(end)}
    </>
  );
}

function CustomerRow({
  customer,
  highlight,
  open,
  today,
}: {
  customer: CustomerListItem;
  highlight?: string;
  open: boolean;
  today: Date;
}) {
  const named = Boolean(customer.name?.trim());
  const meta = appointmentParts(customer, today);
  const phone = customer.phone
    ? (formatBrazilianPhone(customer.phone, "plus") ?? customer.phone)
    : null;
  const relation = relationLine(customer);
  return (
    <div className="customer-panel-row" role="listitem">
      <Link
        aria-current={open ? "page" : undefined}
        className={clsx(
          "customer-panel-item",
          open && "is-open",
          !named && "is-unnamed",
        )}
        href={`/clientes/detalhes?id=${encodeURIComponent(customer.id)}`}
      >
        {named ? (
          <>
            <span className="customer-panel-avatar" aria-hidden="true">
              {initials(customer.name)}
              <ContactPhoto src={customerPhotoUrl(customer.id)} />
            </span>
            <span className="customer-panel-main">
              <span className="customer-panel-name list-item-title">
                {highlight
                  ? highlightName(customer.name ?? "", highlight)
                  : customer.name}
              </span>
              {relation ? (
                <span className="customer-panel-phone customer-panel-relation">
                  {relation.guardian && <RelationIcon />}
                  <span className="customer-panel-relation-text">
                    {relation.text}
                  </span>
                </span>
              ) : (
                <span className="customer-panel-phone">
                  {phone ?? "Telefone não informado"}
                </span>
              )}
            </span>
            <span className="customer-panel-meta">
              {meta.eyebrow && !highlight && (
                <>
                  <span className="customer-panel-eyebrow">
                    {meta.eyebrow}
                  </span>{" "}
                </>
              )}
              <span className={clsx("customer-panel-when", `is-${meta.tone}`)}>
                {meta.value}
              </span>
            </span>
          </>
        ) : (
          <>
            <span
              className="customer-panel-avatar is-unnamed"
              aria-hidden="true"
            >
              <Icon name="nav-user" />
              <ContactPhoto src={customerPhotoUrl(customer.id)} />
            </span>
            <span className="customer-panel-main">
              <span className="customer-panel-name list-item-title customer-panel-phone-title">
                {phone ?? "Cliente sem nome"}
              </span>
              <span className="customer-panel-imported">
                {phone
                  ? "Cadastro sem nome · importado"
                  : "Telefone não informado"}
              </span>
            </span>
            <span className="customer-panel-name-action">Nomear</span>
          </>
        )}
      </Link>
    </div>
  );
}

type RelationLine = { guardian: boolean; text: string };

/**
 * Segunda linha de quem agenda por quem (Goal149, CL1/CL3): o responsável diz
 * para quem agenda; quem não tem telefone próprio diz quem agenda por ele. Sem
 * gênero (D-158). `null` deixa a linha como sempre foi (telefone).
 */
function relationLine(customer: CustomerListItem): RelationLine | null {
  const dependents = customer.dependents ?? [];
  const [first] = dependents;
  if (first) {
    const name = first.name?.trim() || "cliente sem nome";
    const rest = dependents.length - 1;
    return {
      guardian: false,
      text:
        rest > 0 ? `agenda para ${name} e mais ${rest}` : `agenda para ${name}`,
    };
  }
  if (customer.guardian && !customer.phone?.trim()) {
    const name = customer.guardian.name?.trim() || "Responsável sem nome";
    return { guardian: true, text: `${name} agenda por esta pessoa` };
  }
  return null;
}

function RelationIcon() {
  return (
    <svg
      aria-hidden="true"
      className="customer-panel-relation-icon"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="12"
    >
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function CustomerListSkeleton({
  label = "Carregando clientes",
}: {
  label?: string;
}) {
  return (
    <>
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden="true" className="customer-skeleton">
        {[0, 1, 2, 3].map((item) => (
          <div className="customer-skeleton-row" key={item}>
            <span className="customer-skeleton-avatar" />
            <span className="customer-skeleton-copy">
              <span className="customer-skeleton-name" />
              <span className="customer-skeleton-meta" />
            </span>
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

function initials(name: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}

type CustomerGroup = { letter: string; customers: CustomerListItem[] };

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
 * Agrupa na ordem que o servidor entregou (alfabética, sem acento nem caixa
 * distinguindo letra): a lista chega em levas, e reordenar aqui faria uma
 * pessoa da leva nova saltar para o meio do que já está na tela. A letra só
 * abre grupo novo quando muda, então a leva que continua a mesma letra não
 * repete o cabeçalho. Cadastro sem nome vai para um separador próprio no fim
 * (Goal075 CL-01).
 */
function groupAlphabetically(customers: CustomerListItem[]): CustomerGroup[] {
  const named = customers.filter((customer) => customer.name?.trim());
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

type AppointmentParts = {
  eyebrow?: string;
  tone: "empty" | "last" | "missed" | "next";
  value: string;
};

/** Informação à direita da linha (Goal075 CL-01): próximo, último ou "sem atendimentos", em rótulo e valor. */
function appointmentParts(
  customer: CustomerListItem,
  today: Date,
): AppointmentParts {
  if (customer.nextAppointment) {
    return {
      eyebrow: "próximo",
      tone: "next",
      value: nextAppointmentText(customer.nextAppointment, today).replace(
        /^próximo /,
        "",
      ),
    };
  }
  if (customer.lastAppointment) {
    return {
      eyebrow: "último",
      tone: customer.lastAppointment.status === "NO_SHOW" ? "missed" : "last",
      value: lastAppointmentText(customer.lastAppointment, today).replace(
        /^último /,
        "",
      ),
    };
  }
  return { tone: "empty", value: "sem atendimentos" };
}
