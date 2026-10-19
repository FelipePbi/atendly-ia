import type { NotificationFacts } from "../scheduling-service/types.js";
import type {
  AiConversationStyle,
  AiMessageDelivery,
} from "../tenant-config/ai-settings.js";

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
 *
 * **Mensagem de exemplo (D-197).** A profissional pode escrever como gostaria
 * que o lembrete soasse, com `{nome}`, `{servico}`, `{data}` e `{hora}` no
 * lugar dos dados. O exemplo e referencia de tom, nao fonte de fato, e
 * continua sem modelo de linguagem: os campos sao trocados pelos fatos, a
 * frase padrao com servico, data e horario entra quando o exemplo nao traz os
 * tres campos, o valor segue a politica de preco e a pergunta de confirmacao
 * entra no fim quando o negocio a pede. Exemplo com campo desconhecido, ou
 * com `{servico}` num atendimento sem servico nem titulo, volta ao padrao.
 *
 * **Em partes (D-208).** O texto e uma lista ordenada de partes — saudacao,
 * "tudo bem?", o fato, o valor, a pergunta — separadas por linha em branco.
 * Com o negocio em `PARTS`, cada parte sai como uma mensagem do WhatsApp; a
 * saudacao do padrao se divide em duas ("Oi, Ana!" e "Tudo bem?"), como uma
 * pessoa escreveria. Em `SINGLE` o texto e o de antes, numa mensagem so. No
 * exemplo da profissional, cada linha e uma parte: a quebra de linha dela e
 * a fronteira da mensagem. As frases com fato sao as mesmas nos dois modos.
 */

/** Voz de cada estilo. So registro: nenhuma destas frases carrega fato. */
interface StyleVoice {
  /**
   * Abertura, com o nome da pessoa quando o dono o conhece, em partes: a
   * saudacao e o "tudo bem?" (quando o estilo pergunta). Juntas por espaco,
   * sao a abertura numa frase so.
   */
  greeting(customerName: string | null): string[];
  /** Pedido de confirmacao de presenca, quando o negocio o habilita. */
  confirmation: string;
  /** Fechamento. Vazio e valor legitimo: estilo curto nao precisa de um. */
  closing: string;
}

