"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BffHttpError,
  type Service,
  type ServiceList as ServiceListResult,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailEmpty, ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { ServiceEmptyState } from "./ServiceEmptyState";
import { formatServiceLine } from "./serviceFormatting";

type ServiceGroups = {
  active: Service[];
  inactive: Service[];
  review: Service[];
};

export type ServiceListState = {
  error: string | null;
  filtered: Service[];
  groups: ServiceGroups;
  query: string;
  /** Busca de novo, sem esqueleto: a lista atual fica até a nova chegar. */
  refresh: () => void;
  /** Guarda onde a lista estava rolada. */
  rememberScroll: (top: number) => void;
  result: ServiceListResult | null;
  retry: () => void;
  /** Onde a lista estava rolada, para voltar ao mesmo ponto. */
  savedScroll: () => number;
  setQuery: (value: string) => void;
};

const ServiceListContext = createContext<ServiceListState | null>(null);

/**
 * Dados da lista mantidos acima das telas: o layout de `/servicos` os guarda
 * enquanto a pessoa vai da lista ao editor e volta, sem buscar de novo.
 */
export const ServiceListProvider = ServiceListContext.Provider;

/**
 * Dados da lista: os do layout de `/servicos`, quando a tela está dentro dele;
 * senão, próprios. `enabled=false` não busca nada: o painel que não cabe na
 * janela nunca consome o BFF.
 */
export function useServiceListData(enabled = true): ServiceListState {
  const shared = useContext(ServiceListContext);
  const own = useServiceListState(enabled && !shared);
  return shared ?? own;
}

/**
 * Estado da lista: catálogo, busca e rolagem. O catálogo de um profissional
 * autônomo é curto, então vem inteiro numa resposta só, sem paginação.
 */
export function useServiceListState(enabled = true): ServiceListState {
  const [result, setResult] = useState<ServiceListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getProductServices()
      .serviceCatalog.list(controller.signal)
      .then(setResult)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestError(caught, "Não foi possível carregar os serviços."),
          );
      });
    return () => controller.abort();
  }, [enabled, reload]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return (result?.items ?? []).filter((service) =>
      service.name.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [query, result]);

  const groups = useMemo(() => {
    const review = filtered.filter((service) => service.needsReview);
    const active = filtered
      .filter((service) => service.active && !service.needsReview)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const inactive = filtered.filter(
      (service) => !service.active && !service.needsReview,
    );
    return { active, inactive, review };
  }, [filtered]);

  const scroll = useRef(0);
  const rememberScroll = useCallback((top: number) => {
    scroll.current = top;
  }, []);
  const savedScroll = useCallback(() => scroll.current, []);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const retry = useCallback(() => {
    setError(null);
    setReload((value) => value + 1);
  }, []);

  return {
    error,
    filtered,
    groups,
    query,
    refresh,
    rememberScroll,
    result,
    retry,
    savedScroll,
    setQuery,
  };
}

export function ServiceList() {
  const wide = useWideLayout();
  const state = useServiceListData();
  const { error, result } = state;
  const emptyList = isEmptyList(state);

  useShellConfig({
    // Com a lista ao lado (a partir de 1024 px), o "+" é o do topo da lista,
    // como no quadro; o botão flutuante fica só para a lista em tela cheia.
    action:
      canAdd(state) && !wide
        ? { href: "/servicos/novo", icon: "plus", label: "Novo serviço" }
        : undefined,
    active: "servicos",
    loading: !result && !error,
    module: "directory",
    title: "Serviços",
  });

  if (wide && !emptyList) {
    return (
      <ListDetailLayout
        detail={<ListDetailEmpty>Selecione um serviço</ListDetailEmpty>}
        list={<ServiceListPanelView heading="h1" state={state} />}
        listLabel="Serviços"
      />
    );
  }

  return (
    <ServiceListPanelView heading="h1" screen showAdd={false} state={state} />
  );
}

/**
 * Lista em painel para as rotas de edição e criação: busca os próprios dados
 * e nunca chama `useShellConfig` (a tela que a hospeda já declarou a casca).
 */
