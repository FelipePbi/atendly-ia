"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BffHttpError, type RevenuePeriod, type RevenueReport } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";
import { useOptionalSystemStatus } from "@/shared/runtime/systemStatus";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

import { AiValueCard } from "./AiValueCard";
import { RevenueChart } from "./RevenueChart";
import {
  adjacentPeriodDate,
  bestBar,
  chartBars,
  comparison,
  countLabel,
  formatMoney,
  isCurrentPeriod,
  PERIOD_OPTIONS,
  periodTitle,
  rangeLabel,
  shareLabels,
  strongestWeekday,
  WEEK_ORDER,
  weekdayName,
  weekdayShort,
} from "./revenueFormat";

type View = { period: RevenuePeriod; date?: string };

const VIEW_MEMORY_KEY = "revenue:view";

function memoryKey(view: View): string {
  return `revenue:${view.period}:${view.date ?? "hoje"}`;
}

/**
 * Faturamento (D-177): quanto a profissional atendeu no dia, na semana, no
 * mês ou no ano, e de onde vem a receita. Os totais chegam somados do
 * servidor. Sem esqueleto (D-168): a última leitura da aba aparece na hora;
 * sem ela, a área fica vazia e o "A" animado só aparece se a leitura passar
 * de ~150 ms. Trocar de período mantém o anterior na tela até o novo chegar.
 */
