import {
  type BaseCheckpointSaver,
  END,
  MemorySaver,
  START,
  StateGraph,
} from "@langchain/langgraph";

import { env } from "../../config/env.js";
import { detectAiCommand } from "../../lib/ai-command-detector.js";
import {
  channelMessageLogContext,
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type { AssistantService } from "../assistant/assistant.service.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type {
  AutomationPort,
  HandoffPort,
  IdempotencyPort,
  InboundProcessingResult,
} from "../channel/InboundMessageProcessor.js";
import type { WhatsAppProvider } from "../channel/ports/WhatsAppProvider.js";
import type { KnowledgeVectorStore } from "../knowledge/knowledge-vector-store.js";
import type { GraphRuntimePort } from "./graph-runtime.js";
import {
  type GraphIntent,
  MessageGraphState,
  type MessageGraphStateUpdate,
  type MessageGraphStateValue,
} from "./graph-state.js";

const unsupportedMessageReply =
  "Recebi sua mensagem, mas por enquanto consigo responder melhor por texto. Me envie sua pergunta em texto que continuo por aqui.";
const processingErrorReply =
  "Tive um problema para consultar o sistema agora. Vou chamar a profissional para continuar seu atendimento.";

export interface MessageGraphInput {
  message: ChannelInboundMessage;
  conversationId: string;
  text?: string;
  messageRecordIds?: string[];
  deferResponse?: boolean;
  eventAlreadyGuarded?: boolean;
}

export interface MessageGraphExecution {
  result: InboundProcessingResult;
  bufferedRecord?: { conversationId: string; messageRecordId: string };
}

export interface MessageGraphDependencies {
  automation: AutomationPort;
  provider: WhatsAppProvider;
  idempotency: IdempotencyPort;
  handoff: HandoffPort;
  runtime: GraphRuntimePort;
  knowledge?: KnowledgeVectorStore;
  checkpointer?: BaseCheckpointSaver;
  logger?: DiagnosticLogger;
}

export class MessageGraphWorkflow {
  private readonly logger: DiagnosticLogger;
  private readonly graph;

  constructor(private readonly dependencies: MessageGraphDependencies) {
    this.logger = dependencies.logger ?? noopDiagnosticLogger;
    this.graph = this.buildGraph(
      dependencies.checkpointer ?? new MemorySaver(),
    );
  }

  async invoke(input: MessageGraphInput): Promise<MessageGraphExecution> {
    const config = {
      configurable: { thread_id: input.conversationId },
    };
    const pending = await this.graph.getState(config);
    if (pending.next.length > 0) {
      const pendingMessageId = readPendingMessageId(pending.values);
      const resumed = await this.graph.invoke(null, config);
      if (pendingMessageId === input.message.messageId) {
        return requireGraphExecution(resumed);
      }
    }

    const state = await this.graph.invoke(
      {
        tenantId: input.message.tenantId,
        conversationId: input.conversationId,
        channelId: input.message.channelId,
        invocationStartedAt: new Date().toISOString(),
        inboundMessage: input.message,
        inboundText: input.text ?? input.message.text ?? "",
        inputMessageIds: input.messageRecordIds ?? [],
        deferResponse: input.deferResponse ?? false,
        eventAlreadyGuarded: input.eventAlreadyGuarded ?? false,
        bufferedRecord: undefined,
        retrievedKnowledge: [],
        toolResults: [],
        assistantSession: undefined,
        modelResponse: undefined,
        modelToolResults: [],
        toolResultsValid: true,
        handoffRequired: false,
        handoffReason: "",
        response: undefined,
        result: undefined,
      },
      config,
    );
    return requireGraphExecution(state);
  }

