import type { OnboardingDraft } from "./OnboardingRuntime";

/** Só o que a demonstração lê do rascunho: nada de agenda real nem de BFF. */
export type DemoDraft = Pick<
  OnboardingDraft,
  | "dayHours"
  | "days"
  | "endTime"
  | "serviceDuration"
  | "serviceName"
  | "servicePrice"
  | "servicePriceType"
  | "startTime"
  | "timezone"
>;

export type DemoItem = {
  kind: "ai" | "client" | "event";
  text: string;
};

export type DemoConversation = {
  /** Data completa do dia da demonstração, por exemplo "sexta-feira, 2 de outubro". */
  dateLabel: string;
  items: DemoItem[];
  /** Horários oferecidos (até três), por exemplo ["14h", "15h30", "17h"]. */
  slots: string[];
};

const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MONTH_NAMES = [
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

const FALLBACK_TIMEZONE = "America/Sao_Paulo";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** A resposta de preço da demonstração, pelo tipo gravado (Goal065): a IA só
 * informa o valor cadastrado, e "A partir de" nunca vira preço fixo. */
export function demoPriceReply(
  draft: Pick<DemoDraft, "serviceName" | "servicePrice" | "servicePriceType">,
): string {
  const name = draft.serviceName;
  if (draft.servicePriceType === "ON_REQUEST") {
    return `O valor do ${name} é sob consulta.`;
  }
  const raw = draft.servicePrice.trim().replace(",", ".");
  const value = Number(raw);
  if (
    draft.servicePriceType === "NOT_INFORMED" ||
    raw === "" ||
    !Number.isFinite(value)
  ) {
    return `O valor do ${name} ainda não foi informado.`;
  }
  const price = currencyFormatter.format(value);
  return draft.servicePriceType === "STARTING_AT"
    ? `O ${name} custa a partir de ${price}.`
    : `O ${name} custa ${price}.`;
}

export type DemoTone = "BALANCED" | "CASUAL" | "PROFESSIONAL";

/** A mesma resposta de preço e duração da demonstração, escrita no tom
 * escolhido. É prévia do frontend, não a saída do modelo. */
export function demoToneSample(
  draft: Pick<
    DemoDraft,
    "serviceDuration" | "serviceName" | "servicePrice" | "servicePriceType"
  >,
  tone: DemoTone,
): string {
  const named = {
    ...draft,
    serviceName: draft.serviceName.trim() || "serviço",
  };
  const reply = demoPriceReply(named);
  const minutes = draft.serviceDuration > 0 ? draft.serviceDuration : null;
  if (tone === "PROFESSIONAL") {
    return `${reply}${minutes ? ` O atendimento leva ${minutes} minutos.` : ""} Deseja agendar um horário?`;
  }
  if (tone === "CASUAL") {
    return `Oi! ${reply}${minutes ? ` Leva ${minutes} min 😄` : ""} Bora marcar um horário? 🙌`;
  }
  return `${reply}${minutes ? ` Leva ${minutes} min.` : ""} Quer marcar um horário? 😊`;
}

/** Mesma regra de `dayHourOf` em `blocks/schedule.tsx` (Goal066): início e fim
 * de um dia usam o valor personalizado dele e, na falta, o intervalo-base. */
function dayHourOf(
  draft: Pick<DemoDraft, "dayHours" | "endTime" | "startTime">,
  day: number,
): { endTime: string; startTime: string } {
  const override = draft.dayHours[day];
  return {
    endTime: override?.endTime ?? draft.endTime,
    startTime: override?.startTime ?? draft.startTime,
  };
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "14h" para hora cheia, "15h30" nos outros casos. */
export function formatDemoHour(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, "0")}`;
}

/** "14h, 15h30 ou 17h". */
export function formatDemoList(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} ou ${labels[labels.length - 1]}`;
}

/** Data civil de hoje no fuso do negócio, sem depender do fuso da máquina. */
function civilToday(
  now: Date,
  timezone: string,
): { day: number; month: number; year: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone: FALLBACK_TIMEZONE,
      year: "numeric",
    }).formatToParts(now);
  }
  const pick = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: pick("day"), month: pick("month"), year: pick("year") };
}

