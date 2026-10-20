"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";

import type { ReturnOverview, ReturnSettings } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

import { countLabel, moneyLabel, windowLabel } from "./returnCopy";
import {
  bookedRate,
  dayLabel,
  kindLabel,
  progressSegments,
  SENT_GROUPS,
  valueDetail,
  weekdayShort,
} from "./returnProgress";
import { ReturnProgressBar } from "./ReturnProgressBar";

/**
 * Retorno de clientes, a tela do menu (D-210): o que o retorno trouxe, os
 * atalhos para chamar clientes, acompanhar as aprovações e ajustar o ritmo,
 * a situação de todas as mensagens e o que sai nos próximos dias. Tudo do
 * retorno começa aqui; nada é configurado em outro lugar.
 */
export function ReturnOverviewScreen() {
  const [overview, setOverview] = useState<ReturnOverview | null>(null);
  const [settings, setSettings] = useState<ReturnSettings | null>(null);
  const [dueThisWeek, setDueThisWeek] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const services = getProductServices().customerReturn;
    services
      .overview(controller.signal)
      .then((value) => {
        setOverview(value);
        setError(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Não foi possível carregar o retorno de clientes.");
      });
    // O ritmo e quem vence nesta semana só completam os atalhos: sem eles,
    // a tela entra igual, com a frase genérica do atalho.
    services
      .settings(controller.signal)
      .then(setSettings)
      .catch(() => undefined);
    services
      .candidates({ kind: "RENEWAL", week: "this" }, controller.signal)
      .then((list) => setDueThisWeek(list.candidates.length))
      .catch(() => undefined);
    return () => controller.abort();
  }, [reload]);

  useShellConfig({
    active: "retorno",
    attention: Boolean(error && !overview),
    loading: !overview && !error,
    module: "directory",
    title: "Retorno de clientes",
  });

  const showLoader = useDeferredLoading(!overview && !error);
  if (!overview && !error) {
    return showLoader ? (
      <BrandLoader inline label="Carregando o retorno de clientes" />
    ) : null;
  }

  if (!overview) {
    return (
      <div className="return-hub">
        <HubHeader />
        <StatePanel
          actionLabel="Tentar novamente"
          description={error ?? "Tente novamente em instantes."}
          icon="alert"
          onAction={() => setReload((value) => value + 1)}
          title="Retorno indisponível"
          tone="error"
        />
      </div>
    );
  }

  const fresh = overview.campaigns.total === 0;
  return (
    <div className="return-hub">
      <HubHeader />
      {fresh ? <HowItWorks /> : <ValueCard overview={overview} />}
      <Shortcuts
        dueThisWeek={dueThisWeek}
        overview={overview}
        settings={settings}
      />
      {!fresh && <SituationCard overview={overview} />}
      {!fresh && <UpcomingCard overview={overview} settings={settings} />}
    </div>
  );
}

function HubHeader() {
  return (
    <header className="return-hub-header">
      <h1>Retorno de clientes</h1>
      <p>
        A IA chama de volta quem está no prazo ou sumiu. Você aprova; ela envia
        aos poucos e conversa até marcar.
      </p>
    </header>
  );
}

