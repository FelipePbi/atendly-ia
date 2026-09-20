"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BffHttpError, type CalendarState, type Dashboard } from "@/data";
import { Icon } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import {
  type StatusView,
  useSystemStatus,
  type UseSystemStatusResult,
} from "@/shared/runtime/systemStatus";
import { Skeleton, StatePanel } from "@/shared/ui/States";

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
  const status = useSystemStatus();

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

  /**
   * Único ponto de `useShellConfig` desta tela: `RealDashboard` é filho no
   * mesmo render e, se também chamasse o hook, os dois configs (formatos
   * diferentes — `loading` aqui, `source` lá) se alternariam a cada commit,
   * cada um invalidando o outro, num loop infinito de render.
   */
  useShellConfig(
    dashboard
      ? {
          active: "inicio",
          attention: dashboardNeedsAttention(dashboard),
          module: "dashboard",
          source: "atendly",
          title: "Início",
        }
      : {
          active: "inicio",
          attention: Boolean(error),
          loading: !error,
          module: "dashboard",
          title: "Início",
        },
  );

  if (!dashboard && !error) {
    return <LoadingDashboard />;
  }

  if (!dashboard) {
    return (
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1>Início</h1>
          </div>
        </header>
        <StatusStrip status={status} />
        <StatePanel
          actionLabel="Tentar novamente"
          description={error ?? "Tente novamente em instantes."}
          icon="alert"
          onAction={() => setReload((value) => value + 1)}
          title="Não foi possível carregar o início"
          tone="error"
        />
      </div>
    );
  }

  return (
    <RealDashboard
      dashboard={dashboard}
      onRetry={() => setReload((value) => value + 1)}
      status={status}
    />
  );
}

function dashboardNeedsAttention(dashboard: Dashboard): boolean {
  const ai = dashboard.ai.status === "ok" ? dashboard.ai.data : null;
  const whatsapp =
    dashboard.whatsapp.status === "ok" ? dashboard.whatsapp.data : null;
  const calendarUnavailable = dashboard.scheduling.status === "error";
  const aiUnavailable = dashboard.ai.status === "error";
  const whatsappDisconnected = whatsapp?.status !== "CONNECTED";
  const attentionCount = ai?.conversationsNeedingAttentionCount ?? 0;
  const primaryIssue =
    calendarUnavailable || whatsappDisconnected || aiUnavailable;
  return primaryIssue || attentionCount > 0;
}

function StatusStrip({ status }: { status: UseSystemStatusResult }) {
  return (
    <section
      id="operational-status"
      className="operational-strip"
      aria-label="Status operacional"
    >
      <span className="operational-icon">
        <Icon name="shield" />
      </span>
      <div className="operational-copy">
        <strong>Status honesto</strong>
        <span>WhatsApp e IA conforme a última verificação real.</span>
      </div>
      <div className="operational-points">
        <StatusPoint
          activeCopy="WhatsApp conectado"
          label="WhatsApp"
          offCopy="WhatsApp desconectado"
          view={status.whatsappView}
        />
        <StatusPoint
          activeCopy="IA ativa"
          label="IA"
          offCopy="IA desligada"
          pendingCopy="IA em ativação"
          view={status.aiView}
        />
      </div>
    </section>
  );
}

function StatusPoint({
  activeCopy,
  label,
  offCopy,
  pendingCopy,
  view,
}: {
  activeCopy: string;
  label: string;
  offCopy: string;
  pendingCopy?: string;
  view: StatusView;
}) {
  const copy =
    view === "loading"
      ? `Verificando ${label}`
      : view === "unknown"
        ? `${label} não confirmado`
        : view === "active"
          ? activeCopy
          : view === "pending"
            ? (pendingCopy ?? `${label} em ativação`)
            : offCopy;
  return (
    <span className="status-line" role="status">
      <span
        className={clsx(
          "status-dot",
          view === "off" && "danger",
          view === "pending" && "warning",
          (view === "loading" || view === "unknown") && "neutral",
        )}
        aria-hidden="true"
      />
      {copy}
    </span>
  );
}

