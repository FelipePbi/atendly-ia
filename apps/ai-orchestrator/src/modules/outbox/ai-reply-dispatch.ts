import type {
  SendTextResult,
  WhatsAppProvider,
} from "../channel/ports/WhatsAppProvider.js";

/**
 * Resposta da IA em varias mensagens curtas (decisao de produto 2026-10-11).
 *
 * A IA continua gerando **uma** resposta, com o mesmo grafo, modelo e tools.
 * Só o despacho muda: o texto é dividido de forma deterministica e cada parte
 * sai como uma mensagem separada do WhatsApp, em ordem, com um intervalo
 * minimo entre partes consecutivas. A linha `Message` continua uma so, com o
 * texto completo: e ela que a inbox mostra e que o historico da IA le.
 *
 * Vale so para a resposta da IA ao cliente (grafo e teste de ativacao). Nao
 * passa por aqui: mensagem digitada pela profissional, aviso de sistema,
 * lembrete e o envio do numero da plataforma no teste de ativacao.
 */

/** Intervalo minimo entre duas partes consecutivas da mesma resposta. */
export const AI_REPLY_PART_GAP_MS = 1000;

/**
 * "digitando…" antes de cada parte depois da primeira, proporcional ao
 * tamanho do texto (validacao de 2026-10-11): pausa curta, digitando, e a
 * mensagem chega. A primeira parte sai sem, porque a resposta ja demorou o
 * tempo do modelo.
 */
export function typingDelayFor(text: string): number {
  return Math.min(2000, Math.max(800, Math.round(text.length * 30)));
}

/** Teto de partes por resposta; o excedente vai junto na ultima parte. */
export const AI_REPLY_MAX_PARTS = 4;

/** Uma abertura curta ("Oi!", "Bom dia!", "Oi, Ana!") tem ate isto de palavras. */
const OPENING_MAX_WORDS = 4;

/** Item de lista: "-", "•", "*", "–" seguidos de espaco, ou "1." / "1)". */
const LIST_ITEM_LINE = /^\s*(?:[-•*–]\s|\d{1,3}[.)]\s)/u;

/**
 * Primeira frase do bloco, terminada em "!" ou "?", com os emojis que vierem
 * logo depois dela, seguida de espaco/quebra e do resto. A classe exclui
 * `.!?` e quebra de linha: a frase de abertura e a primeira, inteira na
 * primeira linha. Exigir espaco depois do `!`/`?` evita cortar URL com query.
 */
const OPENING_SENTENCE =
  /^([^\n.!?]*?[!?]+(?:\s*[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]+)*)\s+(\S[\s\S]*)$/u;

/**
 * Divide a resposta em partes para o envio. Funcao pura e deterministica.
 *
 * - quebra em linha em branco (paragrafo);
 * - lista nunca e dividida: paragrafo que comeca com item de lista, e o que
 *   segue um paragrafo terminado em ":", fica junto do anterior;
 * - uma abertura curta no inicio da resposta (primeira frase terminada em
 *   "!"/"?", ate 4 palavras) sai sozinha;
 * - URL nunca e cortada (so se quebra em linha em branco ou depois de
 *   "!"/"?" seguido de espaco) e emoji fica com a frase dele;
 * - partes aparadas, vazias descartadas, teto de 4 (o excedente junta na
 *   ultima, separado por linha em branco);
 * - nenhum texto e criado: as partes, juntas, sao o texto original.
 */
