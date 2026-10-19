import type {
  SendTextResult,
  WhatsAppProvider,
} from "../channel/ports/WhatsAppProvider.js";
import type { AiMessageDelivery } from "../tenant-config/ai-settings.js";

/**
 * Mensagens da plataforma em varias partes curtas (D-208).
 *
 * Toda mensagem que a plataforma compoe para o cliente — resposta da IA,
 * lembrete, confirmacao de presenca, aviso de alteracao e retorno de
 * clientes — sai por aqui. Com o negocio em `PARTS` (o padrao), o texto sai
 * em mensagens separadas do WhatsApp, em ordem, com uma pausa curta e o
 * "digitando…" antes de cada uma, como uma pessoa escrevendo; em `SINGLE`,
 * sai numa mensagem so.
 *
 * A linha `Message` continua uma so: `body` guarda o texto completo (e o que
 * o historico da IA le) e `bodyParts` as partes enviadas (e o que a conversa
 * do app mostra como baloes). O envio so vira `SENT` depois da ultima parte.
 *
 * Nao passa por aqui: mensagem digitada pela profissional (sai exatamente
 * como ela escreveu) e o envio do numero da plataforma no teste de ativacao.
 */

/** Intervalo minimo entre duas partes consecutivas da mesma mensagem. */
export const MESSAGE_PART_GAP_MS = 1000;

/**
 * "digitando…" antes de cada parte, proporcional ao tamanho do texto: pausa
 * curta, digitando, e a mensagem chega. Limitado de 0,8 a 2 segundos.
 */
export function typingDelayFor(text: string): number {
  return Math.min(2000, Math.max(800, Math.round(text.length * 30)));
}

/** Teto de partes por mensagem; o excedente vai junto na ultima parte. */
export const MESSAGE_MAX_PARTS = 5;

/**
 * Como o texto vira partes.
 *
 * - `AI_REPLY`: texto livre do modelo, dividido por {@link splitAiReplyIntoParts};
 * - `BLOCKS`: texto composto por modelo de mensagem (lembrete, retorno), em
 *   que cada parte ja vem separada por linha em branco;
 * - `SINGLE`: uma mensagem so, com o texto inteiro.
 */
export type MessageLayout = "AI_REPLY" | "BLOCKS" | "SINGLE";

/** Layout da resposta da IA conforme a configuracao do negocio. */
export function aiReplyLayout(delivery: AiMessageDelivery): MessageLayout {
  return delivery === "SINGLE" ? "SINGLE" : "AI_REPLY";
}

/** Layout de mensagem composta por modelo conforme a configuracao do negocio. */
export function composedMessageLayout(
  delivery: AiMessageDelivery,
): MessageLayout {
  return delivery === "SINGLE" ? "SINGLE" : "BLOCKS";
}

/** Uma abertura curta ("Oi!", "Bom dia!", "Oi, Ana!") tem ate isto de palavras. */
const OPENING_MAX_WORDS = 4;

/** Item de lista: "-", "•", "*", "–" seguidos de espaco, ou "1." / "1)". */
const LIST_ITEM_LINE = /^\s*(?:[-•*–]\s|\d{1,3}[.)]\s)/u;

/**
 * Primeira frase do bloco, terminada em "!" ou "?", com os emojis que vierem
 * logo depois dela, seguida de espaco/quebra e do resto. A classe exclui
 * `.!?` e quebra de linha: a frase de abertura e a primeira, inteira na
 * primeira linha. Exigir espaco depois do `!`/`?` evita cortar URL com query.
 * O emoji aceita modificador de tom, juncao (ZWJ) e seletor de variacao, em
 * alternancia e nao em classe: sequencia combinada dentro de classe engana.
 */
const OPENING_SENTENCE =
  /^([^\n.!?]*?[!?]+(?:\s*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️)+)*)\s+(\S[\s\S]*)$/u;

function normalizeText(text: string): string {
  return text.replace(/\r\n?/gu, "\n").trim();
}

/** Junta o excedente na ultima parte, separado por linha em branco. */
export function capMessageParts(parts: string[]): string[] {
  if (parts.length <= MESSAGE_MAX_PARTS) return parts;
  return [
    ...parts.slice(0, MESSAGE_MAX_PARTS - 1),
    parts.slice(MESSAGE_MAX_PARTS - 1).join("\n\n"),
  ];
}

