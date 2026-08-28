import Link from "next/link";
import { AppShell } from "@/shared/layout/AppShell";
import { Icon } from "@/shared/icons/Icon";
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
