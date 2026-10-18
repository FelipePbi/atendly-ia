"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type AiTone,
  type Appointment,
  appointmentStatusLabel,
  BffHttpError,
  type CalendarState,
  type Conversation,
  type Dashboard,
  type ServiceList,
} from "@/data";
import { durationLabel } from "@/features/agenda/NewAppointmentFields";
import {
  appointmentServiceColors,
  type ServiceColorMap,
  serviceColorMap,
} from "@/features/agenda/occupancy";
import { ChatSheetShell } from "@/features/conversations/ConversationActionsSheet";
import {
  conversationState,
  handoffReasonCopy,
  needsAttention,
  waitingNoticeCopy,
} from "@/features/conversations/conversationState";
import {
  businessDaysAgo,
  conversationLabel,
  formatWaitingTime,
} from "@/features/conversations/format";
import {
  useNotificationsDrawer,
  useNotificationsDrawerViewport,
} from "@/features/notifications/NotificationsDrawer";
import { Icon, type IconName } from "@/shared/icons/Icon";
import { useShellConfig } from "@/shared/layout/ShellConfig";
import { useDeferredLoading } from "@/shared/motion/useDeferredLoading";
import {
  getProductServices,
  useProductRuntime,
} from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";
import {
  type StatusView,
  useSystemStatus,
  type UseSystemStatusResult,
} from "@/shared/runtime/systemStatus";
import { swatchProps } from "@/shared/serviceColor";
import { BrandLoader } from "@/shared/ui/Brand";
import { StatePanel } from "@/shared/ui/States";

import {
  appointmentAmount,
  firstNames,
  homeMoney,
  isCompleted,
} from "./homeMoney";
import {
  AgendaMoneyLine,
  AiProof,
  type HomeViewport,
  MonthBlock,
  PanelPhone,
  PanelWide,
  reveal,
  Spark,
  useHomeRevenue,
  WeekBlock,
} from "./HomeRevenue";

/** A última leitura do Início na aba (D-167): voltar à Home mostra na hora. */
const DASHBOARD_MEMORY_KEY = "dashboard:home";

/**
 * Início sem esqueleto (vídeo de 2026-10-16, o mesmo ajuste de Serviços e
 * Conversas): a última leitura da aba aparece na hora e é revalidada em
 * segundo plano. Sem ela, a área fica vazia; se a leitura passar de ~150 ms
 * (D-168), o "A" animado aparece no centro do conteúdo. Quando o dado chega,
 * o painel entra com fade, também com movimento reduzido (D-173).
 */
