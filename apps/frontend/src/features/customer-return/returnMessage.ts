import type { AiTone } from "@/data";

/** Os fatos que a mensagem usa, no recorte da prévia da tela. */
export interface ReturnFacts {
  kind: "RENEWAL" | "WINBACK";
  followUp: boolean;
  customerName: string | null;
  serviceName: string | null;
  today: string;
  expectedDate: string | null;
  intervalDays: number | null;
  daysSinceLastVisit: number | null;
  offeredSlots: Array<{ date: string; time: string }>;
  incentive: string | null;
  messageTemplate: string | null;
}

/**
 * Texto da mensagem de retorno (D-206), montado por modelo — **sem modelo de
 * linguagem**, pela mesma regra dos lembretes (Goal021): quem escreve data,
 * horario e beneficio e o dado, nunca uma geracao. O estilo do negocio muda
 * registro e emoji; as frases com fato sao as mesmas nos tres estilos.
 *
 * Datas chegam prontas no fuso do negocio (`YYYY-MM-DD`, `HH:MM`) e so viram
 * texto ("na quinta-feira", "sexta às 17h30"); o dia da semana sai da propria
 * data por aritmetica de calendario, sem objeto de data nem fuso.
 *
 * Cópia deliberada de
 * `apps/ai-orchestrator/src/modules/customer-return/return-message.ts`, para a
 * prévia da tela. Os dois arquivos mudam juntos, e os testes dos dois lados
 * afirmam as mesmas frases para os mesmos fatos.
 */

interface ReturnVoice {
  greeting(name: string | null): string;
  shortGreeting(name: string | null): string;
  /** Renovacao com horarios: pergunta antes de oferecer. */
  reserve: string;
  /** Sem horario na mensagem: pergunta aberta. */
  askSlot: string;
  /** Resgate: reaproximacao, sem pressao. */
  missYou: string;
  incentive(text: string): string;
}

const VOICES: Record<AiTone, ReturnVoice> = {
  PROFESSIONAL: {
    greeting: (name) => (name ? `Olá, ${name}.` : "Olá."),
    shortGreeting: (name) => (name ? `Olá, ${name}.` : "Olá."),
    reserve: "Gostaria que eu reservasse um horário?",
    askSlot: "Posso verificar um horário para você?",
    missYou: "Faz algum tempo desde o seu último atendimento por aqui.",
    incentive: (text) =>
      `Para o seu retorno, há uma condição especial: ${text}.`,
  },
  BALANCED: {
    greeting: (name) => (name ? `Oi, ${name}! Tudo bem?` : "Oi! Tudo bem?"),
    shortGreeting: (name) => (name ? `Oi, ${name}!` : "Oi!"),
    reserve: "Quer que eu já reserve um horário?",
    askSlot: "Quer que eu veja um horário pra você?",
    missYou: "Faz um tempinho que você não aparece por aqui.",
    incentive: (text) => `Pra sua volta, tenho uma condição especial: ${text}.`,
  },
  CASUAL: {
    greeting: (name) =>
      name ? `Oii, ${name}! Tudo bem? 😊` : "Oii! Tudo bem? 😊",
    shortGreeting: (name) => (name ? `Oii, ${name}! 😊` : "Oii! 😊"),
    reserve: "Quer que eu já deixe reservado? 💛",
    askSlot: "Quer que eu veja um horário pra você? 💛",
    missYou: "Faz um tempinho que você não aparece por aqui 💕",
    incentive: (text) =>
      `Pra sua volta, tenho uma condição especial: ${text} 💛`,
  },
};

const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;
const WEEKDAY_ON = [
  "no domingo",
  "na segunda-feira",
  "na terça-feira",
  "na quarta-feira",
  "na quinta-feira",
  "na sexta-feira",
  "no sábado",
] as const;

const SAKAMOTO_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string | null): LocalDate | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function weekdayOf(date: LocalDate): number {
  const y = date.month < 3 ? date.year - 1 : date.year;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      SAKAMOTO_OFFSETS[date.month - 1] +
      date.day) %
    7
  );
}

/** Dia juliano inteiro, so para a diferenca entre duas datas locais. */
function dayNumber(date: LocalDate): number {
  const a = Math.floor((14 - date.month) / 12);
  const y = date.year + 4800 - a;
  const m = date.month + 12 * a - 3;
  return (
    date.day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400)
  );
}

