"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { BffHttpError, type Service, type ServiceList as ServiceListResult } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Badge } from "@/shared/ui/Badge";
import { Dialog } from "@/shared/ui/Dialog";

export function ServiceList() {
  const [result, setResult] = useState<ServiceListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | "inactive">("all");
  const [pending, setPending] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
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
  }, [reload]);

  const services = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return (result?.items ?? []).filter(
      (service) =>
        service.name.toLocaleLowerCase("pt-BR").includes(normalized) &&
        (filter === "all" ||
          (filter === "active" && service.active) ||
          (filter === "inactive" && !service.active)),
    );
  }, [filter, query, result]);

  async function changeStatus() {
    if (!pending || !result?.editable) return;
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await getProductServices().serviceCatalog.update(
        pending.id,
        {
          active: !pending.active,
        },
      );
      setResult({
        ...result,
        items: result.items.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      });
      setPending(null);
      setFeedback(`Serviço ${updated.active ? "ativado" : "desativado"}.`);
    } catch (caught: unknown) {
      setFeedback(requestError(caught, "Não foi possível alterar o serviço."));
    } finally {
      setBusy(false);
    }
  }

  useShellConfig({
    action: result?.editable
      ? { href: "/servicos/novo", icon: "plus", label: "Novo serviço" }
      : undefined,
    active: "servicos",
    loading: !result && !error,
    module: "directory",
    source: "atendly",
    title: "Serviços",
  });
  return (
    <>
      <section className="directory-page">
        <DirectoryHeader
          description="Organize o que pode ser agendado, com duração, preço e estado claros."
          title="Serviços"
          action={
            result?.editable ? (
              <Link className="btn btn-primary" href="/servicos/novo">
                <Icon name="plus" />
                <span>Novo serviço</span>
              </Link>
            ) : null
          }
        />
        <DirectorySourceStrip />
        {feedback && (
          <p className="directory-retry-status" role="status">
            {feedback}
          </p>
        )}
        {!result && !error ? (
          <DirectoryLoading />
        ) : error ? (
          <DirectoryState
            actionLabel="Carregar novamente"
            description={error}
            error
            onAction={() => {
              setError(null);
              setReload((value) => value + 1);
            }}
            title="Não foi possível carregar serviços"
          />
        ) : services.length === 0 && !query && filter === "all" ? (
          <DirectoryState
            actionHref={result?.editable ? "/servicos/novo" : undefined}
            actionLabel={
              result?.editable ? "Cadastrar primeiro serviço" : undefined
            }
            description="A IA só oferece serviços ativos com duração e preço ou valor sob consulta."
            title="Cadastre seu primeiro serviço"
          />
        ) : (
          <>
            <DirectoryToolbar
              filter={filter}
              filters={[
                ["all", "Todos"],
                ["active", "Ativos"],
                ["inactive", "Inativos"],
              ]}
              query={query}
              onFilter={(value) => setFilter(value as typeof filter)}
              onQuery={setQuery}
            />
            <section className="directory-list-surface">
              <div className="directory-list-meta">
                <strong>Serviços cadastrados</strong>
                <span>
                  {services.length}{" "}
                  {services.length === 1 ? "serviço" : "serviços"}
                </span>
              </div>
              <div
                className="directory-grid-head service-grid"
                aria-hidden="true"
              >
                <span>Serviço</span>
                <span>Duração</span>
                <span>Preço</span>
                <span>Status</span>
                <span>Ação</span>
                <span />
              </div>
              <div>
                {services.map((service) => (
                  <div className="directory-row service-grid" key={service.id}>
                    <span className="directory-row-main">
                      <span className="directory-source-icon">
                        <Icon name="briefcase" />
                      </span>
                      <span className="directory-row-copy">
                        <strong>{service.name}</strong>
                        <span>Agenda Atendly</span>
                      </span>
                    </span>
                    <span className="directory-cell">
                      <span className="directory-cell-label">Duração</span>
                      {formatServiceDuration(service)}
                    </span>
                    <span className="directory-cell">
                      <span className="directory-cell-label">Preço</span>
                      <strong>{formatPrice(service)}</strong>
                    </span>
                    <span className="directory-cell">
                      <span className="directory-cell-label">Status</span>
                      <span className="directory-row-badges">
                        <Badge
                          label={service.active ? "Ativo" : "Inativo"}
                          tone={service.active ? "success" : "neutral"}
                        />
                        {service.needsReview && (
                          <Badge
                            icon="alert"
                            label={`Revisar · ${reviewOriginLabel(service.reviewOrigin)}`}
                            tone="warning"
                          />
                        )}
                      </span>
                    </span>
                    <span className="directory-cell">
                      <span className="directory-cell-label">Ação</span>
                      {result?.editable ? (
                        <button
                          className="btn btn-tertiary"
                          type="button"
                          onClick={() => setPending(service)}
                        >
                          {service.active ? "Desativar" : "Ativar"}
                        </button>
                      ) : (
                        <span className="muted small">Somente leitura</span>
                      )}
                    </span>
                    {result?.editable ? (
                      <Link
                        className="icon-btn directory-row-action"
                        href={`/servicos/editar?id=${encodeURIComponent(service.id)}`}
                        aria-label={`Editar ${service.name}`}
                      >
                        <Icon name="chevron-right" />
                      </Link>
                    ) : (
                      <span className="directory-row-action">
                        <Icon name="external" />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {services.length === 0 && (
                <p className="directory-no-results">
                  Nenhum serviço corresponde à busca e ao filtro.
                </p>
              )}
            </section>
          </>
        )}
      </section>
      <Dialog
        eyebrow="Atenção"
        onClose={() => !busy && setPending(null)}
        open={Boolean(pending)}
        title={pending?.active ? "Desativar serviço?" : "Ativar serviço?"}
      >
        <p className="small muted">
          Novos agendamentos respeitarão o estado atualizado. O histórico será
          preservado.
        </p>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            type="button"
            onClick={() => setPending(null)}
          >
            Manter como está
          </button>
          <button
            className={pending?.active ? "btn btn-danger" : "btn btn-primary"}
            disabled={busy}
            type="button"
            onClick={() => void changeStatus()}
          >
            {busy
              ? "Salvando..."
              : pending?.active
                ? "Desativar serviço"
                : "Ativar serviço"}
          </button>
        </div>
      </Dialog>
    </>
  );
}

export function DirectoryHeader({
  action,
  back,
  description,
  title,
}: {
  action?: ReactNode;
  back?: string;
  description: string;
  title: string;
}) {
  return (
    <header className="directory-page-header">
      <div>
        {back && (
          <Link className="btn btn-tertiary" href={back}>
            <Icon name="chevron-left" />
            Voltar
          </Link>
        )}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="directory-page-actions">{action}</div>}
    </header>
  );
}

export function DirectorySourceStrip() {
  return (
    <section className="directory-source-strip">
      <div className="directory-source-copy">
        <span className="directory-source-icon">
          <Icon name="briefcase" />
        </span>
        <div>
          <strong>Gerenciado pela Agenda Atendly</strong>
          <span>Serviços podem ser criados, editados e desativados aqui.</span>
        </div>
      </div>
      <span className="badge badge-success">Controle completo</span>
    </section>
  );
}

function DirectoryToolbar({
  filter,
  filters,
  onFilter,
  onQuery,
  query,
}: {
  filter: string;
  filters: Array<[string, string]>;
  onFilter: (value: string) => void;
  onQuery: (value: string) => void;
  query: string;
}) {
  return (
    <section className="directory-toolbar" aria-label="Busca e filtros">
      <label className="directory-search">
        <span className="sr-only">Buscar</span>
        <Icon name="search" />
        <input
          className="input"
          type="search"
          placeholder="Buscar serviço"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="directory-filters">
        {filters.map(([value, label]) => (
          <button
            className={clsx(
              "directory-filter",
              filter === value && "is-active",
            )}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
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
    NETWORK_ERROR: "Não foi possível acessar a Atendly. Confira sua conexão.",
  };
  const message = messages[error.code] ?? fallback;
  return `${message} Referência: ${error.requestId}`;
}

function formatPrice(service: Service): string {
  if (service.priceType === "NOT_INFORMED") return "Não informado";
  if (service.priceType === "ON_REQUEST" || service.price === null) {
    return "Sob consulta";
  }
  const amount = service.price.toLocaleString("pt-BR", {
    currency: "BRL",
    style: "currency",
  });
  return service.priceType === "STARTING_AT" ? `A partir de ${amount}` : amount;
}

function formatServiceDuration(service: Service): string {
  return service.durationMinutes === null
    ? "Não informada"
    : `${service.durationMinutes} min`;
}

function reviewOriginLabel(origin: Service["reviewOrigin"]): string {
  if (origin === "IMPORT") return "importado";
  if (origin === "MANUAL") return "cadastro manual";
  return "origem não informada";
}
