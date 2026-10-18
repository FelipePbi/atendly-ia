import {
  formatGranularityLabel,
  formatMaxLeadDaysLabel,
  formatMinLeadLabel,
} from "./agendaSummaries";
import { weekdayLabels } from "./shared/labels";

/**
 * Exemplos da tela "Antecedência e intervalos" (D-192): frases concretas do
 * que cada valor escolhido significa, calculadas com a hora de agora no fuso
 * do negócio, e a simulação "Na prática", que junta as quatro escolhas com os
 * dias e horários de atendimento. Tudo usa o valor escolhido na tela, antes de
 * salvar. É ilustrativo: não lê a Agenda, então não sabe o que está ocupado.
 *
 * O tempo é contado em minutos do relógio local desde 1970-01-01 (o "relógio
 * de parede" do fuso), como o motor de disponibilidade faz ao percorrer a
 * grade: o dia é `Math.floor(min / 1440)` e o horário é o resto.
 */

type Rule = {
  active: boolean;
  dayOfWeek: number;
  endTime: string;
  startTime: string;
};

const MINUTES_PER_DAY = 1_440;
// 1970-01-01 foi uma quinta-feira (`dayOfWeek` 4).
const EPOCH_WEEKDAY = 4;
// Hora do atendimento de exemplo na frase do prazo de cancelamento.
const SAMPLE_APPOINTMENT_MINUTE = 10 * 60;
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function localWallClock(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return Math.floor(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    ) / 60_000,
  );
}

function dayIndex(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY);
}

function minuteOfDay(minutes: number): number {
  return minutes - dayIndex(minutes) * MINUTES_PER_DAY;
}

