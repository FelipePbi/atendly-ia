"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BffHttpError, type Dashboard } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { AppShell } from "@/shared/layout/AppShell";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { Skeleton } from "@/shared/ui/States";

import type { DashboardScenario } from "./types";

const scenarioContent: Record<
  Exclude<DashboardScenario, "loading">,
  {
    agendaBadge: string;
    agendaCopy: string;
    agendaTitle: string;
    attentionCopy: string;
    attentionTitle: string;
    metricCopy: string;
    nextCopy: string;
    source: "atendly" | "external";
  }
> = {
  atendly: {
    agendaBadge: "Agenda Atendly",
    agendaCopy:
      "Horário, cliente e serviço serão carregados da Agenda Atendly.",
    agendaTitle: "Dados reais aparecerão aqui",
    attentionCopy: "A lista será preenchida com dados reais.",
    attentionTitle: "Conversas aguardando você",
    metricCopy: "Preenchido com dados operacionais reais",
    nextCopy: "Nenhum dado real foi fornecido para este protótipo.",
    source: "atendly",
  },
  external: {
    agendaBadge: "Fonte externa",
    agendaCopy: "Horários serão consultados na Minha Agenda.",
    agendaTitle: "Dados reais aparecerão aqui",
    attentionCopy: "A lista será preenchida com dados reais.",
    attentionTitle: "Conversas aguardando você",
    metricCopy: "Confirmados somente após sucesso na Minha Agenda",
    nextCopy: "Exibido somente após consulta bem-sucedida na fonte oficial.",
    source: "external",
  },
  empty: {
    agendaBadge: "Fonte oficial",
    agendaCopy:
      "Agendamentos criados manualmente ou pela Atendly aparecerão aqui.",
    agendaTitle: "Ainda não há agendamentos hoje",
    attentionCopy: "Novas conversas que exigirem ação humana aparecerão aqui.",
    attentionTitle: "Nenhuma conversa pendente",
    metricCopy: "Sem agendamentos registrados hoje",
    nextCopy: "Nenhum atendimento futuro disponível.",
    source: "atendly",
  },
  "integration-error": {
    agendaBadge: "Desatualizada",
    agendaCopy:
      "Os horários não serão apresentados como atuais enquanto a fonte oficial não responder.",
    agendaTitle: "Consulta indisponível",
    attentionCopy: "Evita oferecer horários desatualizados.",
    attentionTitle: "Reconectar agenda oficial",
    metricCopy: "Métrica suspensa enquanto a fonte oficial está indisponível",
    nextCopy: "Não disponível sem consulta segura.",
    source: "external",
  },
  "whatsapp-disconnected": {
    agendaBadge: "Operacional",
    agendaCopy: "Dados reais serão carregados da Agenda Atendly.",
    agendaTitle: "Agenda continua disponível",
    attentionCopy: "Clientes não estão recebendo atendimento automático.",
    attentionTitle: "Reconectar WhatsApp",
    metricCopy: "Novos atendimentos automáticos estão pausados",
    nextCopy: "Nenhum dado real foi fornecido.",
    source: "atendly",
  },
};

