import type { Service, ServiceColorToken } from "@/data";

import {
  formatServiceDuration,
  formatServicePrice,
  formatServiceRecurrence,
} from "./serviceFormatting";

export const colorTokenOptions: Array<{
  value: ServiceColorToken;
  label: string;
}> = [
  { value: "SKY", label: "Ameixa" },
  { value: "AMBER", label: "Terracota" },
  { value: "EMERALD", label: "Oliva" },
  { value: "SLATE", label: "Ardósia" },
  { value: "ROSE", label: "Rosa-antigo" },
  { value: "VIOLET", label: "Lavanda" },
];

export const SERVICE_SNAPSHOT_NOTE =
  "Agendamentos já marcados continuam com os valores combinados na época.";

/** O estado do formulário de edição, como o `ServiceForm` o guarda. */
export interface ServiceFormValues {
  active: boolean;
  aiInstruction: string;
  aiInstructionOriginal: string;
  aiInstructionReadError: boolean;
  bufferAfter: string;
  bufferBefore: string;
  colorToken: ServiceColorToken | "";
  description: string;
  durationValue: string;
  name: string;
  priceCents: number | null;
  priceType: Service["priceType"];
  recurrenceValue: string;
}

export type ServiceChangeField =
  | "name"
  | "duration"
  | "price"
  | "color"
  | "description"
  | "recurrence"
  | "buffers"
  | "instruction"
  | "active";

export interface ServiceChange {
  field: ServiceChangeField;
  /** Artigo que antecede o rótulo: "o", "a" ou "as". */
  article: string;
  /** Nome do campo, que a interface desenha em `<strong>`. */
  label: string;
  /** "45 → 50 min", sem parênteses; `null` quando a frase não traz valores. */
  detail: string | null;
}

export interface ServiceSentencePart {
  strong?: true;
  text: string;
}

export interface ServiceChanges {
  changes: ServiceChange[];
  hasChanges: boolean;
  /** A frase inteira em partes, para a interface pôr o rótulo em `<strong>`. */
  sentence: ServiceSentencePart[];
  sentenceText: string;
  /** Segunda linha: só quando nome, duração, preço ou intervalo mudam. */
  snapshotNote: string | null;
}

const SNAPSHOT_FIELDS: ReadonlySet<ServiceChangeField> = new Set([
  "name",
  "duration",
  "price",
  "buffers",
]);

function parseCount(value: string, emptyAs: number | null): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return emptyAs;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : emptyAs;
}

function requiresPrice(priceType: Service["priceType"]): boolean {
  return priceType === "FIXED" || priceType === "STARTING_AT";
}

function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function durationDetail(before: number | null, after: number | null): string {
  if (before !== null && after !== null && before < 60 && after < 60) {
    return `${before} → ${after} min`;
  }
  return `${formatServiceDuration(before)} → ${formatServiceDuration(after)}`;
}

function colorName(token: ServiceColorToken | null): string {
  if (token === null) return "sem cor";
  return colorTokenOptions.find((option) => option.value === token)?.label ?? token;
}

function pushText(parts: ServiceSentencePart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last && !last.strong) last.text += text;
  else parts.push({ text });
}

function buildSentence(
  items: Array<{ detail: string | null; lead: string; strong: string }>,
  serviceName: string,
): ServiceSentencePart[] {
  const parts: ServiceSentencePart[] = [];
  pushText(parts, "Você mudou ");
  items.forEach((item, index) => {
    if (index > 0) pushText(parts, index === items.length - 1 ? " e " : ", ");
    pushText(parts, `${item.lead} `);
    parts.push({ strong: true, text: item.strong });
    if (item.detail !== null) pushText(parts, ` (${item.detail})`);
  });
  pushText(parts, ` de ${serviceName}.`);
  return parts;
}

/**
 * Compara o serviço carregado com o formulário, normalizado como o `PATCH` o
 * enviaria, e devolve só as mudanças reais: um campo que volta ao valor
 * original deixa de contar.
 */
