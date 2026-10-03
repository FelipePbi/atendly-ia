"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type Appointment,
  appointmentStatusLabel,
  BffHttpError,
  type CalendarState,
  type Dashboard,
} from "@/data";
import { durationLabel } from "@/features/agenda/NewAppointmentFields";
import {
  useNotificationsDrawer,
  useNotificationsDrawerViewport,
} from "@/features/notifications/NotificationsDrawer";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
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
        <Skeleton style={{ height: 40, width: 40, borderRadius: "50%" }} />
      </header>
      <section className="operational-strip">
        <Skeleton style={{ height: 40, width: 40 }} />
        <div className="dashboard-skeleton-grid">
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line" style={{ width: "74%" }} />
        </div>
        <span className="badge">Verificando</span>
      </section>
      <div className="dashboard-body">
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
        <article className="card dashboard-card week-card">
          <div className="dashboard-card-head">
            <Skeleton className="skeleton-title" />
          </div>
          <Skeleton style={{ height: 48, width: "100%" }} />
        </article>
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
          attention: dashboardNeedsAttention(dashboard, status.whatsappView),
          module: "dashboard",
          title: "Início",
          whatsappInBand: bandSaysWhatsappOff(dashboard, status.whatsappView),
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

/**
 * Cumprimento da Home (Goal064 §7): pelo horário no fuso do negócio, nunca
 * pelo nome do negócio. `dashboard.platform.timezone` já é a fonte de fuso
 * desta tela (usada por `today` e por `currentTimeLabel` logo abaixo).
 */
function currentHourInTimeZone(timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(new Date());
  return Number.parseInt(formatted, 10);
}

/** "HH:MM" no fuso do negócio, no mesmo formato de `appointment.startTime`. */
function currentTimeLabel(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date());
}

