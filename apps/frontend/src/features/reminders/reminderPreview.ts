import type { AiTone, ReminderPricePolicy } from "@/data";

/**
 * Cópia deliberada das frases de
 * `apps/ai-orchestrator/src/modules/reminders/notification-message.ts`
 * (lembrete, tipo REMINDER). Os dois arquivos mudam juntos, e os testes dos
 * dois lados afirmam as mesmas strings para os mesmos fatos.
 */

interface Voice {
  greeting(customerName: string | null): string;
  confirmation: string;
  closing: string;
}

const VOICES: Record<AiTone, Voice> = {
  PROFESSIONAL: {
    greeting: (name) => (name ? `Olá, ${name}.` : "Olá."),
    confirmation: "Pode confirmar sua presença respondendo sim ou não?",
    closing: "Fico à disposição.",
  },
  BALANCED: {
    greeting: (name) => (name ? `Oi, ${name}! Tudo bem?` : "Oi! Tudo bem?"),
    confirmation: "Você confirma sua presença? É só responder sim ou não.",
    closing: "Qualquer coisa, é só me chamar!",
  },
  CASUAL: {
    greeting: (name) =>
      name ? `Oii, ${name}! Tudo bem? 😊` : "Oii! Tudo bem? 😊",
    confirmation: "Confirma pra mim? Pode responder sim ou não 💛",
    closing: "Qualquer coisa me chama por aqui 💛",
  },
};

const WEEKDAYS = [
  "no domingo",
  "na segunda-feira",
  "na terça-feira",
  "na quarta-feira",
  "na quinta-feira",
  "na sexta-feira",
  "no sábado",
] as const;

const SAKAMOTO_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function weekdayIndex(year: number, month: number, day: number): number {
  const y = month < 3 ? year - 1 : year;
  const sum =
    y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) +
    SAKAMOTO_OFFSETS[month - 1] +
    day;
  return sum % 7;
}

interface LocalWhen {
  day: string;
  clock: string;
}

function localWhen(date: string, time: string): LocalWhen | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59) return null;

  const weekday = WEEKDAYS[weekdayIndex(year, month, day)];
  return {
    day: `${weekday}, ${dateMatch[3]}/${dateMatch[2]}`,
    clock: minute === 0 ? `${hour}h` : `${hour}h${timeMatch[2]}`,
  };
}

function whenOf(date: string, time: string): string {
  const when = localWhen(date, time);
  return when ? `${when.day}, às ${when.clock}` : `no dia ${date} às ${time}`;
}