  private buildGraph(checkpointer: BaseCheckpointSaver) {
    return new StateGraph(MessageGraphState)
      .addNode("loadRuntimeContext", (state) => this.loadRuntimeContext(state))
      .addNode("loadConversation", (state) => this.loadConversation(state))
      .addNode("operationalGuard", (state) => this.operationalGuard(state))
      .addNode("understandMessage", (state) => this.understandMessage(state))
      .addNode("recordInbound", (state) => this.recordInbound(state))
      .addNode("bufferInbound", (state) => this.bufferInbound(state))
      .addNode("retrieveKnowledge", (state) => this.retrieveKnowledge(state))
      .addNode("agent", (state) => this.agent(state))
      .addNode("executeTool", (state) => this.executeTool(state))
      .addNode("validateToolResult", (state) => this.validateToolResult(state))
      .addNode("composeResponse", (state) => this.composeResponse(state))
      .addNode("persistResponse", (state) => this.persistResponse(state))
      .addNode("sendResponse", (state) => this.sendResponse(state))
      .addNode("handoff", (state) => this.handoff(state))
      .addEdge(START, "loadRuntimeContext")
      .addEdge("loadRuntimeContext", "loadConversation")
      .addEdge("loadConversation", "operationalGuard")
      .addConditionalEdges(
        "operationalGuard",
        (state) => (state.guardDecision === "enabled" ? "continue" : "end"),
        { continue: "understandMessage", end: END },
      )
      .addConditionalEdges("understandMessage", routeAfterUnderstanding, {
        end: END,
        buffer: "bufferInbound",
        record: "recordInbound",
        retrieval: "retrieveKnowledge",
        agent: "agent",
      })
      .addEdge("bufferInbound", END)
      .addConditionalEdges("recordInbound", routeAfterRecording, {
        retrieval: "retrieveKnowledge",
        agent: "agent",
      })
      .addEdge("retrieveKnowledge", "agent")
      .addConditionalEdges("agent", routeAfterAgent, {
        end: END,
        tools: "executeTool",
        compose: "composeResponse",
      })
      .addEdge("executeTool", "validateToolResult")
      .addEdge("validateToolResult", "agent")
      .addConditionalEdges(
        "composeResponse",
        (state) => (state.handoffRequired ? "handoff" : "persist"),
        { handoff: "handoff", persist: "persistResponse" },
      )
      .addEdge("handoff", "persistResponse")
      .addConditionalEdges(
        "persistResponse",
        (state) => (state.result ? "end" : "send"),
        { end: END, send: "sendResponse" },
      )
      .addEdge("sendResponse", END)
      .compile({ checkpointer });
  }

  private async loadRuntimeContext(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const runtime = await this.dependencies.runtime.loadTenantConfig(
      state.inboundMessage,
    );
    return {
      tenantConfig: runtime.tenantConfig,
      customerContext: {
        phone: state.inboundMessage.customerPhone,
        name: state.inboundMessage.customerName,
      },
      guardDecision: runtime.channelConnected
        ? "enabled"
        : "channel_disconnected",
    };
  }

  private async loadConversation(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    return {
      conversation: await this.dependencies.runtime.loadConversation({
        tenantId: state.tenantId,
        channelId: state.channelId,
        conversationId: state.conversationId,
      }),
    };
  }

  private async operationalGuard(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const message = state.inboundMessage;
    const firstDelivery =
      state.eventAlreadyGuarded ||
      (await this.dependencies.idempotency.remember(message));
    if (!firstDelivery) {
      return {
        guardDecision: "duplicate",
        result: { ok: true, action: "duplicate" },
      };
    }

    if (message.fromMe && !isSelfChatMessage(message)) {
      return { guardDecision: "enabled" };
    }

    if (state.guardDecision === "channel_disconnected") {
      return {
        result: { ok: true, action: "channel_disconnected" },
      };
    }

    if (!env.EVOLUTION_BOT_ENABLED || !state.tenantConfig.aiEnabled) {
      return {
        guardDecision: "bot_disabled",
        result: { ok: true, action: "bot_disabled" },
      };
    }

    const paused = await this.dependencies.handoff.isBotPaused(
      message.customerPhone,
    );
    if (!paused) return { guardDecision: "enabled" };

    const pauseContext = await this.dependencies.handoff.getBotPauseContext?.(
      message.customerPhone,
    );
    if (isTextMessage(message) && isUnsupportedMessagePause(pauseContext)) {
      await this.dependencies.handoff.resumeBot(message.customerPhone);
      return {
        guardDecision: "enabled",
        conversation: { status: "ACTIVE", humanHandoff: false },
      };
    }

    const humanTakeover =
      state.conversation.humanHandoff ||
      state.conversation.status === "HUMAN_HANDOFF";
    return {
      guardDecision: humanTakeover ? "human_takeover" : "paused",
      result: { ok: true, action: "paused_conversation" },
    };
  }