export function ProductDashboardScreen() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(
    () => recall<Dashboard>(DASHBOARD_MEMORY_KEY) ?? null,
  );
  // Só a primeira leitura desta visita entra com fade; a lembrada, não.
  const [arriving] = useState(() => !recall(DASHBOARD_MEMORY_KEY));
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const status = useSystemStatus();

  useEffect(() => {
    const controller = new AbortController();
    getProductServices()
      .dashboard.get(controller.signal)
      .then((result) => {
        remember(DASHBOARD_MEMORY_KEY, result);
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

  const showLoader = useDeferredLoading(!dashboard && !error);
  if (!dashboard && !error) {
    return showLoader ? (
      <BrandLoader inline label="Carregando dados do início" />
    ) : null;
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
      arriving={arriving}
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

function homeGreeting(
  timezone: string,
  name: string | null | undefined,
): string {
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
  /** Controle que grava `PATCH /v1/settings/ai`: "Pausar" (H7) ou "Reativar" (H5). */
  control?: "pause" | "resume";
  description: string;
  icon: IconName;
  title: string;
  tone: "error" | "info" | "ok" | "warning";
  /** "disconnected": faixa do H3; "inactive"/"paused": anel vazado dos quadros H4 e H5. */
  variant?: "disconnected" | "inactive" | "paused";
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
  checklistWaitsWhatsapp,
  missingPhrase,
  pausedSince,
  whatsappIssue,
}: {
  aiUnavailable: boolean;
  aiView: StatusView;
  automatedConversationsToday: number;
  calendarUnavailable: boolean;
  checklistComplete: boolean;
  /** O checklist está na tela com "Conectar o WhatsApp" pendente (quadro H4). */
  checklistWaitsWhatsapp: boolean;
  /** "Falta conectar o WhatsApp e fazer o teste": derivada dos passos pendentes. */
  missingPhrase: string;
  /** "Desde 09:12." quando `pausedAt` é conhecido. */
  pausedSince: string | null;
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
  // Exceção do H4 (review117, rodada 1): com o checklist na tela e
  // "Conectar o WhatsApp" pendente, a configuração ainda não terminou e a
  // faixa diz o que falta em vez de "WhatsApp desconectado". Com o checklist
  // completo, a ordem abaixo não muda.
  if (whatsappIssue === "off" && checklistWaitsWhatsapp) {
    return inactiveState(missingPhrase);
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
          control: "resume",
          description: `${pausedSince ? `${pausedSince} ` : ""}As conversas continuam chegando; ninguém recebe resposta automática.`,
          icon: "shield",
          title: "IA pausada",
          tone: "warning",
          variant: "paused",
        }
      : inactiveState(missingPhrase);
  }
  return {
    alert: false,
    control: "pause",
    description: `Atendendo pelo WhatsApp · ${automatedConversationsToday} ${
      automatedConversationsToday === 1 ? "conversa hoje" : "conversas hoje"
    }`,
    icon: "shield",
    title: "IA ativa",
    tone: "ok",
  };
}

function inactiveState(missingPhrase: string): OperationalState {
  return {
    alert: true,
    description: missingPhrase,
    icon: "shield",
    title: "IA inativa",
    tone: "warning",
    variant: "inactive",
  };
}

type ResumeFailure = "failed" | "needs-test";

type BandControls = {
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
  /** `GET /v1/settings` respondeu: sem o estilo lido, nada é gravado. */
  ready: boolean;
  readFailed: boolean;
  resumeFailure: ResumeFailure | null;
};

function OperationalBand({
  controls,
  extra,
  pauseRef,
  state,
}: {
  controls: BandControls;
  /** No tablet, " · 2 aguardam você" na mesma linha da IA ativa. */
  extra?: string | null;
  pauseRef: RefObject<HTMLButtonElement | null>;
  state: OperationalState;
}) {
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
  const hollow = state.variant === "paused" || state.variant === "inactive";
  return (
    <section
      id="operational-status"
      className={clsx(
        "operational-strip",
        active && "is-active",
        state.variant === "paused" && "is-paused",
        state.variant === "inactive" && "is-inactive",
        state.tone === "error" && "alert-error",
        state.tone === "info" && "alert-info",
      )}
      role={state.alert && !controls.resumeFailure ? "alert" : undefined}
    >
      {active ? (
        <span
          className="ia-dot is-active operational-ring"
          aria-hidden="true"
        />
      ) : hollow ? (
        <span className="operational-ring-off" aria-hidden="true" />
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
        <span>
          {state.description}
          {extra}
        </span>
        {state.control && controls.readFailed && (
          <p className="operational-note" role="status">
            Não foi possível ler as configurações da IA agora.
          </p>
        )}
        {controls.resumeFailure === "needs-test" && (
          <p className="operational-error" role="alert">
            A IA só liga depois de um teste real que terminou bem.{" "}
            <Link href="/configuracoes/ia#teste-real">Fazer o teste</Link>
          </p>
        )}
        {controls.resumeFailure === "failed" && (
          <p className="operational-error" role="alert">
            Não foi possível reativar a IA.
          </p>
        )}
        {state.action && !active && (
          <Link
            className="btn btn-primary operational-action"
            href={state.action.href}
          >
            {state.action.label}
          </Link>
        )}
      </div>
      {state.control === "pause" && (
        <button
          className="operational-link"
          disabled={!controls.ready}
          onClick={controls.onPause}
          ref={pauseRef}
          type="button"
        >
          Pausar
        </button>
      )}
      {state.control === "resume" && (
        <button
          className="operational-resume"
          disabled={!controls.ready || controls.busy}
          onClick={controls.onResume}
          type="button"
        >
          Reativar
        </button>
      )}
    </section>
  );
}

function AgendaStatus({ status }: { status: string }) {
  const label = appointmentStatusLabel(status);
  if (status.toUpperCase() === "COMPLETED") {
    return (
      <span className="agenda-status is-completed">
        <CheckMark />
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

function CheckMark() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      viewBox="0 0 24 24"
      width="12"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function AgendaRow({
  appointment,
  delay,
  price,
  serviceColors,
}: {
  appointment: Appointment;
  delay: number;
  price: boolean;
  serviceColors: ServiceColorMap;
}) {
  const colors = appointmentServiceColors(appointment, serviceColors);
  const amount = price ? appointmentAmount(appointment) : null;
  return (
    <Link
      className={clsx(
        "today-row hm-reveal",
        isCompleted(appointment) && "is-done",
      )}
      href={`/agenda/agendamento?id=${encodeURIComponent(appointment.id)}`}
      style={reveal(delay)}
    >
      <strong className="agenda-time">{appointment.startTime}</strong>
      <span className="agenda-bar" aria-hidden="true">
        {(colors.length > 0 ? colors : [null]).map((color, part) => (
          <span
            className="agenda-bar-part"
            {...swatchProps(color)}
            key={part}
          />
        ))}
      </span>
      <div className={clsx("agenda-row-body", price && "has-price")}>
        <div className="agenda-copy">
          <strong>{appointment.customer?.name ?? "Cliente"}</strong>
          <span>
            {appointment.services.length > 0
              ? appointment.services.map((service) => service.name).join(" + ")
              : (appointment.title ?? "Atendimento")}
            {" · "}
            {durationLabel(appointment.durationMinutes)}
            {appointment.source === "AI" && (
              <>
                {" "}
                <Spark />
                <span className="sr-only">(marcado pela IA)</span>
              </>
            )}
          </span>
        </div>
        {price ? (
          <div className="agenda-money">
            {amount !== null && (
              <span className="agenda-amount">{homeMoney(amount)}</span>
            )}
            <AgendaStatus status={appointment.status} />
          </div>
        ) : (
          <AgendaStatus status={appointment.status} />
        )}
      </div>
    </Link>
  );
}

/**
 * Concluídos recolhidos numa linha só (1a, celular): sobra espaço para o que
 * vem. Tocar abre os atendimentos de novo.
 */
function CompletedSummary({
  appointments,
  expanded,
  onToggle,
}: {
  appointments: Appointment[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = appointments.reduce(
    (sum, appointment) => sum + (appointmentAmount(appointment) ?? 0),
    0,
  );
  const first = appointments[0];
  const last = appointments.at(-1);
  if (!first || !last) return null;
  return (
    <button
      aria-expanded={expanded}
      className={clsx("today-row is-done is-summary", expanded && "is-open")}
      onClick={onToggle}
      type="button"
    >
      <strong className="agenda-time">{first.startTime}</strong>
      <span className="agenda-bar is-neutral" aria-hidden="true" />
      <span className="agenda-row-body has-price">
        <span className="agenda-copy">
          <strong>
            {appointments.length} concluídos até {last.endTime}
          </strong>
          <span>{firstNames(appointments)}</span>
        </span>
        <span className="agenda-summary-end">
          <span className="agenda-money">
            <span className="agenda-amount">{homeMoney(total)}</span>
            <span className="agenda-status is-completed">
              <CheckMark />
              Faturado
            </span>
          </span>
          <svg
            aria-hidden="true"
            className="agenda-summary-chevron"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </span>
    </button>
  );
}

/**
 * Marca o atendimento em curso (startTime <= agora < endTime) ou, na
 * ausência de um em curso, o próximo a começar (Goal074 §7.5).
 */
function AgendaToday({
  appointments,
  collapseDone,
  nowLabel,
  price,
  serviceColors,
  showNowMarker,
}: {
  appointments: Appointment[];
  /** 1a no celular: dois ou mais concluídos antes de "agora" viram uma linha. */
  collapseDone: boolean;
  nowLabel: string;
  price: boolean;
  /** Cor de cada serviço lida de `GET /v1/services` (D-108 (f)); sem cor, traço neutro. */
  serviceColors: ServiceColorMap;
  showNowMarker: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const markerIndex = appointments.findIndex(
    (appointment) => appointment.endTime > nowLabel,
  );
  const insertAt = !showNowMarker
    ? -1
    : markerIndex === -1
      ? appointments.length
      : markerIndex;
  const before = insertAt === -1 ? 0 : insertAt;
  const done = appointments
    .slice(0, before)
    .filter((appointment) => isCompleted(appointment));
  const collapsed = collapseDone && done.length >= 2;
  const marker = (
    <div className="agenda-now-marker hm-fade" key="agora">
      agora
    </div>
  );

  return (
    <div className="agenda-stack">
      {collapsed && (
        <CompletedSummary
          appointments={done}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
        />
      )}
      {appointments.flatMap((appointment, index) => {
        if (collapsed && !expanded && done.includes(appointment)) return [];
        const row = (
          <AgendaRow
            appointment={appointment}
            delay={0.18 + Math.max(0, index - (appointments.length - 7)) * 0.04}
            key={appointment.id}
            price={price}
            serviceColors={serviceColors}
          />
        );
        return index === insertAt ? [marker, row] : [row];
      })}
      {insertAt === appointments.length && marker}
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

type SettingsRead =
  | { phase: "error" }
  | { phase: "loading" }
  | { pausedAt: string | null; phase: "ready"; tone: AiTone };

type ServiceToReview = ServiceList["items"][number];

/** "Desde 09:12." se a pausa é de hoje no fuso do negócio; "Desde 04/10, 09:12." se de outro dia. */
function pausedSinceLabel(
  pausedAt: string | null,
  timezone: string,
): string | null {
  if (!pausedAt) return null;
  const instant = new Date(pausedAt);
  if (Number.isNaN(instant.getTime())) return null;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
  }).format(instant);
  if (businessDaysAgo(pausedAt, timezone) === 0) return `Desde ${time}.`;
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
  }).format(instant);
  return `Desde ${day}, ${time}.`;
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ConversationPendency({
  conversation,
  state,
}: {
  conversation: Conversation;
  state: "ai-unstable" | "waiting-you";
}) {
  const reason =
    state === "ai-unstable"
      ? handoffReasonCopy(conversation.handoffReason)
      : waitingNoticeCopy(conversation.handoffReason);
  const elapsed = formatWaitingTime(conversation.updatedAt);
  return (
    <Link
      className="pendency-row is-conversation"
      href={`/conversas/${encodeURIComponent(conversation.id)}`}
    >
      <span aria-hidden="true" className="pendency-dot" />
      <div className="pendency-text">
        <strong>{conversationLabel(conversation)}</strong>
        {reason ? ` ${reason}` : null}
        <span className="pendency-sub">
          {state === "waiting-you"
            ? `Aguardando ${elapsed}`
            : `A IA não conseguiu responder · ${elapsed}`}
        </span>
      </div>
      <ChevronIcon />
    </Link>
  );
}

function ServicePendency({ service }: { service: ServiceToReview }) {
  const textId = useId();
  return (
    <div className="pendency-row is-service">
      <svg
        aria-hidden="true"
        className="pendency-warning"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M12 4 21 20H3z" />
        <path d="M12 10v4M12 17v.5" />
      </svg>
      <div className="pendency-text" id={textId}>
        <strong>{service.name}</strong> está sem duração
        <span className="pendency-sub">
          A IA não consegue marcar esse serviço
        </span>
      </div>
      <Link
        aria-describedby={textId}
        className="pendency-action"
        href={`/servicos/editar?id=${encodeURIComponent(service.id)}`}
      >
        Corrigir
      </Link>
    </div>
  );
}

function PauseConfirmation({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  return (
    <ChatSheetShell
      className="is-pause"
      onClose={onCancel}
      title="Pausar sua IA?"
      titleId={titleId}
    >
      <div className="pause-sheet-head">
        <span aria-hidden="true" className="pause-sheet-icon">
          <svg
            fill="none"
            height="22"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="22"
          >
            <path d="M9 6v12M15 6v12" />
          </svg>
        </span>
        <div className="pause-sheet-copy">
          <h2 className="pause-sheet-title" id={titleId}>
            Pausar sua IA?
          </h2>
          <p>
            Enquanto estiver pausada, seus clientes não recebem respostas
            automáticas. As conversas continuam chegando normalmente e você
            reativa quando quiser.
          </p>
        </div>
      </div>
      {error && (
        <p className="chat-sheet-error" role="alert">
          {error}
        </p>
      )}
      <div className="pause-sheet-actions">
        <button
          className="pause-sheet-confirm"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          Pausar IA
        </button>
        <button className="pause-sheet-cancel" onClick={onCancel} type="button">
          Continuar atendendo
        </button>
      </div>
    </ChatSheetShell>
  );
}

function RealDashboard({
  arriving,
  dashboard,
  onRetry,
  status,
}: {
  arriving: boolean;
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
  const timezone = dashboard.platform.timezone;
  const todayAppointments = scheduling?.todayAppointments ?? [];
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
    status.phase !== "loading" &&
    status.aiView !== "active" &&
    !checklistComplete;
  const greeting = homeGreeting(timezone, session?.user.name);
  const todayLong = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: timezone,
    weekday: "long",
  })
    .format(new Date())
    .replace("-feira", "");
  const today = todayLong.charAt(0).toUpperCase() + todayLong.slice(1);
  const nowLabel = currentTimeLabel(timezone);

  const [settings, setSettings] = useState<SettingsRead>({ phase: "loading" });
  const [catalog, setCatalog] = useState<ServiceToReview[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [resumeFailure, setResumeFailure] = useState<ResumeFailure | null>(
    null,
  );
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const pauseWasOpen = useRef(false);
  const viewport = useHomeViewport();
  const revenue = useHomeRevenue(dashboard);
  const [variant, setVariant] = useState<HomeVariant>(
    () => recall<HomeVariant>(VARIANT_MEMORY_KEY) ?? "painel",
  );
  // A coreografia de entrada roda na primeira leitura da visita e a cada
  // troca de direção; a leitura lembrada aparece parada (D-167).
  const [animate, setAnimate] = useState(arriving);
  const [entry, setEntry] = useState(0);

  function chooseVariant(next: HomeVariant) {
    if (next === variant) return;
    remember(VARIANT_MEMORY_KEY, next);
    setVariant(next);
    setAnimate(true);
    setEntry((value) => value + 1);
  }

  /**
   * O estilo (`tone`) e a hora da pausa vêm de `GET /v1/settings`, lido de novo
   * a cada painel novo e a cada mudança do estado da IA. A falha não derruba a
   * Home: sem a leitura, só "Pausar" e "Reativar" ficam desabilitados.
   */
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => getProductServices().settings.get(controller.signal))
      .then((state) => {
        setSettings({
          pausedAt: state.ai.pausedAt ?? null,
          phase: "ready",
          tone: state.ai.tone ?? "BALANCED",
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSettings((current) =>
          current.phase === "ready" ? current : { phase: "error" },
        );
      });
    return () => controller.abort();
  }, [dashboard, status.aiView]);

  /**
   * A falha de `GET /v1/services` só tira a linha de serviço das pendências e
   * deixa o traço dos atendimentos neutro; a agenda continua na tela.
   */
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => getProductServices().serviceCatalog.list(controller.signal))
      .then((list) => setCatalog(list.items))
      .catch(() => {
        if (!controller.signal.aborted) setCatalog([]);
      });
    return () => controller.abort();
  }, [dashboard]);

  useEffect(() => {
    if (pauseWasOpen.current && !pauseOpen) pauseRef.current?.focus();
    pauseWasOpen.current = pauseOpen;
  }, [pauseOpen]);

  const servicesToReview = catalog.filter((service) => service.needsReview);
  const serviceColors = serviceColorMap(catalog);
  const attention = (ai?.conversationsNeedingAttention ?? [])
    .map((conversation) => ({
      conversation,
      state: conversationState(conversation),
    }))
    .filter(
      (
        entry,
      ): entry is {
        conversation: Conversation;
        state: "ai-unstable" | "waiting-you";
      } => needsAttention(entry.state),
    );
  const pendencyConversations = [
    ...attention.filter((entry) => entry.state === "ai-unstable"),
    ...attention.filter((entry) => entry.state === "waiting-you"),
  ];
  const hasPendencies =
    pendencyConversations.length + servicesToReview.length > 0;
  const remainingAppointments = todayAppointments.filter(
    (appointment) => appointment.startTime > nowLabel,
  );
  const listedAppointments = hasPendencies
    ? remainingAppointments
    : todayAppointments;
  const todayCount = hasPendencies
    ? `· ${remainingAppointments.length} ${remainingAppointments.length === 1 ? "restante" : "restantes"}`
    : todayAppointments.length > 0
      ? `· ${todayAppointments.length} ${todayAppointments.length === 1 ? "atendimento" : "atendimentos"}`
      : null;

  const operationalState = resolveOperationalState({
    aiUnavailable,
    aiView: status.aiView,
    automatedConversationsToday: ai?.automatedConversationsToday ?? 0,
    calendarUnavailable,
    checklistComplete,
    checklistWaitsWhatsapp:
      checklistVisible &&
      checklistItems.some((item) => item.key === "whatsapp" && !item.done),
    missingPhrase: missingStepsPhrase(checklistItems),
    pausedSince: pausedSinceLabel(
      settings.phase === "ready" ? settings.pausedAt : null,
      timezone,
    ),
    whatsappIssue,
  });
  const unreadCount = status.notificationsSummary?.unreadCount ?? 0;

  async function writeAi(enabled: boolean): Promise<boolean> {
    if (settings.phase !== "ready" || aiBusy) return false;
    setAiBusy(true);
    try {
      await getProductServices().settings.updateAi({
        enabled,
        tone: settings.tone,
      });
      status.refresh();
      onRetry();
      return true;
    } catch (caught) {
      if (enabled) {
        setResumeFailure(
          caught instanceof BffHttpError &&
            caught.code === "AI_ACTIVATION_TEST_REQUIRED"
            ? "needs-test"
            : "failed",
        );
      } else {
        setPauseError("Não foi possível pausar a IA.");
      }
      return false;
    } finally {
      setAiBusy(false);
    }
  }

  async function resume() {
    setResumeFailure(null);
    await writeAi(true);
  }

  async function confirmPause() {
    setPauseError(null);
    if (await writeAi(false)) setPauseOpen(false);
  }

  function cancelPause() {
    if (aiBusy) return;
    setPauseError(null);
    setPauseOpen(false);
  }

  const conversationsToday = ai?.automatedConversationsToday ?? 0;
  const waitingCount = ai?.conversationsNeedingAttentionCount ?? 0;
  const conversationsLine = ai
    ? `${conversationsToday} ${conversationsToday === 1 ? "conversa hoje" : "conversas hoje"}${
        waitingCount > 0
          ? `, ${waitingCount} ${waitingCount === 1 ? "aguarda" : "aguardam"} você`
          : ""
      }`
    : null;
  const bandExtra =
    operationalState.tone === "ok" && waitingCount > 0
      ? ` · ${waitingCount} ${waitingCount === 1 ? "aguarda" : "aguardam"} você`
      : null;
  const painel = variant === "painel";
  const upcoming = remainingAppointments.filter(
    (appointment) => !isCompleted(appointment),
  );

  /** O bloco "Hoje"/"Próximos": cabeçalho, estado da agenda e a lista. */
  function agendaSection({
    collapseDone,
    full,
    price,
  }: {
    collapseDone: boolean;
    full: boolean;
    price: boolean;
  }) {
    const list = full ? listedAppointments : upcoming;
    const count = full
      ? todayCount
      : upcoming.length > 0
        ? `· ${upcoming.length} ${upcoming.length === 1 ? "atendimento" : "atendimentos"}`
        : null;
    return (
      <article
        className="card dashboard-card today-card hm-reveal"
        id="agenda-today"
        style={reveal(0.14)}
      >
        <header className="dashboard-card-head today-head">
          <div className="today-title">
            <h2>{full ? "Hoje" : "Próximos"}</h2>
            {(calendarUnavailable || count) && (
              <span
                className={clsx(
                  "today-count",
                  calendarUnavailable && "is-danger",
                )}
              >
                {calendarUnavailable ? "· Indisponível" : count}
              </span>
            )}
          </div>
          <Link className="dashboard-link" href="/agenda">
            Ver agenda
          </Link>
        </header>
        {price && revenue.day && !calendarUnavailable && (
          <AgendaMoneyLine layout={viewport} report={revenue.day} />
        )}
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
        ) : list.length === 0 ? (
          <div className="today-empty">
            <div aria-hidden="true" className="today-empty-art">
              <span className="today-empty-line" />
              <span className="today-empty-line" />
              <span className="today-empty-slot" />
              <span className="today-empty-line" />
              <span className="today-empty-line" />
            </div>
            <h3 className="today-empty-title">
              {todayAppointments.length === 0
                ? "Nenhum atendimento hoje."
                : "Nenhum atendimento restante hoje."}
            </h3>
            <Link className="today-empty-action" href="/agenda/novo">
              Criar agendamento
            </Link>
          </div>
        ) : (
          <AgendaToday
            appointments={list}
            collapseDone={collapseDone}
            nowLabel={nowLabel}
            price={price}
            serviceColors={serviceColors}
            showNowMarker={full && !hasPendencies}
          />
        )}
      </article>
    );
  }

  const proof = revenue.week ? (
    <AiProof
      aiOff={status.aiView === "off"}
      headline={painel}
      more={!painel}
      report={revenue.week}
      since={viewport === "desktop"}
    />
  ) : null;

  let layout: ReactNode;
  if (painel && viewport === "phone") {
    layout = (
      <>
        <PanelPhone animate={animate} reports={revenue} />
        {agendaSection({ collapseDone: false, full: false, price: false })}
      </>
    );
  } else if (painel) {
    layout = (
      <>
        <PanelWide
          animate={animate}
          layout={viewport === "desktop" ? "desktop" : "tablet"}
          reports={revenue}
        />
        <div className="hm-split">
          {agendaSection({
            collapseDone: false,
            full: viewport === "desktop",
            price: false,
          })}
          {proof}
        </div>
      </>
    );
  } else if (viewport === "phone") {
    layout = (
      <>
        {agendaSection({ collapseDone: true, full: true, price: true })}
        {revenue.week && <WeekBlock layout="phone" report={revenue.week} />}
        {revenue.month && <MonthBlock report={revenue.month} />}
      </>
    );
  } else {
    layout = (
      <div className="hm-split">
        {agendaSection({ collapseDone: false, full: true, price: true })}
        <div className="hm-aside">
          {revenue.week && (
            <WeekBlock layout={viewport} report={revenue.week} />
          )}
          {revenue.month && <MonthBlock report={revenue.month} />}
          {proof}
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "dashboard-page hm-page",
        `is-${variant}`,
        `is-${viewport}`,
        animate && "is-entering",
      )}
      key={`${variant}-${entry}`}
    >
      <header className="dashboard-header hm-reveal" style={reveal(0)}>
        <div>
          <h1>{greeting}</h1>
          <p className="dashboard-date">
            {today}
            {viewport === "desktop" &&
              conversationsLine &&
              ` · ${conversationsLine}`}
          </p>
        </div>
        <div className="hm-header-actions">
          <VariantSwitch onChange={chooseVariant} value={variant} />
          <HomeBell unreadCount={unreadCount} />
        </div>
      </header>

      <div className="hm-stack">
        <OperationalBand
          controls={{
            busy: aiBusy,
            onPause: () => setPauseOpen(true),
            onResume: () => void resume(),
            readFailed: settings.phase === "error",
            ready: settings.phase === "ready",
            resumeFailure,
          }}
          extra={viewport === "tablet" ? bandExtra : null}
          pauseRef={pauseRef}
          state={operationalState}
        />

        {hasPendencies && (
          <section
            aria-labelledby="attention-heading"
            className="attention-card pendency-block"
            id="attention"
          >
            <h2 className="pendency-label" id="attention-heading">
              Precisa da sua atenção
            </h2>
            <div className="pendency-list">
              {pendencyConversations.map(({ conversation, state }) => (
                <ConversationPendency
                  conversation={conversation}
                  key={conversation.id}
                  state={state}
                />
              ))}
              {servicesToReview.map((service) => (
                <ServicePendency key={service.id} service={service} />
              ))}
            </div>
          </section>
        )}

        {checklistVisible && <PostOnboardingChecklist items={checklistItems} />}

        {layout}
      </div>

      {pauseOpen && (
        <PauseConfirmation
          busy={aiBusy}
          error={pauseError}
          onCancel={cancelPause}
          onConfirm={() => void confirmPause()}
        />
      )}
    </div>
  );
}

type HomeVariant = "painel" | "agenda";

const VARIANT_MEMORY_KEY = "home:variant";

/**
 * Seletor discreto ao lado do sino: o faturamento num painel (1b, padrão) ou
 * dentro da agenda (1a).
 */
function VariantSwitch({
  onChange,
  value,
}: {
  onChange: (value: HomeVariant) => void;
  value: HomeVariant;
}) {
  return (
    <div aria-label="Como ver o faturamento" className="hm-switch" role="group">
      <button
        aria-label="Faturamento em painel"
        aria-pressed={value === "painel"}
        className={clsx("hm-switch-option", value === "painel" && "is-active")}
        onClick={() => onChange("painel")}
        title="Faturamento em painel"
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
          width="18"
        >
          <rect height="16" rx="2.5" width="18" x="3" y="4" />
          <path d="M8 16v-4M12 16V9M16 16v-2" />
        </svg>
      </button>
      <button
        aria-label="Faturamento na agenda"
        aria-pressed={value === "agenda"}
        className={clsx("hm-switch-option", value === "agenda" && "is-active")}
        onClick={() => onChange("agenda")}
        title="Faturamento na agenda"
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
          width="18"
        >
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      </button>
    </div>
  );
}

const PHONE_QUERY = "(max-width: 767px)";
const DESKTOP_QUERY = "(min-width: 1100px)";

function readViewport(): HomeViewport {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "phone";
  }
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  if (window.matchMedia(PHONE_QUERY).matches) return "phone";
  return "tablet";
}

/**
 * Celular abaixo de 768 px, tablet até a sidebar aparecer (1100 px), desktop
 * daí em diante — as três telas do protótipo.
 */
function useHomeViewport(): HomeViewport {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const queries = [PHONE_QUERY, DESKTOP_QUERY].map((query) =>
        window.matchMedia(query),
      );
      for (const query of queries) query.addEventListener("change", notify);
      return () => {
        for (const query of queries) {
          query.removeEventListener("change", notify);
        }
      };
    },
    readViewport,
    () => "phone",
  );
}

type ChecklistItem = {
  /** Ação da linha; só o primeiro passo pendente a mostra. */
  action: { href: string; label: string };
  done: boolean;
  href: string;
  /** Por que o passo ainda não tem ação: dito, nunca escondido. */
  hint?: string;
  key: string;
  label: string;
  /** Como o passo entra na frase "Falta …" da faixa "IA inativa". */
  missing: string;
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
      action: { href: "/servicos", label: "Cadastrar" },
      done: Boolean(capabilities?.aiActivationReady),
      href: "/servicos",
      key: "service",
      label: "Cadastrar um serviço",
      missing: "cadastrar um serviço",
    },
    {
      action: { href: "/configuracoes/disponibilidade", label: "Definir" },
      done: Boolean(capabilities?.hoursConfigured),
      href: "/configuracoes/disponibilidade",
      key: "hours",
      label: "Definir horários de atendimento",
      missing: "definir os horários de atendimento",
    },
    {
      action: { href: "/configuracoes/whatsapp", label: "Conectar" },
      done: whatsappActive,
      href: "/configuracoes/whatsapp",
      key: "whatsapp",
      label: "Conectar o WhatsApp",
      missing: "conectar o WhatsApp",
    },
    {
      action: { href: "/configuracoes/ia#teste-real", label: "Fazer o teste" },
      done: testDone,
      hint: whatsappActive || testDone ? undefined : "depois do WhatsApp",
      href: "/configuracoes/ia#teste-real",
      key: "activation-test",
      label: "Fazer o teste real",
      missing: "fazer o teste",
    },
  ];
}