function greetingWord(hour: number): string {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function homeGreeting(timezone: string, name: string | null | undefined): string {
  const word = greetingWord(currentHourInTimeZone(timezone));
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${word}, ${firstName}` : word;
}

/**
 * Estado do banner de WhatsApp da Home, derivado de `status.whatsappView`
 * (Goal059/H-02) — a mesma fonte da sidebar e do checklist. `unknown` nunca
 * vira "off": afirmar desconexão sem confirmação é o próprio bug.
 */
function whatsappBannerIssue(view: StatusView): "off" | "unknown" | null {
  if (view === "off") return "off";
  if (view === "unknown") return "unknown";
  return null;
}

/**
 * A faixa só diz "WhatsApp desconectado" quando a agenda responde: com a
 * consulta da agenda indisponível ela vence (gravidade) e o aviso do WhatsApp
 * continua a cargo do banner da casca.
 */
function bandSaysWhatsappOff(
  dashboard: Dashboard,
  whatsappView: StatusView,
): boolean {
  return (
    whatsappBannerIssue(whatsappView) === "off" &&
    dashboard.scheduling.status !== "error"
  );
}

function dashboardNeedsAttention(
  dashboard: Dashboard,
  whatsappView: StatusView,
): boolean {
  const ai = dashboard.ai.status === "ok" ? dashboard.ai.data : null;
  const calendarUnavailable = dashboard.scheduling.status === "error";
  const aiUnavailable = dashboard.ai.status === "error";
  const whatsappOff = whatsappBannerIssue(whatsappView) === "off";
  const attentionCount = ai?.conversationsNeedingAttentionCount ?? 0;
  const primaryIssue = calendarUnavailable || whatsappOff || aiUnavailable;
  return primaryIssue || attentionCount > 0;
}

type OperationalState = {
  action?: { href: string; label: string };
  alert: boolean;
  description: string;
  icon: IconName;
  title: string;
  tone: "error" | "info" | "ok" | "warning";
  /** Faixa de desconexão do quadro H3: ícone e texto em cima, ação em largura total embaixo. */
  variant?: "disconnected";
};

/**
 * Uma única faixa de estado (Goal074 §7.5), nunca duas: o alerta e o resumo
 * operacional eram blocos separados antes deste Goal. A ordem de prioridade
 * segue a gravidade — agenda indisponível é o problema mais bloqueante,
 * "IA pausada" o mais brando — e só o estado vencedor aparece.
 */
function resolveOperationalState({
  aiUnavailable,
  aiView,
  automatedConversationsToday,
  calendarUnavailable,
  checklistComplete,
  whatsappIssue,
}: {
  aiUnavailable: boolean;
  aiView: StatusView;
  automatedConversationsToday: number;
  calendarUnavailable: boolean;
  checklistComplete: boolean;
  whatsappIssue: "off" | "unknown" | null;
}): OperationalState {
  if (calendarUnavailable) {
    return {
      action: { href: "/configuracoes/agenda", label: "Revisar integração" },
      alert: true,
      description:
        "A agenda continua ativa, mas a consulta está indisponível no momento.",
      icon: "alert",
      title: "Não foi possível consultar a agenda",
      tone: "error",
    };
  }
  if (whatsappIssue === "off") {
    return {
      action: { href: "/configuracoes/whatsapp", label: "Reconectar WhatsApp" },
      alert: true,
      description: "Sua IA não está atendendo.",
      icon: "ban",
      title: "WhatsApp desconectado",
      tone: "error",
      variant: "disconnected",
    };
  }
  if (whatsappIssue === "unknown") {
    return {
      action: { href: "/configuracoes/whatsapp", label: "Verificar WhatsApp" },
      alert: true,
      description: "Ainda não confirmamos a conexão do WhatsApp.",
      icon: "info",
      title: "WhatsApp não confirmado",
      tone: "info",
    };
  }
  if (aiUnavailable) {
    return {
      action: { href: "/conversas", label: "Abrir conversas" },
      alert: true,
      description:
        "A agenda está disponível, mas os dados da IA não responderam.",
      icon: "alert",
      title: "Dados de atendimento indisponíveis",
      tone: "error",
    };
  }
  if (aiView === "pending") {
    // Com os quatro passos concluídos o checklist some; a faixa não pode
    // apontar para passos "abaixo" que não estão na tela (Goal074, rodada 4).
    return {
      alert: true,
      description: checklistComplete
        ? "Os passos estão concluídos; falta a IA confirmar a ativação."
        : "Conclua os passos abaixo para a IA responder no WhatsApp.",
      icon: "shield",
      title: "IA em ativação",
      tone: "info",
    };
  }
  if (aiView === "unknown") {
    return {
      alert: true,
      description: "Ainda não confirmamos o status da IA.",
      icon: "info",
      title: "IA não confirmada",
      tone: "info",
    };
  }
  if (aiView === "loading") {
    return {
      alert: false,
      description: "Verificando o status da IA.",
      icon: "shield",
      title: "Verificando IA",
      tone: "info",
    };
  }
  if (aiView === "off") {
    return checklistComplete
      ? {
          alert: true,
          description:
            "As conversas continuam chegando; ninguém recebe resposta automática.",
          icon: "shield",
          title: "IA pausada",
          tone: "warning",
        }
      : {
          alert: true,
          description: "Termine a configuração abaixo para a IA responder no WhatsApp.",
          icon: "shield",
          title: "IA inativa",
          tone: "warning",
        };
  }
  return {
    action: { href: "/configuracoes/ia", label: "Pausar" },
    alert: false,
    description: `Atendendo pelo WhatsApp · ${automatedConversationsToday} ${
      automatedConversationsToday === 1 ? "conversa hoje" : "conversas hoje"
    }`,
    icon: "shield",
    title: "IA ativa",
    tone: "ok",
  };
}

function OperationalBand({ state }: { state: OperationalState }) {
  const active = state.tone === "ok";
  if (state.variant === "disconnected") {
    return (
      <section
        id="operational-status"
        className="operational-strip is-disconnected"
        role="alert"
      >
        <div className="operational-head">
          <Icon className="operational-ban" name={state.icon} />
          <div className="operational-copy">
            <strong>{state.title}</strong>
            <span>{state.description}</span>
          </div>
        </div>
        {state.action && (
          <Link className="operational-reconnect" href={state.action.href}>
            {state.action.label}
          </Link>
        )}
      </section>
    );
  }
  return (
    <section
      id="operational-status"
      className={clsx(
        "operational-strip",
        active && "is-active",
        state.tone === "error" && "alert-error",
        state.tone === "info" && "alert-info",
        state.tone === "warning" && "banner-warning",
      )}
      role={state.alert ? "alert" : undefined}
    >
      {active ? (
        <span className="ia-dot is-active operational-ring" aria-hidden="true" />
      ) : (
        <span
          className={clsx(
            "operational-icon",
            state.tone === "error" && "danger",
            state.tone === "warning" && "warning",
          )}
        >
          <Icon name={state.icon} />
        </span>
      )}
      <div className="operational-copy">
        <strong>{state.title}</strong>
        <span>{state.description}</span>
        {state.action && !active && (
          <Link
            className="btn btn-primary operational-action"
            href={state.action.href}
          >
            {state.action.label}
          </Link>
        )}
      </div>
      {state.action && active && (
        <Link className="operational-link" href={state.action.href}>
          {state.action.label}
        </Link>
      )}
    </section>
  );
}

function AgendaStatus({ status }: { status: string }) {
  const label = appointmentStatusLabel(status);
  if (status.toUpperCase() === "COMPLETED") {
    return (
      <span className="agenda-status is-completed">
        <Icon name="check" />
        {label}
      </span>
    );
  }
  const confirmed = label === "Confirmado";
  return (
    <span
      className={clsx(
        "agenda-status",
        confirmed ? "is-confirmed" : "is-neutral",
      )}
    >
      <span className="agenda-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Marca o atendimento em curso (startTime <= agora < endTime) ou, na
 * ausência de um em curso, o próximo a começar (Goal074 §7.5).
 */
function AgendaToday({
  appointments,
  nowLabel,
}: {
  appointments: Appointment[];
  nowLabel: string;
}) {
  const markerIndex = appointments.findIndex(
    (appointment) => appointment.endTime > nowLabel,
  );
  const insertAt = markerIndex === -1 ? appointments.length : markerIndex;

  return (
    <div className="agenda-stack">
      {appointments.flatMap((appointment, index) => {
        const row = (
          <Link
            className="agenda-row"
            href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
            key={appointment.id}
          >
            <strong className="agenda-time">{appointment.startTime}</strong>
            <span className="agenda-bar" aria-hidden="true" />
            <div className="agenda-row-body">
              <div className="agenda-copy">
                <strong>{appointment.customer?.name ?? "Cliente"}</strong>
                <span>
                  {appointment.services.length > 0
                    ? appointment.services
                        .map((service) => service.name)
                        .join(", ")
                    : (appointment.title ?? "Atendimento")}
                  {" · "}
                  {durationLabel(appointment.durationMinutes)}
                </span>
              </div>
              <AgendaStatus status={appointment.status} />
            </div>
          </Link>
        );
        return index === insertAt
          ? [
              <div className="agenda-now-marker" key="agora">
                agora
              </div>,
              row,
            ]
          : [row];
      })}
      {insertAt === appointments.length && (
        <div className="agenda-now-marker" key="agora">
          agora
        </div>
      )}
    </div>
  );
}

/**
 * O sino da Home (Goal074, Goal077 §3): a partir de 1024 px abre a gaveta da
 * central sobre a Home, sem navegar; abaixo disso — e fora da casca, onde não
 * há gaveta — é o link para a central em tela empurrada.
 */
function HomeBell({ unreadCount }: { unreadCount: number }) {
  const drawer = useNotificationsDrawer();
  const wide = useNotificationsDrawerViewport();
  const label =
    unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : "Notificações";
  const content = (
    <>
      <Icon name="bell" />
      {unreadCount > 0 && <span className="home-bell-dot" aria-hidden="true" />}
    </>
  );
  if (drawer && wide) {
    return (
      <button
        aria-expanded={drawer.isOpen}
        aria-haspopup="dialog"
        aria-label={label}
        className="home-bell"
        onClick={drawer.open}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <Link aria-label={label} className="home-bell" href="/notificacoes">
      {content}
    </Link>
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
  const { session } = useProductRuntime();
  const scheduling =
    dashboard.scheduling.status === "ok" ? dashboard.scheduling.data : null;
  const ai = dashboard.ai.status === "ok" ? dashboard.ai.data : null;
  const calendarUnavailable = dashboard.scheduling.status === "error";
  const aiUnavailable = dashboard.ai.status === "error";
  const whatsappIssue = whatsappBannerIssue(status.whatsappView);
  const todayAppointments = scheduling?.todayAppointments ?? [];
  const attention = ai?.conversationsNeedingAttention ?? [];
  const attentionCount = ai?.conversationsNeedingAttentionCount ?? 0;
  const weekAppointments = calendarUnavailable
    ? null
    : (scheduling?.appointmentsThisWeek ?? 0);
  const weekAiAppointments = aiUnavailable ? null : (ai?.aiAppointmentsThisWeek ?? 0);
  const weekHandoffs = aiUnavailable
    ? null
    : (ai?.conversationsTakenOverThisWeek ?? 0);
  const checklistItems = buildChecklistItems({
    capabilities: scheduling?.calendar.capabilities ?? null,
    whatsappActive: status.whatsappView === "active",
  });
  const checklistComplete = checklistItems.every((item) => item.done);
  /**
   * Checklist pós-onboarding (Goal018/WU-10): só aparece com uma leitura
   * confirmada de `GET /v1/status` (nunca durante `loading`, para não afirmar
   * pendência antes de saber), some assim que a IA está efetivamente ativa e
   * some também com todos os passos concluídos mesmo antes disso — nunca ao
   * lado da faixa "IA pausada" (Goal074, blocker 1: "IA inativa", com o
   * checklist, é um estado diferente de "IA pausada").
   */
  const checklistVisible =
    status.phase !== "loading" && status.aiView !== "active" && !checklistComplete;
  const greeting = homeGreeting(dashboard.platform.timezone, session?.user.name);
  const todayLong = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: dashboard.platform.timezone,
    weekday: "long",
  })
    .format(new Date())
    .replace("-feira", "");
  const today = todayLong.charAt(0).toUpperCase() + todayLong.slice(1);
  const nowLabel = currentTimeLabel(dashboard.platform.timezone);
  const operationalState = resolveOperationalState({
    aiUnavailable,
    aiView: status.aiView,
    automatedConversationsToday: ai?.automatedConversationsToday ?? 0,
    calendarUnavailable,
    checklistComplete,
    whatsappIssue,
  });
  const unreadCount = status.notificationsSummary?.unreadCount ?? 0;

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>{greeting}</h1>
          <p className="dashboard-date">{today}</p>
        </div>
        <HomeBell unreadCount={unreadCount} />
      </header>

      <OperationalBand state={operationalState} />

      {checklistVisible && (
        <PostOnboardingChecklist items={checklistItems} />
      )}

      <div className="dashboard-body">
        {attentionCount > 0 && (
          <article
            id="attention"
            className="card dashboard-card attention-card"
          >
            <header className="dashboard-card-head">
              <h2>Precisa da sua atenção</h2>
              <span className="badge badge-attention">
                {`${attentionCount} ${attentionCount === 1 ? "conversa" : "conversas"}`}
              </span>
            </header>
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
          </article>
        )}

        <article id="agenda-today" className="card dashboard-card today-card">
          <header className="dashboard-card-head today-head">
            <div className="today-title">
              <h2>Hoje</h2>
              <span
                className={clsx(
                  "today-count",
                  calendarUnavailable && "is-danger",
                )}
              >
                {calendarUnavailable
                  ? "· Indisponível"
                  : `· ${todayAppointments.length} ${todayAppointments.length === 1 ? "atendimento" : "atendimentos"}`}
              </span>
            </div>
            <Link className="dashboard-link" href="/agenda">
              Ver agenda
            </Link>
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
                <h3>Nenhum atendimento hoje.</h3>
                <p>
                  Agendamentos criados manualmente ou pela Atendly aparecerão
                  aqui.
                </p>
                <Link className="btn btn-secondary" href="/agenda/novo">
                  Novo agendamento
                </Link>
              </div>
            </div>
          ) : (
            <AgendaToday appointments={todayAppointments} nowLabel={nowLabel} />
          )}
        </article>

        <article className="card dashboard-card week-card">
          <header className="dashboard-card-head week-head">
            <h2>Esta semana</h2>
          </header>
          <div className="week-stats">
            <div className="week-stat">
              <span className="week-stat-value">
                {weekAppointments ?? "—"}
              </span>
              <span className="week-stat-label">agendamentos</span>
            </div>
            <div className="week-stat">
              <span className="week-stat-value">
                {weekAiAppointments ?? "—"}
              </span>
              <span className="week-stat-label">marcados pela IA</span>
            </div>
            <div className="week-stat">
              <span className="week-stat-value">{weekHandoffs ?? "—"}</span>
              <span className="week-stat-label">conversas que você assumiu</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

type ChecklistItem = {
  /** Ação na própria linha, além do link do item, enquanto ela couber. */
  action?: { href: string; label: string };
  done: boolean;
  href: string;
  /** Por que o item ainda não tem ação: dito, nunca escondido. */
  hint?: string;
  key: string;
  label: string;
};

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
 *
 * Cada item leva ao módulo que o resolve (Goal063 §4), concluído ou não: o
 * link é o próprio nome do item. O teste mora em Configurações › IA, e só é
 * oferecido depois do WhatsApp, que é o que ele usa para conversar.
 */
function buildChecklistItems({
  capabilities,
  whatsappActive,
}: {
  capabilities: CalendarState["capabilities"] | null;
  whatsappActive: boolean;
}): ChecklistItem[] {
  const testDone = Boolean(capabilities?.activationTestCompleted);
  return [
    {
      done: Boolean(capabilities?.aiActivationReady),
      href: "/servicos",
      key: "service",
      label: "Cadastrar um serviço",
    },
    {
      done: Boolean(capabilities?.hoursConfigured),
      href: "/configuracoes/disponibilidade",
      key: "hours",
      label: "Definir horários de atendimento",
    },
    {
      action: whatsappActive
        ? undefined
        : { href: "/configuracoes/whatsapp", label: "Conectar" },
      done: whatsappActive,
      href: "/configuracoes/whatsapp",
      key: "whatsapp",
      label: "Conectar o WhatsApp",
    },
    {
      action:
        whatsappActive && !testDone
          ? { href: "/configuracoes/ia#teste-real", label: "Fazer o teste" }
          : undefined,
      done: testDone,
      hint: whatsappActive || testDone ? undefined : "depois do WhatsApp",
      href: "/configuracoes/ia#teste-real",
      key: "activation-test",
      label: "Concluir o teste da IA",
    },
  ];
}

function PostOnboardingChecklist({ items }: { items: ChecklistItem[] }) {
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
            <Link className="checklist-link" href={item.href}>
              {item.label}
            </Link>
            {item.hint && <span className="checklist-hint">{item.hint}</span>}
            {item.action && (
              <Link className="btn btn-secondary" href={item.action.href}>
                {item.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