function weekdayOf(day: number): number {
  return (((day + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

function calendarDate(day: number): Date {
  return new Date(day * MINUTES_PER_DAY * 60_000);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function clockLabel(minutes: number): string {
  const inDay = minuteOfDay(minutes);
  const hours = String(Math.floor(inDay / 60)).padStart(2, "0");
  const rest = String(inDay % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}

/** "às 18:37", mas "à 01:00" (e "à 00:30"): a crase acompanha "uma hora". */
function atClock(minutes: number): string {
  return `${minuteOfDay(minutes) < 120 ? "à" : "às"} ${clockLabel(minutes)}`;
}

/** "das 18:37", mas "da 01:00". */
function fromClock(minutes: number): string {
  return `${minuteOfDay(minutes) < 120 ? "da" : "das"} ${clockLabel(minutes)}`;
}

function dayMonth(day: number): string {
  const date = calendarDate(day);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** "hoje", "amanhã" ou "segunda, 05/10", relativo ao dia de hoje. */
function dayRef(day: number, today: number): string {
  if (day === today) return "hoje";
  if (day === today + 1) return "amanhã";
  return `${weekdayLabels[weekdayOf(day)].toLowerCase()}, ${dayMonth(day)}`;
}

/** "hoje às 15:45", "amanhã às 13:45", "segunda, 05/10 às 09:00". */
function momentRef(minutes: number, today: number): string {
  return `${dayRef(dayIndex(minutes), today)} ${atClock(minutes)}`;
}

/** "16 de janeiro" (e "1º de janeiro"), com o ano só quando não é o ano de hoje. */
function longDate(day: number, today: number): string {
  const date = calendarDate(day);
  const year = date.getUTCFullYear();
  const dayOfMonth = date.getUTCDate();
  const base = `${dayOfMonth === 1 ? "1º" : dayOfMonth} de ${MONTHS[date.getUTCMonth()]}`;
  return year === calendarDate(today).getUTCFullYear()
    ? base
    : `${base} de ${year}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stepPhrase(step: number): string {
  if (step % 60 === 0) {
    const hours = step / 60;
    return hours === 1 ? "De hora em hora" : `De ${hours} em ${hours} h`;
  }
  return `De ${step} em ${step} min`;
}

/** Início do expediente mais cedo entre os dias ativos; 09:00 sem nenhum. */
function earliestStart(rules: Rule[]): number {
  const starts = rules
    .filter((rule) => rule.active)
    .map((rule) => timeToMinutes(rule.startTime));
  return starts.length > 0 ? Math.min(...starts) : 9 * 60;
}

/**
 * Horários da grade num dia, como o motor de disponibilidade percorre: de
 * cada intervalo ativo daquele dia da semana, do início em passos do
 * intervalo escolhido, enquanto começar antes do fim.
 */
function gridSlots(day: number, rules: Rule[], step: number): number[] {
  const weekday = weekdayOf(day);
  const slots = new Set<number>();
  for (const rule of rules) {
    if (!rule.active || rule.dayOfWeek !== weekday) continue;
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);
    for (let minute = start; minute < end; minute += step) {
      slots.add(day * MINUTES_PER_DAY + minute);
    }
  }
  return [...slots].sort((a, b) => a - b);
}

/** Antecedência mínima: "Agora são 14:37, então a IA só oferece horários a partir das 18:37." */
export function leadExample({
  minLeadMinutes,
  now,
  timeZone,
}: {
  minLeadMinutes: number;
  now: Date;
  timeZone: string;
}): string {
  const nowLocal = localWallClock(now, timeZone);
  const today = dayIndex(nowLocal);
  const intro = `Agora são ${clockLabel(nowLocal)}`;
  if (minLeadMinutes <= 0) {
    return `${intro}, então a IA pode oferecer qualquer horário livre a partir de agora.`;
  }
  const limit = nowLocal + minLeadMinutes;
  const from =
    dayIndex(limit) === today
      ? fromClock(limit)
      : `de ${momentRef(limit, today)}`;
  return `${intro}, então a IA só oferece horários a partir ${from}.`;
}

/** Até quando: "Hoje é 18 de outubro, então a IA não marca nada depois de 16 de janeiro de 2027." */
export function horizonExample({
  maxLeadDays,
  now,
  timeZone,
}: {
  maxLeadDays: number;
  now: Date;
  timeZone: string;
}): string {
  const today = dayIndex(localWallClock(now, timeZone));
  return `Hoje é ${longDate(today, today)}, então a IA não marca nada depois de ${longDate(today + maxLeadDays, today)}.`;
}

/** Intervalo: "Com 30 min, a IA oferece 09:00, 09:30, 10:00 e assim por diante." */
export function stepExample({
  granularityMinutes,
  rules,
}: {
  granularityMinutes: number;
  rules: Rule[];
}): string {
  const step = Math.max(1, granularityMinutes);
  const start = earliestStart(rules);
  const times = [0, 1, 2].map((index) => clockLabel(start + index * step));
  return `Com ${formatGranularityLabel(step)}, a IA oferece ${times.join(", ")} e assim por diante.`;
}

/**
 * Prazo de cancelamento: "Quem tem horário amanhã às 10:00 só consegue
 * cancelar ou remarcar pelo WhatsApp até hoje às 10:00." O atendimento de
 * exemplo é às 10:00 do primeiro dia cujo prazo ainda não passou.
 */
export function changePolicyExample({
  minNoticeMinutes,
  now,
  timeZone,
}: {
  minNoticeMinutes: number;
  now: Date;
  timeZone: string;
}): string {
  if (minNoticeMinutes <= 0) {
    return "Quem tem horário marcado pode cancelar ou remarcar pelo WhatsApp a qualquer momento antes dele.";
  }
  const nowLocal = localWallClock(now, timeZone);
  const today = dayIndex(nowLocal);
  let appointment = (today + 1) * MINUTES_PER_DAY + SAMPLE_APPOINTMENT_MINUTE;
  while (appointment - minNoticeMinutes <= nowLocal) {
    appointment += MINUTES_PER_DAY;
  }
  return `Quem tem horário ${momentRef(appointment, today)} só consegue cancelar ou remarcar pelo WhatsApp até ${momentRef(appointment - minNoticeMinutes, today)}.`;
}

export interface OfferSimulation {
  /** "13:45". */
  nowLabel: string;
  /** "Hoje", "Amanhã" ou "Segunda, 05/10"; `null` quando não há horário. */
  day: string | null;
  /** Horários da grade daquele dia que a antecedência deixa de fora (o primeiro e o último). */
  struck: string[];
  /** Até três primeiros horários que a IA ofereceria, se estiverem livres. */
  pills: string[];
  /** Uma frase por regra: antecedência, até quando, intervalo e, havendo horário, o prazo de cancelamento. */
  facts: string[];
  /** Sem nenhum horário na grade dentro do limite: o porquê. */
  empty: string | null;
}

/**
 * "Na prática": se alguém pedisse horário agora, quais seriam as primeiras
 * opções, juntando a antecedência, o limite de dias, o intervalo, os dias e
 * horários de atendimento e, para a primeira opção, o prazo de cancelamento.
 */
export function offerSimulation({
  granularityMinutes,
  maxLeadDays,
  minLeadMinutes,
  minNoticeMinutes,
  now,
  rules,
  timeZone,
}: {
  granularityMinutes: number;
  maxLeadDays: number;
  minLeadMinutes: number;
  minNoticeMinutes: number;
  now: Date;
  rules: Rule[];
  timeZone: string;
}): OfferSimulation {
  const step = Math.max(1, granularityMinutes);
  const nowLocal = localWallClock(now, timeZone);
  const today = dayIndex(nowLocal);
  const limit = nowLocal + Math.max(0, minLeadMinutes);
  const horizon = nowLocal + Math.max(0, maxLeadDays) * MINUTES_PER_DAY;

  let pills: number[] = [];
  let struck: number[] = [];
  let day: number | null = null;
  for (let current = today; current <= dayIndex(horizon); current += 1) {
    const slots = gridSlots(current, rules, step);
    const allowed = slots.filter((slot) => slot >= limit && slot <= horizon);
    if (allowed.length === 0) continue;
    day = current;
    pills = allowed.slice(0, 3);
    const skipped = slots.filter((slot) => slot > nowLocal && slot < limit);
    struck =
      skipped.length > 1
        ? [skipped[0], skipped[skipped.length - 1]]
        : skipped;
    break;
  }

  const facts = [
    minLeadMinutes > 0
      ? `Nada antes de ${momentRef(limit, today)} (${formatMinLeadLabel(minLeadMinutes)} de antecedência).`
      : "Pode ser a partir de agora, sem antecedência mínima.",
    `Nada depois de ${longDate(dayIndex(horizon), today)} (${formatMaxLeadDaysLabel(maxLeadDays)} à frente).`,
    `${stepPhrase(step)}, dentro dos seus dias e horários de atendimento.`,
  ];

  if (pills.length > 0) {
    const first = pills[0];
    const firstRef = momentRef(first, today);
    const deadline = first - minNoticeMinutes;
    if (minNoticeMinutes <= 0) {
      facts.push(
        `Quem marcar ${firstRef} pode cancelar ou remarcar pelo WhatsApp a qualquer momento antes do horário.`,
      );
    } else if (deadline > nowLocal) {
      facts.push(
        `Quem marcar ${firstRef} pode cancelar ou remarcar pelo WhatsApp até ${momentRef(deadline, today)}.`,
      );
    } else {
      const window =
        minNoticeMinutes % 60 === 0
          ? `${minNoticeMinutes / 60} h`
          : `${minNoticeMinutes} min`;
      facts.push(
        `Quem marcar ${firstRef} já não pode cancelar nem remarcar pelo WhatsApp, porque faltam menos de ${window}: a IA explica a regra e oferece falar com você.`,
      );
    }
  }

  return {
    day: day === null ? null : capitalize(dayRef(day, today)),
    empty:
      pills.length > 0
        ? null
        : rules.some((rule) => rule.active)
          ? `No limite de ${formatMaxLeadDaysLabel(maxLeadDays)}, não sobra horário de atendimento depois da antecedência mínima, então a IA não teria o que oferecer.`
          : "Nenhum dia de atendimento está ativo, então a IA não tem horário para oferecer. Ajuste em Dias e horários.",
    facts,
    nowLabel: clockLabel(nowLocal),
    pills: pills.map(clockLabel),
    struck: struck.map(clockLabel),
  };
}
