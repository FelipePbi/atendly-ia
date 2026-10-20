"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import {
  BffHttpError,
  type ReturnCampaignDetail,
  type ReturnTarget,
} from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { Dialog } from "@/shared/ui/Dialog";
import { StatePanel } from "@/shared/ui/States";
import { showToast } from "@/shared/ui/toastBus";

import { countLabel, shortDate } from "./returnCopy";
import {
  approvalTitle,
  CAMPAIGN_STATE_LABELS,
  groupCounts,
  groupInfo,
  groupOf,
  isLive,
  kindLabel,
  localToday,
  PROGRESS_GROUPS,
  type ProgressGroup,
  progressSegments,
  timelineLabel,
  valueDetail,
} from "./returnProgress";
import { ReturnProgressBar } from "./ReturnProgressBar";

type Filter = ProgressGroup | "all";
type CampaignAction = "pause" | "resume" | "cancel";

/**
 * O andamento de uma aprovação (D-210): quantas já saíram, quantas estão na
 * fila e quando saem, quem respondeu, quem marcou (com o dia e o valor),
 * quem ignorou, quem recusou e quem nem recebeu, com o motivo. Daqui a
 * profissional pausa, retoma, cancela o que falta ou tira alguém da fila.
 */
export function ReturnApprovalScreen({ id }: { id: string | undefined }) {
  const [detail, setDetail] = useState<ReturnCampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getProductServices()
      .customerReturn.campaign(id, controller.signal)
      .then((value) => {
        setDetail(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof BffHttpError && caught.status === 404
            ? "Essa aprovação não existe mais."
            : "Não foi possível carregar a aprovação.",
        );
      });
    return () => controller.abort();
  }, [id, reload]);

  const missing = !id ? "Escolha uma aprovação na lista." : null;
  const failure = missing ?? error;
  useShellConfig({
    active: "retorno",
    attention: Boolean(failure && !detail),
    loading: !detail && !failure,
    module: "directory",
    pushed: true,
    title: "Aprovação",
  });

  const showLoader = useDeferredLoading(!detail && !failure);
  const today = localToday();
  const byGroup = useMemo(
    () => (detail ? groupCounts(detail.counts) : null),
    [detail],
  );
  const visible = useMemo(
    () =>
      detail?.targets.filter(
        (target) => filter === "all" || groupOf(target.outcome) === filter,
      ) ?? [],
    [detail, filter],
  );

  async function change(action: CampaignAction) {
    if (!detail) return;
    setBusy(true);
    try {
      const next = await getProductServices().customerReturn.changeCampaign(
        detail.id,
        action,
      );
      setDetail(next);
      setConfirmCancel(false);
      showToast(
        action === "pause"
          ? "Envios pausados: nada sai até você retomar."
          : action === "resume"
            ? "Envios retomados."
            : "Envios cancelados: quem não recebeu saiu da fila.",
      );
    } catch {
      showToast("Não foi possível mudar os envios. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function skip(target: ReturnTarget) {
    if (!detail) return;
    setBusy(true);
    try {
      const next = await getProductServices().customerReturn.skipTarget(
        detail.id,
        target.id,
      );
      setDetail(next);
      showToast(
        `${firstName(target.customerName) ?? "A cliente"} saiu da fila.`,
      );
    } catch {
      showToast("Não foi possível tirar da fila. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  const closeConfirm = useCallback(() => {
    if (!busy) setConfirmCancel(false);
  }, [busy]);

  return (
    <div className="page return-page">
      <PushedBar
        backHref="/retorno/aprovacoes"
        backLabel="Voltar para as aprovações"
        title="Aprovação"
      />
      <div className="return-content">
        {!detail && !failure && showLoader && (
          <BrandLoader inline label="Carregando a aprovação" />
        )}
        {!detail && failure && (
          <StatePanel
            actionHref={
              missing || error?.startsWith("Essa")
                ? "/retorno/aprovacoes"
                : undefined
            }
            actionLabel={
              missing || error?.startsWith("Essa")
                ? "Ver aprovações"
                : "Tentar novamente"
            }
            description={failure}
            icon="alert"
            onAction={() => setReload((value) => value + 1)}
            title="Aprovação indisponível"
            tone="error"
          />
        )}
        {detail && byGroup && (
          <>
            <section
              aria-labelledby="return-approval-title"
              className="return-card return-approval-summary-card"
            >
              <header className="return-approval-header">
                <div className="return-approval-head">
                  <span className="return-approval-kind">
                    {kindLabel(detail.kind)}
                  </span>
                  <span
                    className={clsx(
                      "return-campaign-state",
                      `is-${detail.state.toLowerCase()}`,
                    )}
                  >
                    {CAMPAIGN_STATE_LABELS[detail.state]}
                  </span>
                </div>
                <h1 className="return-card-title" id="return-approval-title">
                  {approvalTitle(detail)}
                </h1>
              </header>
              <p className="return-card-note">
                Aprovada em {shortDate(localToday(new Date(detail.createdAt)))}{" "}
                · {countLabel(detail.counts.total, "cliente", "clientes")} · até{" "}
                {detail.dailyLimit} por dia
                {detail.incentive ? ` · “${detail.incentive}”` : ""}
              </p>
              <p className="return-approval-progress">
                <strong>{detail.counts.sent}</strong> de {detail.counts.total}{" "}
                enviadas
                {detail.counts.queued > 0
                  ? ` · ${detail.counts.queued} na fila`
                  : ""}
              </p>
              <ReturnProgressBar
                decorative
                segments={progressSegments(detail.counts)}
              />
              {valueDetail(detail.counts) && (
                <p className="return-approval-value">
                  {valueDetail(detail.counts)}
                </p>
              )}
              {isLive(detail.state) && (
                <div className="return-approval-actions">
                  {detail.state === "ACTIVE" ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => void change("pause")}
                      type="button"
                    >
                      Pausar envios
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void change("resume")}
                      type="button"
                    >
                      Retomar envios
                    </button>
                  )}
                  {detail.counts.queued > 0 && (
                    <button
                      className="btn btn-tertiary return-danger-link"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                      type="button"
                    >
                      Cancelar o que falta
                    </button>
                  )}
                </div>
              )}
            </section>

            <section aria-labelledby={listId} className="return-clients">
              <h2 className="return-section-title" id={listId}>
                Clientes
              </h2>
              <div aria-label="Mostrar" className="return-filters" role="group">
                <FilterChip
                  active={filter === "all"}
                  count={detail.counts.total}
                  label="Todas"
                  onSelect={() => setFilter("all")}
                />
                {PROGRESS_GROUPS.filter((group) => byGroup[group.key] > 0).map(
                  (group) => (
                    <FilterChip
                      active={filter === group.key}
                      count={byGroup[group.key]}
                      group={group.key}
                      key={group.key}
                      label={group.label}
                      onSelect={() => setFilter(group.key)}
                    />
                  ),
                )}
              </div>
              {visible.length === 0 ? (
                <p className="return-empty">Ninguém nessa situação agora.</p>
              ) : (
                <ul className="return-target-list">
                  {visible.map((target) => (
                    <TargetRow
                      busy={busy}
                      campaignState={detail.state}
                      key={target.id}
                      onSkip={() => void skip(target)}
                      target={target}
                      today={today}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <Dialog
        onClose={closeConfirm}
        open={confirmCancel && detail !== null}
        title="Cancelar o que falta?"
      >
        {detail && (
          <div className="return-fit">
            <p>
              {countLabel(
                detail.counts.queued,
                "cliente ainda na fila não vai receber",
                "clientes ainda na fila não vão receber",
              )}
              . Quem já recebeu continua a conversa com a IA.
            </p>
            <div className="return-fit-actions">
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void change("cancel")}
                type="button"
              >
                Cancelar envios
              </button>
              <button
                className="btn btn-tertiary"
                disabled={busy}
                onClick={() => setConfirmCancel(false)}
                type="button"
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/u)[0];
  return first || null;
}

function FilterChip({
  active,
  count,
  group,
  label,
  onSelect,
}: {
  active: boolean;
  count: number;
  group?: ProgressGroup;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={clsx("return-filter-chip", active && "is-active")}
      onClick={onSelect}
      type="button"
    >
      {group && (
        <span
          aria-hidden="true"
          className={`return-legend-swatch is-${group}`}
        />
      )}
      {label}
      <span className="return-filter-count">{count}</span>
    </button>
  );
}

function TargetRow({
  busy,
  campaignState,
  onSkip,
  target,
  today,
}: {
  busy: boolean;
  campaignState: ReturnCampaignDetail["state"];
  onSkip: () => void;
  target: ReturnTarget;
  today: string;
}) {
  // Progressive disclosure: a linha diz quem, a situação e quando; a
  // mensagem que saiu e as ações abrem no toque.
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const group = groupOf(target.outcome);
  const badge =
    target.outcome === "STOPPED" ? "Pediu para parar" : groupInfo(group).badge;
  const canSkip = target.outcome === "QUEUED" && isLive(campaignState);
  const name = target.customerName?.trim() || "Cliente sem nome";
  return (
    <li className={clsx("return-target", open && "is-open")}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="return-target-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="return-target-head">
          <span className="return-target-name">{name}</span>
          <span className={`return-target-badge is-${group}`}>
            <span
              aria-hidden="true"
              className={`return-legend-swatch is-${group}`}
            />
            {badge}
          </span>
        </span>
        <span className="return-target-when">
          {timelineLabel(target, campaignState, today)}
        </span>
        <Icon className="return-target-chevron" name="chevron-down" />
      </button>
      {open && (
        <div className="return-target-panel" id={panelId}>
          {target.serviceName && (
            <p className="return-target-service">{target.serviceName}</p>
          )}
          {target.messageBody ? (
            <div className="return-message-bubble">{target.messageBody}</div>
          ) : (
            <p className="return-target-service">
              {target.outcome === "QUEUED" || target.outcome === "SENDING"
                ? "A mensagem é escrita na hora do envio, com o nome dela."
                : "Nenhuma mensagem saiu para ela."}
            </p>
          )}
          <div className="return-target-actions">
            <Link
              className="return-card-link"
              href={`/clientes/detalhes?id=${encodeURIComponent(target.customerId)}`}
            >
              Ver cliente
              <Icon name="chevron-right" />
            </Link>
            {canSkip && (
              <button
                className="return-link-button return-danger-link"
                disabled={busy}
                onClick={onSkip}
                type="button"
              >
                Tirar da fila
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