export function ServiceListPanel({ openId }: { openId?: string }) {
  const state = useServiceListData();
  return <ServiceListPanelView heading="h2" openId={openId} state={state} />;
}

export function ServiceListPanelView({
  heading: Heading,
  openId,
  screen = false,
  showAdd = true,
  state,
}: {
  heading: "h1" | "h2";
  openId?: string;
  /** Lista como tela inteira (celular), sem a coluna do detalhe. */
  screen?: boolean;
  showAdd?: boolean;
  state: ServiceListState;
}) {
  const { groups, result } = state;
  const summary = result && result.items.length > 0 ? summaryLine(groups) : "";
  const emptyList = isEmptyList(state);
  return (
    <div
      className={clsx(
        "service-panel",
        screen && "service-list-screen",
        emptyList && "has-state",
      )}
    >
      <div className="service-panel-header">
        <div className="service-panel-title">
          <Heading>Serviços</Heading>
          {/* O resumo guarda a linha enquanto a lista carrega: nada pula. */}
          {!emptyList && (
            <span className="service-panel-summary">{summary || " "}</span>
          )}
        </div>
        {showAdd && canAdd(state) && (
          <Link
            aria-label="Novo serviço"
            className="service-panel-add"
            href="/servicos/novo"
          >
            <Icon name="plus" />
          </Link>
        )}
      </div>
      <ServiceListContent openId={openId} state={state} />
    </div>
  );
}

