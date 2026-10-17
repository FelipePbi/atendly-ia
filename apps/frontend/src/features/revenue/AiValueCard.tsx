"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import type { RevenueReport } from "@/data";
import { Icon } from "@/shared/icons/Icon";

import { aiValueView } from "./aiValue";

/**
 * "O que a IA fez por você" (D-178), no topo do Faturamento: quanto do
 * faturado veio de atendimentos que a IA marcou, os clientes novos que
 * chegaram por ela, o que ela marcou fora do horário e o que ela remarcou.
 * Para quem está sem a IA, o mesmo lugar diz quantas mensagens chegaram fora
 * do horário — um convite, sem número inventado.
 */
export function AiValueCard({
  aiOff,
  report,
}: {
  aiOff: boolean;
  report: RevenueReport;
}) {
  const view = aiValueView(report, aiOff);
  if (view.kind === "none") return null;

  if (view.kind === "invite") {
    return (
      <section
        aria-labelledby="revenue-ai-invite"
        className="card revenue-ai is-invite"
      >
        <span aria-hidden="true" className="revenue-ai-icon">
          <Icon name="spark" />
        </span>
        <div className="revenue-ai-copy">
          <h2 className="revenue-ai-headline" id="revenue-ai-invite">
            {view.headline}
          </h2>
          <p className="revenue-ai-detail">{view.detail}</p>
        </div>
        <Link
          className="btn btn-primary revenue-ai-action"
          href="/configuracoes/ia"
        >
          Ligar a IA
        </Link>
      </section>
    );
  }

  const share = view.share;
  return (
    <section aria-labelledby="revenue-ai-title" className="card revenue-ai">
      <header className="revenue-ai-head">
        <span aria-hidden="true" className="revenue-ai-icon">
          <Icon name="spark" />
        </span>
        <div className="revenue-ai-copy">
          <p className="revenue-eyebrow" id="revenue-ai-title">
            O que a IA fez por você
          </p>
          <h2 className="revenue-ai-headline">{view.headline}</h2>
          {view.expected && (
            <p className="revenue-ai-detail">{view.expected}</p>
          )}
        </div>
        {share !== null && (
          <p className="revenue-ai-share">
            <span className="revenue-ai-share-value">
              {Math.round(share * 100)}%
            </span>
            <span className="revenue-ai-share-label">do faturado</span>
          </p>
        )}
      </header>
      {share !== null && (
        <div
          aria-hidden="true"
          className="revenue-ai-meter"
          style={{ "--share": `${Math.max(share * 100, 2)}%` } as CSSProperties}
        >
          <span className="revenue-ai-meter-fill" />
        </div>
      )}
      {view.highlights.length > 0 && (
        <ul className="revenue-ai-highlights">
          {view.highlights.map((highlight) => (
            <li className="revenue-ai-highlight" key={highlight.key}>
              <span className="revenue-ai-highlight-value">
                {highlight.value}
              </span>
              <span className="revenue-ai-highlight-label">
                {highlight.label}
              </span>
              {highlight.detail && (
                <span className="revenue-ai-highlight-detail">
                  {highlight.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.since && <p className="revenue-ai-since">{view.since}</p>}
    </section>
  );
}
