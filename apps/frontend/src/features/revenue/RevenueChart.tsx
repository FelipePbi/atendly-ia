"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";

import type { RevenuePeriod } from "@/data";

import {
  bestBar,
  type ChartBar,
  countLabel,
  formatCompactMoney,
  formatMoney,
} from "./revenueFormat";

/**
 * Barras do Faturamento (D-177), em HTML e CSS, sem biblioteca de gráfico:
 * cada barra é um botão que abre o período dela (mês no ano, dia no mês e na
 * semana). Toda coluna tem o valor escrito em cima, em formato curto, e todo
 * dia tem o rótulo embaixo (pedido de 2026-10-17: antes só o maior tinha
 * valor). No mês, com 31 colunas, o valor fica na vertical e, no celular, o
 * gráfico rola de lado dentro do cartão. O melhor período ganha a cor cheia;
 * o previsto entra claro, em cima do faturado. A parte do faturado que a IA marcou fica
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
      <div className="revenue-chart-scroll">
        <div
          aria-label={caption}
          className={clsx("revenue-bars", dense && "is-dense")}
          data-count={bars.length}
          role="group"
        >
          {bars.map((bar) => {
            const total = bar.amount + bar.expectedAmount;
            const height = max > 0 ? (total / max) * 100 : 0;
            const billedPart = total > 0 ? (bar.amount / total) * 100 : 0;
            const fill = Math.max(height, total > 0 ? 2 : 0);
            const isBest = best?.key === bar.key;
            return (
              <button
                aria-label={barLabel(bar, isBest, period)}
                className={clsx("revenue-bar", isBest && "is-best")}
                key={bar.key}
                onClick={() => onOpen(bar.drill)}
                title={`${bar.long}: ${formatMoney(bar.amount)}${bar.expectedAmount > 0 ? ` + ${formatMoney(bar.expectedAmount)} previsto` : ""}`}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="revenue-bar-track"
                  style={{ "--fill": `${fill}%` } as CSSProperties}
                >
                  {total > 0 && (
                    <span
                      className={clsx(
                        "revenue-bar-value",
                        bar.amount <= 0 && "is-expected",
                      )}
                    >
                      {formatCompactMoney(bar.amount > 0 ? bar.amount : total)}
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
                <span aria-hidden="true" className="revenue-bar-label">
                  {bar.short}
                </span>
              </button>
            );
          })}
        </div>
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