function ServiceListContent({
  openId,
  state,
}: {
  openId?: string;
  state: ServiceListState;
}) {
  const { error, filtered, groups, query, result, savedScroll, setQuery } =
    state;
  // Na primeira carga não há esqueleto: o topo (título, "+" e busca) já está
  // no lugar, a área dos itens fica vazia e eles entram com um fade curto.
  // Quem volta a uma lista já carregada a encontra como estava, sem fade.
  const [enter] = useState(() => result === null);
  // Só os itens rolam (título, resumo, "+" e busca ficam parados); a lista
  // volta ao ponto em que estava quando é montada de novo — ao voltar do
  // editor no celular.
  const restoreScroll = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) element.scrollTop = savedScroll();
    },
    [savedScroll],
  );
  if (error) {
    return (
      <DirectoryState
        actionLabel="Carregar novamente"
        description={error}
        error
        onAction={state.retry}
        title="Não foi possível carregar serviços"
      />
    );
  }
  if (result && result.items.length === 0) {
    return <ServiceEmptyState canCreate={result.editable} />;
  }
  const editable = Boolean(result?.editable);
  return (
    <>
      <section className="directory-toolbar" aria-label="Busca">
        <label className="directory-search">
          <span className="sr-only">Buscar</span>
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Buscar serviço"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>
      <div
        aria-busy={result ? undefined : true}
        className="service-panel-scroll"
        onScroll={(event) =>
          state.rememberScroll(event.currentTarget.scrollTop)
        }
        ref={restoreScroll}
      >
        {result && (
          <section
            className={clsx(
              "directory-list-surface",
              // Primeira carga: os serviços entram com fade suave, também
              // com movimento reduzido (D-173, 2026-10-16).
              enter && "service-list-arrive",
            )}
          >
            {!editable && (
              <p className="service-list-readonly-note">
                Serviços não podem ser editados aqui.
              </p>
            )}
            <ServiceGroup
              editable={editable}
              heading="Ativos"
              hideHeading
              openId={openId}
              services={groups.active}
            />
            <ServiceGroup
              editable={editable}
              heading="Precisa de revisão"
              hideHeading
              openId={openId}
              services={groups.review}
            />
            <ServiceGroup
              editable={editable}
              heading="Inativos"
              openId={openId}
              services={groups.inactive}
            />
            {filtered.length === 0 && (
              <p className="directory-no-results">
                Nenhum serviço corresponde à busca.
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}

export function DirectoryState({
  actionHref,
  actionLabel,
  description,
  error = false,
  onAction,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  error?: boolean;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="directory-state-surface">
      <div className={error ? "error-state" : "empty-state"}>
        <span className="state-icon">
          <Icon name={error ? "alert" : "info"} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionLabel && actionHref && (
          <Link className="btn btn-primary" href={actionHref}>
            {actionLabel}
          </Link>
        )}
        {actionLabel && !actionHref && (
          <button className="btn btn-primary" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function isEmptyList({ error, result }: ServiceListState): boolean {
  return !error && result !== null && result.items.length === 0;
}

/**
 * O "+" aparece desde o primeiro quadro: enquanto a lista carrega ele já está
 * no lugar; some só no catálogo que não se edita aqui, no erro e na lista
 * vazia (que tem a própria ação).
 */
function canAdd(state: ServiceListState): boolean {
  if (state.error || isEmptyList(state)) return false;
  return state.result ? state.result.editable : true;
}

export function requestError(error: unknown, fallback: string): string {
  if (!(error instanceof BffHttpError)) return fallback;
  const messages: Record<string, string> = {
    SERVICE_NAME_ALREADY_EXISTS: "Já existe um serviço com este nome.",
    NETWORK_ERROR: "Não foi possível acessar a Avenly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function reviewReason(service: Service): string {
  if (service.durationMinutes === null) return "sem duração";
  if (
    (service.priceType === "FIXED" || service.priceType === "STARTING_AT") &&
    service.price === null
  ) {
    return "sem preço";
  }
  if (service.reviewOrigin === "IMPORT") return "importado";
  if (service.reviewOrigin === "MANUAL") return "cadastro manual";
  return "origem não informada";
}

function summaryLine(groups: ServiceGroups): string {
  const parts: string[] = [];
  if (groups.active.length > 0) {
    parts.push(
      `${groups.active.length} ${groups.active.length === 1 ? "ativo" : "ativos"}`,
    );
  }
  if (groups.review.length > 0) {
    parts.push(
      `${groups.review.length} precisa${
        groups.review.length === 1 ? "" : "m"
      } de revisão`,
    );
  }
  if (groups.inactive.length > 0) {
    parts.push(
      `${groups.inactive.length} ${
        groups.inactive.length === 1 ? "inativo" : "inativos"
      }`,
    );
  }
  return parts.join(" · ");
}

function ServiceGroup({
  editable,
  heading,
  hideHeading = false,
  openId,
  services,
}: {
  editable: boolean;
  heading: string;
  hideHeading?: boolean;
  openId?: string;
  services: Service[];
}) {
  if (services.length === 0) return null;
  return (
    <div className="service-group">
      <h2 className={clsx("service-group-heading", hideHeading && "sr-only")}>
        {heading}
      </h2>
      <ul className="service-group-list">
        {services.map((service) => {
          const href = `/servicos/editar?id=${encodeURIComponent(service.id)}`;
          return (
            <li
              className={clsx(
                "directory-row service-row",
                !service.active && !service.needsReview && "is-inactive",
                service.id === openId && "is-open",
              )}
              key={service.id}
            >
              <span
                aria-hidden="true"
                className="service-row-accent"
                data-color={service.colorToken ?? undefined}
              />
              {editable && (
                <Link
                  aria-current={service.id === openId ? "page" : undefined}
                  aria-label={`Editar ${service.name}`}
                  className="service-row-link"
                  href={href}
                />
              )}
              <span className="service-row-body">
                <strong className="service-row-name">{service.name}</strong>
                {service.needsReview ? (
                  <span className="service-row-meta is-review">
                    <Icon name="alert" />
                    {`Precisa de revisão · ${reviewReason(service)}`}
                  </span>
                ) : (
                  <span className="service-row-meta">
                    {formatServiceLine(service)}
                  </span>
                )}
              </span>
              {!editable ? (
                <span className="service-row-readonly">Somente leitura</span>
              ) : service.needsReview ? (
                <Link
                  aria-label={`Corrigir ${service.name}`}
                  className="service-row-fix"
                  href={href}
                >
                  Corrigir
                </Link>
              ) : (
                <Icon className="service-row-chevron" name="chevron-right" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