function shortDate(date: LocalDate): string {
  return `${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}`;
}

function clock(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return match[2] === "00" ? `${hour}h` : `${hour}h${match[2]}`;
}

/** "hoje", "amanhã", "na quinta-feira" ou "em 30/10", relativo a hoje. */
export function relativeDay(today: string, date: string): string {
  const from = parseDate(today);
  const to = parseDate(date);
  if (!from || !to) return `em ${date}`;
  const diff = dayNumber(to) - dayNumber(from);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (Math.abs(diff) < 7) return WEEKDAY_ON[weekdayOf(to)];
  return `em ${shortDate(to)}`;
}

/** "amanhã às 17h30", "sexta às 17h30" ou "sexta, 31/10, às 17h30". */
export function slotPhrase(
  today: string,
  slot: { date: string; time: string },
): string {
  const from = parseDate(today);
  const to = parseDate(slot.date);
  if (!from || !to) return `${slot.date} às ${clock(slot.time)}`;
  const diff = dayNumber(to) - dayNumber(from);
  if (diff === 0) return `hoje às ${clock(slot.time)}`;
  if (diff === 1) return `amanhã às ${clock(slot.time)}`;
  const weekday = WEEKDAY_NAMES[weekdayOf(to)];
  if (diff > 1 && diff < 7) return `${weekday} às ${clock(slot.time)}`;
  return `${weekday}, ${shortDate(to)}, às ${clock(slot.time)}`;
}