  private async understandMessage(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const message = state.inboundMessage;
    if (message.fromMe && !isSelfChatMessage(message)) {
      return this.handleOwnerActivity(state);
    }
    if (!isTextMessage(message)) return { intent: "unsupported" };
    return { intent: classifyMessageIntent(state.inboundText) };
  }

  private async handleOwnerActivity(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const message = state.inboundMessage;
    const botOutboundMessage =
      await this.dependencies.handoff.isBotOutboundMessage(message.messageId);
    if (botOutboundMessage) {
      return {
        intent: "owner_activity",
        result: { ok: true, action: "ignored_bot_outbound" },
      };
    }

    const command = message.text?.trim().toLowerCase();
    const aiCommand = detectAiCommand(message.text);
    if (aiCommand?.type === "PAUSE_AI_FOR_CONTACT") {
      await this.dependencies.handoff.pauseIndefinitely(
        message.customerPhone,
        "IA pausada por comando /ia_pause",
        "Comando enviado pelo WhatsApp conectado.",
      );
      return {
        intent: "owner_activity",
        result: { ok: true, action: "ai_pause_command" },
      };
    }
    if (command === "/bot on") {
      await this.dependencies.handoff.resumeBot(message.customerPhone);
      return {
        intent: "owner_activity",
        result: { ok: true, action: "bot_resumed" },
      };
    }
    if (command === "/bot off") {
      await this.dependencies.handoff.pauseIndefinitely(
        message.customerPhone,
        "Bot pausado por comando /bot off",
      );
      return {
        intent: "owner_activity",
        result: { ok: true, action: "bot_paused" },
      };
    }

    if (isTextMessage(message)) {
      await this.dependencies.automation.recordManualOutboundText({
        phone: message.customerPhone,
        text: message.text,
        aiSettings: message.aiSettings,
        channelMessage: message,
      });
    }
    return {
      intent: "owner_activity",
      result: { ok: true, action: "manual_activity_recorded" },
    };
  }

  private async retrieveKnowledge(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (!this.dependencies.knowledge) return { retrievedKnowledge: [] };
    try {
      return {
        retrievedKnowledge: await this.dependencies.knowledge.search({
          tenantId: state.tenantId,
          query: state.inboundText,
          limit: env.KNOWLEDGE_SEARCH_LIMIT,
        }),
      };
    } catch (error) {
      this.logger.warn(
        {
          ...channelMessageLogContext(state.inboundMessage),
          err: toErrorMessage(error),
        },
        "Knowledge retrieval failed",
      );
      return { retrievedKnowledge: [] };
    }
  }

  private async bufferInbound(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (!isTextMessage(state.inboundMessage)) {
      throw new Error("Only text messages can enter the debounce buffer.");
    }
    if (!hasRecordInboundAutomation(this.dependencies.automation)) {
      throw new Error("Automation port cannot record buffered input.");
    }
    const recorded = await this.dependencies.automation.recordInboundText({
      phone: state.inboundMessage.customerPhone,
      text: state.inboundText,
      businessContext: state.inboundMessage.businessContext,
      aiSettings: state.inboundMessage.aiSettings,
      channelMessage: state.inboundMessage,
    });
    return {
      bufferedRecord: recorded,
      result: { ok: true, action: "buffered" },
    };
  }

