import { Annotation } from "@langchain/langgraph";

import type { AssistantGraphSession } from "../assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type {
  ModelResponse,
  ModelToolResult,
} from "../model/model-provider.js";

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
  | "channel_disconnected";

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
    | "buffered"
    | "replied"
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
  intent: Annotation<GraphIntent>(),
  retrievedKnowledge: Annotation<string[]>(),
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
