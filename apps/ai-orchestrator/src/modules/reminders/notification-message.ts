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
 * Instante nao e formatado em ponto nenhum deste arquivo: `facts.date` e
 * `facts.time` chegam prontos no fuso do negocio (`CalendarSettings.timezone`)
 * e sao usados **literalmente**. Nao ha `Date`, `Intl` nem fuso aqui — e por
 * isso que a IA nao depende do residuo do timezone replicado.
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
 * "seu atendimento" — generico de proposito, porque inventar um nome de
 * servico seria afirmar um fato que ninguem gravou.
 */
function subjectOf(facts: NotificationFacts): string {
  const services = facts.services.filter((name) => name.trim().length > 0);
  if (services.length > 0) return services.join(" e ");
  const title = facts.title?.trim();
  return title && title.length > 0 ? title : "seu atendimento";
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
  // `facts.date` e `facts.time` entram literais. Reordenar ou reescrever a
  // data aqui seria a IA decidindo a apresentacao de um instante — e a
  // apresentacao no fuso do negocio ja foi decidida pelo dono.
  const when = `no dia ${facts.date} às ${facts.time}`;
  const lines: string[] = [];

  if (facts.kind === "CHANGE_NOTICE") {
    lines.push(
      facts.appointmentStatus === "CANCELLED"
        ? `Seu atendimento de ${subject} ${when} foi cancelado.`
        : `Seu atendimento de ${subject} foi alterado e agora está marcado ${when}.`,
    );
  } else {
    lines.push(
      `Passando para lembrar do seu atendimento de ${subject} ${when}.`,
    );
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
