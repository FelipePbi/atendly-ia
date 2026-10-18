"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

import type { RevenueReport } from "@/data";
import { aiValueView } from "@/features/revenue/aiValue";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

import {
  barLabel,
  changeSentence,
  daysLeftLabel,
  type HomeChange,
  homeChange,
  homeMoney,
  lastExpectedWeekday,
  monthTitle,
  percent,
  strongestDayLabel,
  weekBars,
} from "./homeMoney";

export type HomeViewport = "phone" | "tablet" | "desktop";

export type HomeReports = {
  day?: RevenueReport;
  week?: RevenueReport;
  month?: RevenueReport;
};

const PERIODS = ["day", "week", "month"] as const;

/** As mesmas chaves da tela de Faturamento: o que uma leu serve à outra. */
function memoryKey(period: (typeof PERIODS)[number]): string {
  return `revenue:${period}:hoje`;
}

/**
 * Hoje, esta semana e este mês, lidos de `GET /v1/revenue` a cada painel
 * novo do Início. A leitura lembrada aparece na hora; a que falhar só tira
 * da tela o que dependia dela (é complemento, nunca bloqueia o Início).
 */
export function useHomeRevenue(refreshKey: unknown): HomeReports {
  const [reports, setReports] = useState<HomeReports>(() => ({
    day: recall<RevenueReport>(memoryKey("day")),
    week: recall<RevenueReport>(memoryKey("week")),
    month: recall<RevenueReport>(memoryKey("month")),
  }));

  useEffect(() => {
    // Dublês de teste do Início podem não ter o serviço de faturamento.
    const { revenue } = getProductServices() as Partial<
      ReturnType<typeof getProductServices>
    >;
    if (!revenue) return;
    const controller = new AbortController();
    for (const period of PERIODS) {
      revenue
        .get({ period }, controller.signal)
        .then((result) => {
          remember(memoryKey(period), result);
          setReports((current) => ({ ...current, [period]: result }));
        })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [refreshKey]);

  return reports;
}

/** Atraso da entrada de cada bloco, no ritmo do protótipo. */
export function reveal(delay: number): CSSProperties {
  return { "--hm-delay": `${delay}s` } as CSSProperties;
}

/**
 * Número grande que sobe até o valor na entrada (easing cúbico, 0,9 s após
 * 0,25 s). Sem entrada — leitura lembrada — ou com movimento reduzido, já
 * nasce no valor.
 */
export function CountUp({
  animate,
  className,
  to,
}: {
  animate: boolean;
  className?: string;
  to: number;
}) {
  // Nulo: o número parado no valor final.
  const [shown, setShown] = useState<number | null>(() =>
    animate && !prefersReducedMotion() ? 0 : null,
  );

  useEffect(() => {
    if (!animate || prefersReducedMotion()) return;
    if (typeof requestAnimationFrame !== "function") return;
    const duration = 900;
    const delay = 250;
    let raf = 0;
    let start: number | undefined;
    const step = (time: number) => {
      if (start === undefined) start = time;
      const progress = Math.min(1, (time - start - delay) / duration);
      if (progress >= 1) {
        setShown(null);
        return;
      }
      if (progress >= 0) setShown(Math.round(to * (1 - (1 - progress) ** 3)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, to]);

  return (
    <span className={className}>
      <span aria-hidden="true">{homeMoney(shown ?? to)}</span>
      <span className="sr-only">{homeMoney(to)}</span>
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A faísca que marca o que a IA agendou. */
export function Spark({ size = 11 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="hm-spark"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3-6.3-2.2 6.3-2.2z" />
    </svg>
  );
}

export function Chevron({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.25"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ChangeShort({ change }: { change: HomeChange }) {
  return (
    <span className={clsx("hm-change", `is-${change.direction}`)}>
      {change.short}
    </span>
  );
}

/** A barra do dia: o que já entrou e o que ainda vem. */
function DayMeter({ report }: { report: RevenueReport }) {
  const total = report.billed.amount + report.expected.amount;
  const share = total > 0 ? (report.billed.amount / total) * 100 : 0;
  return (
    <div aria-hidden="true" className="hm-meter">
      <span className="hm-grow-x" style={{ width: `${share}%` }} />
    </div>
  );
}

function Fact({
  caption,
  label,
  muted,
  spark,
  value,
}: {
  caption: string;
  label: string;
  muted?: boolean;
  spark?: boolean;
  value: string;
}) {
  return (
    <div className="hm-fact">
      <dt>
        {spark && <Spark />}
        {label}
      </dt>
      <dd className={clsx(muted && "is-muted")}>{value}</dd>
      <dd className="hm-fact-caption">{caption}</dd>
    </div>
  );
}

function dayCount(report: RevenueReport): string {
  const total = report.billed.count + report.expected.count;
  return `${report.billed.count} de ${total} ${total === 1 ? "atendimento" : "atendimentos"}`;
}

function aiDayFact(report: RevenueReport) {
  const amount = report.ai.billed.amount + report.ai.expected.amount;
  const count = report.ai.billed.count + report.ai.expected.count;
  const share = percent(amount, report.billed.amount + report.expected.amount);
  return { amount, count, share };
}

function DayFacts({
  report,
  layout,
}: {
  report: RevenueReport;
  layout: HomeViewport;
}) {
  const ai = aiDayFact(report);
  const confirmed = `${report.expected.count} ${report.expected.count === 1 ? "confirmado" : "confirmados"}`;
  const aiCaption =
    ai.share === null
      ? "nenhum atendimento"
      : `${ai.share}% do dia${layout === "tablet" ? "" : ` · ${ai.count} ${ai.count === 1 ? "atendimento" : "atendimentos"}`}`;
  return (
    <dl
      className={clsx(
        "hm-facts",
        layout !== "phone" && "is-three",
        "hm-reveal",
      )}
      style={reveal(layout === "phone" ? 0.26 : 0.3)}
    >
      <Fact
        caption={confirmed}
        label="A entrar"
        value={homeMoney(report.expected.amount)}
      />
      <Fact
        caption="por atendimento"
        label="Ticket médio"
        value={
          report.billed.averageTicket === null
            ? "—"
            : homeMoney(Math.round(report.billed.averageTicket))
        }
      />
      <Fact
        caption={aiCaption}
        label="Pela IA"
        spark
        value={homeMoney(ai.amount)}
      />
    </dl>
  );
}

/** Segunda a domingo, com o valor de cada dia em cima. */
export function WeekColumns({
  barHeight,
  report,
}: {
  barHeight: number;
  report: RevenueReport;
}) {
  const bars = weekBars(report);
  return (
    <div className="hm-week">
      <ol aria-label="Dia a dia da semana" className="hm-week-bars">
        {bars.map((bar, index) => {
          const value = bar.billed + bar.expected;
          return (
            <li
              aria-label={`${bar.long}: ${homeMoney(bar.billed)} faturado${bar.expected > 0 ? `, ${homeMoney(bar.expected)} a entrar` : ""}`}
              className={clsx("hm-week-day", bar.isToday && "is-today")}
              key={bar.key}
            >
              <span
                aria-hidden="true"
                className={clsx("hm-week-value", value <= 0 && "is-empty")}
              >
                {value > 0 ? barLabel(value) : "—"}
              </span>
              <span
                aria-hidden="true"
                className="hm-week-track"
                style={{ height: barHeight }}
              >
                {value > 0 && (
                  <span
                    className="hm-week-fill hm-grow-y"
                    style={{
                      height: `${bar.height}%`,
                      ...reveal(0.3 + index * 0.05),
                    }}
                  >
                    {bar.expected > 0 && (
                      <span
                        className="hm-week-expected"
                        style={{ height: `${100 - bar.billedShare}%` }}
                      />
                    )}
                    {bar.billed > 0 && <span className="hm-week-billed" />}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="hm-week-labels">
        {bars.map((bar) => (
          <span
            className={clsx(
              bar.isToday && "is-today",
              !bar.isToday && bar.billed + bar.expected <= 0 && "is-empty",
            )}
            key={bar.key}
          >
            {bar.isToday ? "hoje" : bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "R$ 5.470 · +12%": o total da semana (faturado + a entrar) e a variação. */
function WeekTotal({ report }: { report: RevenueReport }) {
  const change = homeChange(report);
  return (
    <span className="hm-head-value">
      <b>{homeMoney(report.billed.amount + report.expected.amount)}</b>
      {change && (
        <>
          {" · "}
          <ChangeShort change={change} />
        </>
      )}
    </span>
  );
}

function AiWeekLine({ report }: { report: RevenueReport }) {
  if (report.ai.billed.amount <= 0) return null;
  const share = percent(report.ai.billed.amount, report.billed.amount);
  return (
    <span className="hm-ai-line">
      <Spark size={12} />
      <span>
        A IA marcou <b>{homeMoney(report.ai.billed.amount)}</b>
        {share !== null && ` · ${share}% do faturado`}
      </span>
    </span>
  );
}

function WeekSplitLine({
  report,
  untilDay,
}: {
  report: RevenueReport;
  untilDay: boolean;
}) {
  const last = untilDay ? lastExpectedWeekday(report) : null;
  return (
    <span className="hm-nowrap">
      <b>{homeMoney(report.billed.amount)}</b> faturados ·{" "}
      <b>{homeMoney(report.expected.amount)}</b> a entrar
      {last ? ` até ${last}` : ""}
    </span>
  );
}

/** "R$ 2.770 a entrar até o fim do mês · faltam 16 dias · sábado é seu dia mais forte". */
function monthLine(report: RevenueReport, strongest: boolean): ReactNode {
  const best = strongest ? strongestDayLabel(report) : null;
  return (
    <>
      {report.expected.amount > 0 && (
        <>
          <b>{homeMoney(report.expected.amount)}</b> a entrar até o fim do mês
          {" · "}
        </>
      )}
      {daysLeftLabel(report.today)}
      {best && ` · ${best}`}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* 1b · Painel do dia                                                        */
/* ------------------------------------------------------------------------ */

type MobilePeriod = "day" | "week";
const MOBILE_PERIOD_KEY = "home:revenue:period";

/**
 * Painel do celular: Hoje/Semana alternam de verdade, e o rodapé é o mês,
 * que abre o Faturamento.
 */
export function PanelPhone({
  animate,
  reports,
}: {
  animate: boolean;
  reports: HomeReports;
}) {
  const titleId = useId();
  const [period, setPeriod] = useState<MobilePeriod>(
    () => recall<MobilePeriod>(MOBILE_PERIOD_KEY) ?? "day",
  );
  const report = reports[period];
  if (!reports.day && !reports.week) return null;

  function choose(next: MobilePeriod) {
    remember(MOBILE_PERIOD_KEY, next);
    setPeriod(next);
  }

  return (
    <section
      aria-labelledby={titleId}
      className="hm-panel hm-reveal"
      style={reveal(0.12)}
    >
      <div className="hm-panel-head">
        <h2 id={titleId}>Faturamento</h2>
        <div aria-label="Ver por" className="hm-seg" role="group">
          {(
            [
              ["day", "Hoje"],
              ["week", "Semana"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={period === value}
              className={clsx("hm-seg-option", period === value && "is-active")}
              key={value}
              onClick={() => choose(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {report && period === "day" && (
        <div className="hm-period" key="day">
          <HeroRow
            animate={animate}
            caption={`faturado hoje · ${dayCount(report)}`}
            change={homeChange(report)}
            to={report.billed.amount}
          />
          <div className="hm-meter-block">
            <DayMeter report={report} />
            <span className="hm-meter-caption">
              <b>{homeMoney(report.billed.amount + report.expected.amount)}</b>{" "}
              no dia, se tudo confirmar
            </span>
          </div>
          <DayFacts layout="phone" report={report} />
        </div>
      )}

      {report && period === "week" && (
        <div className="hm-period" key="week">
          <HeroRow
            animate={animate}
            caption={`faturados nesta semana · ${report.billed.count} ${report.billed.count === 1 ? "atendimento" : "atendimentos"}`}
            change={homeChange(report)}
            to={report.billed.amount}
          />
          <WeekColumns barHeight={44} report={report} />
          <dl className="hm-facts hm-reveal" style={reveal(0.26)}>
            <Fact
              caption={`${report.expected.count} ${report.expected.count === 1 ? "confirmado" : "confirmados"}${lastExpectedWeekday(report) ? ` até ${lastExpectedWeekday(report)}` : ""}`}
              label="A entrar"
              value={homeMoney(report.expected.amount)}
            />
            <Fact
              caption={
                percent(report.ai.billed.amount, report.billed.amount) === null
                  ? "nada faturado ainda"
                  : `${percent(report.ai.billed.amount, report.billed.amount)}% do faturado`
              }
              label="Pela IA"
              spark
              value={homeMoney(report.ai.billed.amount)}
            />
          </dl>
        </div>
      )}

      {reports.month && (
        <Link className="hm-month-row" href="/faturamento">
          <span className="hm-month-row-copy">
            <span className="hm-month-row-title">
              {monthTitle(reports.month)} ·{" "}
              {homeMoney(reports.month.billed.amount)}
            </span>
            <span className="hm-month-row-sub">
              {monthLine(reports.month, false)}
            </span>
          </span>
          <Chevron size={16} />
        </Link>
      )}
    </section>
  );
}

function HeroRow({
  animate,
  caption,
  change,
  to,
}: {
  animate: boolean;
  caption: string;
  change: HomeChange | null;
  to: number;
}) {
  return (
    <div className="hm-hero-row">
      <div className="hm-hero-copy">
        <CountUp animate={animate} className="hm-hero" to={to} />
        <span className="hm-hero-caption">{caption}</span>
      </div>
      {change && (
        <div className="hm-hero-change">
          <ChangeShort change={change} />
          <span className="hm-hero-change-sub">
            {change.sub} ({homeMoney(change.previous)})
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Painel do tablet e do desktop: três zonas lado a lado — o dia, a semana e
 * o mês — sem alternar nada.
 */
export function PanelWide({
  animate,
  layout,
  reports,
}: {
  animate: boolean;
  layout: "tablet" | "desktop";
  reports: HomeReports;
}) {
  const titleId = useId();
  const { day, week, month } = reports;
  if (!day && !week && !month) return null;
  return (
    <section
      aria-labelledby={titleId}
      className={clsx("hm-panel is-wide", `is-${layout}`, "hm-reveal")}
      style={reveal(0.12)}
    >
      <h2 className="sr-only" id={titleId}>
        Faturamento
      </h2>
      {day && (
        <div className="hm-zone is-day">
          <div className="hm-zone-head">
            <h3 className="hm-eyebrow">Hoje</h3>
            <span className="hm-zone-note">
              {dayCount(day)}{" "}
              {day.billed.count + day.expected.count === 1
                ? "concluído"
                : "concluídos"}
            </span>
          </div>
          <div className="hm-hero-block">
            <CountUp
              animate={animate}
              className="hm-hero is-wide"
              to={day.billed.amount}
            />
            <span className="hm-hero-caption">
              faturado até agora ·{" "}
              <b>{homeMoney(day.billed.amount + day.expected.amount)}</b> no dia
              {homeChange(day) && (
                <>
                  {" · "}
                  <ChangeShort change={homeChange(day) as HomeChange} />{" "}
                  {(homeChange(day) as HomeChange).sub} (
                  {homeMoney((homeChange(day) as HomeChange).previous)})
                </>
              )}
            </span>
          </div>
          <DayMeter report={day} />
          <DayFacts layout={layout} report={day} />
        </div>
      )}
      {week && (
        <div className="hm-zone is-week">
          <div className="hm-zone-head">
            <h3 className="hm-eyebrow">Esta semana</h3>
            <WeekTotal report={week} />
          </div>
          <WeekColumns barHeight={64} report={week} />
          <div className="hm-zone-foot">
            {layout === "desktop" && (
              <WeekSplitLine report={week} untilDay={false} />
            )}
            <AiWeekLine report={week} />
          </div>
        </div>
      )}
      {month && (
        <div className="hm-zone is-month">
          <h3 className="hm-eyebrow">{monthTitle(month)}</h3>
          <div className="hm-month-figure">
            <span className="hm-month-amount">
              {homeMoney(month.billed.amount)}
            </span>
            <span className="hm-month-caption">faturados até agora</span>
          </div>
          <span className="hm-month-line">
            {monthLine(month, layout === "desktop")}
          </span>
          <Link className="hm-more" href="/faturamento">
            Ver faturamento completo <Chevron />
          </Link>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 1a · Agenda que fatura                                                    */
/* ------------------------------------------------------------------------ */

/** A linha de dinheiro sob o cabeçalho de "Hoje", com a barra do dia. */
export function AgendaMoneyLine({
  layout,
  report,
}: {
  layout: HomeViewport;
  report: RevenueReport;
}) {
  const change = homeChange(report);
  return (
    <div className="hm-money">
      <div className="hm-money-line">
        {layout === "phone" ? (
          <span>
            <b>{homeMoney(report.billed.amount)}</b> faturado ·{" "}
            <b>{homeMoney(report.expected.amount)}</b> a entrar
          </span>
        ) : (
          <span className="hm-money-legend">
            <span>
              <span aria-hidden="true" className="hm-dot is-billed" />
              <b>{homeMoney(report.billed.amount)}</b> faturado
            </span>
            <span>
              <span aria-hidden="true" className="hm-dot is-expected" />
              <b>{homeMoney(report.expected.amount)}</b> a entrar
            </span>
          </span>
        )}
        {change && (
          <span
            className={clsx("hm-change is-small", `is-${change.direction}`)}
          >
            {changeSentence(change)}
          </span>
        )}
      </div>
      <DayMeter report={report} />
    </div>
  );
}

export function WeekBlock({
  layout,
  report,
}: {
  layout: HomeViewport;
  report: RevenueReport;
}) {
  const change = homeChange(report);
  return (
    <section
      aria-labelledby="hm-week-title"
      className="hm-block hm-reveal"
      style={reveal(0.2)}
    >
      <div className="hm-zone-head">
        <h2 className="hm-eyebrow" id="hm-week-title">
          Esta semana
        </h2>
        <WeekTotal report={report} />
      </div>
      <WeekColumns
        barHeight={layout === "phone" ? 34 : layout === "tablet" ? 72 : 80}
        report={report}
      />
      {layout === "phone" ? (
        <AiWeekLine report={report} />
      ) : (
        <div className="hm-block-lines">
          <WeekSplitLine report={report} untilDay />
          {layout === "desktop" && change && (
            <span>{changeSentence(change, true)}</span>
          )}
          <AiWeekLine report={report} />
        </div>
      )}
    </section>
  );
}

export function MonthBlock({ report }: { report: RevenueReport }) {
  return (
    <section
      aria-labelledby="hm-month-title"
      className="hm-block is-month hm-reveal"
      style={reveal(0.28)}
    >
      <div className="hm-zone-head">
        <h2 className="hm-eyebrow" id="hm-month-title">
          {monthTitle(report)}
        </h2>
        <span className="hm-head-value">
          <b>{homeMoney(report.billed.amount)}</b> faturados
        </span>
      </div>
      <span className="hm-month-line">{monthLine(report, false)}</span>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* O que a IA fez por você                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Bloco de prova (D-178): só o que a agenda prova, da semana. Sem nada da IA
 * no período, não aparece.
 */
export function AiProof({
  aiOff,
  headline,
  more,
  report,
  since,
}: {
  aiOff: boolean;
  headline: boolean;
  more: boolean;
  report: RevenueReport;
  since: boolean;
}) {
  const view = aiValueView(report, aiOff, homeMoney);
  if (view.kind !== "value") return null;
  return (
    <section
      aria-labelledby="hm-ai-title"
      className={clsx("hm-proof hm-reveal", headline && "has-headline")}
      style={reveal(0.36)}
    >
      <h2 className="hm-eyebrow" id="hm-ai-title">
        O que a IA fez por você
      </h2>
      {headline && (
        <p className="hm-proof-headline">{highlightMoney(view.headline)}.</p>
      )}
      {view.highlights.map((item) => (
        <div className="hm-proof-item" key={item.key}>
          <span className="hm-proof-value">{item.value}</span>
          <div className="hm-proof-copy">
            <span className="hm-proof-label">{item.label}</span>
            {item.detail && (
              <span className="hm-proof-detail">{item.detail}</span>
            )}
          </div>
        </div>
      ))}
      {since && view.since && (
        <span className="hm-proof-since">{view.since}</span>
      )}
      {more && (
        <Link className="hm-more" href="/faturamento">
          Ver faturamento completo <Chevron />
        </Link>
      )}
    </section>
  );
}

/** "A IA marcou R$ 1.180 dos seus…": o primeiro valor ganha a cor do faturamento. */
function highlightMoney(headline: string): ReactNode {
  const match = /R\$\s?[\d.,]+/.exec(headline);
  if (!match) return headline;
  return (
    <>
      {headline.slice(0, match.index)}
      <span className="hm-proof-amount">{match[0]}</span>
      {headline.slice(match.index + match[0].length)}
    </>
  );
}