function LoadingDashboard() {
  return (
    <div
      className="dashboard-page"
      aria-busy="true"
      aria-label="Carregando painel inicial"
    >
      <header className="dashboard-header">
        <div style={{ width: "min(100%, 320px)" }}>
          <div className="skeleton skeleton-title" />
          <div
            className="skeleton skeleton-line"
            style={{ marginTop: 10, width: "58%" }}
          />
        </div>
      </header>
      <section className="operational-strip">
        <Skeleton style={{ height: 40, width: 40 }} />
        <div className="dashboard-skeleton-grid">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line" style={{ width: "74%" }} />
        </div>
        <span className="badge">Verificando</span>
      </section>
      <div className="dashboard-grid">
        <article className="card dashboard-card today-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <div className="dashboard-skeleton-grid">
            {[0, 1].map((item) => (
              <div className="dashboard-skeleton-block" key={item}>
                <Skeleton className="skeleton-title" />
                <Skeleton className="skeleton-line" />
              </div>
            ))}
          </div>
        </article>
        <article className="card dashboard-card next-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <div className="dashboard-skeleton-grid">
            <Skeleton style={{ height: 34, width: "42%" }} />
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line" style={{ width: "56%" }} />
          </div>
        </article>
        <article className="card dashboard-card outcomes-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <div className="outcome-layout">
            <div className="dashboard-skeleton-grid">
              <Skeleton style={{ height: 40, width: "32%" }} />
              <Skeleton className="skeleton-line" />
            </div>
            <div className="dashboard-skeleton-grid">
              <Skeleton className="skeleton-line" />
              <Skeleton className="skeleton-line" />
              <Skeleton className="skeleton-line" />
            </div>
          </div>
        </article>
        <article className="card dashboard-card attention-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <div className="dashboard-skeleton-grid">
            <div className="dashboard-skeleton-block">
              <Skeleton className="skeleton-title" />
              <Skeleton className="skeleton-line" />
            </div>
          </div>
        </article>
        <section className="card dashboard-card quick-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <div className="quick-actions">
            <Skeleton style={{ height: 44, width: 160 }} />
            <Skeleton style={{ height: 44, width: 180 }} />
          </div>
        </section>
      </div>
      <span className="sr-only" role="status">
        Carregando dados do início.
      </span>
    </div>
  );
}