function amountOf(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

export interface ReminderPreviewFacts {
  customerName: string | null;
  /** Nome do serviço, ou `null` quando não há serviço nomeado. */
  subject: string | null;
  /** `AAAA-MM-DD` no fuso do negócio. */
  date: string;
  /** `HH:MM` no fuso do negócio. */
  time: string;
  price: number | null;
  confirmationRequested: boolean;
  /** Mensagem de exemplo da profissional (D-197); `null` é o padrão. */
  messageExample?: string | null;
}

function factualLines(facts: ReminderPreviewFacts): string[] {
  const appointment = facts.subject
    ? `atendimento de ${facts.subject}`
    : "atendimento";
  const lines = [
    `Passando para lembrar do seu ${appointment} ${whenOf(facts.date, facts.time)}.`,
  ];
  if (facts.price !== null) lines.push(`Valor: ${amountOf(facts.price)}.`);
  return lines;
}

const EXAMPLE_FIELDS = ["nome", "servico", "data", "hora"] as const;
type ExampleField = (typeof EXAMPLE_FIELDS)[number];
const EXAMPLE_FIELD = /\{([^{}]*)\}/g;
const FACT_FIELD = /\{(servico|data|hora)\}/;

function isExampleField(value: string): value is ExampleField {
  return (EXAMPLE_FIELDS as readonly string[]).includes(value);
}

/**
 * Cópia de `composeFromExample` do ai-orchestrator (D-197): o exemplo é
 * referência de tom, os fatos vêm sempre do agendamento. `null` quando o
 * exemplo não serve e o padrão vale.
 */
function composeFromExample(
  example: string,
  facts: ReminderPreviewFacts,
  voice: Voice,
): string | null {
  const fields = new Set<ExampleField>();
  for (const match of example.matchAll(EXAMPLE_FIELD)) {
    const field = match[1];
    if (!isExampleField(field)) return null;
    fields.add(field);
  }
  if (fields.has("servico") && facts.subject === null) return null;

  const name = facts.customerName?.trim() || null;
  const when = localWhen(facts.date, facts.time);
  const values: Record<ExampleField, string> = {
    nome: name ?? "",
    servico: facts.subject ?? "",
    data: when ? when.day : `no dia ${facts.date}`,
    hora: when ? when.clock : facts.time,
  };

  const blocks: string[] = [];
  let factualBlock = -1;
  for (const raw of example.split(/\r?\n/)) {
    let line = raw;
    if (name === null) {
      line = line
        .replace(/[ \t]*,?[ \t]*\{nome\}/g, "")
        .replace(/^[ \t]*[,;:][ \t]*/, "");
    }
    line = line
      .replace(EXAMPLE_FIELD, (_match, field: ExampleField) => values[field])
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (line.length === 0) continue;
    blocks.push(line);
    if (FACT_FIELD.test(raw)) factualBlock = blocks.length - 1;
  }

  const factual = factualLines(facts);
  if (fields.has("servico") && fields.has("data") && fields.has("hora")) {
    blocks.splice(factualBlock + 1, 0, ...factual.slice(1));
  } else {
    blocks.splice(Math.min(1, blocks.length), 0, ...factual);
  }
  if (facts.confirmationRequested) blocks.push(voice.confirmation);
  return blocks.join("\n\n");
}

/**
 * Texto inicial do editor da mensagem de exemplo: a saudação do estilo e a
 * frase padrão, com os campos no lugar dos dados. A pergunta de confirmação
 * e o valor ficam de fora porque entram sozinhos, pelas opções da tela.
 */
export function defaultReminderMessageExample(tone: AiTone | null): string {
  const voice = VOICES[tone ?? "BALANCED"];
  return [
    voice.greeting("{nome}"),
    "Passando para lembrar do seu atendimento de {servico} {data}, às {hora}.",
  ].join("\n\n");
}

export function composeReminderPreviewText(input: {
  style: AiTone;
  facts: ReminderPreviewFacts;
}): string {
  const { facts } = input;
  const voice = VOICES[input.style];
  const example = facts.messageExample?.trim();
  if (example) {
    const custom = composeFromExample(example, facts, voice);
    if (custom !== null) return custom;
  }
  const blocks = [
    voice.greeting(facts.customerName?.trim() || null),
    ...factualLines(facts),
  ];
  if (facts.confirmationRequested) {
    blocks.push(voice.confirmation);
  } else if (voice.closing) {
    blocks.push(voice.closing);
  }
  return blocks.join("\n\n");
}

/** Dia seguinte ao de `now` no fuso do negócio, como `AAAA-MM-DD`. */
export function reminderPreviewDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const tomorrow = new Date(
    Date.UTC(part("year"), part("month") - 1, part("day") + 1),
  );
  const year = String(tomorrow.getUTCFullYear()).padStart(4, "0");
  const month = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface ReminderPreviewService {
  name: string;
  active: boolean;
  priceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
  price: number | null;
}

export function reminderPreviewText({
  confirmationEnabled,
  messageExample = null,
  now,
  pricePolicy,
  services,
  timeZone,
  tone,
}: {
  confirmationEnabled: boolean;
  messageExample?: string | null;
  now: Date;
  pricePolicy: ReminderPricePolicy;
  services: readonly ReminderPreviewService[];
  timeZone: string;
  tone: AiTone | null;
}): string {
  const service = services.find((entry) => entry.active) ?? null;
  const price =
    pricePolicy === "WHEN_FIXED" &&
    service !== null &&
    service.priceType === "FIXED" &&
    service.price !== null
      ? service.price
      : null;
  return composeReminderPreviewText({
    style: tone ?? "BALANCED",
    facts: {
      customerName: "Ana",
      subject: service?.name ?? null,
      date: reminderPreviewDate(now, timeZone),
      time: "15:30",
      price,
      confirmationRequested: confirmationEnabled,
      messageExample,
    },
  });
}
