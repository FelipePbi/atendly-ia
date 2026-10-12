import type { Conversation } from "@/data";
import type { IconName } from "@/shared/icons/Icon";

/**
 * Os seis estados de linguagem interna do vault
 * (`docs/product-vault/01-Regras/03-IA-e-Conversas.md`). Não são filtro nem
 * nome de aba: são o que a profissional lê sobre quem está conduzindo a
 * conversa agora. Cada um sai do que o contrato devolve — `status`,
 * `humanHandoff`, `handling`, `aiPaused`, `ignored`, `category` e `session` —,
 * nunca de heurística sobre o nome de um filtro local.
 */
export type ConversationState =
  | "ai-active"
  | "ai-handling"
  | "ai-paused"
  | "ai-unstable"
  | "waiting-you"
  | "you-handling";

/**
 * Motivos de handoff que o pipeline grava quando a IA **não conseguiu**
 * continuar: `erro: …` do nó do agente, mídia que o bot não trata e a pausa
 * indefinida que acompanha essas falhas. São o que o vault chama de
 * `IA com instabilidade` — separados de um handoff normal, em que a IA
 * simplesmente entregou a conversa para a pessoa. Imagem recebida é handoff
 * normal (vault, 03-IA-e-Conversas "Imagens"; quadro K2): a conversa fica
 * `Aguardando você`, não instável (Goal114).
 */
const instabilityMarkers = [
  "erro",
  "error",
  "falha",
  "failed",
  "nao suportada",
  "não suportada",
  "timeout",
  "indisponivel",
  "indisponível",
];

function isInstabilityReason(reason: string | null): boolean {
  if (!reason) return false;
  const normalized = reason.toLocaleLowerCase("pt-BR");
  return instabilityMarkers.some((marker) => normalized.includes(marker));
}

function hasLiveSession(conversation: Conversation): boolean {
  const expiresAt = conversation.session?.expiresAt;
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function conversationState(
  conversation: Conversation,
): ConversationState {
  const reason = conversation.handoffReason?.trim() || null;
  const handedOff =
    conversation.status === "HUMAN_HANDOFF" || conversation.humanHandoff;

  // `handling` vem da sessão vigente e é o fato mais recente sobre quem
  // responde; `OWNER_TAKEOVER` cobre o estoque anterior ao campo.
  if (conversation.handling === "HUMAN") return "you-handling";
  if (handedOff && reason === "OWNER_TAKEOVER") return "you-handling";

  // Contato ignorado vem antes de qualquer estado de IA: a IA não responde
  // nem usa esta conversa, então não há automação para descrever.
  if (conversation.ignored) return "ai-paused";

  // A pausa indefinida acompanha a falha, então o motivo do handoff precisa
  // ser lido antes de `aiPaused` — senão instabilidade viraria pausa comum.
  if (handedOff && isInstabilityReason(reason)) return "ai-unstable";
  if (handedOff) return "waiting-you";

  if (conversation.aiPaused || conversation.category === "PERSONAL") {
    return "ai-paused";
  }

  if (conversation.status === "ACTIVE" && hasLiveSession(conversation)) {
    return "ai-handling";
  }

  return "ai-active";
}

export type ConversationStateView = {
  /** Rótulo da ação principal da barra de estado. */
  action: string;
  className: string;
  /** O que o campo de resposta pode dizer neste estado. */
  composer: string;
  copy: string;
  icon: IconName;
  label: string;
};

const views: Record<ConversationState, ConversationStateView> = {
  "ai-active": {
    action: "Assumir conversa",
    className: "is-ai",
    composer: "Assuma a conversa para responder você mesma.",
    copy: "A IA responde em nome do negócio na próxima mensagem.",
    icon: "spark",
    label: "IA ativa",
  },
  "ai-handling": {
    action: "Assumir conversa",
    className: "is-ai",
    composer: "Assuma a conversa para responder você mesma.",
    copy: "A IA está conduzindo este atendimento agora.",
    icon: "spark",
    label: "IA atendendo",
  },
  "ai-paused": {
    action: "Assumir conversa",
    className: "is-paused",
    composer: "Assuma a conversa para responder ao cliente.",
    copy: "Nenhuma resposta automática será enviada nesta conversa.",
    icon: "info",
    label: "IA pausada",
  },
  "ai-unstable": {
    action: "Assumir conversa",
    className: "is-error",
    composer: "Assuma a conversa para responder ao cliente.",
    copy: "Não foi possível continuar o atendimento automático.",
    icon: "alert",
    label: "IA com instabilidade",
  },
  "waiting-you": {
    action: "Assumir conversa",
    className: "is-waiting",
    composer: "Assuma a conversa para responder ao cliente.",
    copy: "Esta conversa precisa da sua atenção.",
    icon: "alert",
    label: "Aguardando você",
  },
  "you-handling": {
    action: "Retomar IA",
    className: "is-human",
    composer: "Você está respondendo · IA pausada",
    copy: "Você está atendendo. A IA não responde enquanto isso.",
    icon: "user",
    label: "Você atendendo",
  },
};

export function conversationStateView(
  state: ConversationState,
): ConversationStateView {
  return views[state];
}

export function needsAttention(state: ConversationState): boolean {
  return state === "waiting-you" || state === "ai-unstable";
}

/**
 * O motivo do handoff em português. O pipeline grava marcadores internos
 * (`OWNER_TAKEOVER`, `erro: …`); a tela diz por que a conversa caiu no colo da
 * profissional sem devolver jargão para ela.
 */
export function handoffReasonCopy(reason: string | null): string | null {
  const value = reason?.trim();
  if (!value) return null;
  if (value === "OWNER_TAKEOVER") return "Você assumiu esta conversa.";
  const normalized = value.toLocaleLowerCase("pt-BR");
  if (
    normalized.includes("image_received") ||
    normalized.includes("suportada")
  ) {
    return "O cliente enviou algo que a IA não trata sozinha.";
  }
  if (isInstabilityReason(value)) {
    return "A IA não conseguiu concluir a resposta e chamou você.";
  }
  return `A IA passou a conversa para você: ${value}`;
}

/**
 * O motivo da espera como linha de evento do chat (quadro K2). Imagem recebida
 * ganha a frase do quadro; os outros motivos usam `handoffReasonCopy`. A
 * assunção pela própria profissional não é espera, e não vira linha.
 */
export function waitingNoticeCopy(reason: string | null): string | null {
  const value = reason?.trim();
  if (!value || value === "OWNER_TAKEOVER") return null;
  if (isImageReason(value)) {
    return "Imagem recebida · a IA pausou e está aguardando você";
  }
  return handoffReasonCopy(value);
}

export function isImageReason(reason: string | null): boolean {
  return Boolean(reason?.toLocaleLowerCase("pt-BR").includes("image_received"));
}
