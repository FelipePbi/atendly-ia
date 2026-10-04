"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BffHttpError, type Service, type ServiceList as ServiceListResult } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailEmpty, ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { formatServiceLine } from "./serviceFormatting";

type ServiceGroups = {
  active: Service[];
  inactive: Service[];
  review: Service[];
};

type ServiceListState = {
  error: string | null;
  filtered: Service[];
  groups: ServiceGroups;
  query: string;
  result: ServiceListResult | null;
  retry: () => void;
  setQuery: (value: string) => void;
};

/** `enabled=false` não busca nada: o painel que não cabe na janela nunca consome o BFF. */
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

  return {
    error,
    filtered,
    groups,
    query,
    result,
    retry: () => {
      setError(null);
      setReload((value) => value + 1);
    },
    setQuery,
  };
}

export function ServiceList() {
  const wide = useWideLayout();
  const state = useServiceListState();
  const { error, result } = state;

  useShellConfig({
    action: result?.editable
      ? { href: "/servicos/novo", icon: "plus", label: "Novo serviço" }
      : undefined,
    active: "servicos",
    loading: !result && !error,
    module: "directory",
    title: "Serviços",
  });

  if (wide) {
    return (
      <ListDetailLayout
        detail={<ListDetailEmpty>Selecione um serviço</ListDetailEmpty>}
        list={<ServiceListPanelView heading="h1" state={state} />}
        listLabel="Serviços"
      />
    );
  }

  return <ServiceListPanelView heading="h1" showAdd={false} state={state} />;
}

/**
 * Lista em painel para as rotas de edição e criação: busca os próprios dados
 * e nunca chama `useShellConfig` (a tela que a hospeda já declarou a casca).
 */
export function ServiceListPanel({ openId }: { openId?: string }) {
  const state = useServiceListState();
  return <ServiceListPanelView heading="h2" openId={openId} state={state} />;
}

function ServiceListPanelView({
  heading: Heading,
  openId,
  showAdd = true,
  state,
}: {
  heading: "h1" | "h2";
  openId?: string;
  showAdd?: boolean;
  state: ServiceListState;
}) {
  const { groups, result } = state;
  const summary = result && result.items.length > 0 ? summaryLine(groups) : "";
  return (
    <div className="service-panel">
      <div className="service-panel-header">
        <div className="service-panel-title">
          <Heading>Serviços</Heading>
          {summary && <span className="service-panel-summary">{summary}</span>}
        </div>
        {showAdd && result?.editable && (
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
  const { error, filtered, groups, query, result, setQuery } = state;
  if (!result && !error) return <DirectoryLoading />;
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
    return (
      <DirectoryState
        actionHref={result.editable ? "/servicos/novo" : undefined}
        actionLabel={result.editable ? "Cadastrar primeiro serviço" : undefined}
        description="A IA só oferece serviços ativos com duração e preço ou valor sob consulta."
        title="Cadastre seu primeiro serviço"
      />
    );
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
      <section className="directory-list-surface">
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
    </>
  );
}

function DirectoryLoading() {
  return (
    <div
      className="directory-loading-shell"
      aria-busy="true"
      aria-label="Carregando dados"
    >
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="directory-loading-row" key={item}>
          <span className="skeleton directory-loading-avatar" />
          <span className="directory-loading-copy">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
          </span>
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-line" />
        </div>
      ))}
    </div>
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
      <h2
        className={clsx("service-group-heading", hideHeading && "sr-only")}
      >
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
