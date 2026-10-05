/**
 * Politica de contato, sessao e controle humano, isolada de Prisma de
 * proposito: fronteira de inatividade, precedencia entre override manual e
 * sugestao automatica e elegibilidade da IA sao decisoes de produto que
 * precisam ser testaveis sem banco.
 *
 * Nada aqui interpreta conteudo de mensagem. Classificar e do agente; esta
 * camada so decide o que a plataforma faz com a categoria ja registrada.
 */

export type SessionCategory = "COMMERCIAL" | "UNCLASSIFIED" | "PERSONAL";
export type CategorySource = "AUTOMATIC" | "MANUAL";
export type HumanControlSource = "WHATSAPP" | "AVENLY" | "BACKFILL";

/**
 * Fronteiras configuraveis da sessao. `inactivitySeconds` e a janela de
 * aproximadamente 24 h sem interacao **do contato** (D-009): a resposta da
 * plataforma nao renova a sessao, quem sumiu deixou de conversar.
 */
export interface SessionPolicy {
  inactivitySeconds: number;
}

export function sessionExpiresAt(
  lastContactMessageAt: Date,
  policy: SessionPolicy,
): Date {
  return new Date(
    lastContactMessageAt.getTime() + policy.inactivitySeconds * 1000,
  );
}

/**
 * A sessao expirou quando o instante de expiracao ja passou. O limite e
 * fechado: exatamente no instante de expiracao a sessao ainda vale, e so o
 * milissegundo seguinte abre sessao nova. Nao existe expiracao silenciosa por
 * outro relogio.
 */
export function isSessionExpired(input: {
  expiresAt: Date;
  now: Date;
}): boolean {
  return input.now.getTime() > input.expiresAt.getTime();
}

/**
 * De quem e a decisao manual vigente: so desta sessao (`CONVERSATION`), do
 * contato (`CONTACT`), ou de ninguem (`null`, classificacao automatica).
 */
export type CategoryScope = "CONVERSATION" | "CONTACT";

/**
 * Categoria vigente da sessao.
 *
 * Precedencia: decisao da sessao > decisao do contato > sugestao >
 * `Nao classificadas`. A decisao mais especifica e mais recente vence: "so
 * esta conversa" vale apenas na sessao em que foi tomada, e a sessao seguinte
 * nasce sem ela; o override do contato atravessa a troca de sessao; a sugestao
 * do agente so vale quando ninguem decidiu manualmente. Sem decisao nem
 * sugestao, a conversa fica em `Nao classificadas` — nunca em um palpite.
 */
export function resolveEffectiveCategory(input: {
  sessionOverride?: SessionCategory | null;
  override?: SessionCategory | null;
  suggestion?: SessionCategory | null;
}): { category: SessionCategory; source: CategorySource } {
  if (input.sessionOverride) {
    return { category: input.sessionOverride, source: "MANUAL" };
  }
  if (input.override) return { category: input.override, source: "MANUAL" };
  if (input.suggestion) {
    return { category: input.suggestion, source: "AUTOMATIC" };
  }
  return { category: "UNCLASSIFIED", source: "AUTOMATIC" };
}

/** Escopo da decisao manual que `resolveEffectiveCategory` faria valer. */
export function resolveCategoryScope(input: {
  sessionOverride?: SessionCategory | null;
  override?: SessionCategory | null;
}): CategoryScope | null {
  if (input.sessionOverride) return "CONVERSATION";
  if (input.override) return "CONTACT";
  return null;
}

/**
 * Classificacao tecnica do agente traduzida para a organizacao da inbox.
 *
 * E sugestao, sempre: o retorno alimenta `suggestedCategory`, nunca o override
 * manual. Fornecedor, spam e desconhecido nao viram Comercial nem Pessoal —
 * ficam em `Nao classificadas`, que e exatamente o que a plataforma sabe.
 */
export function categoryFromClassification(
  classification: string | null | undefined,
): SessionCategory | null {
  switch (classification) {
    case "potential_customer":
    case "existing_customer":
      return "COMMERCIAL";
    case "personal_contact":
      return "PERSONAL";
    case "supplier_or_partner":
    case "spam":
    case "unknown":
      return "UNCLASSIFIED";
    default:
      return null;
  }
}

/**
 * Motivo pelo qual a IA nao processa esta mensagem. `null` significa elegivel.
 *
 * A ordem e deliberada: o que e regra do contato vem antes do que e estado da
 * conversa, e o que e privacidade vem antes do que e operacao. Contato
 * ignorado e sessao pessoal precisam recusar **antes** de qualquer leitura de
 * conteudo — classificacao, transcricao, modelo, RAG, embedding ou memoria.
 */
export type AiEligibilityReason =
  | "contact_ignored"
  | "session_personal"
  | "channel_disconnected"
  | "ai_disabled"
  | "contact_ai_paused"
  | "human_handling";

export interface AiEligibilityInput {
  contactIgnored: boolean;
  contactAiPaused: boolean;
  category: SessionCategory;
  humanHandling: boolean;
  aiEnabled: boolean;
  channelConnected: boolean;
}

export function aiEligibilityReason(
  input: AiEligibilityInput,
): AiEligibilityReason | null {
  if (input.contactIgnored) return "contact_ignored";
  if (input.category === "PERSONAL") return "session_personal";
  if (!input.channelConnected) return "channel_disconnected";
  if (!input.aiEnabled) return "ai_disabled";
  if (input.contactAiPaused) return "contact_ai_paused";
  if (input.humanHandling) return "human_handling";
  return null;
}

export function isAiEligible(input: AiEligibilityInput): boolean {
  return aiEligibilityReason(input) === null;
}

/**
 * Guard deterministico antes de executar tool com efeito e antes de enviar.
 *
 * Alem da elegibilidade, compara a **versao de entrada**: se o contato falou de
 * novo desde o inicio deste turno, o contexto mudou e a saida pendente e
 * descartada em vez de responder ao que a pessoa acabou de corrigir.
 */
export function executionGuardReason(
  input: AiEligibilityInput & {
    observedInboundVersion: number;
    currentInboundVersion: number;
  },
): AiEligibilityReason | "input_superseded" | null {
  const eligibility = aiEligibilityReason(input);
  if (eligibility) return eligibility;
  if (input.currentInboundVersion > input.observedInboundVersion) {
    return "input_superseded";
  }
  return null;
}