/** "Falta conectar o WhatsApp e fazer o teste": só os passos pendentes, na ordem do checklist. */
function missingStepsPhrase(items: ChecklistItem[]): string {
  const missing = items
    .filter((item) => !item.done)
    .map((item) => item.missing);
  if (missing.length === 0) return "";
  const last = missing.at(-1);
  const list =
    missing.length === 1
      ? last
      : `${missing.slice(0, -1).join(", ")} e ${last}`;
  return `Falta ${list}`;
}

function PostOnboardingChecklist({ items }: { items: ChecklistItem[] }) {
  const doneCount = items.filter((item) => item.done).length;
  const firstPending = items.find((item) => !item.done);

  return (
    <section className="checklist-card" aria-labelledby="checklist-heading">
      <div className="checklist-head">
        <h2 id="checklist-heading">Ative sua IA</h2>
        <p className="checklist-count">
          {doneCount} de {items.length} passos concluídos
        </p>
        <div aria-hidden="true" className="checklist-progress">
          {items.map((item) => (
            <span
              className={clsx("checklist-segment", item.done && "is-done")}
              key={item.key}
            />
          ))}
        </div>
      </div>
      <ul className="checklist-list">
        {items.map((item) => (
          <li
            aria-label={`${item.label}: ${item.done ? "concluído" : "pendente"}`}
            className={clsx(
              "checklist-item",
              item.done && "is-done",
              item === firstPending && "is-current",
            )}
            key={item.key}
          >
            <span className="checklist-marker" aria-hidden="true">
              {item.done && (
                <svg
                  fill="none"
                  height="13"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                  viewBox="0 0 24 24"
                  width="13"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
            <Link className="checklist-link" href={item.href}>
              {item.label}
            </Link>
            {item.hint && item !== firstPending && (
              <span className="checklist-hint">{item.hint}</span>
            )}
            {item === firstPending && (
              <Link className="checklist-action" href={item.action.href}>
                {item.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
