/**
 * Politica da inbox duravel, isolada de Prisma de proposito: backoff, limite de
 * tentativas e chave de serializacao sao decisoes de produto/operacao que
 * precisam ser testaveis sem banco.
 */

export interface InboxRetryPolicy {
  maxAttempts: number;
  baseSeconds: number;
  maxSeconds: number;
}

/**
 * Backoff exponencial limitado. `attempts` e o numero de tentativas ja
 * consumidas, incluindo a que acabou de falhar.
 */
export function nextRetryDelayMs(
  attempts: number,
  policy: InboxRetryPolicy,
): number {
  const exponent = Math.max(0, attempts - 1);
  const seconds = Math.min(
    policy.maxSeconds,
    policy.baseSeconds * 2 ** Math.min(exponent, 16),
  );
  return Math.max(0, Math.round(seconds * 1000));
}

/**
 * Dead-letter: o evento para de ser retentado e fica visivel como atencao. Nao
 * existe reenvio em massa — a retomada e sempre decisao explicita.
 */
export function isDeadLettered(
  attempts: number,
  policy: InboxRetryPolicy,
): boolean {
  return attempts >= policy.maxAttempts;
}

/**
 * Chave de serializacao por conversa. Eventos com a mesma chave executam um de
 * cada vez e em ordem; chaves distintas correm em paralelo.
 *
 * Usa o contato externo, nao o id da conversa: a conversa pode nem existir
 * ainda quando o evento e persistido, e criar uma so para poder enfileirar
 * inverteria a ordem de recebimento e persistencia.
 */
export function buildConversationKey(input: {
  tenantId: string;
  channelId: string;
  externalContactId: string;
}): string {
  return `${input.tenantId}:${input.channelId}:${input.externalContactId}`;
}

/**
 * Motivo de erro sanitizado. O inbox guarda o texto para diagnostico e ele sai
 * em log e em DTO interno: nao pode carregar segredo nem payload cru.
 */
export function sanitizeInboxError(value: unknown, limit = 300): string {
  const text =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : "unknown_error";
  const withoutSecrets = text
    .replace(/(apikey|token|authorization|secret)[=:]\s*\S+/giu, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/gu, "[redacted]");
  return withoutSecrets.slice(0, limit);
}

/**
 * Destino do evento tecnico, por tipo.
 *
 * Presenca e digitacao sao alto volume e nao mudam nenhuma decisao: recebem ACK
 * e sao descartadas. Eventos de ciclo de vida da conexao ficam registrados,
 * porque explicam por que o canal parou de responder.
 */
export function technicalEventDisposition(
  event: string | undefined,
): "record" | "discard" {
  const normalized = event?.toLowerCase() ?? "";
  if (normalized.includes("presence") || normalized.includes("typing")) {
    return "discard";
  }
  return "record";
}

/**
 * Politica de janela da conversa sobre a inbox persistida.
 *
 * `min/max/maxWait` reproduzem a politica adaptativa de fragmentos que antes so
 * existia no `Map` em memoria; `ambiguous*` implementam a espera da mensagem
 * ambigua descrita no §2 do Goal004. Tudo em segundos, como vem da
 * configuracao do processo.
 */
export interface ConversationWindowPolicy {
  minSeconds: number;
  maxSeconds: number;
  maxWaitSeconds: number;
  ambiguousSeconds: number;
  ambiguousMaxWaitSeconds: number;
}

export interface ConversationWindowInput {
  /** Texto do fragmento mais recente da conversa. */
  text: string;
  /**
   * Textos dos fragmentos ainda pendentes, na ordem de recebimento.
   *
   * Opcional: quando o chamador nao consegue reconstruir os fragmentos
   * anteriores, a politica cai no comportamento de fragmento unico.
   */
  pendingTexts?: string[];
  /** Fragmentos pendentes da conversa, incluindo o que acabou de chegar. */
  pendingFragments: number;
  /** Recebimento do fragmento mais antigo ainda pendente. */
  firstEventAt: Date;
  /** Conversa sem historico anterior: nada foi trocado com este contato. */
  firstContact: boolean;
  now: Date;
  policy: ConversationWindowPolicy;
}

/**
 * Quanto o evento ainda espera antes de ficar reivindicavel.
 *
 * A janela e sempre recalculada sobre o estado persistido, entao um fragmento
 * novo da mesma conversa a estende — e o limite desde o primeiro evento impede
 * que uma sequencia longa adie a resposta para sempre.
 */
