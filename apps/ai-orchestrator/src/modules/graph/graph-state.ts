import { Annotation } from "@langchain/langgraph";

import type { AssistantGraphSession } from "../assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { KnowledgeSearchResult } from "../knowledge/knowledge-vector-store.js";
import type {
  ModelResponse,
  ModelToolResult,
} from "../model/model-provider.js";
import type { SessionSnapshot } from "../session/SessionService.js";

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
  tone: "PROFESSIONAL_OBJECTIVE" | "LIGHT_CLOSE";
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
    | "ignored_contact"
    | "personal_session"
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
  inboundText: Annotation<string>(),
  inputMessageIds: Annotation<string[]>(),
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
  toolResults: Annotation<GraphToolResult[]>(),
  assistantSession: Annotation<AssistantGraphSession | undefined>(),
  modelResponse: Annotation<ModelResponse | undefined>(),
  modelToolResults: Annotation<ModelToolResult[]>(),
  toolResultsValid: Annotation<boolean>(),
  response: Annotation<GraphResponse | undefined>(),
  handoffRequired: Annotation<boolean>(),
  handoffReason: Annotation<string>(),
  result: Annotation<GraphResult | undefined>(),
});

export type MessageGraphStateValue = typeof MessageGraphState.State;
export type MessageGraphStateUpdate = typeof MessageGraphState.Update;
