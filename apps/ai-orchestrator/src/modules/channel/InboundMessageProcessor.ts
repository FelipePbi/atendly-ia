import type { BaseCheckpointSaver } from "@langchain/langgraph";

import { env } from "../../config/env.js";
import {
  channelMessageLogContext,
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type {
  AssistantReply,
  AssistantService,
} from "../assistant/assistant.service.js";
import type { GraphRuntimePort } from "../graph/graph-runtime.js";
import { MessageGraphWorkflow } from "../graph/message-graph.js";
import type {
  BotPauseContext,
  HandoffService,
} from "../handoff/HandoffService.js";
import type { IdempotencyStore } from "../idempotency/IdempotencyStore.js";
import type { KnowledgeVectorStore } from "../knowledge/knowledge-vector-store.js";
import type { BusinessContext } from "../tenant-config/business-context.js";
import type { ChannelInboundMessage } from "./domain/ChannelMessage.js";
import type { WhatsAppProvider } from "./ports/WhatsAppProvider.js";

export interface InboundOutboundMessage {
  text: string;
  conversationId?: string;
  messageRecordId?: string;
  providerMessageId?: string;
  rawPayload?: unknown;
}

export interface InboundProcessingResult {
  ok: true;
  action:
    | "ignored_group"
    | "duplicate"
    | "ignored_bot_outbound"
    | "bot_resumed"
    | "bot_paused"
    | "manual_activity_recorded"
    | "ai_pause_command"
    | "bot_disabled"
    | "paused_conversation"
    | "channel_disconnected"
    | "unsupported_handoff"
    | "unsupported_message"
    | "buffered"
    | "replied"
    | "error_handoff";
  outboundMessage?: InboundOutboundMessage;
}

export interface RecordedInboundText {
  conversationId: string;
  messageRecordId: string;
}

export interface AutomationPort {
  handleIncomingText(input: {
    phone: string;
    text: string;
    businessContext?: BusinessContext;
    aiSettings?: ChannelInboundMessage["aiSettings"];
    channelMessage: ChannelInboundMessage;
  }): Promise<AssistantReply>;
  markOutboundMessageSent(input: {
    messageRecordId: string;
    providerMessageId?: string;
    rawPayload?: unknown;
  }): Promise<void>;
  recordManualOutboundText(input: {
    phone: string;
    text: string;
    businessContext?: BusinessContext;
    aiSettings?: ChannelInboundMessage["aiSettings"];
    channelMessage: ChannelInboundMessage;
  }): Promise<Pick<AssistantReply, "conversationId" | "messageRecordId">>;
  recordInboundText?(input: {
    phone: string;
    text: string;
    businessContext?: BusinessContext;
    aiSettings?: ChannelInboundMessage["aiSettings"];
    channelMessage: ChannelInboundMessage;
  }): Promise<RecordedInboundText>;
  handleBufferedText?(input: {
    phone: string;
    text: string;
    businessContext?: BusinessContext;
    aiSettings?: ChannelInboundMessage["aiSettings"];
    channelMessage: ChannelInboundMessage;
    messageRecordIds: string[];
  }): Promise<AssistantReply>;
}

export interface HandoffPort {
  isBotPaused(phone: string): Promise<boolean>;
  isBotOutboundMessage(messageId: string): Promise<boolean>;
  pauseForHuman(input: {
    phone: string;
    reason: string;
    summary?: string;
    pauseUntil?: Date | null;
  }): Promise<void>;
  pauseIndefinitely(
    phone: string,
    reason: string,
    summary?: string,
  ): Promise<void>;
  getBotPauseContext?(phone: string): Promise<BotPauseContext | null>;
  resumeBot(phone: string): Promise<void>;
}

export interface IdempotencyPort {
  remember(message: ChannelInboundMessage): Promise<boolean>;
}

export interface MessageDebounceConfig {
  enabled: boolean;
  minSeconds: number;
  maxSeconds: number;
  maxWaitSeconds: number;
}

export interface InboundMessageProcessorOptions {
  debounce?: Partial<Omit<MessageDebounceConfig, "enabled">> | false;
  runtime: GraphRuntimePort;
  checkpointer?: BaseCheckpointSaver;
  knowledge?: KnowledgeVectorStore;
}

interface BufferedMessage {
  channelMessage: ChannelInboundMessage & { kind: "text"; text: string };
  text: string;
  conversationId: string;
  messageRecordId: string;
  receivedAt: Date;
}

interface ConversationMessageBuffer {
  key: string;
  phone: string;
  firstMessageAt: Date;
  lastMessageAt: Date;
  messages: BufferedMessage[];
  timer?: NodeJS.Timeout;
}

/** Owns the inbound channel pipeline and delegates state transitions to LangGraph. */
export class InboundMessageProcessor {
  private readonly debounce: MessageDebounceConfig;
  private readonly buffers = new Map<string, ConversationMessageBuffer>();
  private readonly runtime: GraphRuntimePort;
  private readonly workflow: MessageGraphWorkflow;

  constructor(
    private readonly automation: AutomationPort | AssistantService,
    provider: WhatsAppProvider,
    idempotency: IdempotencyPort | IdempotencyStore,
    handoff: HandoffPort | HandoffService,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    options: InboundMessageProcessorOptions,
  ) {
    this.debounce = buildDebounceConfig(options.debounce);
    this.runtime = options.runtime;
    this.workflow = new MessageGraphWorkflow({
      automation,
      provider,
      idempotency,
      handoff,
      runtime: this.runtime,
      knowledge: options.knowledge,
      checkpointer: options.checkpointer,
      logger,
    });
  }

  async handleInboundMessage(
    message: ChannelInboundMessage,
  ): Promise<InboundProcessingResult> {
    this.logger.info(
      channelMessageLogContext(message),
      "Inbound message processor received channel message",
    );
    if (message.isGroup && env.EVOLUTION_IGNORE_GROUPS) {
      return { ok: true, action: "ignored_group" };
    }

    const conversationId = await this.runtime.resolveConversationId(message);
    if (
      isTextMessage(message) &&
      !message.fromMe &&
      this.debounce.enabled &&
      hasBufferedAutomation(this.automation)
    ) {
      return this.bufferTextMessage(message, conversationId);
    }

    const execution = await this.workflow.invoke({ message, conversationId });
    if (shouldCancelBufferedMessages(execution.result)) {
      this.cancelBufferedMessages(message);
    }
    return execution.result;
  }

  async flushBufferedMessagesForTesting(
    phone: string,
  ): Promise<InboundProcessingResult | null> {
    const entry = [...this.buffers.entries()].find(
      ([, buffer]) => buffer.phone === phone,
    );
    return entry ? this.flushBufferedMessages(entry[0]) : null;
  }

  private async bufferTextMessage(
    message: ChannelInboundMessage & { kind: "text"; text: string },
    conversationId: string,
  ): Promise<InboundProcessingResult> {
    const execution = await this.workflow.invoke({
      message,
      conversationId,
      text: message.text,
      deferResponse: true,
    });
    if (execution.result.action !== "buffered") return execution.result;
    if (!execution.bufferedRecord) {
      throw new Error("LangGraph buffered input without a message record.");
    }

    const now = new Date();
    const key = messageBufferKey(message);
    const existing = this.buffers.get(key);
    const buffer: ConversationMessageBuffer = existing ?? {
      key,
      phone: message.customerPhone,
      firstMessageAt: now,
      lastMessageAt: now,
      messages: [],
    };
    buffer.lastMessageAt = now;
    buffer.messages.push({
      channelMessage: message,
      text: message.text,
      conversationId: execution.bufferedRecord.conversationId,
      messageRecordId: execution.bufferedRecord.messageRecordId,
      receivedAt: now,
    });
    this.buffers.set(key, buffer);
    this.scheduleBufferedProcessing(buffer);
    return execution.result;
  }

  private scheduleBufferedProcessing(buffer: ConversationMessageBuffer): void {
    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = setTimeout(
      () => {
        void this.flushBufferedMessages(buffer.key).catch((error) => {
          this.logger.error(
            { phone: buffer.phone, err: toErrorMessage(error) },
            "Inbound message processor failed to flush graph buffer",
          );
        });
      },
      getDebounceDelayMs(buffer, this.debounce),
    );
  }

  private cancelBufferedMessages(message: ChannelInboundMessage): void {
    const key = messageBufferKey(message);
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    if (buffer.timer) clearTimeout(buffer.timer);
    this.buffers.delete(key);
  }

  private async flushBufferedMessages(
    key: string,
  ): Promise<InboundProcessingResult | null> {
    const buffer = this.buffers.get(key);
    if (!buffer) return null;
    if (buffer.timer) clearTimeout(buffer.timer);
    this.buffers.delete(key);

    const latest = buffer.messages.at(-1);
    if (!latest) return null;
    const text = buffer.messages
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join("\n");
    const execution = await this.workflow.invoke({
      message: latest.channelMessage,
      conversationId: latest.conversationId,
      text,
      messageRecordIds: buffer.messages.map((item) => item.messageRecordId),
      eventAlreadyGuarded: true,
    });
    return execution.result;
  }
}

function isTextMessage(
  message: ChannelInboundMessage,
): message is ChannelInboundMessage & { kind: "text"; text: string } {
  return message.kind === "text" && Boolean(message.text?.trim());
}

function hasBufferedAutomation(
  automation: AutomationPort | AssistantService,
): automation is AutomationPort &
  Required<Pick<AutomationPort, "recordInboundText" | "handleBufferedText">> {
  return (
    typeof automation.recordInboundText === "function" &&
    typeof automation.handleBufferedText === "function"
  );
}

function shouldCancelBufferedMessages(
  result: InboundProcessingResult,
): boolean {
  return [
    "manual_activity_recorded",
    "ai_pause_command",
    "bot_paused",
  ].includes(result.action);
}

function messageBufferKey(message: ChannelInboundMessage): string {
  return `${message.tenantId}:${message.channelId}:${message.customerPhone}`;
}

function buildDebounceConfig(
  overrides: InboundMessageProcessorOptions["debounce"],
): MessageDebounceConfig {
  if (overrides === false) {
    return {
      enabled: false,
      minSeconds: 0,
      maxSeconds: 0,
      maxWaitSeconds: 0,
    };
  }
  const minSeconds = overrides?.minSeconds ?? env.AI_DEBOUNCE_MIN_SECONDS;
  const maxSeconds = Math.max(
    minSeconds,
    overrides?.maxSeconds ?? env.AI_DEBOUNCE_MAX_SECONDS,
  );
  const maxWaitSeconds = Math.max(
    minSeconds,
    overrides?.maxWaitSeconds ?? env.AI_DEBOUNCE_MAX_WAIT_SECONDS,
  );
  return {
    enabled: minSeconds > 0 && maxWaitSeconds > 0,
    minSeconds,
    maxSeconds,
    maxWaitSeconds,
  };
}

function getDebounceDelayMs(
  buffer: ConversationMessageBuffer,
  config: MessageDebounceConfig,
): number {
  const latestText = buffer.messages.at(-1)?.text ?? "";
  const minMs = config.minSeconds * 1000;
  const maxMs = config.maxSeconds * 1000;
  const maxRunAt =
    buffer.firstMessageAt.getTime() + config.maxWaitSeconds * 1000;
  const remainingUntilMax = Math.max(0, maxRunAt - Date.now());
  let desiredMs = minMs;
  if (isUrgentFollowUp(latestText)) {
    desiredMs = Math.max(1000, Math.floor(minMs / 2));
  } else if (latestText.length > 220 || buffer.messages.length >= 4) {
    desiredMs = Math.min(maxMs, Math.max(minMs, 18_000));
  } else if (latestText.length > 80 || buffer.messages.length >= 2) {
    desiredMs = Math.min(maxMs, Math.max(minMs, 12_000));
  }
  return Math.max(0, Math.min(desiredMs, remainingUntilMax));
}

function isUrgentFollowUp(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.includes("???") ||
    normalized === "alo" ||
    normalized === "alô" ||
    normalized === "ta ai?" ||
    normalized === "tá aí?"
  );
}
