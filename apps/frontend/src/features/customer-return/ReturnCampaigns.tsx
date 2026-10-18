"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import type { ReturnCampaignDetail, ReturnCampaignSummary } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Dialog } from "@/shared/ui/Dialog";
import { showToast } from "@/shared/ui/toastBus";

import {
  CAMPAIGN_STATE_LABELS,
  countLabel,
  moneyLabel,
  shortDate,
  targetStateLabel,
} from "./returnCopy";

type CampaignAction = "pause" | "resume" | "cancel";

/**
 * Rodadas aprovadas (D-206): enviadas, na fila, respondidas, agendadas e o
 * faturamento do que já foi atendido. A profissional pausa, retoma, cancela
 * o que falta ou tira uma cliente da fila.
 */
export function ReturnCampaigns({ version }: { version: number }) {
  const headingId = useId();
  const [campaigns, setCampaigns] = useState<ReturnCampaignSummary[] | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeDialog = useCallback(() => setOpenId(null), []);
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customerReturn.campaigns(controller.signal)
      .then((value) => {
        setCampaigns(value);
        setFailed(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [version, reload]);

  if (failed && !campaigns) {
    return (
      <section aria-labelledby={headingId} className="return-campaigns">
        <h2 className="return-section-title" id={headingId}>
          Rodadas
        </h2>
        <p className="return-empty" role="alert">
          Não foi possível carregar as rodadas.{" "}
          <button
            className="return-link-button"
            onClick={() => setReload((value) => value + 1)}
            type="button"
          >
            Tentar novamente
          </button>
        </p>
      </section>
    );
  }
  if (!campaigns || campaigns.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="return-campaigns">
      <h2 className="return-section-title" id={headingId}>
        Rodadas
      </h2>
      <ul className="return-campaign-list">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <CampaignCard
              campaign={campaign}
              onOpen={() => setOpenId(campaign.id)}
            />
          </li>
        ))}
      </ul>
      <CampaignDialog id={openId} onChanged={refresh} onClose={closeDialog} />
    </section>
  );
}

function campaignTitle(campaign: ReturnCampaignSummary): string {
  if (campaign.kind === "RENEWAL") {
    return campaign.weekStart
      ? `Renovação · semana de ${shortDate(campaign.weekStart)}`
      : "Renovação";
  }
  return campaign.winbackDays
    ? `Resgate · ${campaign.winbackDays} dias ou mais`
    : "Resgate";
}

function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: ReturnCampaignSummary;
  onOpen: () => void;
}) {
  const { counts } = campaign;
  return (
    <article className="return-campaign">
      <div className="return-campaign-head">
        <strong>{campaignTitle(campaign)}</strong>
        <span
          className={clsx(
            "return-campaign-state",
            `is-${campaign.state.toLowerCase()}`,
          )}
        >
          {CAMPAIGN_STATE_LABELS[campaign.state]}
        </span>
      </div>
      <p className="return-campaign-meta">
        Aprovada em {shortDate(campaign.createdAt.slice(0, 10))} ·{" "}
        {countLabel(counts.total, "cliente", "clientes")} · até{" "}
        {campaign.dailyLimit} por dia
        {campaign.incentive ? ` · “${campaign.incentive}”` : ""}
      </p>
      <dl className="return-campaign-numbers">
        <div>
          <dt>Enviadas</dt>
          <dd>{counts.sent}</dd>
        </div>
        <div>
          <dt>Na fila</dt>
          <dd>{counts.queued}</dd>
        </div>
        <div>
          <dt>Responderam</dt>
          <dd>{counts.replied}</dd>
        </div>
        <div>
          <dt>Agendaram</dt>
          <dd>{counts.booked}</dd>
        </div>
      </dl>
      {counts.revenue > 0 && (
        <p className="return-campaign-revenue">
          {moneyLabel(counts.revenue)} faturados com quem voltou
        </p>
      )}
      <button
        className="btn btn-secondary return-campaign-open"
        onClick={onOpen}
        type="button"
      >
        Ver clientes e opções
      </button>
    </article>
  );
}

function CampaignDialog({
  id,
  onChanged,
  onClose,
}: {
  id: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  // Tudo guardado com a rodada a que pertence: abrir outra não mostra a
  // anterior enquanto a leitura nova não chega.
  const [loaded, setLoaded] = useState<ReturnCampaignDetail | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const detail = loaded && loaded.id === id ? loaded : null;
  const failed = failedId !== null && failedId === id;
  const confirmCancel = confirmFor !== null && confirmFor === id;
  const setDetail = setLoaded;
  const setConfirmCancel = (value: boolean) => setConfirmFor(value ? id : null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    getProductServices()
      .customerReturn.campaign(id, controller.signal)
      .then(setLoaded)
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailedId(id);
      });
    return () => controller.abort();
  }, [id]);

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
          ? "Rodada pausada: nada sai até você retomar."
          : action === "resume"
            ? "Rodada retomada."
            : "Rodada cancelada: quem não recebeu saiu da fila.",
      );
      onChanged();
    } catch {
      showToast("Não foi possível mudar a rodada. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  async function skip(targetId: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const next = await getProductServices().customerReturn.skipTarget(
        detail.id,
        targetId,
      );
      setDetail(next);
      showToast("Cliente tirada da rodada.");
      onChanged();
    } catch {
      showToast("Não foi possível tirar da rodada. Tente de novo.", "danger");
    } finally {
      setBusy(false);
    }
  }

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const live = detail?.state === "ACTIVE" || detail?.state === "PAUSED";
  return (
    <Dialog
      onClose={close}
      open={id !== null}
      title={detail ? campaignTitle(detail) : "Rodada"}
    >
      <div className="return-campaign-detail">
        {!detail && !failed && (
          <p className="return-empty" role="status">
            Carregando a rodada
          </p>
        )}
        {failed && (
          <p className="return-empty" role="alert">
            Não foi possível carregar a rodada.
          </p>
        )}
        {detail && (
          <>
            <p className="return-campaign-meta">
              {CAMPAIGN_STATE_LABELS[detail.state]} ·{" "}
              {countLabel(detail.counts.sent, "enviada", "enviadas")} de{" "}
              {detail.counts.total}
            </p>
            <ul className="return-target-list">
              {detail.targets.map((target) => (
                <li className="return-target" key={target.id}>
                  <div className="return-target-copy">
                    <Link
                      className="return-target-name"
                      href={`/clientes/detalhes?id=${encodeURIComponent(target.customerId)}`}
                    >
                      {target.customerName?.trim() || "Cliente sem nome"}
                    </Link>
                    <span className="return-target-state">
                      {targetStateLabel(target)}
                    </span>
                  </div>
                  {target.state === "QUEUED" && live && (
                    <button
                      className="return-link-button"
                      disabled={busy}
                      onClick={() => void skip(target.id)}
                      type="button"
                    >
                      Tirar da rodada
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {live && !confirmCancel && (
              <div className="return-editor-actions">
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
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => setConfirmCancel(true)}
                    type="button"
                  >
                    Cancelar o que falta
                  </button>
                )}
              </div>
            )}
            {live && confirmCancel && (
              <div className="return-confirm" role="group">
                <p>
                  {countLabel(
                    detail.counts.queued,
                    "cliente ainda na fila não vai receber",
                    "clientes ainda na fila não vão receber",
                  )}
                  . Quem já recebeu continua com a conversa.
                </p>
                <div className="return-editor-actions">
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                    type="button"
                  >
                    Voltar
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => void change("cancel")}
                    type="button"
                  >
                    Cancelar rodada
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