  private async recordInbound(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (
      state.inputMessageIds.length > 0 ||
      !isTextMessage(state.inboundMessage) ||
      !hasGraphAutomation(this.dependencies.automation)
    ) {
      return {};
    }
    const recorded = await this.dependencies.automation.recordInboundText({
      phone: state.inboundMessage.customerPhone,
      text: state.inboundText,
      businessContext: state.inboundMessage.businessContext,
      aiSettings: state.inboundMessage.aiSettings,
      channelMessage: state.inboundMessage,
    });
    return { inputMessageIds: [recorded.messageRecordId] };
  }

  private async agent(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const message = state.inboundMessage;
    if (state.intent === "unsupported") {
      return { response: { text: unsupportedMessageReply } };
    }

    const pausedBeforeAgent = await this.dependencies.handoff.isBotPaused(
      message.customerPhone,
    );
    if (pausedBeforeAgent) {
      return { result: { ok: true, action: "paused_conversation" } };
    }

    try {
      if (hasGraphAutomation(this.dependencies.automation)) {
        const session =
          state.assistantSession ??
          (await this.dependencies.automation.prepareGraphTurn({
            phone: message.customerPhone,
            text: state.inboundText,
            businessContext: message.businessContext,
            aiSettings: message.aiSettings,
            channelMessage: message,
            messageRecordIds: state.inputMessageIds,
            knowledgeRequested: state.intent === "knowledge",
            retrievedKnowledge: state.retrievedKnowledge,
          }));
        const step =
          await this.dependencies.automation.invokeGraphAgent(session);
        return {
          assistantSession: step.session,
          modelResponse: step.response,
          modelToolResults: [],
        };
      }
      const reply =
        state.inputMessageIds.length > 0 &&
        hasBufferedAutomation(this.dependencies.automation)
          ? await this.dependencies.automation.handleBufferedText({
              phone: message.customerPhone,
              text: state.inboundText,
              businessContext: message.businessContext,
              aiSettings: message.aiSettings,
              channelMessage: message,
              messageRecordIds: state.inputMessageIds,
            })
          : await this.dependencies.automation.handleIncomingText({
              phone: message.customerPhone,
              text: state.inboundText,
              businessContext: message.businessContext,
              aiSettings: message.aiSettings,
              channelMessage: message,
            });
      const conversation = await this.dependencies.runtime.loadConversation({
        tenantId: state.tenantId,
        channelId: state.channelId,
        conversationId: state.conversationId,
      });
      return {
        conversation,
        handoffRequired:
          conversation.humanHandoff || conversation.status === "HUMAN_HANDOFF",
        response: reply,
      };
    } catch (error) {
      if (hasGraphAutomation(this.dependencies.automation)) {
        await this.dependencies.automation.failGraphTurn(
          state.assistantSession,
          error,
        );
      }
      const reason = `erro: ${toErrorMessage(error)}`;
      this.logger.error(
        { ...channelMessageLogContext(message), err: toErrorMessage(error) },
        "LangGraph agent node failed",
      );
      return {
        handoffRequired: true,
        handoffReason: reason,
        response: { text: processingErrorReply },
      };
    }
  }

  private async executeTool(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (
      hasGraphAutomation(this.dependencies.automation) &&
      state.assistantSession &&
      state.modelResponse?.toolCalls.length
    ) {
      const step = await this.dependencies.automation.executeGraphTools(
        state.assistantSession,
        state.modelResponse.toolCalls,
      );
      return {
        assistantSession: step.session,
        modelToolResults: step.toolResults,
      };
    }
    return {
      toolResults: await this.dependencies.runtime.loadToolResults({
        tenantId: state.tenantId,
        channelId: state.channelId,
        conversationId: state.conversationId,
        invocationStartedAt: state.invocationStartedAt,
      }),
    };
  }