export function ProductDashboardScreen() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .dashboard.get(controller.signal)
      .then((result) => {
        setDashboard(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof BffHttpError
              ? caught.message
              : "Não foi possível carregar o início.",
          );
        }
      });
    return () => controller.abort();
  }, [reload]);

  if (!dashboard && !error) {
    return (
      <AppShell active="inicio" module="dashboard" loading>
        <LoadingDashboard />
      </AppShell>
    );
  }

  if (!dashboard) {
    return (
      <AppShell active="inicio" module="dashboard" attention>
        <div className="dashboard-page">
          <div className="error-state" role="alert">
            <span className="state-icon">
              <Icon name="alert" />
            </span>
            <h1>Não foi possível carregar o início</h1>
            <p>{error}</p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setReload((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return <RealDashboard dashboard={dashboard} />;
}

function RealDashboard({ dashboard }: { dashboard: Dashboard }) {
  const scheduling =
    dashboard.scheduling.status === "ok" ? dashboard.scheduling.data : null;
  const ai = dashboard.ai.status === "ok" ? dashboard.ai.data : null;
  const whatsapp =
    dashboard.whatsapp.status === "ok" ? dashboard.whatsapp.data : null;
  const external = scheduling?.calendar.source === "EXTERNAL";
  const calendarUnavailable =
    dashboard.scheduling.status === "error" ||
    Boolean(
      external && scheduling?.calendar.integration?.status !== "CONNECTED",
    );
  const aiUnavailable = dashboard.ai.status === "error";
  const whatsappDisconnected = whatsapp?.status !== "CONNECTED";
  const todayAppointments = scheduling?.todayAppointments ?? [];
  const attention = ai?.conversationsNeedingAttention ?? [];
  const attentionCount = ai?.conversationsNeedingAttentionCount ?? 0;
  const empty =
    !calendarUnavailable &&
    todayAppointments.length === 0 &&
    !scheduling?.nextAppointment &&
    (ai?.aiAppointmentsToday ?? 0) === 0 &&
    attentionCount === 0;
  const primaryIssue = calendarUnavailable
    ? "calendar"
    : whatsappDisconnected
      ? "whatsapp"
      : aiUnavailable
        ? "ai"
        : null;
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: dashboard.platform.timezone,
    weekday: "long",
  }).format(new Date());

  return (
    <AppShell
      active="inicio"
      module="dashboard"
      source={external ? "external" : "atendly"}
      whatsapp={whatsappDisconnected ? "disconnected" : "connected"}
      attention={Boolean(primaryIssue) || attentionCount > 0}
    >
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1>Olá, {dashboard.platform.tenantName || "seu negócio"}</h1>
            <p className="dashboard-date">{today}</p>
          </div>
          <span className="dashboard-source">
            <Icon name={external ? "refresh" : "calendar"} />
            {external ? "Minha Agenda" : "Agenda Atendly"} · fonte oficial
          </span>
        </header>

        {primaryIssue && (
          <div className="alert alert-error dashboard-banner" role="alert">
            <Icon name="alert" />
            <div>
              <p className="alert-title">
                {primaryIssue === "calendar"
                  ? "Não foi possível consultar a agenda oficial"
                  : primaryIssue === "whatsapp"
                    ? "WhatsApp desconectado"
                    : "Dados de atendimento indisponíveis"}
              </p>
              <p className="alert-text">
                {primaryIssue === "calendar"
                  ? "Os horários podem estar desatualizados. Consulte a integração antes de confirmar novos agendamentos."
                  : primaryIssue === "whatsapp"
                    ? "O atendimento automático está pausado. Sua agenda continua disponível para uso manual."
                    : "As métricas e conversas pendentes não puderam ser consultadas. Tente novamente antes de concluir que não há atividade."}
              </p>
            </div>
            <Link
              className="btn btn-primary"
              href={
                primaryIssue === "calendar"
                  ? "/configuracoes/agenda"
                  : primaryIssue === "whatsapp"
                    ? "/configuracoes/whatsapp"
                    : "/conversas"
              }
            >
              {primaryIssue === "calendar"
                ? "Revisar integração"
                : primaryIssue === "whatsapp"
                  ? "Reconectar WhatsApp"
                  : "Abrir conversas"}
            </Link>
          </div>
        )}

        <section id="operational-status" className="operational-strip">
          <span className={`operational-icon${primaryIssue ? " danger" : ""}`}>
            <Icon name={primaryIssue ? "alert" : "shield"} />
          </span>
          <div className="operational-copy">
            <strong>
              {calendarUnavailable
                ? "Integração com problema"
                : whatsappDisconnected
                  ? "Atendimento automático pausado"
                  : aiUnavailable
                    ? "Dados de atendimento indisponíveis"
                    : "Tudo funcionando"}
            </strong>
            <span>
              {calendarUnavailable
                ? "A fonte oficial permanece ativa, mas a consulta está indisponível."
                : whatsappDisconnected
                  ? "Reconecte o WhatsApp para a Atendly voltar a responder clientes."
                  : aiUnavailable
                    ? "A agenda está disponível, mas os dados da IA não responderam."
                    : external
                      ? "WhatsApp conectado e Minha Agenda disponível."
                      : "WhatsApp conectado e Agenda Atendly disponível."}
            </span>
          </div>
          <div className="operational-points">
            <span className="status-line">
              <span
                className={`status-dot${whatsappDisconnected ? " danger" : ""}`}
              />
              WhatsApp
            </span>
            <span className="status-line">
              <span
                className={`status-dot${calendarUnavailable ? " danger" : ""}`}
              />
              {calendarUnavailable ? "Agenda indisponível" : "Agenda"}
            </span>
          </div>
        </section>

        {external && !calendarUnavailable && (
          <div className="external-source-banner">
            <Icon name="calendar" />
            Minha Agenda é a fonte oficial
            {scheduling?.calendar.integration?.lastSuccessfulSyncAt
              ? ` · última sincronização ${formatDateTime(
                  scheduling.calendar.integration.lastSuccessfulSyncAt,
                  dashboard.platform.timezone,
                )}`
              : ""}
          </div>
        )}

        <div className="dashboard-grid">
          <article id="agenda-today" className="card dashboard-card today-card">
            <header className="dashboard-card-head">
              <h2>Agenda de hoje</h2>
              <span
                className={`badge${calendarUnavailable ? " badge-danger" : ""}`}
              >
                {calendarUnavailable
                  ? "Indisponível"
                  : `${todayAppointments.length} ${todayAppointments.length === 1 ? "atendimento" : "atendimentos"}`}
              </span>
            </header>
            {calendarUnavailable ? (
              <div className="error-state" style={{ padding: "24px 16px" }}>
                <span className="state-icon">
                  <Icon name="refresh" />
                </span>
                <h3>Consulta indisponível</h3>
                <p>Horários antigos não serão apresentados como atuais.</p>
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-inner">
                  <span className="state-icon">
                    <Icon name="calendar" />
                  </span>
                  <h3>Ainda não há agendamentos hoje</h3>
                  <p>
                    Agendamentos criados manualmente ou pela Atendly aparecerão
                    aqui.
                  </p>
                </div>
              </div>
            ) : (
              <div className="agenda-stack">
                {todayAppointments.map((appointment) => (
                  <Link
                    className="agenda-row"
                    href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
                    key={appointment.id}
                  >
                    <strong className="agenda-time">
                      {appointment.startTime}
                    </strong>
                    <div className="agenda-copy">
                      <strong>{appointment.customer?.name ?? "Cliente"}</strong>
                      <span>
                        {appointment.services
                          .map((service) => service.name)
                          .join(", ")}
                      </span>
                    </div>
                    <span className="badge">
                      {appointment.source === "AI"
                        ? "Criado pela IA"
                        : "Confirmado"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </article>

          <article className="card dashboard-card next-card">
            <header className="dashboard-card-head">
              <h2>Próximo atendimento</h2>
            </header>
            <div className="next-focus">
              <div>
                <div className="next-focus-time">
                  {scheduling?.nextAppointment?.startTime ?? "—"}
                </div>
                <p>
                  {scheduling?.nextAppointment
                    ? `${scheduling.nextAppointment.customer?.name ?? "Cliente"} · ${scheduling.nextAppointment.services.map((service) => service.name).join(", ")}`
                    : calendarUnavailable
                      ? "Não disponível sem uma consulta segura."
                      : "Nenhum atendimento futuro disponível."}
                </p>
              </div>
              <span
                className={`badge${calendarUnavailable ? " badge-danger" : ""}`}
              >
                {calendarUnavailable
                  ? "Não atualizado"
                  : (scheduling?.nextAppointment?.date ?? "Agenda livre")}
              </span>
            </div>
          </article>

          <article className="card dashboard-card outcomes-card">
            <header className="dashboard-card-head">
              <h2>O que a Atendly fez hoje</h2>
            </header>
            <div className="outcome-layout">
              <div className="outcome-lead">
                <div>
                  <div className="outcome-value">
                    {ai?.aiAppointmentsToday ?? "—"}
                  </div>
                  <div className="outcome-label">
                    Agendamentos feitos pela IA
                  </div>
                </div>
                <small>
                  {ai
                    ? "Confirmados somente após persistência na fonte oficial"
                    : "Métricas de automação indisponíveis"}
                </small>
              </div>
              <div className="outcome-minis">
                <div className="outcome-mini">
                  <div>
                    <strong>{ai?.automatedConversationsToday ?? "—"}</strong>
                    <small>Conversas automatizadas</small>
                  </div>
                </div>
                <div className="outcome-mini">
                  <div>
                    <strong>
                      {scheduling?.estimatedRevenueToday === null ||
                      scheduling?.estimatedRevenueToday === undefined
                        ? "—"
                        : formatCurrency(scheduling.estimatedRevenueToday)}
                    </strong>
                    <small>Receita estimada dos atendimentos de hoje</small>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article
            id="attention"
            className="card dashboard-card attention-card"
          >
            <header className="dashboard-card-head">
              <h2>Precisam de atenção</h2>
              <span
                className={`badge ${attentionCount === 0 ? "badge-success" : "badge-attention"}`}
              >
                {attentionCount === 0
                  ? "Nenhuma"
                  : `${attentionCount} ${attentionCount === 1 ? "conversa" : "conversas"}`}
              </span>
            </header>
            {ai && attention.length > 0 ? (
              <div className="attention-list">
                {attention.map((conversation) => (
                  <Link
                    className="attention-row"
                    href={`/conversas/${encodeURIComponent(conversation.id)}`}
                    key={conversation.id}
                  >
                    <span className="avatar">
                      <Icon name="chat" />
                    </span>
                    <div className="attention-row-main">
                      <strong>
                        {conversation.customerName ??
                          conversation.externalContactId}
                      </strong>
                      <span>
                        {conversation.lastMessage?.body ??
                          conversation.handoffReason ??
                          "Aguardando atendimento humano"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <div className="dashboard-empty-inner">
                  <h3>
                    {ai
                      ? "Nenhuma conversa pendente"
                      : "Conversas temporariamente indisponíveis"}
                  </h3>
                  <p>
                    {ai
                      ? "Novas conversas que exigirem ação humana aparecerão aqui."
                      : "Tente novamente antes de concluir que não há pendências."}
                  </p>
                </div>
              </div>
            )}
          </article>

          <section className="card dashboard-card quick-card">
            <header className="dashboard-card-head">
              <h2>Ações rápidas</h2>
            </header>
            <div className="quick-actions">
              <Link className="btn btn-primary" href="/agenda">
                Ver agenda de hoje
              </Link>
              {attentionCount > 0 && (
                <Link className="btn btn-secondary" href="/conversas">
                  Ver conversas com atenção
                </Link>
              )}
              <Link className="btn btn-secondary" href="/configuracoes">
                Revisar status
              </Link>
            </div>
          </section>
        </div>
        {empty && <span className="sr-only">Ambiente sem atividade hoje.</span>}
      </div>
    </AppShell>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function DashboardScreen({
  scenario = "atendly",
}: {
  scenario?: DashboardScenario;
}) {
  if (scenario === "loading")
    return (
      <AppShell active="inicio" module="dashboard" loading>
        <LoadingDashboard />
      </AppShell>
    );
  const content = scenarioContent[scenario];
  const isError = scenario === "integration-error";
  const disconnected = scenario === "whatsapp-disconnected";
  const empty = scenario === "empty";
  const external = content.source === "external";
  const operationalTitle = isError
    ? "Integração com problema"
    : disconnected
      ? "Atendimento automático pausado"
      : external
        ? "Integração disponível"
        : "Tudo funcionando";
  const operationalCopy = isError
    ? "Minha Agenda permanece fonte oficial, mas não respondeu."
    : disconnected
      ? "Reconecte o WhatsApp para a Atendly voltar a responder clientes."
      : external
        ? "Minha Agenda continua controlando seus agendamentos."
        : "WhatsApp conectado e Agenda Atendly disponível.";
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(new Date());

  return (
    <AppShell
      active="inicio"
      module="dashboard"
      source={content.source}
      whatsapp={disconnected ? "disconnected" : "connected"}
      attention={isError}
    >
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1>Olá, Felipe</h1>
            <p className="dashboard-date">{today}</p>
          </div>
          <span className="dashboard-source">
            <Icon name={external ? "refresh" : "calendar"} />
            {external ? "Minha Agenda" : "Agenda Atendly"} · fonte oficial
          </span>
        </header>
        {(isError || disconnected) && (
          <div className="alert alert-error dashboard-banner" role="alert">
            <Icon name="alert" />
            <div>
              <p className="alert-title">
                {isError
                  ? "Não foi possível consultar a Minha Agenda"
                  : "WhatsApp desconectado"}
              </p>
              <p className="alert-text">
                {isError
                  ? "Horários podem estar desatualizados. Não confirme novos agendamentos pela Atendly até reconectar."
                  : "Atendimento automático está pausado. Sua agenda continua disponível para uso manual."}
              </p>
            </div>
            <Link
              className="btn btn-primary"
              href={
                isError
                  ? "/inicio?scenario=external"
                  : "/configuracoes/whatsapp"
              }
            >
              {isError ? "Tentar consultar novamente" : "Reconectar WhatsApp"}
            </Link>
          </div>
        )}
        <section id="operational-status" className="operational-strip">
          <span
            className={`operational-icon${isError || disconnected ? " danger" : ""}`}
          >
            <Icon name={isError || disconnected ? "alert" : "shield"} />
          </span>
          <div className="operational-copy">
            <strong>{operationalTitle}</strong>
            <span>{operationalCopy}</span>
          </div>
          <div className="operational-points">
            <span className="status-line">
              <span className={`status-dot${disconnected ? " danger" : ""}`} />
              WhatsApp
            </span>
            <span className="status-line">
              <span className={`status-dot${isError ? " danger" : ""}`} />
              {external
                ? isError
                  ? "Agenda indisponível"
                  : "Consulta concluída"
                : "Agenda"}
            </span>
          </div>
        </section>
        {external && !isError && (
          <div className="external-source-banner">
            <Icon name="calendar" />
            Minha Agenda é a fonte oficial · última consulta concluída nesta
            sessão
          </div>
        )}
        <div className="dashboard-grid">
          <article id="agenda-today" className="card dashboard-card today-card">
            <header className="dashboard-card-head">
              <h2>Agenda de hoje</h2>
              <span className={`badge${isError ? " badge-danger" : ""}`}>
                {empty ? "0 atendimentos" : content.agendaBadge}
              </span>
            </header>
            {isError ? (
              <div className="error-state" style={{ padding: "24px 16px" }}>
                <span className="state-icon">
                  <Icon name="refresh" />
                </span>
                <h3>{content.agendaTitle}</h3>
                <p>{content.agendaCopy}</p>
              </div>
            ) : empty ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-inner">
                  <span className="state-icon">
                    <Icon name="calendar" />
                  </span>
                  <h3>{content.agendaTitle}</h3>
                  <p>{content.agendaCopy}</p>
                </div>
              </div>
            ) : (
              <div className="agenda-stack">
                <div className="agenda-row">
                  <strong className="agenda-time">—</strong>
                  <div className="agenda-copy">
                    <strong>{content.agendaTitle}</strong>
                    <span>{content.agendaCopy}</span>
                  </div>
                  <span
                    className={`badge${disconnected ? " badge-success" : ""}`}
                  >
                    {content.agendaBadge}
                  </span>
                </div>
              </div>
            )}
          </article>
          <article className="card dashboard-card next-card">
            <header className="dashboard-card-head">
              <h2>Próximo atendimento</h2>
            </header>
            <div className="next-focus">
              <div>
                <div className="next-focus-time">—</div>
                <p>{content.nextCopy}</p>
              </div>
              <span className={`badge${isError ? " badge-danger" : ""}`}>
                {isError
                  ? "Não atualizado"
                  : empty
                    ? "Agenda livre"
                    : external
                      ? "Minha Agenda"
                      : "Agenda Atendly"}
              </span>
            </div>
          </article>
          <article className="card dashboard-card outcomes-card">
            <header className="dashboard-card-head">
              <h2>O que a Atendly fez hoje</h2>
            </header>
            <div className="outcome-layout">
              <div className="outcome-lead">
                <div>
                  <div className="outcome-value">{empty ? "0" : "—"}</div>
                  <div className="outcome-label">
                    Agendamentos feitos pela IA
                  </div>
                </div>
                <small>{content.metricCopy}</small>
              </div>
              <div className="outcome-minis">
                <div className="outcome-mini">
                  <div>
                    <strong>—</strong>
                    <small>Horas economizadas</small>
                  </div>
                </div>
                <div className="outcome-mini">
                  <div>
                    <strong>—</strong>
                    <small>
                      {isError || empty
                        ? "Receita estimada"
                        : "Receita estimada, quando disponível"}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <article
            id="attention"
            className="card dashboard-card attention-card"
          >
            <header className="dashboard-card-head">
              <h2>Precisam de atenção</h2>
              <span
                className={`badge ${empty ? "badge-success" : isError || disconnected ? "badge-attention" : "badge-attention"}`}
              >
                {empty
                  ? "Nenhuma"
                  : isError || disconnected
                    ? "Ação necessária"
                    : "— conversas"}
              </span>
            </header>
            <div className={empty ? "dashboard-empty" : "attention-list"}>
              <div
                className={empty ? "dashboard-empty-inner" : "attention-row"}
              >
                {!empty && (
                  <span className="avatar">
                    <Icon name={isError ? "alert" : "chat"} />
                  </span>
                )}
                <div className="attention-row-main">
                  <strong>{content.attentionTitle}</strong>
                  <span>{content.attentionCopy}</span>
                </div>
              </div>
            </div>
          </article>
          <section className="card dashboard-card quick-card">
            <header className="dashboard-card-head">
              <h2>Ações rápidas</h2>
            </header>
            <div className="quick-actions">
              <Link
                className="btn btn-primary"
                href={
                  isError
                    ? "/configuracoes/agenda"
                    : disconnected
                      ? "/configuracoes/whatsapp"
                      : "#agenda-today"
                }
              >
                {isError
                  ? "Tentar novamente"
                  : disconnected
                    ? "Reconectar WhatsApp"
                    : external
                      ? "Ver agenda consultada"
                      : "Ver agenda de hoje"}
              </Link>
              {!isError && !empty && (
                <Link className="btn btn-secondary" href="/conversas">
                  Ver conversas com atenção
                </Link>
              )}
              <a className="btn btn-secondary" href="#operational-status">
                Revisar status
              </a>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