export function describeServiceChanges(
  service: Service,
  form: ServiceFormValues,
): ServiceChanges {
  const changes: ServiceChange[] = [];

  const nameBefore = service.name.trim();
  const nameAfter = form.name.trim();
  if (nameBefore !== nameAfter) {
    changes.push({
      article: "o",
      detail: `${nameBefore} → ${nameAfter}`,
      field: "name",
      label: "nome",
    });
  }

  const durationBefore = service.durationMinutes;
  const durationAfter = parseCount(form.durationValue, null);
  if (durationBefore !== durationAfter) {
    changes.push({
      article: "a",
      detail: durationDetail(durationBefore, durationAfter),
      field: "duration",
      label: "duração",
    });
  }

  const priceBefore = requiresPrice(service.priceType)
    ? (service.price ?? 0)
    : null;
  const priceAfter = requiresPrice(form.priceType)
    ? (form.priceCents ?? 0) / 100
    : null;
  if (service.priceType !== form.priceType || priceBefore !== priceAfter) {
    changes.push({
      article: "o",
      detail: `${formatServicePrice(service)} → ${formatServicePrice({
        price: form.priceCents === null ? null : form.priceCents / 100,
        priceType: form.priceType,
      })}`,
      field: "price",
      label: "preço",
    });
  }

  const colorBefore = service.colorToken ?? null;
  const colorAfter = form.colorToken === "" ? null : form.colorToken;
  if (colorBefore !== colorAfter) {
    changes.push({
      article: "a",
      detail: `${colorName(colorBefore)} → ${colorName(colorAfter)}`,
      field: "color",
      label: "cor na agenda",
    });
  }

  if (nullIfBlank(service.description) !== nullIfBlank(form.description)) {
    changes.push({
      article: "a",
      detail: null,
      field: "description",
      label: "descrição",
    });
  }

  const recurrenceBefore = service.recurrenceIntervalDays || null;
  const recurrenceAfter = parseCount(form.recurrenceValue, null) || null;
  if (recurrenceBefore !== recurrenceAfter) {
    const before = formatServiceRecurrence(recurrenceBefore) ?? "sem recorrência";
    const after = formatServiceRecurrence(recurrenceAfter) ?? "sem recorrência";
    changes.push({
      article: "a",
      detail: `${before} → ${after}`,
      field: "recurrence",
      label: "recorrência",
    });
  }

  if (
    (service.bufferBeforeMinutes ?? 0) !== parseCount(form.bufferBefore, 0) ||
    (service.bufferAfterMinutes ?? 0) !== parseCount(form.bufferAfter, 0)
  ) {
    changes.push({
      article: "o",
      detail: null,
      field: "buffers",
      label: "intervalo antes e depois",
    });
  }

  if (
    !form.aiInstructionReadError &&
    form.aiInstruction !== form.aiInstructionOriginal
  ) {
    changes.push({
      article: "as",
      detail: null,
      field: "instruction",
      label: "instruções para a IA",
    });
  }

  if (service.active !== form.active) {
    changes.push({
      article: "o",
      detail: form.active ? "inativo → ativo" : "ativo → inativo",
      field: "active",
      label: "status",
    });
  }

  if (changes.length === 0) {
    return {
      changes,
      hasChanges: false,
      sentence: [],
      sentenceText: "",
      snapshotNote: null,
    };
  }

  const sentence = buildSentence(
    changes.map((change) => ({
      detail: change.detail,
      lead: change.article,
      strong: change.label,
    })),
    service.name,
  );

  return {
    changes,
    hasChanges: true,
    sentence,
    sentenceText: sentence.map((part) => part.text).join(""),
    snapshotNote: changes.some((change) => SNAPSHOT_FIELDS.has(change.field))
      ? SERVICE_SNAPSHOT_NOTE
      : null,
  };
}