const STYLE_VOICES: Record<AiConversationStyle, StyleVoice> = {
  PROFESSIONAL: {
    greeting: (name) => [name ? `Olá, ${name}.` : "Olá."],
    confirmation: "Pode confirmar sua presença respondendo sim ou não?",
    closing: "Fico à disposição.",
  },
  BALANCED: {
    greeting: (name) => [name ? `Oi, ${name}!` : "Oi!", "Tudo bem?"],
    confirmation: "Você confirma sua presença? É só responder sim ou não.",
    closing: "Qualquer coisa, é só me chamar!",
  },
  CASUAL: {
    greeting: (name) => [name ? `Oii, ${name}!` : "Oii!", "Tudo bem? 😊"],
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

interface LocalWhen {
  /** "na quarta-feira, 16/09". */
  day: string;
  /** "14h30", ou "14h" com minuto zero. */
  clock: string;
}

/**
 * Data e hora locais em texto. `null` quando a entrada esta fora do formato
 * ou fora de calendario: melhor a data crua do que um dia da semana inventado.
 */
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

/**
 * "na quarta-feira, 16/09, às 14h30" a partir de `AAAA-MM-DD` e `HH:MM`
 * locais. Entrada fora do formato ou fora de calendario devolve o texto
 * literal antigo.
 */
function whenOf(date: string, time: string): string {
  const when = localWhen(date, time);
  return when ? `${when.day}, às ${when.clock}` : `no dia ${date} às ${time}`;
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

/** Campos que a mensagem de exemplo pode usar (D-197). */
export const REMINDER_MESSAGE_EXAMPLE_FIELDS = [
  "nome",
  "servico",
  "data",
  "hora",
] as const;

type ExampleField = (typeof REMINDER_MESSAGE_EXAMPLE_FIELDS)[number];

const EXAMPLE_FIELD = /\{([^{}]*)\}/g;
const FACT_FIELD = /\{(servico|data|hora)\}/;

function isExampleField(value: string): value is ExampleField {
  return (REMINDER_MESSAGE_EXAMPLE_FIELDS as readonly string[]).includes(value);
}

/**
 * O lembrete escrito a partir da mensagem de exemplo da profissional, ou
 * `null` quando o exemplo nao serve e o padrao deve valer.
 *
 * Cada linha nao vazia do exemplo vira uma parte (D-208: a quebra de linha
 * da profissional e a fronteira da mensagem), e as partes saem separadas por
 * linha em branco, como no padrao. Os campos sao trocados numa passada so
 * — um nome com `{data}` dentro continua sendo so um nome. Sem nome
 * conhecido, `{nome}` sai junto com a virgula e o espaco que o precedem
 * ("Oii, {nome}!" vira "Oii!").
 */
function composeFromExample(
  example: string,
  facts: NotificationFacts,
  voice: StyleVoice,
): string[] | null {
  const fields = new Set<ExampleField>();
  for (const match of example.matchAll(EXAMPLE_FIELD)) {
    const field = match[1];
    if (!isExampleField(field)) return null;
    fields.add(field);
  }
  const subject = subjectOf(facts);
  // Sem servico nem titulo nao ha o que pôr em `{servico}`: inventar seria
  // afirmar um fato, e "atendimento de atendimento" seria pior que o padrao.
  if (fields.has("servico") && subject === null) return null;

  const name = facts.customerName?.trim() || null;
  const when = localWhen(facts.date, facts.time);
  const values: Record<ExampleField, string> = {
    nome: name ?? "",
    servico: subject ?? "",
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

  const factual = notificationFactualLines(facts);
  const ownsFacts =
    fields.has("servico") && fields.has("data") && fields.has("hora");
  if (ownsFacts) {
    // So o valor sobra da frase padrao: entra logo depois da frase do exemplo
    // que fala do atendimento.
    blocks.splice(factualBlock + 1, 0, ...factual.slice(1));
  } else {
    // Faltou servico, data ou horario: a frase padrao entra inteira depois da
    // primeira linha (a saudacao, quase sempre).
    blocks.splice(Math.min(1, blocks.length), 0, ...factual);
  }
  if (facts.kind === "REMINDER" && facts.confirmationRequested) {
    blocks.push(voice.confirmation);
  }
  return blocks;
}

/**
 * As partes da mensagem, em ordem: voz do estilo em volta das frases
 * factuais.
 *
 * O aviso de alteracao nunca pede confirmacao de presenca, mesmo que o fato
 * chegue marcado: confirmar presenca e do lembrete. O endereco do negocio nao
 * aparece porque nao existe nos fatos — e assim que ele nao vira repeticao
 * automatica. Em `PARTS` a saudacao do padrao sai em duas partes; em
 * `SINGLE`, numa so, como antes.
 */
export function composeNotificationParts(input: {
  style: AiConversationStyle;
  facts: NotificationFacts;
  delivery?: AiMessageDelivery;
}): string[] {
  const voice = STYLE_VOICES[input.style];
  const example = input.facts.messageExample?.trim();
  if (input.facts.kind === "REMINDER" && example) {
    const custom = composeFromExample(example, input.facts, voice);
    if (custom !== null) return custom;
  }
  const greeting = voice.greeting(input.facts.customerName?.trim() || null);
  const blocks = [
    ...(input.delivery === "SINGLE" ? [greeting.join(" ")] : greeting),
    ...notificationFactualLines(input.facts),
  ];
  if (input.facts.kind === "REMINDER" && input.facts.confirmationRequested) {
    blocks.push(voice.confirmation);
  } else if (voice.closing) {
    blocks.push(voice.closing);
  }
  return blocks;
}

/**
 * Texto final: as partes separadas por linha em branco. E a forma gravada em
 * `Message.body` e a que o despacho divide de volta em partes (`BLOCKS`).
 */
export function composeNotificationText(input: {
  style: AiConversationStyle;
  facts: NotificationFacts;
  delivery?: AiMessageDelivery;
}): string {
  return composeNotificationParts(input).join("\n\n");
}