  private validateToolResult(
    state: MessageGraphStateValue,
  ): MessageGraphStateUpdate {
    if (
      hasGraphAutomation(this.dependencies.automation) &&
      state.assistantSession &&
      state.modelResponse
    ) {
      const valid = state.modelToolResults.every(isModelToolResultValid);
      return {
        assistantSession: this.dependencies.automation.advanceGraphTurn(
          state.assistantSession,
          state.modelResponse,
          state.modelToolResults,
        ),
        modelResponse: undefined,
        modelToolResults: [],
        toolResultsValid: valid,
      };
    }
    return {
      toolResultsValid: state.toolResults.every(
        (result) => result.status !== "STARTED",
      ),
    };
  }

  private async handoff(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (state.handoffReason) {
      await this.dependencies.handoff.pauseIndefinitely(
        state.customerContext.phone,
        state.handoffReason,
        "Falha durante processamento automatico da mensagem.",
      );
    }
    return { handoffRequired: true };
  }

  private async composeResponse(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (
      hasGraphAutomation(this.dependencies.automation) &&
      state.assistantSession
    ) {
      const reply = await this.dependencies.automation.completeGraphTurn(
        state.assistantSession,
        state.modelResponse,
      );
      const conversation = await this.dependencies.runtime.loadConversation({
        tenantId: state.tenantId,
        channelId: state.channelId,
        conversationId: state.conversationId,
      });
      return {
        conversation,
        handoffRequired:
          conversation.humanHandoff || conversation.status === "HUMAN_HANDOFF",
        response: reply,
      };
    }
    if (!state.response?.text) {
      throw new Error("LangGraph composeResponse received an empty response.");
    }
    return {
      response: { ...state.response, text: state.response.text.trim() },
    };
  }

  private async persistResponse(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (!state.response) {
      throw new Error("LangGraph persistResponse received an empty response.");
    }
    const paused = await this.dependencies.handoff.isBotPaused(
      state.customerContext.phone,
    );
    if (paused && !state.handoffRequired) {
      return {
        result: { ok: true, action: "paused_conversation" },
      };
    }

    if (state.response.messageRecordId) {
      await this.dependencies.automation.markOutboundMessageSent({
        messageRecordId: state.response.messageRecordId,
        providerMessageId: state.response.messageRecordId,
      });
    }
    return {};
  }

  private async sendResponse(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (!state.response) {
      throw new Error("LangGraph sendResponse received an empty response.");
    }
    const message = state.inboundMessage;
    const sent = await this.dependencies.provider.sendText({
      to: message.customerPhone,
      text: state.response.text,
      quotedMessageId: message.messageId,
      quotedParticipant: message.chatId,
      correlationId: state.response.messageRecordId,
    });
    const response = {
      ...state.response,
      providerMessageId: sent.messageId ?? state.response.messageRecordId,
      rawPayload: sent.raw,
    };
    if (state.response.messageRecordId) {
      await this.dependencies.automation.markOutboundMessageSent({
        messageRecordId: state.response.messageRecordId,
        providerMessageId: sent.messageId ?? state.response.messageRecordId,
        rawPayload: sent.raw,
      });
    }
    return {
      response,
      result: {
        ok: true,
        action: state.handoffReason
          ? "error_handoff"
          : state.intent === "unsupported"
            ? "unsupported_message"
            : "replied",
        outboundMessage: response,
      },
    };
  }
}

function requireGraphExecution(
  state: MessageGraphStateValue,
): MessageGraphExecution {
  if (!state.result) {
    throw new Error("LangGraph execution ended without a result.");
  }
  return { result: state.result, bufferedRecord: state.bufferedRecord };
}

function readPendingMessageId(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.inboundMessage)) return undefined;
  return typeof value.inboundMessage.messageId === "string"
    ? value.inboundMessage.messageId
    : undefined;
}

function routeAfterUnderstanding(
  state: MessageGraphStateValue,
): "end" | "buffer" | "record" | "retrieval" | "agent" {
  if (state.result) return "end";
  if (state.deferResponse && state.intent !== "owner_activity") return "buffer";
  if (state.intent === "unsupported") return "agent";
  return "record";
}