function RealDashboard({
  dashboard,
  onRetry,
  status,
}: {
  dashboard: Dashboard;
  onRetry: () => void;
  status: UseSystemStatusResult;
}) {
  const scheduling =
    dashboard.scheduling.status === "ok" ? dashboard.scheduling.data : null;
  const ai = dashboard.ai.status === "ok" ? dashboard.ai.data : null;
  const whatsapp =
    dashboard.whatsapp.status === "ok" ? dashboard.whatsapp.data : null;
  const calendarUnavailable = dashboard.scheduling.status === "error";
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
  /**
   * Checklist pós-onboarding (Goal018/WU-10): só aparece com uma leitura
   * confirmada de `GET /v1/status` (nunca durante `loading`, para não afirmar
   * pendência antes de saber) e some assim que a IA está efetivamente ativa.
   */
  const checklistVisible = status.phase !== "loading" && status.aiView !== "active";
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: dashboard.platform.timezone,
    weekday: "long",
  }).format(new Date());

  return (
    <>
      <div className="dashboard-page">
        <header className="dashboard-header">
          <div>
            <h1>Olá, {dashboard.platform.tenantName || "seu negócio"}</h1>
            <p className="dashboard-date">{today}</p>
          </div>
          <span className="dashboard-source">
            <Icon name="calendar" />
            Agenda Atendly · fonte oficial
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
                    : "WhatsApp conectado e Agenda Atendly disponível."}
            </span>
          </div>
          <div className="operational-points">
            <StatusPoint
              activeCopy="WhatsApp conectado"
              label="WhatsApp"
              offCopy="WhatsApp desconectado"
              view={status.whatsappView}
            />
            <StatusPoint
              activeCopy="IA ativa"
              label="IA"
              offCopy="IA desligada"
              pendingCopy="IA em ativação"
              view={status.aiView}
            />
            <span className="status-line">
              <span
                className={`status-dot${calendarUnavailable ? " danger" : ""}`}
              />
              {calendarUnavailable ? "Agenda indisponível" : "Agenda"}
            </span>
          </div>
        </section>

        {checklistVisible && (
          <PostOnboardingChecklist
            capabilities={scheduling?.calendar.capabilities ?? null}
            whatsappActive={status.whatsappView === "active"}
          />
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
                <button
                  className="btn btn-secondary"
                  onClick={onRetry}
                  type="button"
                >
                  Tentar novamente
                </button>
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
                  {!ai && (
                    <button
                      className="btn btn-secondary"
                      onClick={onRetry}
                      type="button"
                    >
                      Tentar novamente
                    </button>
                  )}
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
    </>
  );
}

type ChecklistItem = { done: boolean; key: string; label: string };

/**
 * Checklist pós-onboarding do vault (`docs/product-vault/02-Fluxos/01-Onboarding.md`):
 * cada item vem de uma leitura real de `GET /v1/dashboard`/`GET /v1/status`,
 * nunca de configuração local.
 *
 * "Teste concluído" é o quarto item, e ele entra agora que existe produtor:
 * `capabilities.activationTestCompleted`, que o BFF só marca com execução do
 * teste real em `SUCCEEDED` e ainda válida para o WhatsApp de hoje. Ausente na
 * resposta (dependência indisponível) é `false` — "não sei" nunca vira
 * "concluído".
 */
function PostOnboardingChecklist({
  capabilities,
  whatsappActive,
}: {
  capabilities: CalendarState["capabilities"] | null;
  whatsappActive: boolean;
}) {
  const items: ChecklistItem[] = [
    {
      done: Boolean(capabilities?.aiActivationReady),
      key: "service",
      label: "Cadastrar um serviço",
    },
    {
      done: Boolean(capabilities?.hoursConfigured),
      key: "hours",
      label: "Definir horários de atendimento",
    },
    {
      done: whatsappActive,
      key: "whatsapp",
      label: "Conectar o WhatsApp",
    },
    {
      done: Boolean(capabilities?.activationTestCompleted),
      key: "activation-test",
      label: "Concluir o teste da IA",
    },
  ];
  const doneCount = items.filter((item) => item.done).length;

  return (
    <section
      className="card dashboard-card checklist-card"
      aria-labelledby="checklist-heading"
    >
      <header className="dashboard-card-head">
        <h2 id="checklist-heading">Ative sua IA</h2>
        <span className="badge">
          {doneCount} de {items.length} passos concluídos
        </span>
      </header>
      <ul className="checklist-list">
        {items.map((item) => (
          <li
            aria-label={`${item.label}: ${item.done ? "concluído" : "pendente"}`}
            className={clsx("checklist-item", item.done && "is-done")}
            key={item.key}
          >
            <span className="checklist-marker" aria-hidden="true">
              {item.done && <Icon name="check" />}
            </span>
            <span aria-hidden="true">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