export function conversationWindowMs(input: ConversationWindowInput): number {
  const elapsedMs = Math.max(0, input.now.getTime() - input.firstEventAt.getTime());
  const ambiguous = isAmbiguousFirstContact(input);

  const maxWaitSeconds = ambiguous
    ? input.policy.ambiguousMaxWaitSeconds
    : input.policy.maxWaitSeconds;
  const remainingUntilMax = Math.max(0, maxWaitSeconds * 1000 - elapsedMs);

  const desiredMs = ambiguous
    ? input.pendingFragments <= 1
      ? // Mensagem ambigua de numero sem historico: a espera nao e debounce de
        // fragmento, e tempo para a pessoa dizer o que quer antes de a Atendly
        // responder. Conta desde o primeiro evento, nao desde agora.
        Math.max(0, input.policy.ambiguousSeconds * 1000 - elapsedMs)
      : // O fragmento seguinte continua igualmente ambiguo ("oi", "bom dia"):
        // a pessoa ainda nao disse o que quer, entao a espera recomeca a partir
        // dele em vez de a Atendly responder uma saudacao com outra. O teto
        // desde o primeiro evento continua valendo e fecha a janela.
        input.policy.ambiguousSeconds * 1000
    : fragmentWindowMs(input);

  return Math.max(0, Math.min(desiredMs, remainingUntilMax));
}

/**
 * Janela adaptativa de fragmentos: texto longo ou varios fragmentos esperam
 * mais, seguimento urgente encurta. Mesmos degraus do buffer em memoria, agora
 * calculados sobre o que esta gravado.
 */
function fragmentWindowMs(input: ConversationWindowInput): number {
  const minMs = input.policy.minSeconds * 1000;
  const maxMs = Math.max(minMs, input.policy.maxSeconds * 1000);
  const text = input.text.trim();

  if (isUrgentFollowUp(text)) return Math.max(1000, Math.floor(minMs / 2));
  if (text.length > 220 || input.pendingFragments >= 4) {
    return Math.min(maxMs, Math.max(minMs, 18_000));
  }
  if (text.length > 80 || input.pendingFragments >= 2) {
    return Math.min(maxMs, Math.max(minMs, 12_000));
  }
  return minMs;
}

/**
 * Heuristica de transporte, nao classificacao.
 *
 * So olha o que o transporte ja sabe: e a primeira mensagem de um contato sem
 * historico e o texto e uma saudacao curta, sem pedido. Interpretar a intencao
 * — categoria, agendamento, urgencia — e do Goal005 e nao acontece aqui.
 */
export function isAmbiguousFirstContact(
  input: Pick<
    ConversationWindowInput,
    "text" | "pendingFragments" | "firstContact" | "pendingTexts"
  >,
): boolean {
  if (!input.firstContact) return false;
  if (!isAmbiguousGreeting(input.text)) return false;
  if (input.pendingFragments <= 1) return true;

  // Um segundo fragmento que ja diz o que a pessoa quer encerra a espera: a
  // conversa volta a janela normal de fragmentos. Se os fragmentos seguintes
  // continuam sendo saudacao, a mensagem segue ambigua e a espera se estende
  // ate o teto.
  const fragments = input.pendingTexts;
  if (!fragments || fragments.length === 0) return false;
  return fragments.every((fragment) => isAmbiguousGreeting(fragment));
}

const ambiguousGreeting =
  /^(oi+|ol[aá]+|opa+|eae|e a[íi]|al[oô]+|hey|hi|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|boa)$/u;

export function isAmbiguousGreeting(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!?.,;]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized || normalized.length > 40) return false;
  if (ambiguousGreeting.test(normalized)) return true;
  // Saudacao composta ("oi bom dia", "ola tudo bem"): continua sem pedido.
  const parts = normalized.split(" ");
  for (let cut = 1; cut < parts.length; cut += 1) {
    const left = parts.slice(0, cut).join(" ");
    const right = parts.slice(cut).join(" ");
    if (ambiguousGreeting.test(left) && ambiguousGreeting.test(right)) {
      return true;
    }
  }
  return false;
}

/**
 * Seguimento urgente encurta a espera: a pessoa esta cobrando resposta, nao
 * completando a mensagem.
 */
export function isUrgentFollowUp(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.includes("???") ||
    normalized === "alo" ||
    normalized === "alô" ||
    normalized === "ta ai?" ||
    normalized === "tá aí?"
  );
}