/**
 * Divide a resposta da IA em partes para o envio. Funcao pura e
 * deterministica.
 *
 * - quebra em linha em branco (paragrafo);
 * - lista nunca e dividida: paragrafo que comeca com item de lista, e o que
 *   segue um paragrafo terminado em ":", fica junto do anterior;
 * - uma abertura curta no inicio da resposta (primeira frase terminada em
 *   "!"/"?", ate 4 palavras) sai sozinha;
 * - URL nunca e cortada (so se quebra em linha em branco ou depois de
 *   "!"/"?" seguido de espaco) e emoji fica com a frase dele;
 * - partes aparadas, vazias descartadas, teto de {@link MESSAGE_MAX_PARTS}
 *   (o excedente junta na ultima, separado por linha em branco);
 * - nenhum texto e criado: as partes, juntas, sao o texto original.
 */
export function splitAiReplyIntoParts(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const blocks: string[] = [];
  for (const raw of normalized.split(/\n\s*\n/u)) {
    const paragraph = raw.trim();
    if (!paragraph) continue;
    const previous = blocks.at(-1);
    if (
      previous !== undefined &&
      (LIST_ITEM_LINE.test(paragraph) || previous.endsWith(":"))
    ) {
      blocks[blocks.length - 1] = `${previous}\n\n${paragraph}`;
      continue;
    }
    blocks.push(paragraph);
  }

  return capMessageParts([...splitOpening(blocks[0]), ...blocks.slice(1)]);
}

function splitOpening(block: string): string[] {
  if (LIST_ITEM_LINE.test(block)) return [block];
  const match = OPENING_SENTENCE.exec(block);
  if (!match) return [block];
  const opening = match[1].trim();
  const rest = match[2].trim();
  if (!rest || /:\/\/|www\./iu.test(opening)) return [block];
  const words = opening.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (words === 0 || words > OPENING_MAX_WORDS) return [block];
  return [opening, rest];
}

/**
 * Partes de uma mensagem conforme o layout. Funcao pura e deterministica:
 * o mesmo texto com o mesmo layout da sempre as mesmas partes, e e isso que
 * deixa o retry retomar da parte certa. Nenhum texto e criado nem alterado
 * alem de aparar espacos: dividir nunca muda um fato.
 */
