"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

import type { RevenuePeriod } from "@/data";

import {
  bestBar,
  type ChartBar,
  countLabel,
  formatMoney,
} from "./revenueFormat";

/**
 * Barras do Faturamento (D-177), em HTML e CSS, sem biblioteca de gráfico:
 * cada barra é um botão que abre o período dela (mês no ano, dia no mês e na
 * semana). O melhor período ganha a cor cheia e o valor por cima; o previsto
 * entra claro, em cima do faturado. A parte do faturado que a IA marcou fica
 * na base da barra, em tom mais escuro (D-178). Para leitor de tela, cada
 * barra diz o período, o faturado, a parte da IA, os atendimentos e o
 * previsto.
 */
export function RevenueChart({
  bars,
  caption,
  onOpen,
  period,
}: {
  bars: ChartBar[];
  caption: string;
  onOpen: (target: { period: RevenuePeriod; date: string }) => void;
  period: RevenuePeriod;
}) {
  const max = Math.max(
    ...bars.map((bar) => bar.amount + bar.expectedAmount),
    0,
  );
  const best = bestBar(bars);
  const hasExpected = bars.some((bar) => bar.expectedAmount > 0);
  const hasAi = bars.some((bar) => bar.aiAmount > 0);
  const dense = bars.length > 12;

  return (
    <div className="revenue-chart">
      <div
        aria-label={caption}
        className={clsx("revenue-bars", dense && "is-dense")}
        data-count={bars.length}
        role="group"
      >
        {bars.map((bar, index) => {
          const total = bar.amount + bar.expectedAmount;
          const height = max > 0 ? (total / max) * 100 : 0;
          const billedPart = total > 0 ? (bar.amount / total) * 100 : 0;
          const fill = Math.max(height, total > 0 ? 2 : 0);
          const isBest = best?.key === bar.key;
          const showLabel = !dense || index === 0 || (index + 1) % 5 === 0;
          return (
            <button
              aria-label={barLabel(bar, isBest, period)}
              className={clsx(
                "revenue-bar",
                isBest && "is-best",
                // O valor do melhor fica dentro do cartão nas pontas.
                index < 2 && "is-start",
                index > bars.length - 3 && "is-end",
              )}
              key={bar.key}
              onClick={() => onOpen(bar.drill)}
              title={`${bar.long}: ${formatMoney(bar.amount)}`}
              type="button"
            >
              <span
                aria-hidden="true"
                className="revenue-bar-track"
                style={{ "--fill": `${fill}%` } as CSSProperties}
              >
                {isBest && (
                  <span className="revenue-bar-value">
                    {formatMoney(bar.amount)}
                  </span>
                )}
                <span
                  className="revenue-bar-fill"
                  style={{ height: `${fill}%` }}
                >
                  {bar.expectedAmount > 0 && (
                    <span
                      className="revenue-bar-expected"
                      style={{ height: `${100 - billedPart}%` }}
                    />
                  )}
                  {bar.aiAmount > 0 && (
                    <span
                      className="revenue-bar-ai"
                      style={{ height: `${(bar.aiAmount / total) * 100}%` }}
                    />
                  )}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={clsx("revenue-bar-label", !showLabel && "is-hidden")}
              >
                {bar.short}
              </span>
            </button>
          );
        })}
      </div>
      {(hasExpected || hasAi) && (
        <p aria-hidden="true" className="revenue-legend">
          <span className="revenue-legend-item">
            <span className="revenue-legend-swatch" /> Faturado
          </span>
          {hasAi && (
            <span className="revenue-legend-item">
              <span className="revenue-legend-swatch is-ai" /> Marcado pela IA
            </span>
          )}
          {hasExpected && (
            <span className="revenue-legend-item">
              <span className="revenue-legend-swatch is-expected" /> Previsto
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function barLabel(bar: ChartBar, isBest: boolean, period: RevenuePeriod) {
  const parts = [
    `${bar.long}${isBest ? (period === "year" ? ", melhor mês" : ", melhor dia") : ""}`,
    `${formatMoney(bar.amount)} faturado`,
    countLabel(bar.count, "atendimento", "atendimentos"),
  ];
  if (bar.aiAmount > 0) {
    parts.splice(2, 0, `${formatMoney(bar.aiAmount)} marcado pela IA`);
  }
  if (bar.expectedAmount > 0) {
    parts.push(`${formatMoney(bar.expectedAmount)} previsto`);
  }
  return `${parts.join(", ")}. Abrir ${period === "year" ? "o mês" : "o dia"}`;
}
