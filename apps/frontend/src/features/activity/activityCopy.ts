import type { ActivityChange, ActivityEntry } from "@/data";
import { extractPhoneDigits, formatBrazilianPhone } from "@/shared/phone";
import {
  isHexColor,
  isServiceColorToken,
  type ServiceColor,
  serviceColorLabel,
} from "@/shared/serviceColor";

/**
 * Frases da tela "Atividade" (D-176, D-200): o registro chega com verbo
 * estável (`appointment.rescheduled`), campos e antes/depois; a frase em
 * pt-BR nasce aqui, sem termo interno ("A IA remarcou Ana de 14:00 para
 * 15:30"), e cada valor sai legível para quem não é técnico: cor com o
 * círculo e o nome, minutos em "1 h 30 min", dinheiro em "R$ 90,00",
 * telefone em "+55 11 91234-5678". Linhas antigas, gravadas antes desses
 * ajustes, passam pela mesma tradução.
 */

type Details = Record<string, unknown>;
type RawValue = ActivityChange["before"];

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
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

/** "20/10/2026" de `2026-10-20` (data solta, sem hora). */
function formatFullDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

/** "R$ 90,00". */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency",
  })
    .format(value)
    .replace(/ /gu, " ");
}

/** "30 min", "1 h 30 min", "5 h", "1 dia", "2 dias". */
export function formatMinutes(value: number): string {
  if (value >= 1440 && value % 1440 === 0) {
    const days = value / 1440;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function daysLabel(value: number): string {
  return value === 1 ? "1 dia" : `${value} dias`;
}

/** Só dígitos (com ou sem "+"): um número, nunca um nome. */
const PHONE_LIKE = /^\+?\d[\d\s()-]{7,}$/u;

/**
 * Nome do contato ou do cliente; quando o registro só tem o número, o
 * número formatado ("+55 55 99693-6463"). Identificador do WhatsApp que não
 * é telefone vira "um contato do WhatsApp", nunca dígitos crus.
 */
export function personLabel(value: unknown, fallback: string): string {
  const label = text(value);
  if (!label) return fallback;
  if (!PHONE_LIKE.test(label)) return label;
  return (
    formatBrazilianPhone(label, "plus") ??
    (extractPhoneDigits(label).length > 13 ? "um contato do WhatsApp" : label)
  );
}

function phoneValue(value: string): string {
  return formatBrazilianPhone(value, "plus") ?? value;
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

const TIMEZONES: Record<string, string> = {
  "America/Sao_Paulo": "Brasília (GMT−3)",
  "America/Manaus": "Manaus (GMT−4)",
  "America/Rio_Branco": "Rio Branco (GMT−5)",
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
  color: "Cor",
  colorToken: "Cor",
  colorHex: "Cor",
  bufferBeforeMinutes: "Intervalo antes",
  bufferAfterMinutes: "Intervalo depois",
  recurrenceIntervalDays: "Retorno sugerido",
  active: "Situação",
  startsAt: "Horário",
  status: "Situação",
  finalValue: "Valor final",
  primaryGuardian: "Quem agenda",
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
  messageExample: "Mensagem de exemplo",
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
  exceptionPhones: "Números que recebem de verdade",
  exceptionCount: "Números que recebem de verdade",
};

/** Campo que nenhuma tradução conhece: rótulo neutro, nunca "Campo". */
export const UNKNOWN_FIELD_LABEL = "Outro ajuste";

function isSandbox(entry: ActivityEntry): boolean {
  return entry.action.startsWith("settings.ai_sandbox");
}

export function fieldLabel(entry: ActivityEntry, field: string): string {
  if (field.startsWith("weekday.")) {
    return WEEKDAYS[Number(field.slice("weekday.".length))] ?? "Dia da semana";
  }
  if (field.startsWith("memory.")) {
    return MEMORY_KINDS[field.slice("memory.".length)] ?? "Preferência";
  }
  if (field === "enabled" && isSandbox(entry)) return "Modo sandbox";
  if (entry.entity.type === "business" && field === "category")
    return "Segmento";
  return FIELD_LABELS[field] ?? UNKNOWN_FIELD_LABEL;
}

/**
 * Um lado do antes/depois, pronto para a tela. `color` desenha o círculo
 * da cor do serviço (`null` = serviço sem cor); `muted` é o valor que o
 * registro não guardou; `items` é uma lista, um por linha.
 */
export interface ChangeValue {
  text: string;
  color?: ServiceColor | null;
  muted?: boolean;
  items?: string[];
}

const EMPTY_TEXT: Record<string, string> = {
  description: "Sem descrição",
  address: "Sem endereço",
  price: "Sem preço",
  finalValue: "Sem valor",
  durationMinutes: "Sem duração",
  recurrenceIntervalDays: "Sem retorno",
  bufferBeforeMinutes: "Sem intervalo",
  bufferAfterMinutes: "Sem intervalo",
  primaryGuardian: "Ninguém",
  aiInstruction: "Sem instrução",
  content: "Vazio",
  messageExample: "Sem mensagem",
  modalities: "Nenhum",
  exceptionPhones: "Nenhum",
  category: "Sem categoria",
};

const MINUTE_FIELDS = new Set([
  "durationMinutes",
  "bufferBeforeMinutes",
  "bufferAfterMinutes",
  "minLeadMinutes",
  "granularityMinutes",
  "customerChangeMinNoticeMinutes",
]);

const DAY_FIELDS = new Set([
  "maxLeadDays",
  "recurrenceIntervalDays",
  "commercialRetentionDays",
  "personalRetentionDays",
]);

function plain(value: string): ChangeValue {
  return { text: value };
}

function colorValue(color: ServiceColor | null): ChangeValue {
  return color
    ? { text: serviceColorLabel(color), color }
    : { text: "Sem cor", color: null };
}

/** Valor legível de um lado do antes/depois; vazio vira o "nada" do campo. */
export function formatChangeValue(
  entry: ActivityEntry,
  field: string,
  value: RawValue,
): ChangeValue {
  if (field.startsWith("weekday.")) {
    return plain(value === null || value === "" ? "Fechado" : String(value));
  }
  if (field.startsWith("reminder.")) {
    return plain(
      typeof value === "number"
        ? `${formatMinutes(value)} antes`
        : "Sem lembrete",
    );
  }
  if (field === "color" || field === "colorToken" || field === "colorHex") {
    if (isHexColor(value))
      return colorValue(value.toLowerCase() as ServiceColor);
    if (isServiceColorToken(value)) return colorValue(value);
    return colorValue(null);
  }
  if (field === "exceptionCount" && typeof value === "number") {
    if (value === 0) return plain("Nenhum");
    return plain(value === 1 ? "1 número" : `${value} números`);
  }
  if (field === "enabled") {
    if (isSandbox(entry)) return plain(value ? "Ligado" : "Desligado");
    return plain(value ? "Ligada" : "Desligada");
  }
  if (field === "active") return plain(value ? "Ativo" : "Arquivado");
  if (value === null || value === "") {
    return { text: EMPTY_TEXT[field] ?? "—", muted: true };
  }
  if (field === "exceptionPhones" && typeof value === "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(phoneValue);
    return { text: items.join(", "), items };
  }
  if (field === "phone" && typeof value === "string")
    return plain(phoneValue(value));
  if (field === "startsAt")
    return plain(formatLocalStamp(value) ?? String(value));
  if (
    (field === "price" || field === "finalValue") &&
    typeof value === "number"
  ) {
    return plain(formatCurrency(value));
  }
  if (MINUTE_FIELDS.has(field) && typeof value === "number") {
    return plain(formatMinutes(value));
  }
  if (DAY_FIELDS.has(field) && typeof value === "number") {
    return plain(daysLabel(value));
  }
  if (field === "timezone" && typeof value === "string") {
    return plain(
      TIMEZONES[value] ?? value.replace(/^.*\//u, "").replace(/_/gu, " "),
    );
  }
  if (field === "modalities" && typeof value === "string") {
    return plain(
      value
        .split(",")
        .map((item) => MODALITIES[item.trim()] ?? item.trim())
        .join(", "),
    );
  }
  if (field === "category" && entry.entity.type === "business") {
    return plain(String(value));
  }
  const choices = CHOICES[field];
  if (choices && typeof value === "string")
    return plain(choices[value] ?? value);
  if (typeof value === "boolean") return plain(value ? "Sim" : "Não");
  if (typeof value === "string") {
    const date = formatFullDate(value);
    if (date) return plain(date);
    const stamp = formatLocalStamp(value);
    if (stamp) return plain(stamp);
  }
  return plain(String(value));
}

/**
 * Linha do antes/depois. `before: null` é a linha de um valor só (o que foi
 * adicionado ou apagado: a frase já diz qual dos dois).
 */
export interface ChangeLine {
  field: string;
  label: string;
  before: ChangeValue | null;
  after: ChangeValue;
}

const COLOR_FIELDS = new Set(["color", "colorToken", "colorHex"]);

/**
 * A cor do serviço é uma só (D-184). Registro novo traz `color`; o antigo
 * trazia `colorHex` sozinho, porque `colorToken` caía no filtro de segredo:
 * `null → #d479ff` ali quer dizer "uma cor da paleta (que não ficou
 * registrada) virou a personalizada", e `#hex → null`, o contrário.
 */
function colorChange(
  entry: ActivityEntry,
): { before: ChangeValue; after: ChangeValue } | null {
  const merged = entry.changes.find((change) => change.field === "color");
  if (merged) {
    return {
      before: formatChangeValue(entry, "color", merged.before),
      after: formatChangeValue(entry, "color", merged.after),
    };
  }
  const token = entry.changes.find((change) => change.field === "colorToken");
  const hex = entry.changes.find((change) => change.field === "colorHex");
  if (!token && !hex) return null;
  const side = (key: "before" | "after"): ChangeValue => {
    const hexValue = hex?.[key];
    const tokenValue = token?.[key];
    if (isHexColor(hexValue))
      return formatChangeValue(entry, "color", hexValue);
    if (isServiceColorToken(tokenValue)) {
      return formatChangeValue(entry, "color", tokenValue);
    }
    if (token) return formatChangeValue(entry, "color", null);
    return key === "before"
      ? { text: "Não registrada", muted: true }
      : { text: "Uma das cores sugeridas", muted: true };
  };
  return { before: side("before"), after: side("after") };
}

/** Campos que a frase já conta: repetir embaixo só faz ruído. */
function hiddenInSentence(entry: ActivityEntry, field: string): boolean {
  switch (entry.action) {
    case "appointment.rescheduled":
      return field === "startsAt";
    case "appointment.cancelled":
    case "appointment.completed":
    case "appointment.no_show":
      return field === "status";
    case "settings.ai_enabled":
    case "settings.ai_paused":
    case "settings.ai_sandbox_enabled":
    case "settings.ai_sandbox_disabled":
      return field === "enabled";
    case "service.archived":
    case "service.reactivated":
      return field === "active";
    case "service.created":
    case "customer.created":
      return field === "name" || field === "active";
    default:
      return false;
  }
}

/** Ações em que o antes/depois é o que entrou ou o que saiu, um valor só. */
const ADDED_ACTIONS = new Set([
  "customer.created",
  "service.created",
  "customer.note_added",
  "customer.tag_added",
  "customer.memory_added",
  "knowledge.document_created",
]);
const REMOVED_ACTIONS = new Set([
  "customer.note_deleted",
  "customer.tag_deleted",
  "customer.memory_removed",
  "customer.guardian_cleared",
]);

function isEmpty(value: RawValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/** Linhas de antes/depois que valem a pena mostrar, na ordem do registro. */
export function changeLines(entry: ActivityEntry): ChangeLine[] {
  const lines: ChangeLine[] = [];
  let colorDone = false;
  for (const change of entry.changes) {
    if (hiddenInSentence(entry, change.field)) continue;
    if (COLOR_FIELDS.has(change.field)) {
      if (colorDone) continue;
      colorDone = true;
      const color = colorChange(entry);
      if (!color) continue;
      lines.push({
        field: "color",
        label: "Cor",
        before: ADDED_ACTIONS.has(entry.action) ? null : color.before,
        after: color.after,
      });
      continue;
    }
    const label = fieldLabel(entry, change.field);
    if (ADDED_ACTIONS.has(entry.action) && isEmpty(change.before)) {
      if (isEmpty(change.after)) continue;
      lines.push({
        field: change.field,
        label,
        before: null,
        after: formatChangeValue(entry, change.field, change.after),
      });
      continue;
    }
    if (REMOVED_ACTIONS.has(entry.action) && isEmpty(change.after)) {
      if (isEmpty(change.before)) continue;
      lines.push({
        field: change.field,
        label,
        before: null,
        after: formatChangeValue(entry, change.field, change.before),
      });
      continue;
    }
    lines.push({
      field: change.field,
      label,
      before: formatChangeValue(entry, change.field, change.before),
      after: formatChangeValue(entry, change.field, change.after),
    });
  }
  return lines;
}

function subject(entry: ActivityEntry): string {
  return entry.actor === "AI" ? "A IA" : "Você";
}

function customer(entry: ActivityEntry, details: Details): string {
  return personLabel(details.customerName ?? entry.entity.label, "um cliente");
}

/** "Corte, Escova" ou o título do atendimento sem serviço. */
function servicesOf(details: Details): string | null {
  const services = Array.isArray(details.services)
    ? details.services.filter(
        (item): item is string => typeof item === "string",
      )
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

function isPersonal(details: Details): boolean {
  return details.kind === "PERSONAL";
}

/** A frase de uma linha do registro. */
export function activitySentence(entry: ActivityEntry): string {
  const who = subject(entry);
  const details: Details = entry.details ?? {};
  const label = text(entry.entity.label);
  const person = customer(entry, details);
  const contact = personLabel(entry.entity.label, "um contato");
  const customerLabel = personLabel(entry.entity.label, "um cliente");
  const when = formatLocalStamp(details.startsAt);
  const at = when ? ` para ${when}` : "";
  const on = when ? ` de ${when}` : "";
  const services = servicesOf(details);
  const service = label ? `o serviço ${label}` : "um serviço";

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
      return `${who} cadastrou ${customerLabel}`;
    case "customer.updated":
      return `${who} alterou o cadastro de ${customerLabel}`;
    case "customer.deleted":
      return `${who} excluiu o cadastro de ${customerLabel}`;
    case "customer.deactivated":
      return `${who} desativou ${person}`;
    case "customer.reactivated":
      return `${who} reativou ${person}`;
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
      return `${who} criou ${service}`;
    case "service.updated":
      return `${who} alterou ${service}`;
    case "service.archived":
      return `${who} arquivou ${service}`;
    case "service.reactivated":
      return `${who} reativou ${service}`;
    case "service.ai_instruction_updated":
      return label
        ? `${who} mudou a instrução para a IA do serviço ${label}`
        : `${who} mudou a instrução para a IA de um serviço`;

    case "agenda.block_created":
      return isPersonal(details)
        ? `${who} marcou um compromisso pessoal${blockSpan(details)}${quoted(label)}`
        : `${who} bloqueou a agenda${blockSpan(details)}${quoted(label)}`;
    case "agenda.block_removed":
      return isPersonal(details)
        ? `${who} desmarcou um compromisso pessoal${blockSpan(details)}${quoted(label)}`
        : `${who} liberou um bloqueio${blockSpan(details)}${quoted(label)}`;
    case "agenda.block_moved":
      return isPersonal(details)
        ? `${who} mudou o horário de um compromisso pessoal${quoted(label)}`
        : `${who} mudou o horário de um bloqueio${quoted(label)}`;
    case "agenda.block_series_created":
      return isPersonal(details)
        ? `${who} criou um compromisso pessoal que se repete${quoted(label)}`
        : `${who} criou um bloqueio que se repete${quoted(label)}`;
    case "agenda.block_series_updated":
      return isPersonal(details)
        ? `${who} alterou um compromisso pessoal que se repete${quoted(label)}`
        : `${who} alterou um bloqueio que se repete${quoted(label)}`;
    case "agenda.block_series_removed":
      return isPersonal(details)
        ? `${who} encerrou um compromisso pessoal que se repete${quoted(label)}`
        : `${who} encerrou um bloqueio que se repete${quoted(label)}`;
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
      return entry.changes.some((change) => change.field === "tone")
        ? `${who} mudou o estilo da IA`
        : `${who} alterou a IA`;
    case "settings.ai_sandbox_enabled":
      return `${who} ligou o modo sandbox`;
    case "settings.ai_sandbox_disabled":
      return `${who} desligou o modo sandbox`;
    case "settings.ai_sandbox_updated":
      return `${who} mudou quem recebe de verdade no modo sandbox`;
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
      return `${who} assumiu a conversa com ${contact}`;
    case "conversation.released_to_ai":
      return `${who} devolveu a conversa com ${contact} para a IA`;
    case "conversation.handoff_requested":
      return `A IA passou a conversa com ${contact} para você`;
    case "conversation.category_changed":
      return `${who} mudou a categoria da conversa com ${contact}`;
    case "conversation.contact_ignored":
      return `${who} pediu para a IA não atender ${contact}`;
    case "conversation.contact_unignored":
      return `${who} voltou a deixar a IA atender ${contact}`;
    case "conversation.resolved":
      return `${who} encerrou a conversa com ${contact}`;

    case "import.started":
      return `${who} começou a importar os dados da Minha Agenda`;
    case "import.completed":
      return `${who} concluiu a importação da Minha Agenda`;
    case "import.source_connected":
      return `${who} conectou a Minha Agenda para importar`;
    case "import.source_disconnected":
      return `${who} desconectou a Minha Agenda`;

    default:
      return label
        ? `${who} fez uma alteração em ${personLabel(label, label)}`
        : `${who} fez uma alteração`;
  }
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plural(value: number, one: string, many: string): string {
  return `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;
}

/** "Repete segunda e quarta, das 12:00 às 13:00". */
function seriesPattern(details: Details): string | null {
  const days = Array.isArray(details.daysOfWeek)
    ? details.daysOfWeek
        .filter((day): day is number => typeof day === "number")
        .sort((left, right) => left - right)
        .map((day) => WEEKDAY_NAMES[day])
        .filter((day): day is string => Boolean(day))
    : [];
  if (days.length === 0) return null;
  const list =
    days.length === 7
      ? "Repete todos os dias"
      : days.length === 1
        ? `Repete ${days[0]}`
        : `Repete ${days.slice(0, -1).join(", ")} e ${days.at(-1)}`;
  const start = text(details.startTime);
  const end = text(details.endTime);
  return start && end ? `${list}, das ${start} às ${end}` : list;
}

/** Linha complementar quando há algo além do antes/depois. */
export function activityNote(entry: ActivityEntry): string | null {
  const details: Details = entry.details ?? {};
  switch (entry.action) {
    case "appointment.cancelled": {
      const reason = text(details.reason);
      return reason ? `Motivo: ${reason}` : null;
    }
    case "conversation.handoff_requested":
      return text(details.summary) ?? text(details.reason);
    case "import.completed": {
      const counts = (details.counts ?? {}) as Record<string, unknown>;
      const imported = count(counts.imported);
      if (imported === null) return null;
      const parts = [plural(imported, "item importado", "itens importados")];
      const failed = count(counts.failed);
      if (failed) parts.push(plural(failed, "não importado", "não importados"));
      return parts.join(" · ");
    }
    case "settings.ai_sandbox_enabled":
      return "As mensagens deixam de sair para os clientes; só os números de exceção recebem de verdade.";
    case "settings.ai_sandbox_disabled":
      return "As mensagens voltaram a sair para os clientes.";
    case "agenda.block_series_created":
    case "agenda.block_series_updated":
    case "agenda.block_series_removed":
      return seriesPattern(details);
    case "agenda.extra_availability_added":
    case "agenda.extra_availability_removed":
    case "agenda.unavailability_added":
    case "agenda.unavailability_removed": {
      const reason = text(details.reason);
      return reason ? `Motivo: ${reason}` : null;
    }
    default:
      return null;
  }
}

const RETURN_TO = `voltar=${encodeURIComponent("/configuracoes/atividade")}`;

/** Para onde a linha leva, quando a entidade tem tela própria. */
export function activityHref(entry: ActivityEntry): string | null {
  const id = entry.entity.id;
  if (!id) return null;
  if (entry.entity.type === "customer" && entry.action !== "customer.deleted") {
    return `/clientes/detalhes?id=${encodeURIComponent(id)}&${RETURN_TO}`;
  }
  if (
    entry.entity.type === "appointment" &&
    entry.action !== "appointment.deleted"
  ) {
    return `/agenda/agendamento?id=${encodeURIComponent(id)}&${RETURN_TO}`;
  }
  if (entry.entity.type === "conversation") {
    return `/conversas/${encodeURIComponent(id)}`;
  }
  return null;
}
