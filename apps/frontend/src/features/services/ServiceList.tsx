"use client";

import clsx from "clsx";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { BffHttpError, type Service, type ServiceList as ServiceListResult } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { ListDetailEmpty, ListDetailLayout } from "@/shared/layout/ListDetail";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useWideLayout } from "@/shared/layout/useWideLayout";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Badge } from "@/shared/ui/Badge";
import { Dialog } from "@/shared/ui/Dialog";

import { formatServiceLine } from "./serviceFormatting";

type ServiceListState = {
  busy: boolean;
  changeStatus: () => Promise<void>;
  error: string | null;
  feedback: string | null;
  filtered: Service[];
  groups: { active: Service[]; inactive: Service[]; review: Service[] };
  pending: Service | null;
  query: string;
  result: ServiceListResult | null;
  retry: () => void;
  setPending: (service: Service | null) => void;
  setQuery: (value: string) => void;
};

/** `enabled=false` não busca nada: o painel que não cabe na janela nunca consome o BFF. */
export function useServiceListState(enabled = true): ServiceListState {
  const [result, setResult] = useState<ServiceListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
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

  return {
    busy,
    changeStatus,
    error,
    feedback,
    filtered,
    groups,
    pending,
    query,
    result,
    retry: () => {
      setError(null);
      setReload((value) => value + 1);
    },
    setPending,
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
        detail={<ListDetailEmpty>Selecione um serviço para editar</ListDetailEmpty>}
        list={<ServiceListPanelView heading="h1" state={state} />}
        listLabel="Serviços"
      />
    );
  }

  return (
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
      <ServiceListContent state={state} />
    </section>
  );
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
  state,
}: {
  heading: "h1" | "h2";
  openId?: string;
  state: ServiceListState;
}) {
  const { result } = state;
  return (
    <div className="service-panel">
      <div className="service-panel-header">
        <Heading>Serviços</Heading>
        {result?.editable && (
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
  const {
    busy,
    changeStatus,
    error,
    feedback,
    filtered,
    groups,
    pending,
    query,
    result,
    setPending,
    setQuery,
  } = state;
  return (
    <>
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
          onAction={state.retry}
          title="Não foi possível carregar serviços"
        />
      ) : result && result.items.length === 0 ? (
        <DirectoryState
          actionHref={result.editable ? "/servicos/novo" : undefined}
          actionLabel={result.editable ? "Cadastrar primeiro serviço" : undefined}
          description="A IA só oferece serviços ativos com duração e preço ou valor sob consulta."
          title="Cadastre seu primeiro serviço"
        />
      ) : (
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
            <div className="directory-list-meta">
              <strong>Serviços cadastrados</strong>
              <span>{summaryLine(groups)}</span>
            </div>
            {!result?.editable && (
              <p className="service-list-readonly-note">
                Serviços não podem ser editados aqui.
              </p>
            )}
            <ServiceGroup
              editable={Boolean(result?.editable)}
              heading="Precisa de revisão"
              openId={openId}
              services={groups.review}
              tone="warning"
              onToggleActive={setPending}
            />
            <ServiceGroup
              editable={Boolean(result?.editable)}
              heading="Ativos"
              openId={openId}
              services={groups.active}
              onToggleActive={setPending}
            />
            <ServiceGroup
              editable={Boolean(result?.editable)}
              heading="Inativos"
              openId={openId}
              services={groups.inactive}
              onToggleActive={setPending}
            />
            {filtered.length === 0 && (
              <p className="directory-no-results">
                Nenhum serviço corresponde à busca.
              </p>
            )}
          </section>
        </>
      )}
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

function reviewOriginLabel(origin: Service["reviewOrigin"]): string {
  if (origin === "IMPORT") return "importado";
  if (origin === "MANUAL") return "cadastro manual";
  return "origem não informada";
}

function summaryLine(groups: {
  active: Service[];
  inactive: Service[];
  review: Service[];
}): string {
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
  onToggleActive,
  openId,
  services,
  tone,
}: {
  editable: boolean;
  heading: string;
  onToggleActive: (service: Service) => void;
  openId?: string;
  services: Service[];
  tone?: "warning";
}) {
  if (services.length === 0) return null;
  return (
    <div className="service-group">
      <h2 className="service-group-heading" data-tone={tone}>
        {heading}
      </h2>
      <ul className="service-group-list">
        {services.map((service) => (
          <li
            className={clsx("directory-row service-row", service.id === openId && "is-open")}
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
                href={`/servicos/editar?id=${encodeURIComponent(service.id)}`}
              />
            )}
            <span className="service-row-body">
              <strong className="service-row-name">{service.name}</strong>
              <span className="service-row-meta">
                {formatServiceLine(service)}
                {service.needsReview && (
                  <Badge
                    icon="alert"
                    label={`Revisar · ${reviewOriginLabel(service.reviewOrigin)}`}
                    tone="warning"
                  />
                )}
              </span>
            </span>
            <span className="service-row-actions">
              {editable && service.needsReview && (
                <Link
                  aria-label={`Corrigir ${service.name}`}
                  className="btn btn-tertiary service-row-fix"
                  href={`/servicos/editar?id=${encodeURIComponent(service.id)}`}
                >
                  Corrigir
                </Link>
              )}
              {editable ? (
                <button
                  className="btn btn-tertiary"
                  type="button"
                  onClick={() => onToggleActive(service)}
                >
                  {service.active ? "Desativar" : "Ativar"}
                </button>
              ) : (
                <span className="muted small">Somente leitura</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
