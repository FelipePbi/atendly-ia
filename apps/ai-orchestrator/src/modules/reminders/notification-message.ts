import type { NotificationFacts } from "../scheduling-service/types.js";
import type { AiConversationStyle } from "../tenant-config/ai-settings.js";

/**
 * Composicao do texto da notificacao (Goal021).
 *
 * **Nenhuma chamada de modelo de linguagem acontece aqui, e isso e a regra,
 * nao uma otimizacao.** Um lembrete que inventa horario e o dano que este Goal
 * existe para evitar; um modelo generativo entre o fato e o cliente e
 * exatamente a porta por onde esse dano entra. O texto e montado por modelo de
 * mensagem, a partir dos fatos que o dono da agenda ja compos.
 *
 * Estilo muda **registro, informalidade e emoji** — nunca o fato. As frases
 * factuais sao geradas por {@link notificationFactualLines} uma unica vez e
 * entram identicas, palavra por palavra, nos tres estilos de
 * `AI_CONVERSATION_STYLES`. E a mesma fronteira que `prompts/style.ts` ja
 * declara para a conversa.
 *
 * Instante nao e convertido em ponto nenhum deste arquivo: `facts.date` e
 * `facts.time` chegam prontos no fuso do negocio (`CalendarSettings.timezone`)
 * e so sao **reescritos como texto** ("na quarta-feira, 16/09, as 14h30"). O
 * dia da semana sai da propria data local por aritmetica de calendario com
 * inteiros (Sakamoto), sem objeto de data, sem biblioteca de formatacao e sem
 * fuso — e por isso que a IA nao depende do residuo do timezone replicado. Data
 * ou hora fora do formato mantem o texto literal "no dia {date} as {time}".
 */

/** Voz de cada estilo. So registro: nenhuma destas frases carrega fato. */
interface StyleVoice {
  /** Abertura, com o nome da pessoa quando o dono o conhece. */
  greeting(customerName: string | null): string;
  /** Pedido de confirmacao de presenca, quando o negocio o habilita. */
  confirmation: string;
  /** Fechamento. Vazio e valor legitimo: estilo curto nao precisa de um. */
  closing: string;
}

const STYLE_VOICES: Record<AiConversationStyle, StyleVoice> = {
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

/**
 * O que a pessoa foi fazer, pelo snapshot do acordo.
 *
 * Sem servico nomeado sobra o titulo do atendimento manual; sem os dois,
 * `null` e a frase fica em "seu atendimento" — generico de proposito, porque
 * inventar um nome de servico seria afirmar um fato que ninguem gravou.
 */
function subjectOf(facts: NotificationFacts): string | null {
  const services = facts.services.filter((name) => name.trim().length > 0);
  if (services.length > 0) return services.join(" e ");
  const title = facts.title?.trim();
  return title && title.length > 0 ? title : null;
}

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

/** 0 = domingo. Aritmetica inteira de calendario; `month` de 1 a 12. */
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

/**
 * "na quarta-feira, 16/09, às 14h30" a partir de `AAAA-MM-DD` e `HH:MM`
 * locais. Entrada fora do formato ou fora de calendario devolve o texto
 * literal antigo: melhor a data crua do que um dia da semana inventado.
 */
function whenOf(date: string, time: string): string {
  const literal = `no dia ${date} às ${time}`;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return literal;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12) return literal;
  if (day < 1 || day > daysInMonth(year, month)) return literal;
  if (hour > 23 || minute > 59) return literal;

  const weekday = WEEKDAYS[weekdayIndex(year, month, day)];
  const clock = minute === 0 ? `${hour}h` : `${hour}h${timeMatch[2]}`;
  return `${weekday}, ${dateMatch[3]}/${dateMatch[2]}, às ${clock}`;
}

/**
 * Valor em reais. Formata **numero**, nunca instante: o preco chega como
 * numero do dono e so aparece quando a politica e mostrar e o acordo inteiro
 * tem preco fixo — "a partir de" e "sob consulta" nunca chegam aqui.
 */
function amountOf(price: number): string {
  return `R$ ${price.toFixed(2).replace(".", ",")}`;
}

/**
 * As frases factuais, identicas nos tres estilos.
 *
 * Exportada porque e o ponto que a suite prova: a mesma intencao produz este
 * mesmo conjunto de frases em `PROFESSIONAL`, `BALANCED` e `CASUAL`.
 */
export function notificationFactualLines(facts: NotificationFacts): string[] {
  const subject = subjectOf(facts);
  const appointment = subject
    ? `atendimento de ${subject}`
    : "atendimento";
  // `facts.date` e `facts.time` ja estao no fuso do negocio; so mudam de
  // forma, nunca de valor.
  const when = whenOf(facts.date, facts.time);
  const lines: string[] = [];

  if (facts.kind === "CHANGE_NOTICE") {
    lines.push(
      facts.appointmentStatus === "CANCELLED"
        ? `Seu ${appointment} ${when} foi cancelado.`
        : `Seu ${appointment} foi alterado e agora está marcado ${when}.`,
    );
  } else {
    lines.push(`Passando para lembrar do seu ${appointment} ${when}.`);
  }

  if (facts.price !== null) {
    lines.push(`Valor: ${amountOf(facts.price)}.`);
  }
  return lines;
}

/**
 * Texto final: voz do estilo em volta das frases factuais.
 *
 * O aviso de alteracao nunca pede confirmacao de presenca, mesmo que o fato
 * chegue marcado: confirmar presenca e do lembrete. O endereco do negocio nao
 * aparece porque nao existe nos fatos — e assim que ele nao vira repeticao
 * automatica.
 */
export function composeNotificationText(input: {
  style: AiConversationStyle;
  facts: NotificationFacts;
}): string {
  const voice = STYLE_VOICES[input.style];
  const blocks = [
    voice.greeting(input.facts.customerName?.trim() || null),
    ...notificationFactualLines(input.facts),
  ];
  if (input.facts.kind === "REMINDER" && input.facts.confirmationRequested) {
    blocks.push(voice.confirmation);
  } else if (voice.closing) {
    blocks.push(voice.closing);
  }
  return blocks.join("\n\n");
}