export function slotsPhrase(
  today: string,
  slots: Array<{ date: string; time: string }>,
): string | null {
  if (slots.length === 0) return null;
  const phrases = slots.map((slot) => slotPhrase(today, slot));
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(", ")} ou ${phrases.at(-1)}`;
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/u)[0];
  return first && first.length > 0 ? first : null;
}

/** Texto livre da profissional, sem ponto final duplicado. */
function incentiveText(incentive: string | null): string | null {
  const text = incentive?.trim().replace(/[.!\s]+$/u, "");
  return text && text.length > 0 ? text : null;
}

/** Ha quanto tempo ela nao vem, em palavras: "há 3 meses", "há 45 dias". */
export function absencePhrase(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days < 60) return `há ${days} dias`;
  const months = Math.round(days / 30);
  return months >= 12 ? "há mais de um ano" : `há ${months} meses`;
}

/**
 * As frases com fato, identicas nos tres estilos. Exportada porque e o ponto
 * que a suite prova.
 */
export function returnFactualLines(facts: ReturnFacts): string[] {
  if (facts.kind === "WINBACK") return [];
  const subject = facts.serviceName?.trim()
    ? `Seu atendimento de ${facts.serviceName.trim()}`
    : "Seu último atendimento";
  const lines: string[] = [];
  if (facts.expectedDate && facts.intervalDays) {
    const when = relativeDay(facts.today, facts.expectedDate);
    const passed = facts.expectedDate < facts.today;
    lines.push(
      passed
        ? `${subject} completou ${facts.intervalDays} dias ${when}.`
        : `${subject} completa ${facts.intervalDays} dias ${when}.`,
    );
  }
  return lines;
}

/** Campos do texto-base editavel (D-206). */
export const RETURN_TEMPLATE_FIELDS = [
  "nome",
  "servico",
  "quando",
  "horarios",
  "incentivo",
] as const;
type TemplateField = (typeof RETURN_TEMPLATE_FIELDS)[number];
const TEMPLATE_FIELD = /\{([^{}]*)\}/g;

function isTemplateField(value: string): value is TemplateField {
  return (RETURN_TEMPLATE_FIELDS as readonly string[]).includes(value);
}

/**
 * Texto a partir do texto-base da profissional, ou `null` quando ele nao
 * serve e o padrao deve valer (campo desconhecido, `{servico}` sem servico,
 * `{horarios}` sem horario livre). Linha so com `{incentivo}` some quando nao
 * ha incentivo. Horarios e incentivo que o texto nao cita entram no fim: o
 * que a rodada promete nunca fica de fora.
 */
function composeFromTemplate(
  template: string,
  facts: ReturnFacts,
  voice: ReturnVoice,
): string | null {
  const fields = new Set<TemplateField>();
  for (const match of template.matchAll(TEMPLATE_FIELD)) {
    if (!isTemplateField(match[1])) return null;
    fields.add(match[1]);
  }
  const name = firstName(facts.customerName);
  const service = facts.serviceName?.trim() || null;
  const slots = slotsPhrase(facts.today, facts.offeredSlots);
  const incentive = incentiveText(facts.incentive);
  if (fields.has("servico") && !service) return null;
  if (fields.has("horarios") && !slots) return null;
  const when =
    facts.kind === "RENEWAL"
      ? facts.expectedDate
        ? relativeDay(facts.today, facts.expectedDate)
        : ""
      : (absencePhrase(facts.daysSinceLastVisit) ?? "");
  const values: Record<TemplateField, string> = {
    nome: name ?? "",
    servico: service ?? "",
    quando: when,
    horarios: slots ?? "",
    incentivo: incentive ?? "",
  };
  const blocks: string[] = [];
  for (const raw of template.split(/\r?\n/u)) {
    if (!incentive && raw.includes("{incentivo}")) continue;
    let line = raw;
    if (!name) {
      line = line
        .replace(/[ \t]*,?[ \t]*\{nome\}/gu, "")
        .replace(/^[ \t]*[,;:][ \t]*/u, "");
    }
    line = line
      .replace(TEMPLATE_FIELD, (_match, field: TemplateField) => values[field])
      .replace(/[ \t]{2,}/gu, " ")
      .trim();
    if (line.length > 0) blocks.push(line);
  }
  if (facts.kind === "RENEWAL" && slots && !fields.has("horarios")) {
    blocks.push(`Tenho ${slots}.`);
  }
  if (incentive && !fields.has("incentivo")) {
    blocks.push(voice.incentive(incentive));
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

/** Lembrete unico, curto, sem horario novo e sem texto-base. */
function composeFollowUp(facts: ReturnFacts, voice: ReturnVoice): string {
  const name = firstName(facts.customerName);
  const incentive = incentiveText(facts.incentive);
  const blocks = [voice.shortGreeting(name)];
  if (facts.kind === "RENEWAL") {
    blocks.push(
      facts.serviceName?.trim()
        ? `Passando só pra saber se você quer marcar o seu atendimento de ${facts.serviceName.trim()}.`
        : "Passando só pra saber se você quer marcar um horário.",
    );
  } else if (incentive) {
    blocks.push(voice.incentive(incentive));
  }
  blocks.push(voice.askSlot);
  return blocks.join("\n\n");
}

/**
 * Texto-base inicial do editor (D-206): o padrão de cada rotina escrito com
 * os campos no lugar dos dados. Gravado igual, continua valendo o padrão.
 */
export function defaultReturnTemplate(
  kind: "RENEWAL" | "WINBACK",
  style: AiTone,
): string {
  const voice = VOICES[style];
  if (kind === "RENEWAL") {
    return [
      voice.greeting("{nome}"),
      `Está chegando a hora do seu atendimento de {servico}, {quando}. ${voice.reserve} Tenho {horarios}.`,
    ].join("\n\n");
  }
  return [
    voice.greeting("{nome}"),
    voice.missYou,
    voice.incentive("{incentivo}"),
    voice.askSlot,
  ].join("\n\n");
}

export function composeReturnText(input: {
  style: AiTone;
  facts: ReturnFacts;
}): string {
  const voice = VOICES[input.style];
  const facts = input.facts;
  if (facts.followUp) return composeFollowUp(facts, voice);

  const template = facts.messageTemplate?.trim();
  if (template) {
    const custom = composeFromTemplate(template, facts, voice);
    if (custom !== null) return custom;
  }

  const blocks = [voice.greeting(firstName(facts.customerName))];
  if (facts.kind === "RENEWAL") {
    const factual = returnFactualLines(facts).join(" ");
    const slots = slotsPhrase(facts.today, facts.offeredSlots);
    blocks.push(
      [factual, slots ? `${voice.reserve} Tenho ${slots}.` : voice.askSlot]
        .filter((part) => part.length > 0)
        .join(" "),
    );
  } else {
    const incentive = incentiveText(facts.incentive);
    blocks.push(
      [voice.missYou, incentive ? voice.incentive(incentive) : ""]
        .filter((part) => part.length > 0)
        .join(" "),
    );
    blocks.push(voice.askSlot);
  }
  return blocks.join("\n\n");
}
