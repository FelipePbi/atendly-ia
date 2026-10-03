import type {
  AgendaInitialView,
  ReminderSettings,
  SettingsState,
} from "@/data";

import { weekdayLabels, weekdayShortLabels } from "./shared/labels";

type AvailabilityRule = NonNullable<
  SettingsState["availability"]
>["rules"][number];

// Segunda…Domingo na tela; o valor gravado de `dayOfWeek` é 0=domingo…6=sábado.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const MIN_LEAD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 60, label: "1 h" },
  { value: 120, label: "2 h" },
  { value: 240, label: "4 h" },
  { value: 1_440, label: "1 dia" },
];

export const MAX_LEAD_DAYS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
];

export const GRANULARITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
];

export const CUSTOMER_CHANGE_POLICY_OPTIONS: Array<{
  value: number;
  label: string;
}> = [
  { value: 0, label: "Sem restrição" },
  { value: 720, label: "Até 12 h antes" },
  { value: 1_440, label: "Até 24 h antes" },
  { value: 2_880, label: "Até 48 h antes" },
];

export const INITIAL_VIEW_OPTIONS: Array<{
  value: AgendaInitialView | null;
  label: string;
}> = [
  { value: null, label: "Automática" },
  { value: "DAY", label: "Dia" },
  { value: "WEEK", label: "Semana" },
  { value: "MONTH", label: "Mês" },
];

export function formatMinLeadLabel(minutes: number): string {
  if (minutes <= 0) return "Sem antecedência mínima";
  if (minutes % 1_440 === 0) {
    const days = minutes / 1_440;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return `${minutes} min`;
}

export function formatMaxLeadDaysLabel(days: number): string {
  return days === 1 ? "1 dia" : `${days} dias`;
}

export function formatGranularityLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 h" : `${hours} h`;
  }
  return `${minutes} min`;
}

export function formatCustomerChangePolicyLabel(minutes: number): string {
  if (minutes <= 0) return "Sem restrição";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Até ${hours} h antes`;
  }
  return `Até ${minutes} min antes`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Agrupa dias vizinhos na semana (Segunda…Domingo) com a mesma chave. */
function groupAdjacentDays(
  days: number[],
  keyOf: (day: number) => string,
): Array<{ days: number[]; key: string }> {
  const groups: Array<{ days: number[]; key: string }> = [];
  for (const day of days) {
    const key = keyOf(day);
    const last = groups[groups.length - 1];
    const previous = last?.days[last.days.length - 1];
    const adjacent =
      previous !== undefined &&
      WEEK_ORDER.indexOf(day) === WEEK_ORDER.indexOf(previous) + 1;
    if (last && last.key === key && adjacent) last.days.push(day);
    else groups.push({ days: [day], key });
  }
  return groups;
}

function dayRange(days: number[]): string {
  const first = weekdayShortLabels[days[0]];
  const last = weekdayShortLabels[days[days.length - 1]];
  return days.length === 1 ? first : `${first}–${last}`;
}

/**
 * Resumo da grade de atendimento: "Seg–Sex 09:00–18:00 · Sáb 09:00–14:00".
 * Junta dias seguidos com os mesmos intervalos, junta mais de um intervalo no
 * mesmo dia ("09:00–12:00 e 14:00–18:00") e, sem regra ativa, diz que não há
 * dia de atendimento.
 */
export function availabilityGridSummary(
  rules: Pick<
    AvailabilityRule,
    "active" | "dayOfWeek" | "endTime" | "startTime"
  >[],
): string {
  const intervalsOf = (day: number) =>
    rules
      .filter((rule) => rule.active && rule.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((rule) => `${rule.startTime}–${rule.endTime}`)
      .join(" e ");
  const workingDays = WEEK_ORDER.filter((day) => intervalsOf(day) !== "");
  if (workingDays.length === 0) return "Nenhum dia de atendimento";
  return groupAdjacentDays(workingDays, intervalsOf)
    .map((group) => `${dayRange(group.days)} ${group.key}`)
    .join(" · ");
}

/** "Seg–Sáb · domingo oculto", ou "Todos os dias" quando nenhum está oculto. */
export function visibleDaysSummary(hiddenDays: Iterable<number>): string {
  const hidden = new Set(hiddenDays);
  if (hidden.size === 0) return "Todos os dias";
  const visible = WEEK_ORDER.filter((day) => !hidden.has(day));
  const hiddenOrdered = WEEK_ORDER.filter((day) => hidden.has(day));
  const hiddenText = `${joinAnd(
    hiddenOrdered.map((day) => weekdayLabels[day].toLowerCase()),
  )} ${hiddenOrdered.length === 1 ? "oculto" : "ocultos"}`;
  if (visible.length === 0) return hiddenText;
  const ranges = groupAdjacentDays(visible, () => "visible").map((group) =>
    dayRange(group.days),
  );
  return `${ranges.join(", ")} · ${hiddenText}`;
}

export function initialViewSummary(view: AgendaInitialView | null): string {
  return (
    INITIAL_VIEW_OPTIONS.find((option) => option.value === view)?.label ??
    "Automática"
  );
}

const MIN_LEAD_SHORT: Record<number, string> = {
  60: "1 h",
  120: "2 h",
  240: "4 h",
  1_440: "1 dia",
};

/** "Mín. 2 h · máx. 60 dias · a cada 30 min". */
export function offerRulesSummary(availability: {
  granularityMinutes: number;
  maxLeadDays: number;
  minLeadMinutes: number;
}): string {
  const min =
    availability.minLeadMinutes <= 0
      ? "Sem antecedência mínima"
      : `Mín. ${MIN_LEAD_SHORT[availability.minLeadMinutes] ?? formatMinLeadLabel(availability.minLeadMinutes)}`;
  return `${min} · máx. ${formatMaxLeadDaysLabel(availability.maxLeadDays)} · a cada ${formatGranularityLabel(availability.granularityMinutes)}`;
}

export function changePolicySummary(minutes: number): string {
  return minutes <= 0
    ? "Sem restrição de antecedência"
    : formatCustomerChangePolicyLabel(minutes);
}

function reminderLeadLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

/** "1 lembrete · 24 h antes · pede confirmação". */
export function remindersSummary(
  reminders: Pick<ReminderSettings, "confirmationEnabled" | "rules">,
): string {
  if (reminders.rules.length === 0) return "Desligados";
  const rules = [...reminders.rules].sort(
    (a, b) => (a.slot === "FIRST" ? -1 : 1) - (b.slot === "FIRST" ? -1 : 1),
  );
  const count = `${rules.length} ${rules.length === 1 ? "lembrete" : "lembretes"}`;
  const leads = `${joinAnd(rules.map((rule) => reminderLeadLabel(rule.leadMinutes)))} antes`;
  return reminders.confirmationEnabled
    ? `${count} · ${leads} · pede confirmação`
    : `${count} · ${leads}`;
}
