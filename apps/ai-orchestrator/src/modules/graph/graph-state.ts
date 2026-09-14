import { Annotation } from "@langchain/langgraph";

import type { AssistantGraphSession } from "../assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { KnowledgeSearchResult } from "../knowledge/knowledge-vector-store.js";
import type { InboundTranscription } from "../media/audio-transcription.js";
import type { CustomerMemoryPromptItem } from "../memory/customer-memory.js";
import type {
  ModelResponse,
  ModelToolResult,
} from "../model/model-provider.js";
import type { SessionSnapshot } from "../session/SessionService.js";
import type { AiConversationStyle } from "../tenant-config/ai-settings.js";

/**
 * Identidade do turno de entrada.
 *
 * O turno e a mensagem que entrou, nao o instante em que ela foi processada:
 * relogio nao serve aqui porque duas iteracoes do mesmo turno acontecem com
 * milissegundos de diferenca e um retry do mesmo webhook acontece minutos
 * depois — os dois casos precisam ser o **mesmo** turno. O identificador do
 * provedor e estavel nas duas situacoes.
 */
export function deriveTurnId(message: ChannelInboundMessage): string {
  return `${message.channelId}:${message.messageId}`;
}

export type GraphIntent =
  | "simple_response"
  | "knowledge"
  | "operational"
  | "handoff"
  | "owner_activity"
  | "unsupported";

export type GraphGuardDecision =
  | "enabled"
  | "duplicate"
  | "bot_disabled"
  | "paused"
  | "human_takeover"
  | "channel_disconnected"
  // Regra do contato e da sessao, avaliadas antes de qualquer leitura de
  // conteudo: nem classificacao, nem modelo, nem RAG, nem memoria.
  | "ignored_contact"
  | "personal_session";

export interface GraphTenantConfig {
  aiEnabled: boolean;
  tone: AiConversationStyle;
  promptVersion: string;
}

export interface GraphCustomerContext {
  phone: string;
  name?: string;
}

export interface GraphConversationContext {
  status: "ACTIVE" | "HUMAN_HANDOFF" | "CLOSED";
  humanHandoff: boolean;
  /**
   * Contato da conversa lido do banco, nao do payload do transporte. Opcional
   * porque o runtime anterior ao Goal005 nao o devolve.
   */
  externalContactId?: string;
  contactId?: string | null;
  /**
   * Servico em foco lido do estado persistido da conversa (rascunho de
   * agendamento ou acao pendente), nunca inferido por texto livre. Alimenta a
   * precedencia de conhecimento por servico em `retrieveKnowledge`.
   */
  focusServiceIds?: string[];
}

export interface GraphToolResult {
  name: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED";
  result?: unknown;
  error?: string;
}

export interface GraphResponse {
  text: string;
  conversationId?: string;
  messageRecordId?: string;
  /** Operation-id estavel da saida, emitido antes de chamar o transporte. */
  correlationId?: string;
  providerMessageId?: string;
  rawPayload?: unknown;
}

export interface GraphBufferedRecord {
  conversationId: string;
  messageRecordId: string;
  /**
   * Texto do fragmento como o grafo o entendeu, ja marcado quando veio de
   * audio transcrito. E ele, e nao o texto bruto do transporte, que o lote
   * agrupa: um fragmento de voz nao tem texto no payload do canal.
   */
  text?: string;
}

export interface GraphResult {
  ok: true;
  action:
    | "duplicate"
    | "ignored_bot_outbound"
    | "bot_resumed"
    | "bot_paused"
    | "manual_activity_recorded"
    | "ai_pause_command"
    | "bot_disabled"
    | "paused_conversation"
    | "channel_disconnected"
    | "unsupported_message"
    // Imagem com IA elegivel: handoff deterministico, sem chamada de modelo
    // (Goal013).
    | "unsupported_handoff"
    | "ignored_contact"
    | "personal_session"
    | "unsupported_media_kind"
    | "buffered"
    | "replied"
    | "superseded"
    | "send_failed"
    | "error_handoff";
  outboundMessage?: GraphResponse;
}

export const MessageGraphState = Annotation.Root({
  tenantId: Annotation<string>(),
  conversationId: Annotation<string>(),
  channelId: Annotation<string>(),
  invocationStartedAt: Annotation<string>(),
  inboundMessage: Annotation<ChannelInboundMessage>(),
  /**
   * Turno de entrada deste ciclo, ver `deriveTurnId`. Atravessa o grafo ate as
   * tools para que o rascunho saiba em que turno nasceu.
   */
  turnId: Annotation<string>(),
  inboundText: Annotation<string>(),
  inputMessageIds: Annotation<string[]>(),
  /**
   * `Message.id` da mensagem **deste** turno, quando ela foi persistida.
   *
   * Diferente de `inputMessageIds`, que no lote agrupado carrega todos os
   * fragmentos: a transcricao precisa do attachment desta mensagem, nao do
   * primeiro fragmento do lote.
   */
  inboundRecordId: Annotation<string | undefined>(),
  /** Desfecho da transcricao deste turno, ver `transcribeAudio`. */
  audioTranscription: Annotation<InboundTranscription | undefined>(),
  deferResponse: Annotation<boolean>(),
  eventAlreadyGuarded: Annotation<boolean>(),
  bufferedRecord: Annotation<GraphBufferedRecord | undefined>(),
  tenantConfig: Annotation<GraphTenantConfig>(),
  customerContext: Annotation<GraphCustomerContext>(),
  conversation: Annotation<GraphConversationContext>(),
  guardDecision: Annotation<GraphGuardDecision>(),
  /** Contato e sessao vigentes; ausente quando a porta de sessao nao esta ligada. */
  session: Annotation<SessionSnapshot | undefined>(),
  /** Versao de entrada observada no inicio do turno, comparada antes de agir. */
  observedInboundVersion: Annotation<number>(),
  intent: Annotation<GraphIntent>(),
  retrievedKnowledge: Annotation<KnowledgeSearchResult[]>(),
  /**
   * Memoria permitida da pessoa vinculada ao contato desta conversa. Carregada
   * depois do `sessionGate`, entao contato ignorado e sessao pessoal nunca
   * chegam a ler memoria.
   */
  customerMemory: Annotation<CustomerMemoryPromptItem[]>(),
  toolResults: Annotation<GraphToolResult[]>(),
  assistantSession: Annotation<AssistantGraphSession | undefined>(),
  modelResponse: Annotation<ModelResponse | undefined>(),
  modelToolResults: Annotation<ModelToolResult[]>(),
  toolResultsValid: Annotation<boolean>(),
  response: Annotation<GraphResponse | undefined>(),
  handoffRequired: Annotation<boolean>(),
  handoffReason: Annotation<string>(),
  /**
   * Resumo do handoff quando difere da falha de processamento generica, ex.
   * imagem recebida (Goal013). Sem valor, o no `handoff` usa o resumo de
   * falha de sempre.
   */
  handoffSummary: Annotation<string | undefined>(),
  result: Annotation<GraphResult | undefined>(),
});

export type MessageGraphStateValue = typeof MessageGraphState.State;
export type MessageGraphStateUpdate = typeof MessageGraphState.Update;
