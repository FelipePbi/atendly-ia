import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { onSessionMemoryReset } from "@/shared/runtime/sessionMemory";

/**
 * Mídia do chat já baixada nesta aba, como blob local.
 *
 * Cada busca é uma ida ao WhatsApp (BFF → IA → Evolution), então trocar de
 * conversa e voltar não pode baixar tudo de novo: o que já veio fica aqui
 * até a aba fechar ou o teto empurrar o mais antigo para fora. Também limita
 * quantas buscas correm ao mesmo tempo, porque abrir uma conversa cheia de
 * figurinhas pediria todas de uma vez. Pertence à sessão como a memória da
 * aba (D-167): sair ou trocar de conta esvazia tudo.
 */
export interface CachedMedia {
  contentType: string;
  fileName: string | null;
  url: string;
}

const MAX_CONCURRENT = 3;
const MAX_BYTES = 64 * 1024 * 1024;

interface Entry extends CachedMedia {
  size: number;
}

const ready = new Map<string, Entry>();
const pending = new Map<string, Pending>();
const waiting: Array<() => void> = [];
let active = 0;
let totalBytes = 0;
/** Muda a cada esvaziamento: busca que voltou depois dele não é guardada. */
let generation = 0;

function keyOf(conversationId: string, messageId: string) {
  return `${conversationId}/${messageId}`;
}

/** O que já está pronto, sem buscar; renova a posição no teto. */
export function peekMedia(
  conversationId: string,
  messageId: string,
): CachedMedia | undefined {
  const key = keyOf(conversationId, messageId);
  const entry = ready.get(key);
  if (!entry) return undefined;
  ready.delete(key);
  ready.set(key, entry);
  return entry;
}

export interface LoadMediaOptions {
  /** Cancela a busca: enquanto espera vaga e, sem `keepRunning`, também a ida. */
  signal?: AbortSignal;
  /**
   * Busca que já começou continua até o fim mesmo com `signal` cancelado,
   * para o resultado ficar guardado — imagem e figurinha que saíram da tela
   * na troca de conversa. Só o lugar na fila é devolvido.
   */
  keepRunning?: boolean;
}

interface Pending {
  keepRunning: boolean;
  promise: Promise<CachedMedia>;
  running: boolean;
  signal?: AbortSignal;
}

/**
 * Busca (ou reaproveita) a mídia de uma mensagem. Duas telas pedindo a mesma
 * mídia esperam a mesma busca, salvo se a de quem pediu antes já foi
 * cancelada — aí nasce outra.
 */
export function loadMedia(
  conversationId: string,
  messageId: string,
  { keepRunning = false, signal }: LoadMediaOptions = {},
): Promise<CachedMedia> {
  const hit = peekMedia(conversationId, messageId);
  if (hit) return Promise.resolve(hit);
  const key = keyOf(conversationId, messageId);
  const running = pending.get(key);
  if (
    running &&
    (!running.signal?.aborted || (running.running && running.keepRunning))
  ) {
    return running.promise;
  }

  const record = { keepRunning, running: false, signal } as Pending;
  const startedIn = generation;
  record.promise = (async () => {
    await acquire(signal);
    record.running = true;
    try {
      const result = await getProductServices().conversations.getMedia(
        conversationId,
        messageId,
        keepRunning ? undefined : signal,
      );
      const entry: Entry = {
        contentType: result.contentType,
        fileName: result.fileName,
        size: result.blob.size,
        url: URL.createObjectURL(result.blob),
      };
      if (startedIn === generation) store(key, entry);
      return entry;
    } finally {
      if (startedIn === generation) release();
    }
  })();
  pending.set(key, record);
  const forget = () => {
    if (pending.get(key) === record) pending.delete(key);
  };
  void record.promise.then(forget, forget);
  return record.promise;
}

/** Esvazia tudo e revoga os blobs. */
export function clearMediaCache() {
  for (const entry of ready.values()) URL.revokeObjectURL(entry.url);
  ready.clear();
  pending.clear();
  waiting.length = 0;
  active = 0;
  totalBytes = 0;
  generation += 1;
}

function store(key: string, entry: Entry) {
  ready.set(key, entry);
  totalBytes += entry.size;
  for (const [oldKey, old] of ready) {
    if (totalBytes <= MAX_BYTES || oldKey === key) break;
    ready.delete(oldKey);
    totalBytes -= old.size;
    URL.revokeObjectURL(old.url);
  }
}

function acquire(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener("abort", onAbort);
      active += 1;
      resolve();
    };
    const onAbort = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(abortError());
    };
    waiting.push(start);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function release() {
  active = Math.max(0, active - 1);
  waiting.shift()?.();
}

function abortError() {
  return new DOMException("A busca da mídia foi cancelada.", "AbortError");
}

onSessionMemoryReset(clearMediaCache);