export function splitAiReplyIntoParts(text: string): string[] {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
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

  const parts = [...splitOpening(blocks[0]), ...blocks.slice(1)];
  if (parts.length <= AI_REPLY_MAX_PARTS) return parts;
  return [
    ...parts.slice(0, AI_REPLY_MAX_PARTS - 1),
    parts.slice(AI_REPLY_MAX_PARTS - 1).join("\n\n"),
  ];
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
 * Id de transporte de cada parte.
 *
 * A **ultima** parte leva o `correlationId` da linha; as anteriores levam
 * `<correlationId>-p<n>`. Assim o recibo que reconcilia a linha pelo
 * `correlationId` e o da ultima parte — prova de que a sequencia terminou —,
 * e a resposta de parte unica continua com o mesmo id de antes.
 */
export function aiReplyPartMessageId(
  correlationId: string,
  index: number,
  totalParts: number,
): string {
  return index >= totalParts - 1
    ? correlationId
    : `${correlationId}-p${index + 1}`;
}

/** `correlationId` da linha a partir do id de transporte de qualquer parte. */
export function aiReplyCorrelationIdOf(messageId: string): string {
  return messageId.replace(/-p\d+$/u, "");
}

/** Progresso persistido do despacho em partes (`Message.deliveryPartsSent`). */
export interface AiReplyPartProgressPort {
  readPartsSent(messageRecordId: string): Promise<number>;
  recordPartsSent(input: {
    messageRecordId: string;
    partsSent: number;
  }): Promise<void>;
}

export interface AiReplyDispatchInput {
  to: string;
  text: string;
  /** Id de transporte da linha; sem ele o Go gera o id de cada parte. */
  correlationId?: string;
  /** Linha `Message` da resposta; sem ela nao ha progresso a persistir. */
  messageRecordId?: string;
  /** Citacao vai so na primeira parte. */
  quotedMessageId?: string;
  quotedParticipant?: string;
  requestId?: string;
}

export interface AiReplyDispatchOptions {
  progress?: AiReplyPartProgressPort;
  /**
   * Consultado antes de cada parte depois da primeira enviada nesta execucao.
   * Motivo nao nulo interrompe a sequencia: as partes ainda nao enviadas sao
   * descartadas (ex.: a profissional assumiu a conversa no meio).
   */
  shouldStop?: () => Promise<string | null>;
  /** Trocavel so em teste; a espera e sempre `AI_REPLY_PART_GAP_MS`. */
  sleep?: (ms: number) => Promise<void>;
}

export type AiReplyDispatchOutcome =
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
 * Envia a resposta da IA parte a parte, em ordem.
 *
 * Parte unica sai como antes: mesmo texto (aparado), mesmo id, sem espera e
 * sem tocar no progresso. Com varias partes, o progresso e lido no inicio e
 * gravado depois de cada parte confirmada; o retry da mesma linha retoma da
 * primeira parte ainda nao enviada e nunca reenvia uma parte confirmada.
 *
 * Falha do transporte sobe com o erro original: quem chama classifica e grava
 * o estado da linha como sempre fez (`classifySendFailure`). A espera entre
 * partes e um timer assincrono: nao bloqueia o processo nem outras conversas.
 */
export async function dispatchAiReply(
  provider: Pick<WhatsAppProvider, "sendText">,
  reply: AiReplyDispatchInput,
  options: AiReplyDispatchOptions = {},
): Promise<AiReplyDispatchOutcome> {
  // O texto de cada parte vem so daqui: e a resposta recebida, dividida. O
  // guard de emissores de texto (tests/support/send-text-sites.ts) reconhece
  // esta forma e segue a cadeia ate quem passou `reply`.
  const parts = splitAiReplyIntoParts(reply.text);
  if (parts.length === 0) {
    throw new Error("AI reply dispatch received an empty reply.");
  }
  const totalParts = parts.length;
  const sleep = options.sleep ?? defaultSleep;
  const progress = totalParts > 1 ? options.progress : undefined;
  const recordId = reply.messageRecordId;

  const alreadySent =
    progress && recordId
      ? Math.min(totalParts, Math.max(0, await progress.readPartsSent(recordId)))
      : 0;

  let last: SendTextResult | undefined;
  let sentInThisRun = 0;
  for (let index = alreadySent; index < totalParts; index += 1) {
    if (sentInThisRun > 0) {
      await sleep(AI_REPLY_PART_GAP_MS);
      const reason = await options.shouldStop?.();
      if (reason) {
        return { status: "stopped", reason, partsSent: index, totalParts };
      }
    }
    last = await provider.sendText({
      to: reply.to,
      text: parts[index],
      quotedMessageId: index === 0 ? reply.quotedMessageId : undefined,
      quotedParticipant: index === 0 ? reply.quotedParticipant : undefined,
      correlationId: reply.correlationId
        ? aiReplyPartMessageId(reply.correlationId, index, totalParts)
        : undefined,
      requestId: reply.requestId,
      ...(index > 0 ? { typingDelayMs: typingDelayFor(parts[index]) } : {}),
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
    providerMessageId: last?.messageId ?? reply.correlationId,
    raw: last?.raw ?? null,
    partsSent: totalParts,
    totalParts,
  };
}