function routeAfterRecording(
  state: MessageGraphStateValue,
): "retrieval" | "agent" {
  return state.intent === "knowledge" ? "retrieval" : "agent";
}

function routeAfterAgent(
  state: MessageGraphStateValue,
): "end" | "tools" | "compose" {
  if (state.result) return "end";
  return state.modelResponse?.toolCalls.length ? "tools" : "compose";
}

export function classifyMessageIntent(text: string): GraphIntent {
  const normalized = normalizeText(text);
  if (/(humano|pessoa|atendente|profissional)/u.test(normalized)) {
    return "handoff";
  }
  if (
    /(agend|horario|disponib|servico|preco|valor|quanto custa|custo|cancel|remarc|reagend)/u.test(
      normalized,
    )
  ) {
    return "operational";
  }
  if (
    /(politica|cuidado|orientacao|duvida|como funciona|procedimento|contraindic|manutencao|durabilidade)/u.test(
      normalized,
    ) ||
    /(posso|pode)\b.*\b(antes|depois|lavar|molhar|usar|fazer)/u.test(normalized)
  ) {
    return "knowledge";
  }
  return "simple_response";
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTextMessage(
  message: ChannelInboundMessage,
): message is ChannelInboundMessage & { kind: "text"; text: string } {
  return message.kind === "text" && Boolean(message.text?.trim());
}

function isSelfChatMessage(message: ChannelInboundMessage): boolean {
  if (!env.EVOLUTION_ALLOW_SELF_CHAT) return false;
  const info = readEvolutionInfo(message.raw);
  const chat = normalizeJid(info?.Chat) || normalizeJid(message.chatId);
  const sender = normalizeJid(info?.Sender);
  const senderAlt = normalizeJid(info?.SenderAlt);
  return Boolean(chat && (chat === sender || chat === senderAlt));
}

function isUnsupportedMessagePause(
  pauseContext:
    | { reason?: string; handoffId?: string; summary?: string | null }
    | null
    | undefined,
): boolean {
  return Boolean(
    pauseContext?.reason?.startsWith("Mensagem ") &&
    pauseContext.reason.endsWith(" nao suportada pelo bot"),
  );
}

function readEvolutionInfo(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw) || !isRecord(raw.data)) return undefined;
  return isRecord(raw.data.Info) ? raw.data.Info : undefined;
}

function normalizeJid(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasBufferedAutomation(
  automation: AutomationPort,
): automation is AutomationPort &
  Required<Pick<AutomationPort, "handleBufferedText">> {
  return typeof automation.handleBufferedText === "function";
}

function hasRecordInboundAutomation(
  automation: AutomationPort,
): automation is AutomationPort &
  Required<Pick<AutomationPort, "recordInboundText">> {
  return typeof automation.recordInboundText === "function";
}

type GraphAutomationPort = AutomationPort &
  Required<Pick<AutomationPort, "recordInboundText">> &
  Pick<
    AssistantService,
    | "prepareGraphTurn"
    | "invokeGraphAgent"
    | "executeGraphTools"
    | "advanceGraphTurn"
    | "completeGraphTurn"
    | "failGraphTurn"
  >;

function hasGraphAutomation(
  automation: AutomationPort,
): automation is GraphAutomationPort {
  const candidate = automation as Partial<GraphAutomationPort>;
  return (
    typeof candidate.recordInboundText === "function" &&
    typeof candidate.prepareGraphTurn === "function" &&
    typeof candidate.invokeGraphAgent === "function" &&
    typeof candidate.executeGraphTools === "function" &&
    typeof candidate.advanceGraphTurn === "function" &&
    typeof candidate.completeGraphTurn === "function" &&
    typeof candidate.failGraphTurn === "function"
  );
}

function isModelToolResultValid(result: { content: string }): boolean {
  try {
    const value: unknown = JSON.parse(result.content);
    return isRecord(value) && typeof value.ok === "boolean";
  } catch {
    return false;
  }
}