export function splitMessageIntoParts(
  text: string,
  layout: MessageLayout,
): string[] {
  if (layout === "AI_REPLY") return splitAiReplyIntoParts(text);
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (layout === "SINGLE") return [normalized];
  return capMessageParts(
    normalized
      .split(/\n\s*\n/u)
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

/**
 * O que vai em `Message.bodyParts`: as partes quando ha mais de uma, vazio
 * quando a mensagem sai inteira (a conversa mostra um balao so).
 */
export function storedBodyParts(text: string, layout: MessageLayout): string[] {
  const parts = splitMessageIntoParts(text, layout);
  return parts.length > 1 ? parts : [];
}

/**
 * Id de transporte de cada parte.
 *
 * A **ultima** parte leva o `correlationId` da linha; as anteriores levam
 * `<correlationId>-p<n>`. Assim o recibo que reconcilia a linha pelo
 * `correlationId` e o da ultima parte — prova de que a sequencia terminou —,
 * e a mensagem de parte unica continua com o mesmo id de antes.
 */
export function messagePartId(
  correlationId: string,
  index: number,
  totalParts: number,
): string {
  return index >= totalParts - 1
    ? correlationId
    : `${correlationId}-p${index + 1}`;
}

/** Sufixo de parte anterior a ultima (`-p1`, `-p2`...). */
const PART_SUFFIX = /-p\d+$/u;

/** `correlationId` da linha a partir do id de transporte de qualquer parte. */
export function messageCorrelationIdOf(messageId: string): string {
  return messageId.replace(PART_SUFFIX, "");
}

/** Progresso persistido do despacho em partes (`Message.deliveryPartsSent`). */
export interface MessagePartProgressPort {
  readPartsSent(messageRecordId: string): Promise<number>;
  recordPartsSent(input: {
    messageRecordId: string;
    partsSent: number;
  }): Promise<void>;
}

export interface MessageDispatchInput {
  to: string;
  text: string;
  /**
   * Como o texto vira partes; ver {@link MessageLayout}. Ausente e a resposta
   * da IA dividida (`AI_REPLY`), o comportamento de antes desta opcao.
   */
  layout?: MessageLayout;
  /** Id de transporte da linha; sem ele o Go gera o id de cada parte. */
  correlationId?: string;
  /** Linha `Message` da saida; sem ela nao ha progresso a persistir. */
  messageRecordId?: string;
  /** Citacao vai so na primeira parte. */
  quotedMessageId?: string;
  quotedParticipant?: string;
  requestId?: string;
}

export interface MessageDispatchOptions {
  progress?: MessagePartProgressPort;
  /**
   * Consultado antes de cada parte depois da primeira enviada nesta execucao.
   * Motivo nao nulo interrompe a sequencia: as partes ainda nao enviadas sao
   * descartadas (ex.: a profissional assumiu a conversa no meio).
   */
  shouldStop?: () => Promise<string | null>;
  /**
   * "digitando…" tambem antes da primeira parte. A resposta da IA nao usa: ela
   * ja demorou o tempo do modelo. Mensagem composta (lembrete, retorno) usa,
   * para nao chegar como disparo automatico.
   */
  typeFirstPart?: boolean;
  /** Trocavel so em teste; a espera e sempre `MESSAGE_PART_GAP_MS`. */
  sleep?: (ms: number) => Promise<void>;
}

export type MessageDispatchOutcome =
  | {
      status: "sent";
      providerMessageId?: string;
      raw: unknown;
      partsSent: number;
      totalParts: number;
    }
  | {
      status: "stopped";
      reason: string;
      partsSent: number;
      totalParts: number;
    };

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Envia a mensagem parte a parte, em ordem.
 *
 * Cada parte passa pelo provedor do negocio, e por isso pelo sandbox dele
 * (D-199), que e consultado a cada `sendText`. Parte unica sai como antes:
 * mesmo texto (aparado), mesmo id, sem espera e sem tocar no progresso. Com
 * varias partes, o progresso e lido no inicio e gravado depois de cada parte
 * confirmada; o retry da mesma linha retoma da primeira parte ainda nao
 * enviada e nunca reenvia uma parte confirmada.
 *
 * Entre as partes nao ha presenca: o "digitando…" de cada uma abre e fecha a
 * propria janela de online no Go (D-205), e a pausa entre elas acontece com o
 * numero indisponivel.
 *
 * Falha do transporte sobe com o erro original: quem chama classifica e grava
 * o estado da linha como sempre fez (`classifySendFailure`). A espera entre
 * partes e um timer assincrono: nao bloqueia o processo nem outras conversas.
 */
export async function dispatchMessage(
  provider: Pick<WhatsAppProvider, "sendText">,
  message: MessageDispatchInput,
  options: MessageDispatchOptions = {},
): Promise<MessageDispatchOutcome> {
  // O texto de cada parte vem so daqui: e a mensagem recebida, dividida. O
  // guard de emissores de texto (tests/support/send-text-sites.ts) reconhece
  // esta forma e segue a cadeia ate quem passou `message`.
  const parts = splitMessageIntoParts(
    message.text,
    message.layout ?? "AI_REPLY",
  );
  if (parts.length === 0) {
    throw new Error("Message dispatch received an empty text.");
  }
  const totalParts = parts.length;
  const sleep = options.sleep ?? defaultSleep;
  const progress = totalParts > 1 ? options.progress : undefined;
  const recordId = message.messageRecordId;

  const alreadySent =
    progress && recordId
      ? Math.min(
          totalParts,
          Math.max(0, await progress.readPartsSent(recordId)),
        )
      : 0;

  let last: SendTextResult | undefined;
  let sentInThisRun = 0;
  for (let index = alreadySent; index < totalParts; index += 1) {
    if (sentInThisRun > 0) {
      await sleep(MESSAGE_PART_GAP_MS);
      const reason = await options.shouldStop?.();
      if (reason) {
        return { status: "stopped", reason, partsSent: index, totalParts };
      }
    }
    const typing =
      totalParts > 1 && (index > 0 || options.typeFirstPart === true);
    last = await provider.sendText({
      to: message.to,
      text: parts[index],
      quotedMessageId: index === 0 ? message.quotedMessageId : undefined,
      quotedParticipant: index === 0 ? message.quotedParticipant : undefined,
      correlationId: message.correlationId
        ? messagePartId(message.correlationId, index, totalParts)
        : undefined,
      requestId: message.requestId,
      ...(typing ? { typingDelayMs: typingDelayFor(parts[index]) } : {}),
    });
    sentInThisRun += 1;
    if (progress && recordId) {
      await progress.recordPartsSent({
        messageRecordId: recordId,
        partsSent: index + 1,
      });
    }
  }

  return {
    status: "sent",
    providerMessageId: last?.messageId ?? message.correlationId,
    raw: last?.raw ?? null,
    partsSent: totalParts,
    totalParts,
  };
}