function HowItWorks() {
  const steps = [
    "Escolha quem chamar: quem está no prazo de voltar ou quem sumiu.",
    "Aprove. As mensagens saem aos poucos, no seu ritmo.",
    "Quando a cliente responde, a IA conversa e marca o horário.",
  ];
  return (
    <section aria-labelledby="return-how" className="return-card return-how">
      <header className="return-value-head">
        <span aria-hidden="true" className="return-how-icon">
          <Icon name="spark" />
        </span>
        <h2 className="return-card-title" id="return-how">
          Traga de volta quem já é sua cliente
        </h2>
      </header>
      <ol className="return-how-steps">
        {steps.map((step, index) => (
          <li key={step}>
            <span aria-hidden="true" className="return-how-number">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "O que o retorno trouxe": o faturado e o previsto, e quantas voltaram. */
function ValueCard({ overview }: { overview: ReturnOverview }) {
  const { totals, customersBack } = overview;
  const value = totals.revenue + totals.expectedRevenue;
  const detail = valueDetail(totals);
  const rate = bookedRate(totals);
  return (
    <section
      aria-labelledby="return-value"
      className="return-card return-value"
    >
      <header className="return-value-head">
        <span aria-hidden="true" className="return-value-icon">
          <Icon name="spark" />
        </span>
        <p className="return-eyebrow" id="return-value">
          O que o retorno trouxe
        </p>
      </header>
      {value > 0 ? (
        <>
          <p className="return-value-total">{moneyLabel(value)}</p>
          {detail && <p className="return-value-detail">{detail}</p>}
        </>
      ) : (
        <p className="return-value-empty">
          Quando as clientes chamadas marcarem, o valor aparece aqui.
        </p>
      )}
      <dl className="return-value-facts">
        <div>
          <dt>
            {customersBack === 1 ? "cliente voltou" : "clientes voltaram"}
          </dt>
          <dd>{customersBack}</dd>
        </div>
        <div>
          <dt>das mensagens viraram horário</dt>
          <dd>{rate === null ? "–" : `${rate}%`}</dd>
        </div>
        <div>
          <dt>
            {totals.sent === 1 ? "mensagem enviada" : "mensagens enviadas"}
          </dt>
          <dd>{totals.sent}</dd>
        </div>
      </dl>
    </section>
  );
}

interface ShortcutItem {
  detail: string;
  href: string;
  icon: IconName;
  primary?: boolean;
  title: string;
}

function Shortcuts({
  dueThisWeek,
  overview,
  settings,
}: {
  dueThisWeek: number | null;
  overview: ReturnOverview;
  settings: ReturnSettings | null;
}) {
  const live = overview.campaigns.live;
  const items: ShortcutItem[] = [
    {
      detail:
        dueThisWeek === null || dueThisWeek === 0
          ? "Renovação e Resgate"
          : `${countLabel(dueThisWeek, "cliente", "clientes")} no prazo esta semana`,
      href: "/retorno/chamar",
      icon: "chat",
      primary: true,
      title: "Chamar clientes",
    },
    {
      detail:
        overview.campaigns.total === 0
          ? "Nenhuma ainda"
          : live > 0
            ? `${countLabel(live, "em andamento", "em andamento")}`
            : countLabel(overview.campaigns.total, "aprovação", "aprovações"),
      href: "/retorno/aprovacoes",
      icon: "nav-list",
      title: "Aprovações",
    },
    {
      detail: settings
        ? `Até ${settings.dailyLimit} por dia`
        : "Ritmo e mensagens",
      href: "/retorno/configuracoes",
      icon: "nav-sliders",
      title: "Configurações",
    },
  ];
  return (
    <nav aria-label="Atalhos do retorno" className="return-shortcuts">
      {items.map((item) => (
        <Link
          className={`return-shortcut${item.primary ? " is-primary" : ""}`}
          href={item.href}
          key={item.href}
        >
          <span aria-hidden="true" className="return-shortcut-icon">
            <Icon name={item.icon} />
          </span>
          <span className="return-shortcut-copy">
            <span className="return-shortcut-title">{item.title}</span>
            <span className="return-shortcut-detail">{item.detail}</span>
          </span>
          <Icon className="return-shortcut-chevron" name="chevron-right" />
        </Link>
      ))}
    </nav>
  );
}

/** Situação das mensagens que já saíram, de todas as aprovações. */
function SituationCard({ overview }: { overview: ReturnOverview }) {
  const { totals } = overview;
  const segments = progressSegments(totals, SENT_GROUPS);
  return (
    <section aria-labelledby="return-situation" className="return-card">
      <header className="return-card-head">
        <div>
          <h2 className="return-card-title" id="return-situation">
            Como as clientes responderam
          </h2>
          <p className="return-card-note">
            {totals.sent === 0
              ? "Nenhuma mensagem saiu ainda."
              : `${countLabel(totals.sent, "mensagem enviada", "mensagens enviadas")}, desde a primeira aprovação.`}
          </p>
        </div>
      </header>
      {totals.sent > 0 && <ReturnProgressBar legend segments={segments} />}
      <Link className="return-card-link" href="/retorno/aprovacoes">
        Ver cada aprovação
        <Icon name="chevron-right" />
      </Link>
    </section>
  );
}

/** O que sai hoje e nos próximos 6 dias, e as próximas da fila. */
function UpcomingCard({
  overview,
  settings,
}: {
  overview: ReturnOverview;
  settings: ReturnSettings | null;
}) {
  const { upcoming, today } = overview;
  const inWeek = upcoming.days.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(...upcoming.days.map((day) => day.count), 1);
  const queued = inWeek + upcoming.later;
  return (
    <section aria-labelledby="return-upcoming" className="return-card">
      <header className="return-card-head">
        <div>
          <h2 className="return-card-title" id="return-upcoming">
            Próximos envios
          </h2>
          <p className="return-card-note">
            {queued === 0
              ? "Nada na fila agora."
              : `${countLabel(queued, "mensagem na fila", "mensagens na fila")}${settings ? `, ${windowLabel(settings.windowDays, settings.windowStart, settings.windowEnd)}` : ""}.`}
          </p>
        </div>
      </header>
      {inWeek > 0 && (
        <ol aria-label="Mensagens previstas por dia" className="return-days">
          {upcoming.days.map((day) => (
            <li className="return-day" key={day.date}>
              <span className="sr-only">
                {`${dayLabel(day.date, today)}: ${countLabel(day.count, "mensagem", "mensagens")}`}
              </span>
              <span aria-hidden="true" className="return-day-count">
                {day.count > 0 ? day.count : ""}
              </span>
              <span aria-hidden="true" className="return-day-track">
                <span
                  className="return-day-fill"
                  style={
                    {
                      "--fill": `${day.count > 0 ? Math.max((day.count / max) * 100, 8) : 0}%`,
                    } as CSSProperties
                  }
                />
              </span>
              <span aria-hidden="true" className="return-day-label">
                {weekdayShort(day.date, today)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {upcoming.next.length > 0 && (
        <ul className="return-next">
          {upcoming.next.slice(0, 3).map((item) => (
            <li className="return-next-item" key={item.targetId}>
              <Link
                className="return-next-link"
                href={`/retorno/aprovacoes/detalhes?id=${encodeURIComponent(item.campaignId)}`}
              >
                <span className="return-next-name">
                  {item.customerName?.trim() || "Cliente sem nome"}
                </span>
                <span className="return-next-meta">
                  {kindLabel(item.kind)}
                  {item.serviceName ? ` · ${item.serviceName}` : ""}
                </span>
              </Link>
              <span className="return-next-when">
                {dayLabel(item.plannedDate, today)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {upcoming.paused > 0 && (
        <p className="return-card-note is-warning">
          {countLabel(
            upcoming.paused,
            "mensagem parada numa aprovação pausada",
            "mensagens paradas em aprovações pausadas",
          )}
          . Retome em{" "}
          <Link className="return-inline-link" href="/retorno/aprovacoes">
            Aprovações
          </Link>
          .
        </p>
      )}
      {queued === 0 && upcoming.paused === 0 && (
        <Link className="return-card-link" href="/retorno/chamar">
          Chamar clientes
          <Icon name="chevron-right" />
        </Link>
      )}
    </section>
  );
}
