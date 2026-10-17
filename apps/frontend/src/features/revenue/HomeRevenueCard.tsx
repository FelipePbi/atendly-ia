"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { RevenueReport } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

import {
  chartBars,
  comparison,
  countLabel,
  formatCompactMoney,
  formatMoney,
} from "./revenueFormat";

type HomePeriod = "day" | "week";

const PERIOD_MEMORY_KEY = "home:revenue:period";

/** A mesma chave da tela de Faturamento: o que uma leu serve à outra. */
function memoryKey(period: HomePeriod): string {
  return `revenue:${period}:hoje`;
}

/**
 * Faturamento no Início (D-180): hoje ou esta semana, num cartão só. O total
 * do período soma o faturado (concluídos) e o previsto (confirmados pela
 * frente), com a barra mostrando quanto já entrou; abaixo, atendimentos
 * concluídos, ticket médio, a comparação com ontem ou a semana anterior e
 * quanto a IA marcou. Na semana, uma coluna por dia com o valor.
 *
 * É complemento do Início: sem esqueleto (a leitura lembrada aparece na hora;
 * sem ela, o cartão entra quando chega) e, se a leitura falhar, não aparece.
 */
export function HomeRevenueCard() {
  const [period, setPeriod] = useState<HomePeriod>(
    () => recall<HomePeriod>(PERIOD_MEMORY_KEY) ?? "day",
  );
  const [reports, setReports] = useState<
    Partial<Record<HomePeriod, RevenueReport>>
  >(() => ({
    day: recall<RevenueReport>(memoryKey("day")),
    week: recall<RevenueReport>(memoryKey("week")),
  }));
  const [arriving] = useState(() => !reports[period]);

  useEffect(() => {
    remember(PERIOD_MEMORY_KEY, period);
    // Dublês de teste do Início podem não ter o serviço de faturamento.
    const { revenue } = getProductServices() as Partial<
      ReturnType<typeof getProductServices>
    >;
    if (!revenue) return;
    const controller = new AbortController();
    revenue
      .get({ period }, controller.signal)
      .then((result) => {
        remember(memoryKey(period), result);
        setReports((current) => ({ ...current, [period]: result }));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [period]);

  // Trocar de aba mantém o período anterior na tela, ocupado, até o novo
  // chegar: o cartão nunca some no meio da troca.
  const other: HomePeriod = period === "day" ? "week" : "day";
  const report = reports[period] ?? reports[other];
  if (!report) return null;
  const pending = !reports[period];

  return (
    <section
      aria-busy={pending || undefined}
      aria-labelledby="home-revenue-title"
      className={clsx("dashboard-card home-revenue", arriving && "is-arriving")}
    >
      <header className="home-revenue-head">
        <h2 id="home-revenue-title">Faturamento</h2>
        <div aria-label="Ver por" className="home-revenue-tabs" role="group">
          {(
            [
              ["day", "Hoje"],
              ["week", "Semana"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={period === value}
              className={clsx(
                "home-revenue-tab",
                period === value && "is-active",
              )}
              key={value}
              onClick={() => setPeriod(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <HomeRevenueBody report={report} />
      <Link className="home-revenue-more" href="/faturamento">
        Ver faturamento completo
        <Icon name="chevron-right" />
      </Link>
    </section>
  );
}

function HomeRevenueBody({ report }: { report: RevenueReport }) {
  const day = report.period === "day";
  const { billed, expected, ai } = report;
  const total = billed.amount + expected.amount;
  const billedShare = total > 0 ? (billed.amount / total) * 100 : 0;
  const appointments = billed.count + expected.count;
  const change = comparison(report);
  const aiTotal = ai.billed.amount + ai.expected.amount;

  return (
    <div className="home-revenue-body">
      <div className="home-revenue-total">
        <span className="home-revenue-amount">{formatMoney(total)}</span>
        <span className="home-revenue-caption">
          {day ? "no total de hoje" : "no total da semana"}
        </span>
      </div>

      {total > 0 && (
        <div aria-hidden="true" className="home-revenue-meter">
          <span
            className="home-revenue-meter-billed"
            style={{ width: `${billedShare}%` }}
          />
          <span
            className="home-revenue-meter-expected"
            style={{ width: `${100 - billedShare}%` }}
          />
        </div>
      )}
      <dl className="home-revenue-split">
        <div>
          <dt>
            <span aria-hidden="true" className="home-revenue-dot" />
            Faturado
          </dt>
          <dd>{formatMoney(billed.amount)}</dd>
        </div>
        <div>
          <dt>
            <span aria-hidden="true" className="home-revenue-dot is-expected" />
            Previsto
          </dt>
          <dd>{formatMoney(expected.amount)}</dd>
        </div>
      </dl>

      <ul className="home-revenue-facts">
        <li>
          {appointments === 0
            ? day
              ? "Nenhum atendimento hoje"
              : "Nenhum atendimento nesta semana"
            : `${billed.count} de ${countLabel(appointments, "atendimento concluído", "atendimentos concluídos")}`}
        </li>
        {billed.averageTicket !== null && (
          <li>Ticket médio de {formatMoney(billed.averageTicket)}</li>
        )}
        {/* No Início, só a variação de verdade: "−100% que ontem" num dia que
            ainda nem começou não informa nada. */}
        {change.kind === "change" && billed.amount > 0 && (
          <li className={clsx("home-revenue-change", `is-${change.direction}`)}>
            {change.text}
          </li>
        )}
        {aiTotal > 0 && (
          <li className="home-revenue-ai">
            <Icon name="spark" />
            {formatMoney(aiTotal)} marcados pela IA
          </li>
        )}
      </ul>

      {!day && <WeekColumns report={report} />}
    </div>
  );
}

/** Segunda a domingo, com o valor de cada dia (faturado mais previsto). */
function WeekColumns({ report }: { report: RevenueReport }) {
  const bars = chartBars(report);
  const max = Math.max(
    ...bars.map((bar) => bar.amount + bar.expectedAmount),
    0,
  );
  return (
    <ol aria-label="Dia a dia da semana" className="home-revenue-week">
      {bars.map((bar) => {
        const value = bar.amount + bar.expectedAmount;
        const height = max > 0 ? Math.max((value / max) * 100, 4) : 0;
        const billedPart = value > 0 ? (bar.amount / value) * 100 : 0;
        const isToday = bar.key === report.today;
        return (
          <li
            aria-label={`${bar.long}: ${formatMoney(bar.amount)} faturado${bar.expectedAmount > 0 ? `, ${formatMoney(bar.expectedAmount)} previsto` : ""}`}
            className={clsx("home-revenue-day", isToday && "is-today")}
            key={bar.key}
          >
            <span aria-hidden="true" className="home-revenue-day-value">
              {value > 0 ? formatCompactMoney(value) : "—"}
            </span>
            <span aria-hidden="true" className="home-revenue-day-track">
              {value > 0 && (
                <span
                  className="home-revenue-day-fill"
                  style={{ height: `${height}%` }}
                >
                  <span
                    className="home-revenue-day-expected"
                    style={{ height: `${100 - billedPart}%` }}
                  />
                </span>
              )}
            </span>
            <span aria-hidden="true" className="home-revenue-day-label">
              {isToday ? "hoje" : bar.short}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