/** A próxima data depois de hoje, no fuso do negócio, cujo dia da semana está
 * em `days`. Hoje nunca conta, mesmo sendo dia de atendimento. */
export function nextServiceDate(
  now: Date,
  timezone: string,
  days: number[],
): { date: Date; weekday: number } | null {
  if (days.length === 0) return null;
  const today = civilToday(now, timezone);
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset),
    );
    const weekday = date.getUTCDay();
    if (days.includes(weekday)) return { date, weekday };
  }
  return null;
}

/** Candidatos que começam no início do intervalo e andam de `duration` em
 * `duration` enquanto início mais duração couber no fim; devolve o primeiro, o
 * do meio e o último, sem repetir. */
export function demoSlotMinutes(
  startTime: string,
  endTime: string,
  duration: number,
): number[] {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  if (start === null || end === null || !(duration > 0)) return [];
  const candidates: number[] = [];
  for (let at = start; at + duration <= end; at += duration) {
    candidates.push(at);
  }
  if (candidates.length <= 2) return candidates;
  return [
    candidates[0],
    candidates[Math.floor((candidates.length - 1) / 2)],
    candidates[candidates.length - 1],
  ];
}

function weekdayShort(weekday: number): string {
  const name = WEEKDAY_NAMES[weekday];
  const short = name.replace("-feira", "");
  return `${weekday === 0 || weekday === 6 ? "no" : "na"} ${short}`;
}

/**
 * A conversa da demonstração automática do bloco Sua IA (vault
 * `01-Onboarding.md` §7), calculada só do rascunho e de um relógio recebido:
 * não lê a agenda real, não chama o BFF e não escreve nada. Devolve `null`
 * quando não há dia de atendimento nem horário em que o serviço caiba.
 */
export function buildDemoConversation(
  draft: DemoDraft,
  now: Date,
): DemoConversation | null {
  const next = nextServiceDate(now, draft.timezone, draft.days);
  if (!next) return null;
  const hours = dayHourOf(draft, next.weekday);
  const slotMinutes = demoSlotMinutes(
    hours.startTime,
    hours.endTime,
    draft.serviceDuration,
  );
  if (slotMinutes.length === 0) return null;

  const slots = slotMinutes.map(formatDemoHour);
  const chosenIndex = slots.length === 3 ? 1 : 0;
  const chosen = slots[chosenIndex];
  const dateLabel = `${WEEKDAY_NAMES[next.weekday]}, ${next.date.getUTCDate()} de ${MONTH_NAMES[next.date.getUTCMonth()]}`;
  const chosenAt = Math.floor(slotMinutes[chosenIndex] / 60) === 1 ? "à" : "às";
  const name = draft.serviceName;
  const count = slots.length;

  const items: DemoItem[] = [
    { kind: "client", text: `Oi! Quanto custa o ${name}?` },
    { kind: "event", text: `Serviço identificado · ${name}` },
    {
      kind: "ai",
      text: `${demoPriceReply(draft)} Leva ${draft.serviceDuration} min. Quer marcar um horário?`,
    },
    { kind: "client", text: `Tem horário ${weekdayShort(next.weekday)}?` },
    {
      kind: "event",
      text: `Agenda consultada · ${count} ${count === 1 ? "horário livre" : "horários livres"} ${weekdayShort(next.weekday)}`,
    },
    {
      kind: "ai",
      text:
        count === 1
          ? `Tenho ${formatDemoList(slots)}. Serve pra você?`
          : `Tenho ${formatDemoList(slots)}. Qual prefere?`,
    },
    { kind: "client", text: `Pode ser o de ${chosen}.` },
    {
      kind: "ai",
      text: `${name}, ${dateLabel}, ${chosenAt} ${chosen}. Posso confirmar?`,
    },
    { kind: "client", text: "Pode!" },
    { kind: "event", text: "Agendamento simulado · nada foi marcado" },
    { kind: "ai", text: "Combinado! Te espero lá." },
  ];

  return { dateLabel, items, slots };
}
