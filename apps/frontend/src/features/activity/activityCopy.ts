import type { ActivityChange, ActivityEntry } from "@/data";
import { formatBrazilianPhone } from "@/shared/phone";

/**
 * Frases da tela "Atividade" (D-176): o registro chega com verbo estável
 * (`appointment.rescheduled`), rótulo e antes/depois; a frase em pt-BR nasce
 * aqui, sem termo interno ("A IA remarcou Ana de 14:00 para 15:30").
 */

type Details = Record<string, unknown>;

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `2026-10-20T14:00` (hora local do negócio, sem fuso) em partes. */
function localParts(stamp: unknown): { date: string; time: string } | null {
  const value = text(stamp);
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/u);
  if (!match) return null;
  return { date: `${match[3]}/${match[2]}`, time: match[4] ?? "" };
}

/** "20/10 às 14:00". */
export function formatLocalStamp(stamp: unknown): string | null {
  const parts = localParts(stamp);
  return parts ? `${parts.date} às ${parts.time}` : null;
}

/** "20/10" de `2026-10-20`. */
function formatLocalDate(value: unknown): string | null {
  const match = text(value)?.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${match[3]}/${match[2]}` : null;
}

function currency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })}`;
}

function minutesLabel(value: number): string {
  if (value % 1440 === 0 && value >= 1440) {
    const days = value / 1440;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (value % 60 === 0 && value >= 60) return `${value / 60} h`;
  return `${value} min`;
}

const CHOICES: Record<string, Record<string, string>> = {
  status: {
    CONFIRMED: "Confirmado",
    CANCELLED: "Cancelado",
    COMPLETED: "Concluído",
    NO_SHOW: "Falta",
  },
  priceType: {
    FIXED: "Preço fixo",
    STARTING_AT: "A partir de",
    ON_REQUEST: "Sob consulta",
    NOT_INFORMED: "Sem preço",
  },
  tone: {
    PROFESSIONAL: "Profissional",
    BALANCED: "Equilibrada",
    CASUAL: "Descontraída",
  },
  category: {
    COMMERCIAL: "Comercial",
    UNCLASSIFIED: "Não classificada",
    PERSONAL: "Pessoal",
  },
  pricePolicy: {
    NEVER: "Não mostrar",
    WHEN_FIXED: "Mostrar quando for fixo",
  },
};

const MODALITIES: Record<string, string> = {
  ON_SITE: "Local próprio",
  AT_HOME: "A domicílio",
  ONLINE: "Online",
};

const MEMORY_KINDS: Record<string, string> = {
  PREFERRED_PERIOD: "Período preferido",
  PREFERRED_DAY: "Dia preferido",
  RECURRING_SERVICE: "Serviço de costume",
  OBSERVATION: "Observação",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  durationMinutes: "Duração",
  priceType: "Tipo de preço",
  price: "Preço",
  description: "Descrição",
  colorToken: "Cor",
  colorHex: "Cor",
  bufferBeforeMinutes: "Intervalo antes",
  bufferAfterMinutes: "Intervalo depois",
  recurrenceIntervalDays: "Retorno sugerido",
  active: "Situação",
  startsAt: "Horário",
  status: "Situação",
  finalValue: "Valor final",
  primaryGuardian: "Responsável",
  note: "Observação",
  tag: "Etiqueta",
  aiAuthorized: "A IA pode usar",
  aiAllowed: "A IA pode usar",
  minLeadMinutes: "Antecedência mínima",
  maxLeadDays: "Agenda aberta até",
  granularityMinutes: "Intervalo entre horários",
  customerChangeMinNoticeMinutes: "Aviso mínimo para mudar",
  timezone: "Fuso horário",
  "reminder.FIRST": "Primeiro lembrete",
  "reminder.SECOND": "Segundo lembrete",
  confirmationEnabled: "Pedir confirmação",
  pricePolicy: "Preço no lembrete",
  enabled: "IA",
  tone: "Estilo da IA",
  category: "Categoria",
  modalities: "Atendimento",
  address: "Endereço",
  aiAppointmentCreated: "Avisar quando a IA marcar",
  commercialRetentionDays: "Conversas comerciais",
  personalRetentionDays: "Conversas pessoais",
  content: "Texto",
  title: "Pergunta",
  aiInstruction: "Instrução para a IA",
};

export function fieldLabel(entry: ActivityEntry, field: string): string {
  if (field.startsWith("weekday.")) {
    return WEEKDAYS[Number(field.slice("weekday.".length))] ?? "Dia";
  }
  if (field.startsWith("memory.")) {
    return MEMORY_KINDS[field.slice("memory.".length)] ?? "Informação";
  }
  if (entry.entity.type === "business" && field === "category") return "Segmento";
  return FIELD_LABELS[field] ?? "Campo";
}

/** Valor legível de um lado do antes/depois; `null` vira "—" (ou "Fechado"). */
export function formatChangeValue(
  entry: ActivityEntry,
  field: string,
  value: ActivityChange["before"],
): string {
  if (field.startsWith("weekday.")) return value === null ? "Fechado" : String(value);
  if (field.startsWith("reminder.")) {
    return typeof value === "number" ? `${minutesLabel(value)} antes` : "Sem lembrete";
  }
  if (value === null || value === "") return "—";
  if (field === "phone" && typeof value === "string") {
    return formatBrazilianPhone(value, "parens") ?? value;
  }
  if (field === "startsAt") return formatLocalStamp(value) ?? String(value);
  if ((field === "price" || field === "finalValue") && typeof value === "number") {
    return currency(value);
  }
  if (
    (field === "durationMinutes" ||
      field === "bufferBeforeMinutes" ||
      field === "bufferAfterMinutes" ||
      field === "minLeadMinutes" ||
      field === "granularityMinutes" ||
      field === "customerChangeMinNoticeMinutes") &&
    typeof value === "number"
  ) {
    return minutesLabel(value);
  }
  if (
    (field === "maxLeadDays" ||
      field === "recurrenceIntervalDays" ||
      field === "commercialRetentionDays" ||
      field === "personalRetentionDays") &&
    typeof value === "number"
  ) {
    return value === 1 ? "1 dia" : `${value} dias`;
  }
  if (field === "active") return value ? "Ativo" : "Arquivado";
  if (field === "enabled") return value ? "Ligada" : "Desligada";
  if (field === "modalities" && typeof value === "string") {
    return value
      .split(",")
      .map((item) => MODALITIES[item] ?? item)
      .join(", ");
  }
  if (field === "category" && entry.entity.type === "business") return String(value);
  const choices = CHOICES[field];
  if (choices && typeof value === "string") return choices[value] ?? value;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export interface ChangeLine {
  label: string;
  before: string;
  after: string;
}

/**
 * Linhas de antes/depois que valem a pena mostrar. A troca de horário do
 * atendimento já está na frase; a cor do serviço é só "alterada".
 */
export function changeLines(entry: ActivityEntry): ChangeLine[] {
  if (entry.action === "appointment.rescheduled") return [];
  return entry.changes
    .filter((change) => !["colorToken", "colorHex"].includes(change.field) || entry.changes.length === 1)
    .filter(
      (change) =>
        !(
          entry.action.endsWith(".created") &&
          (change.before === null || change.before === undefined)
        ) || entry.action === "customer.memory_added",
    )
    .map((change) => ({
      label: fieldLabel(entry, change.field),
      before: formatChangeValue(entry, change.field, change.before),
      after: formatChangeValue(entry, change.field, change.after),
    }));
}

function subject(entry: ActivityEntry): string {
  return entry.actor === "AI" ? "A IA" : "Você";
}

function customer(entry: ActivityEntry, details: Details): string {
  return text(details.customerName) ?? entry.entity.label ?? "um cliente";
}

/** "Corte, Escova" ou o título do atendimento sem serviço. */
function servicesOf(details: Details): string | null {
  const services = Array.isArray(details.services)
    ? details.services.filter((item): item is string => typeof item === "string")
    : [];
  return services.length > 0 ? services.join(", ") : text(details.title);
}

function rescheduleSpan(entry: ActivityEntry): string {
  const change = entry.changes.find((item) => item.field === "startsAt");
  const before = localParts(change?.before);
  const after = localParts(change?.after);
  if (!before || !after) return "";
  if (before.date === after.date) {
    return ` de ${before.time} para ${after.time} em ${after.date}`;
  }
  return ` de ${before.date} às ${before.time} para ${after.date} às ${after.time}`;
}

function blockSpan(details: Details): string {
  const start = localParts(details.startsAt);
  const end = localParts(details.endsAt);
  if (!start) return "";
  if (end && end.date === start.date) {
    return ` em ${start.date}, das ${start.time} às ${end.time}`;
  }
  return ` em ${start.date} às ${start.time}`;
}

function exceptionSpan(details: Details): string {
  const date = formatLocalDate(details.date);
  if (!date) return "";
  const start = text(details.startTime);
  const end = text(details.endTime);
  return start && end ? ` em ${date}, das ${start} às ${end}` : ` em ${date}`;
}

function quoted(value: string | null): string {
  return value ? ` “${value}”` : "";
}

/** A frase de uma linha do registro. */
export function activitySentence(entry: ActivityEntry): string {
  const who = subject(entry);
  const details: Details = entry.details ?? {};
  const label = entry.entity.label;
  const person = customer(entry, details);
  const when = formatLocalStamp(details.startsAt);
  const at = when ? ` para ${when}` : "";
  const on = when ? ` de ${when}` : "";
  const services = servicesOf(details);

  switch (entry.action) {
    case "appointment.created":
      return `${who} marcou ${person}${at}${services ? ` · ${services}` : ""}`;
    case "appointment.rescheduled":
      return `${who} remarcou ${person}${rescheduleSpan(entry)}`;
    case "appointment.cancelled":
      return `${who} cancelou o horário de ${person}${on}`;
    case "appointment.completed":
      return `${who} concluiu o atendimento de ${person}${on}`;
    case "appointment.no_show":
      return `${who} registrou falta de ${person}${on}`;
    case "appointment.final_value_set":
      return `${who} registrou o valor final do atendimento de ${person}`;
    case "appointment.presence_confirmed":
      return `${who} confirmou a presença de ${person}${on}`;
    case "appointment.deleted":
      return `${who} removeu o horário de ${person}${on}`;

    case "customer.created":
      return `${who} cadastrou ${label ?? "um cliente"}`;
    case "customer.updated":
      return `${who} alterou o cadastro de ${label ?? "um cliente"}`;
    case "customer.deleted":
      return `${who} excluiu o cadastro de ${label ?? "um cliente"}`;
    case "customer.guardian_set":
      return `${who} definiu quem agenda por ${person}`;
    case "customer.guardian_confirmed":
      return `${who} confirmou ${text(details.guardianName) ?? "o responsável"} como quem agenda por ${person}`;
    case "customer.guardian_cleared":
      return `${who} tirou o responsável de ${person}`;
    case "customer.note_added":
      return `${who} adicionou uma observação em ${person}`;
    case "customer.note_deleted":
      return `${who} apagou uma observação de ${person}`;
    case "customer.note_ai_access":
      return `${who} mudou se a IA pode usar uma observação de ${person}`;
    case "customer.tag_added":
      return `${who} adicionou uma etiqueta em ${person}`;
    case "customer.tag_deleted":
      return `${who} apagou uma etiqueta de ${person}`;
    case "customer.tag_ai_access":
      return `${who} mudou se a IA pode usar uma etiqueta de ${person}`;
    case "customer.memory_added":
      return entry.actor === "AI"
        ? `A IA aprendeu uma preferência de ${person}`
        : `Você anotou uma preferência de ${person}`;
    case "customer.memory_ai_access":
      return `${who} mudou se a IA pode usar uma preferência de ${person}`;
    case "customer.memory_removed":
      return `${who} apagou uma preferência de ${person}`;

    case "service.created":
      return `${who} criou o serviço ${label ?? ""}`.trim();
    case "service.updated":
      return `${who} alterou o serviço ${label ?? ""}`.trim();
    case "service.archived":
      return `${who} arquivou o serviço ${label ?? ""}`.trim();
    case "service.reactivated":
      return `${who} reativou o serviço ${label ?? ""}`.trim();
    case "service.ai_instruction_updated":
      return label
        ? `${who} mudou a instrução para a IA do serviço ${label}`
        : `${who} mudou a instrução para a IA de um serviço`;

    case "agenda.block_created":
      return `${who} bloqueou a agenda${blockSpan(details)}${quoted(label)}`;
    case "agenda.block_removed":
      return `${who} liberou um bloqueio${blockSpan(details)}${quoted(label)}`;
    case "agenda.block_moved":
      return `${who} mudou um bloqueio de horário${quoted(label)}`;
    case "agenda.block_series_created":
      return `${who} criou um bloqueio que se repete${quoted(label)}`;
    case "agenda.block_series_updated":
      return `${who} alterou um bloqueio que se repete${quoted(label)}`;
    case "agenda.block_series_removed":
      return `${who} encerrou um bloqueio que se repete${quoted(label)}`;
    case "agenda.extra_availability_added":
      return `${who} abriu horário extra${exceptionSpan(details)}`;
    case "agenda.extra_availability_removed":
      return `${who} desfez o horário extra${exceptionSpan(details)}`;
    case "agenda.unavailability_added":
      return `${who} marcou indisponibilidade${exceptionSpan(details)}`;
    case "agenda.unavailability_removed":
      return `${who} desfez a indisponibilidade${exceptionSpan(details)}`;

    case "settings.business_updated":
      return `${who} alterou os dados do negócio`;
    case "settings.ai_enabled":
      return `${who} ligou a IA`;
    case "settings.ai_paused":
      return `${who} pausou a IA`;
    case "settings.ai_updated":
      return `${who} mudou o estilo da IA`;
    case "settings.availability_updated":
      return `${who} alterou os horários de atendimento`;
    case "settings.reminders_updated":
      return `${who} alterou os lembretes`;
    case "settings.timezone_updated":
      return `${who} mudou o fuso horário`;
    case "settings.notifications_updated":
      return `${who} alterou os avisos`;
    case "settings.retention_updated":
      return `${who} mudou por quanto tempo as conversas ficam guardadas`;
    case "settings.whatsapp_connect_started":
      return `${who} começou a conectar o WhatsApp`;
    case "settings.whatsapp_disconnected":
      return `${who} desconectou o WhatsApp`;
    case "account.profile_updated":
      return `${who} alterou o nome da conta`;
    case "account.password_changed":
      return `${who} trocou a senha`;
    case "account.deletion_requested":
      return `${who} pediu a exclusão da conta`;
    case "account.deletion_cancelled":
      return `${who} cancelou a exclusão da conta`;
    case "knowledge.document_created":
      return `${who} adicionou a pergunta frequente${quoted(label)}`;
    case "knowledge.document_updated":
      return `${who} alterou a pergunta frequente${quoted(label)}`;
    case "knowledge.document_removed":
      return `${who} removeu a pergunta frequente${quoted(label)}`;
    case "knowledge.other_info_updated":
      return `${who} alterou as outras informações para a IA`;

    case "conversation.taken_over":
      return `${who} assumiu a conversa com ${label ?? "um contato"}`;
    case "conversation.released_to_ai":
      return `${who} devolveu a conversa com ${label ?? "um contato"} para a IA`;
    case "conversation.handoff_requested":
      return `A IA passou a conversa com ${label ?? "um contato"} para você`;
    case "conversation.category_changed":
      return `${who} mudou a categoria da conversa com ${label ?? "um contato"}`;
    case "conversation.contact_ignored":
      return `${who} pediu para a IA não atender ${label ?? "um contato"}`;
    case "conversation.contact_unignored":
      return `${who} voltou a deixar a IA atender ${label ?? "um contato"}`;
    case "conversation.resolved":
      return `${who} encerrou a conversa com ${label ?? "um contato"}`;

    case "import.started":
      return `${who} começou a importar os dados da Minha Agenda`;
    case "import.completed":
      return `${who} concluiu a importação da Minha Agenda`;
    case "import.source_connected":
      return `${who} conectou a Minha Agenda para importar`;
    case "import.source_disconnected":
      return `${who} desconectou a Minha Agenda`;

    default:
      return label ? `${who} fez uma alteração em ${label}` : `${who} fez uma alteração`;
  }
}

/** Linha complementar quando há algo além do antes/depois. */
export function activityNote(entry: ActivityEntry): string | null {
  const details: Details = entry.details ?? {};
  if (entry.action === "appointment.cancelled") {
    const reason = text(details.reason);
    return reason ? `Motivo: ${reason}` : null;
  }
  if (entry.action === "conversation.handoff_requested") {
    return text(details.summary) ?? text(details.reason);
  }
  if (entry.action === "import.completed") {
    const counts = details.counts as { imported?: unknown } | undefined;
    const imported = typeof counts?.imported === "number" ? counts.imported : null;
    return imported === null
      ? null
      : imported === 1
        ? "1 item importado"
        : `${imported} itens importados`;
  }
  return null;
}

const RETURN_TO = `voltar=${encodeURIComponent("/configuracoes/atividade")}`;

/** Para onde a linha leva, quando a entidade tem tela própria. */
export function activityHref(entry: ActivityEntry): string | null {
  const id = entry.entity.id;
  if (!id) return null;
  if (entry.entity.type === "customer" && entry.action !== "customer.deleted") {
    return `/clientes/detalhes?id=${encodeURIComponent(id)}&${RETURN_TO}`;
  }
  if (entry.entity.type === "appointment" && entry.action !== "appointment.deleted") {
    return `/agenda/agendamento?id=${encodeURIComponent(id)}&${RETURN_TO}`;
  }
  if (entry.entity.type === "conversation") {
    return `/conversas/${encodeURIComponent(id)}`;
  }
  return null;
}