export function RevenueScreen() {
  const [view, setView] = useState<View>(
    () => recall<View>(VIEW_MEMORY_KEY) ?? { period: "month" },
  );
  const [report, setReport] = useState<RevenueReport | null>(
    () => recall<RevenueReport>(memoryKey(view)) ?? null,
  );
  const [arriving] = useState(() => !report);
  const [pending, setPending] = useState(!report);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const aiOff = useOptionalSystemStatus()?.aiView === "off";

  // Trocar de período mostra na hora o que a aba já leu dele; o resto fica na
  // tela até a leitura nova chegar.
  const go = (next: View) => {
    const remembered = recall<RevenueReport>(memoryKey(next));
    if (remembered) setReport(remembered);
    setPending(true);
    setView(next);
  };
  const retry = () => {
    setPending(true);
    setReload((value) => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();
    remember(VIEW_MEMORY_KEY, view);
    getProductServices()
      .revenue.get(view, controller.signal)
      .then((result) => {
        remember(memoryKey(view), result);
        setReport(result);
        setError(null);
        setPending(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPending(false);
        setError(
          caught instanceof BffHttpError
            ? caught.message
            : "Não foi possível carregar o faturamento.",
        );
      });
    return () => controller.abort();
  }, [view, reload]);

  useShellConfig({
    active: "faturamento",
    attention: Boolean(error && !report),
    loading: !report && !error,
    title: "Faturamento",
  });

  const showLoader = useDeferredLoading(!report && !error);
  if (!report && !error) {
    return showLoader ? (
      <BrandLoader inline label="Carregando o faturamento" />
    ) : null;
  }

  if (!report) {
    return (
      <div className="revenue-page">
        <RevenueHeader />
        <StatePanel
          actionLabel="Tentar novamente"
          description={error ?? "Tente novamente em instantes."}
          icon="alert"
          onAction={retry}
          title="Não foi possível carregar o faturamento"
          tone="error"
        />
      </div>
    );
  }

  return (
    <div
      aria-busy={pending}
      className={clsx("revenue-page", arriving && "is-arriving")}
    >
      <RevenueHeader />
      <PeriodControls
        onChange={(period) =>
          go(
            isCurrentPeriod(report)
              ? { period }
              : { period, date: report.start },
          )
        }
        onStep={(direction) =>
          go({
            period: report.period,
            date: adjacentPeriodDate(report.period, report.start, direction),
          })
        }
        onToday={() => go({ period: report.period })}
        report={report}
      />
      {error && (
        <div className="revenue-inline-error" role="alert">
          <span>Não foi possível atualizar. {error}</span>
          <button className="btn btn-secondary" onClick={retry} type="button">
            Tentar novamente
          </button>
        </div>
      )}
      <AiValueCard aiOff={aiOff} report={report} />
      <RevenueBody onOpen={go} report={report} />
    </div>
  );
}

function RevenueHeader() {
  return (
    <header className="revenue-header">
      <h1>Faturamento</h1>
      <p>Quanto você atendeu e de onde vem a sua receita.</p>
    </header>
  );
}

function PeriodControls({
  onChange,
  onStep,
  onToday,
  report,
}: {
  onChange: (period: RevenuePeriod) => void;
  onStep: (direction: -1 | 1) => void;
  onToday: () => void;
  report: RevenueReport;
}) {
  const current = isCurrentPeriod(report);
  return (
    <section aria-label="Período" className="revenue-controls">
      <div className="revenue-period-tabs" role="group" aria-label="Ver por">
        {PERIOD_OPTIONS.map((option) => (
          <button
            aria-pressed={option.value === report.period}
            className={clsx(
              "revenue-period-tab",
              option.value === report.period && "is-active",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="revenue-period-nav">
        <button
          aria-label={STEP_LABELS[report.period][0]}
          className="icon-btn"
          onClick={() => onStep(-1)}
          type="button"
        >
          <Icon name="chevron-left" />
        </button>
        <h2 aria-live="polite" className="revenue-period-title">
          {periodTitle(report)}
        </h2>
        <button
          aria-label={STEP_LABELS[report.period][1]}
          className="icon-btn"
          onClick={() => onStep(1)}
          type="button"
        >
          <Icon name="chevron-right" />
        </button>
        {!current && (
          <button className="revenue-today" onClick={onToday} type="button">
            {todayLabel(report.period)}
          </button>
        )}
      </div>
    </section>
  );
}

const STEP_LABELS: Record<RevenuePeriod, [string, string]> = {
  day: ["Dia anterior", "Próximo dia"],
  week: ["Semana anterior", "Próxima semana"],
  month: ["Mês anterior", "Próximo mês"],
  year: ["Ano anterior", "Próximo ano"],
};

function capitalizeFirst(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function todayLabel(period: RevenuePeriod): string {
  if (period === "day") return "Hoje";
  if (period === "week") return "Esta semana";
  if (period === "month") return "Este mês";
  return "Este ano";
}

function RevenueBody({
  onOpen,
  report,
}: {
  onOpen: (target: View) => void;
  report: RevenueReport;
}) {
  const nothing =
    report.billed.count === 0 &&
    report.expected.count === 0 &&
    report.lost.cancelledCount === 0 &&
    report.lost.noShowCount === 0;
  if (nothing) {
    return (
      <StatePanel
        description={
          report.today < report.start
            ? "Ainda não há atendimentos confirmados neste período."
            : "Quando você concluir atendimentos, o valor de cada um aparece aqui, somado por dia, semana, mês e ano."
        }
        icon="calendar"
        title="Nenhum atendimento neste período"
      />
    );
  }
  const bars = chartBars(report);
  return (
    <div className="revenue-body">
      <div className="revenue-main">
        <SummaryCard report={report} />
        {bars.length > 0 && (
          <ChartCard bars={bars} onOpen={onOpen} report={report} />
        )}
        <ServicesCard report={report} />
      </div>
      <div className="revenue-side">
        <CustomersCard report={report} />
        <WeekdayCard report={report} />
        <LostCard report={report} />
      </div>
    </div>
  );
}

function SummaryCard({ report }: { report: RevenueReport }) {
  const change = comparison(report);
  const { billed, expected } = report;
  return (
    <section aria-labelledby="revenue-billed" className="card revenue-summary">
      <h2 className="revenue-eyebrow" id="revenue-billed">
        Faturado
      </h2>
      <p className="revenue-total">{formatMoney(billed.amount)}</p>
      <p className="revenue-note">
        Atendimentos concluídos, pelo preço combinado ou pelo valor final que
        você registrou.
      </p>
      {change.kind !== "none" && (
        <p
          className={clsx(
            "revenue-change",
            change.kind === "change" && `is-${change.direction}`,
          )}
        >
          {change.text}
        </p>
      )}
      {change.kind === "change" && report.previous.partial && (
        <p className="revenue-note">
          Comparando {rangeLabel(report.start, report.today)} com{" "}
          {rangeLabel(report.previous.start, report.previous.end)}.
        </p>
      )}
      <dl className="revenue-stats">
        <div className="revenue-stat">
          <dt>Atendimentos concluídos</dt>
          <dd>{billed.count}</dd>
        </div>
        <div className="revenue-stat">
          <dt>Ticket médio</dt>
          <dd>
            {billed.averageTicket === null
              ? "—"
              : formatMoney(billed.averageTicket)}
          </dd>
        </div>
        {(expected.count > 0 || isCurrentPeriod(report)) && (
          <div className="revenue-stat is-expected">
            <dt>Previsto</dt>
            <dd>
              {formatMoney(expected.amount)}
              <span className="revenue-stat-sub">
                {expected.count === 0
                  ? "nenhum confirmado pela frente"
                  : `${countLabel(expected.count, "confirmado", "confirmados")} pela frente`}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {billed.unvaluedCount > 0 && (
        <p className="revenue-unvalued">
          <Icon name="info" />
          <span>
            {countLabel(
              billed.unvaluedCount,
              "atendimento concluído sem valor",
              "atendimentos concluídos sem valor",
            )}{" "}
            (sob consulta, “a partir de” ou sem preço). Registre o valor final
            no atendimento para ele entrar aqui.
          </span>
        </p>
      )}
    </section>
  );
}

function ChartCard({
  bars,
  onOpen,
  report,
}: {
  bars: ReturnType<typeof chartBars>;
  onOpen: (target: View) => void;
  report: RevenueReport;
}) {
  const best = bestBar(bars);
  const yearly = report.period === "year";
  const title = yearly ? "Mês a mês" : "Dia a dia";
  const bestText = best
    ? `${yearly ? "Melhor mês" : "Melhor dia"}: ${best.long}, ${formatMoney(best.amount)}`
    : "Nada faturado ainda neste período.";
  return (
    <section aria-labelledby="revenue-chart" className="card revenue-card">
      <header className="revenue-card-head">
        <h2 id="revenue-chart">{title}</h2>
        <p className="revenue-card-sub">{bestText}</p>
      </header>
      <RevenueChart
        bars={bars}
        caption={`${title}. ${bestText}`}
        onOpen={onOpen}
        period={report.period}
      />
    </section>
  );
}

function ServicesCard({ report }: { report: RevenueReport }) {
  const services = report.services;
  const labels = shareLabels(services.map((service) => service.amount));
  return (
    <section aria-labelledby="revenue-services" className="card revenue-card">
      <header className="revenue-card-head">
        <h2 id="revenue-services">Por serviço</h2>
        <p className="revenue-card-sub">
          De onde vem o que você faturou neste período.
        </p>
      </header>
      {services.length === 0 ? (
        <p className="revenue-empty-line">
          Nenhum atendimento concluído neste período.
        </p>
      ) : (
        <>
          {report.billed.amount > 0 && (
            <div aria-hidden="true" className="revenue-mix">
              {services
                .filter((service) => service.amount > 0)
                .map((service) => (
                  <span
                    className="revenue-mix-part"
                    data-color={service.colorToken ?? undefined}
                    key={service.serviceId ?? "outros"}
                    style={{ flexGrow: service.amount }}
                  />
                ))}
            </div>
          )}
          <ul className="revenue-service-list">
            {services.map((service, index) => (
              <li
                className="revenue-service"
                data-color={service.colorToken ?? undefined}
                key={service.serviceId ?? "outros"}
              >
                <span aria-hidden="true" className="revenue-service-dot" />
                <div className="revenue-service-copy">
                  <span className="revenue-service-name">{service.name}</span>
                  <span className="revenue-service-sub">
                    {countLabel(service.count, "atendimento", "atendimentos")}
                  </span>
                </div>
                <div className="revenue-service-numbers">
                  <span className="revenue-service-amount">
                    {formatMoney(service.amount)}
                  </span>
                  <span className="revenue-service-share">
                    {report.billed.amount > 0
                      ? `${labels[index]} do faturamento`
                      : "sem valor"}
                  </span>
                </div>
                <span aria-hidden="true" className="revenue-service-bar">
                  <span
                    style={{ width: `${Math.round(service.share * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CustomersCard({ report }: { report: RevenueReport }) {
  if (report.customers.length === 0) return null;
  return (
    <section aria-labelledby="revenue-customers" className="card revenue-card">
      <header className="revenue-card-head">
        <h2 id="revenue-customers">Clientes que mais faturaram</h2>
      </header>
      <ol className="revenue-rank">
        {report.customers.map((customer, index) => (
          <li className="revenue-rank-row" key={customer.customerId}>
            <span aria-hidden="true" className="revenue-rank-position">
              {index + 1}
            </span>
            <Link
              className="revenue-rank-name"
              href={`/clientes/detalhes?id=${encodeURIComponent(customer.customerId)}`}
            >
              {customer.name?.trim() || "Cliente sem nome"}
            </Link>
            <span className="revenue-rank-numbers">
              <span className="revenue-rank-amount">
                {formatMoney(customer.amount)}
              </span>
              <span className="revenue-rank-count">
                {countLabel(customer.count, "atendimento", "atendimentos")}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WeekdayCard({ report }: { report: RevenueReport }) {
  if (report.period === "day" || report.period === "week") return null;
  const strongest = strongestWeekday(report.weekdays);
  if (!strongest) return null;
  const max = Math.max(...report.weekdays.map((day) => day.amount));
  const percent = Math.round(strongest.share * 100);
  return (
    <section aria-labelledby="revenue-weekday" className="card revenue-card">
      <header className="revenue-card-head">
        <h2 id="revenue-weekday">Dia da semana mais forte</h2>
        <p className="revenue-card-sub">
          {capitalizeFirst(weekdayName(strongest.weekday))}: {percent}% do
          faturado, {formatMoney(strongest.amount)}.
        </p>
      </header>
      <ul className="revenue-weekdays">
        {WEEK_ORDER.map((weekday) => {
          const day = report.weekdays.find((item) => item.weekday === weekday);
          const amount = day?.amount ?? 0;
          return (
            <li
              className={clsx(
                "revenue-weekday",
                weekday === strongest.weekday && "is-best",
              )}
              key={weekday}
            >
              <span aria-hidden="true" className="revenue-weekday-track">
                <span
                  style={{ height: `${max > 0 ? (amount / max) * 100 : 0}%` }}
                />
              </span>
              <span aria-hidden="true" className="revenue-weekday-label">
                {weekdayShort(weekday)}
              </span>
              <span className="sr-only">
                {weekdayName(weekday)}: {formatMoney(amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LostCard({ report }: { report: RevenueReport }) {
  const { lost } = report;
  if (lost.cancelledCount === 0 && lost.noShowCount === 0) return null;
  const amount = lost.cancelledAmount + lost.noShowAmount;
  return (
    <section aria-labelledby="revenue-lost" className="card revenue-card">
      <header className="revenue-card-head">
        <h2 id="revenue-lost">Faltas e cancelamentos</h2>
        <p className="revenue-card-sub">
          {amount > 0
            ? `${formatMoney(amount)} deixaram de entrar neste período.`
            : "Sem valor definido nos atendimentos que não aconteceram."}
        </p>
      </header>
      <dl className="revenue-lost">
        <div>
          <dt>{lost.noShowCount === 1 ? "Falta" : "Faltas"}</dt>
          <dd>
            {lost.noShowCount}
            {lost.noShowAmount > 0 && (
              <span> · {formatMoney(lost.noShowAmount)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt>
            {lost.cancelledCount === 1 ? "Cancelamento" : "Cancelamentos"}
          </dt>
          <dd>
            {lost.cancelledCount}
            {lost.cancelledAmount > 0 && (
              <span> · {formatMoney(lost.cancelledAmount)}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
