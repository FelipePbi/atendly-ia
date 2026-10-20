"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ReturnCampaignSummary } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { PushedBar } from "@/shared/layout/PushedBar";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

import { countLabel, moneyLabel, shortDate } from "./returnCopy";
import {
  approvalTitle,
  CAMPAIGN_STATE_LABELS,
  isLive,
  kindLabel,
  localToday,
  progressSegments,
} from "./returnProgress";
import { ReturnProgressBar } from "./ReturnProgressBar";

/**
 * Aprovações do retorno (D-210): cada vez que a profissional aprovou uma
 * lista vira um cartão com o andamento — quantas já saíram, quantas estão na
 * fila, quantas marcaram e o que isso faturou. As em andamento vêm primeiro.
 */
export function ReturnApprovalsScreen() {
  const [campaigns, setCampaigns] = useState<ReturnCampaignSummary[] | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .customerReturn.campaigns(controller.signal)
      .then((value) => {
        setCampaigns(value);
        setError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, [reload]);

  useShellConfig({
    active: "retorno",
    attention: error && !campaigns,
    loading: !campaigns && !error,
    module: "directory",
    pushed: true,
    title: "Aprovações",
  });

  const showLoader = useDeferredLoading(!campaigns && !error);
  const live = campaigns?.filter((item) => isLive(item.state)) ?? [];
  const closed = campaigns?.filter((item) => !isLive(item.state)) ?? [];

  return (
    <div className="page return-page">
      <PushedBar
        backHref="/retorno"
        backLabel="Voltar para o retorno"
        title="Aprovações"
      />
      <div className="return-content">
        {!campaigns && !error && showLoader && (
          <BrandLoader inline label="Carregando as aprovações" />
        )}
        {!campaigns && error && (
          <StatePanel
            actionLabel="Tentar novamente"
            description="Não foi possível carregar as aprovações."
            icon="alert"
            onAction={() => setReload((value) => value + 1)}
            title="Aprovações indisponíveis"
            tone="error"
          />
        )}
        {campaigns && campaigns.length === 0 && (
          <StatePanel
            actionHref="/retorno/chamar"
            actionLabel="Chamar clientes"
            description="Quando você aprovar uma lista de clientes, o andamento de cada mensagem aparece aqui."
            icon="nav-list"
            title="Nenhuma aprovação ainda"
          />
        )}
        {live.length > 0 && (
          <ApprovalGroup campaigns={live} title="Em andamento" />
        )}
        {closed.length > 0 && (
          <ApprovalGroup campaigns={closed} title="Encerradas" />
        )}
      </div>
    </div>
  );
}

function ApprovalGroup({
  campaigns,
  title,
}: {
  campaigns: ReturnCampaignSummary[];
  title: string;
}) {
  return (
    <section className="return-approval-group">
      <h2 className="return-section-title">{title}</h2>
      <ul className="return-approval-list">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <ApprovalCard campaign={campaign} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApprovalCard({ campaign }: { campaign: ReturnCampaignSummary }) {
  const { counts } = campaign;
  const summary = [
    `${counts.sent} de ${counts.total} enviadas`,
    counts.queued > 0 ? `${counts.queued} na fila` : null,
    counts.booked > 0
      ? countLabel(counts.booked, "agendou", "agendaram")
      : null,
    counts.revenue > 0 ? `${moneyLabel(counts.revenue)} faturados` : null,
  ].filter(Boolean);
  return (
    <Link
      className="return-approval"
      href={`/retorno/aprovacoes/detalhes?id=${encodeURIComponent(campaign.id)}`}
    >
      <span className="return-approval-head">
        <span className="return-approval-kind">{kindLabel(campaign.kind)}</span>
        <span
          className={clsx(
            "return-campaign-state",
            `is-${campaign.state.toLowerCase()}`,
          )}
        >
          {CAMPAIGN_STATE_LABELS[campaign.state]}
        </span>
      </span>
      <span className="return-approval-title">{approvalTitle(campaign)}</span>
      <span className="return-approval-meta">
        Aprovada em {shortDate(localToday(new Date(campaign.createdAt)))} ·{" "}
        {countLabel(counts.total, "cliente", "clientes")}
      </span>
      <ReturnProgressBar decorative segments={progressSegments(counts)} />
      <span className="return-approval-summary">
        {summary.join(" · ")}
        <Icon name="chevron-right" />
      </span>
    </Link>
  );
}
