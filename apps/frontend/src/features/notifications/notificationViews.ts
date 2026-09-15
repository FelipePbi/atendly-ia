import type { Notification, NotificationKind, NotificationLevel } from "@/data";

export type NotificationLevelView = {
  className: string;
  label: string;
};

/**
 * Três níveis do vault (`01-Regras/07-Lembretes-Notificacoes-e-Instabilidade`),
 * distintos por rótulo visível e cor — nunca só por cor (AGENTS.md).
 */
const LEVEL_VIEWS: Record<NotificationLevel, NotificationLevelView> = {
  INFO: { className: "is-info", label: "Informativa" },
  ATTENTION: { className: "is-attention", label: "Atenção" },
  CRITICAL: { className: "is-critical", label: "Crítica" },
};

export function notificationLevelView(level: NotificationLevel): NotificationLevelView {
  return LEVEL_VIEWS[level];
}

/**
 * Mesmo vocabulário fechado de `AppointmentNotificationReason` que
 * `LifecycleActions` traduz para o detalhe do agendamento — aqui em versão
 * curta para o cartão da central. `detail` nunca chega até aqui.
 */
const REMINDER_REASON_LABELS: Record<string, string> = {
  LEAD_ALREADY_PASSED: "a antecedência configurada já tinha passado",
  APPOINTMENT_VERSION_SUPERSEDED: "o agendamento mudou antes do envio",
  APPOINTMENT_NOT_CONFIRMED: "o agendamento não estava confirmado",
  APPOINTMENT_CANCELLED: "o agendamento foi cancelado",
  APPOINTMENT_ALREADY_STARTED: "o atendimento já tinha começado",
  REMINDER_CONFIGURATION_CHANGED: "a configuração de lembretes mudou",
  CUSTOMER_WITHOUT_PHONE: "o cliente não tem telefone",
  CONTACT_IGNORED: "o contato está ignorado na IA",
  AI_NOT_ENABLED: "a IA não está habilitada",
  CHANNEL_NOT_CONNECTED: "o canal não está conectado",
  TRANSPORT_FAILED: "o canal recusou o envio",
  TRANSPORT_UNKNOWN: "não foi possível confirmar o envio",
  ATTEMPTS_EXHAUSTED: "as tentativas se esgotaram",
};

/** Vocabulário fechado de `onboardingIssues` (BFF), lido aqui só para copy. */
const SETUP_ISSUE_LABELS: Record<string, string> = {
  BUSINESS_PROFILE_INCOMPLETE: "dados do negócio incompletos",
  BUSINESS_MODALITY_NOT_SELECTED: "modalidade de atendimento não escolhida",
  BUSINESS_ADDRESS_REQUIRED: "endereço do negócio pendente",
  CALENDAR_NOT_SELECTED: "fonte da agenda não escolhida",
  AI_TONE_NOT_SELECTED: "estilo da IA não escolhido",
  ACTIVE_SERVICE_REQUIRED: "nenhum serviço ativo cadastrado",
  AVAILABILITY_REQUIRED: "disponibilidade não configurada",
  CALENDAR_INTEGRATION_NOT_CONNECTED: "conexão com a agenda externa pendente",
};

const KIND_TITLES: Record<NotificationKind, string> = {
  CUSTOMER_WAITING_HUMAN: "Cliente aguardando você",
  REMINDER_FAILED: "Lembrete não enviado",
  IMPORT_COMPLETED: "Importação concluída",
  AI_APPOINTMENT_CREATED: "Agendamento criado pela IA",
  WHATSAPP_DISCONNECTED: "WhatsApp desconectado",
  AI_UNAVAILABLE: "IA indisponível",
  SETUP_INCOMPLETE: "Configuração incompleta",
};

function record(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function formatShortDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

export type NotificationCopy = {
  description: string;
  href: string | null;
  title: string;
};

/**
 * Título e descrição prontos para a central, a partir do `kind` fechado e do
 * `payload` que o BFF já reduziu ao que a copy precisa (PUBLIC_API_V1.md). Um
 * campo ausente ou de forma inesperada nunca quebra a tela — só empobrece a
 * frase para a versão genérica da espécie.
 */
export function notificationCopy(notification: Notification): NotificationCopy {
  const payload = record(notification.payload);
  const title = KIND_TITLES[notification.kind];
  switch (notification.kind) {
    case "CUSTOMER_WAITING_HUMAN": {
      const name = str(payload.contactName) ?? "Um cliente";
      return {
        description: `${name} está esperando atendimento humano.`,
        href: notification.subjectId
          ? `/conversas/${notification.subjectId}`
          : null,
        title,
      };
    }
    case "REMINDER_FAILED": {
      const reason = str(payload.reason);
      const reasonLabel = reason ? (REMINDER_REASON_LABELS[reason] ?? null) : null;
      return {
        description: reasonLabel
          ? `Não foi possível enviar: ${reasonLabel}.`
          : "Não foi possível enviar o lembrete.",
        href: notification.subjectId
          ? `/agenda/agendamento?id=${notification.subjectId}`
          : null,
        title,
      };
    }
    case "IMPORT_COMPLETED": {
      const count = num(payload.importedCount);
      return {
        description:
          count !== null
            ? `${count} registro${count === 1 ? "" : "s"} importado${count === 1 ? "" : "s"} do Minha Agenda.`
            : "Sua importação do Minha Agenda foi concluída.",
        href: "/importacao",
        title,
      };
    }
    case "AI_APPOINTMENT_CREATED": {
      const date = str(payload.date);
      const startTime = str(payload.startTime);
      return {
        description:
          date && startTime
            ? `A IA confirmou um horário para ${formatShortDate(date)} às ${startTime}.`
            : "A IA confirmou um novo horário.",
        href: notification.subjectId
          ? `/agenda/agendamento?id=${notification.subjectId}`
          : null,
        title,
      };
    }
    case "WHATSAPP_DISCONNECTED":
      return {
        description: "Reconecte o WhatsApp para a IA voltar a responder.",
        href: "/configuracoes/whatsapp",
        title,
      };
    case "AI_UNAVAILABLE":
      return {
        description:
          "A IA não está respondendo. As conversas seguem para atendimento humano.",
        href: "/configuracoes/ia",
        title,
      };
    case "SETUP_INCOMPLETE": {
      const issues = Array.isArray(payload.issues)
        ? payload.issues.filter((value): value is string => typeof value === "string")
        : [];
      const labels = issues
        .map((issue) => SETUP_ISSUE_LABELS[issue])
        .filter((value): value is string => Boolean(value));
      return {
        description:
          labels.length > 0
            ? `Pendente: ${labels.join(", ")}.`
            : "Há uma configuração essencial pendente.",
        href: "/configuracoes",
        title,
      };
    }
  }
}

export function formatOccurredAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
