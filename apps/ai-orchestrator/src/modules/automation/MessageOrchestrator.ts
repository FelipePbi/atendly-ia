import { env } from "../../config/env.js";
import { detectAiCommand } from "../../lib/ai-command-detector.js";
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
import type { BusinessSettingsDTO } from "../business-settings/business-settings.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { WhatsAppProvider } from "../channel/ports/WhatsAppProvider.js";
import type {
  BotPauseContext,
  HandoffService,
} from "../handoff/HandoffService.js";
import type { IdempotencyStore } from "../idempotency/IdempotencyStore.js";

const unsupportedMessageReply =
  "Recebi sua mensagem, mas por enquanto consigo responder melhor por texto. Me envie sua pergunta em texto que continuo por aqui.";
const processingErrorReply =
  "Tive um problema para consultar o sistema agora. Vou chamar a profissional para continuar seu atendimento.";

export interface OrchestratorOutboundMessage {
  text: string;
  conversationId?: string;
  messageRecordId?: string;
  providerMessageId?: string;
  rawPayload?: unknown;
}

export interface OrchestratorResult {
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
    | "unsupported_handoff"
    | "unsupported_message"
    | "buffered"
    | "replied"
    | "error_handoff";
  outboundMessage?: OrchestratorOutboundMessage;
}

export interface RecordedInboundText {
  conversationId: string;
  messageRecordId: string;
}

export interface AutomationPort {
  handleIncomingText(input: {
    phone: string;
    text: string;
    businessSettings?: BusinessSettingsDTO;
    virtualAttendantSettings?: ChannelInboundMessage["virtualAttendantSettings"];
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
    businessSettings?: BusinessSettingsDTO;
    virtualAttendantSettings?: ChannelInboundMessage["virtualAttendantSettings"];
    channelMessage: ChannelInboundMessage;
  }): Promise<Pick<AssistantReply, "conversationId" | "messageRecordId">>;
  recordInboundText?(input: {
    phone: string;
    text: string;
    businessSettings?: BusinessSettingsDTO;
    virtualAttendantSettings?: ChannelInboundMessage["virtualAttendantSettings"];
    channelMessage: ChannelInboundMessage;
  }): Promise<RecordedInboundText>;
  handleBufferedText?(input: {
    phone: string;
    text: string;
    businessSettings?: BusinessSettingsDTO;
    virtualAttendantSettings?: ChannelInboundMessage["virtualAttendantSettings"];
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

export interface MessageOrchestratorOptions {
  debounce?: Partial<Omit<MessageDebounceConfig, "enabled">> | false;
}

interface BufferedMessage {
  channelMessage: ChannelInboundMessage & { kind: "text"; text: string };
  text: string;
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

export class MessageOrchestrator {
  private readonly debounce: MessageDebounceConfig;
  private readonly buffers = new Map<string, ConversationMessageBuffer>();

  constructor(
    private readonly automation: AutomationPort | AssistantService,
    private readonly provider: WhatsAppProvider,
    private readonly idempotency: IdempotencyPort | IdempotencyStore,
    private readonly handoff: HandoffPort | HandoffService,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    options: MessageOrchestratorOptions = {},
  ) {
    this.debounce = buildDebounceConfig(options.debounce);
  }

  async handleInboundMessage(
    message: ChannelInboundMessage,
  ): Promise<OrchestratorResult> {
    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator started inbound message",
    );

    if (message.isGroup && env.EVOLUTION_IGNORE_GROUPS) {
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator ignored group message",
      );
      return { ok: true, action: "ignored_group" };
    }

    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator checking idempotency",
    );
    const firstDelivery = await this.idempotency.remember(message);
    this.logger.info(
      {
        ...channelMessageLogContext(message),
        firstDelivery,
      },
      "Orchestrator idempotency result",
    );
    if (!firstDelivery) {
      return { ok: true, action: "duplicate" };
    }

    if (message.fromMe) {
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator routing fromMe message",
      );
      return this.handleFromMeMessage(message);
    }

    return this.processCustomerMessage(message);
  }

  private async processCustomerMessage(
    message: ChannelInboundMessage,
  ): Promise<OrchestratorResult> {
    this.logger.info(
      {
        ...channelMessageLogContext(message),
        botEnabled: env.EVOLUTION_BOT_ENABLED,
      },
      "Orchestrator processing customer message",
    );

    if (
      !env.EVOLUTION_BOT_ENABLED ||
      message.virtualAttendantSettings?.aiEnabled === false
    ) {
      this.logger.warn(
        channelMessageLogContext(message),
        "Orchestrator stopped: bot disabled",
      );
      return { ok: true, action: "bot_disabled" };
    }

    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator checking handoff pause",
    );
    const botPaused = await this.handoff.isBotPaused(message.customerPhone);
    this.logger.info(
      {
        ...channelMessageLogContext(message),
        botPaused,
      },
      "Orchestrator handoff pause result",
    );
    if (botPaused) {
      const pauseContext = await this.handoff.getBotPauseContext?.(
        message.customerPhone,
      );
      if (isTextMessage(message) && isUnsupportedMessagePause(pauseContext)) {
        this.logger.info(
          {
            ...channelMessageLogContext(message),
            pauseReason: pauseContext.reason,
            handoffId: pauseContext.handoffId,
          },
          "Orchestrator resuming bot after unsupported-message pause",
        );
        await this.handoff.resumeBot(message.customerPhone);
      } else {
        return { ok: true, action: "paused_conversation" };
      }
    }

    if (!isTextMessage(message)) {
      this.logger.warn(
        channelMessageLogContext(message),
        "Orchestrator unsupported message: sending guidance",
      );
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator sending unsupported-message reply",
      );
      const sent = await this.provider.sendText({
        to: message.customerPhone,
        text: unsupportedMessageReply,
        quotedMessageId: message.messageId,
        quotedParticipant: message.chatId,
      });
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator unsupported-message reply sent",
      );
      return {
        ok: true,
        action: "unsupported_message",
        outboundMessage: {
          text: unsupportedMessageReply,
          providerMessageId: sent.messageId,
          rawPayload: sent.raw,
        },
      };
    }

    return this.bufferTextMessage(message);
  }

  private async handleFromMeMessage(
    message: ChannelInboundMessage,
  ): Promise<OrchestratorResult> {
    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator checking fromMe message ownership",
    );
    const botOutboundMessage = await this.handoff.isBotOutboundMessage(
      message.messageId,
    );
    this.logger.info(
      {
        ...channelMessageLogContext(message),
        botOutboundMessage,
      },
      "Orchestrator fromMe ownership result",
    );
    if (botOutboundMessage) {
      return { ok: true, action: "ignored_bot_outbound" };
    }

    const command = message.text?.trim().toLowerCase();
    const aiCommand = detectAiCommand(message.text);
    if (aiCommand?.type === "PAUSE_AI_FOR_CONTACT") {
      this.cancelBufferedMessages(message);
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator received /ia_pause command",
      );
      await this.handoff.pauseIndefinitely(
        message.customerPhone,
        "IA pausada por comando /ia_pause",
        "Comando enviado pelo WhatsApp conectado.",
      );
      return { ok: true, action: "ai_pause_command" };
    }

    if (command === "/bot on") {
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator received /bot on command",
      );
      await this.handoff.resumeBot(message.customerPhone);
      return { ok: true, action: "bot_resumed" };
    }

    if (command === "/bot off") {
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator received /bot off command",
      );
      await this.handoff.pauseIndefinitely(
        message.customerPhone,
        "Bot pausado por comando /bot off",
      );
      return { ok: true, action: "bot_paused" };
    }

    if (env.EVOLUTION_ALLOW_SELF_CHAT && isSelfChatMessage(message)) {
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator treating self-chat message as customer input",
      );
      return this.processCustomerMessage(message);
    }

    if (isTextMessage(message)) {
      this.cancelBufferedMessages(message);
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator recording manual fromMe message",
      );
      await this.automation.recordManualOutboundText({
        phone: message.customerPhone,
        text: message.text,
        virtualAttendantSettings: message.virtualAttendantSettings,
        channelMessage: message,
      });
    }

    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator recorded manual owner activity",
    );
    return { ok: true, action: "manual_activity_recorded" };
  }

  async flushBufferedMessagesForTesting(
    phone: string,
  ): Promise<OrchestratorResult | null> {
    const entry = [...this.buffers.entries()].find(
      ([, buffer]) => buffer.phone === phone,
    );
    return entry ? this.flushBufferedMessages(entry[0]) : null;
  }

  private async replyWithAssistant(args: {
    message: ChannelInboundMessage & { kind: "text"; text: string };
    text: string;
    bufferedMessageRecordIds?: string[];
  }): Promise<OrchestratorResult> {
    const { message } = args;

    try {
      const botPausedBeforeAssistant = await this.handoff.isBotPaused(
        message.customerPhone,
      );
      if (botPausedBeforeAssistant) {
        this.logger.info(
          channelMessageLogContext(message),
          "Orchestrator skipped assistant because bot is paused",
        );
        return { ok: true, action: "paused_conversation" };
      }

      this.logger.info(
        {
          ...channelMessageLogContext(message),
          groupedMessageCount: args.bufferedMessageRecordIds?.length ?? 1,
        },
        "Orchestrator calling assistant",
      );
      const reply =
        args.bufferedMessageRecordIds && hasBufferedAutomation(this.automation)
          ? await this.automation.handleBufferedText({
              phone: message.customerPhone,
              text: args.text,
              businessSettings: message.businessSettings,
              virtualAttendantSettings: message.virtualAttendantSettings,
              channelMessage: message,
              messageRecordIds: args.bufferedMessageRecordIds,
            })
          : await this.automation.handleIncomingText({
              phone: message.customerPhone,
              text: args.text,
              businessSettings: message.businessSettings,
              virtualAttendantSettings: message.virtualAttendantSettings,
              channelMessage: message,
            });
      this.logger.info(
        {
          ...channelMessageLogContext(message),
          conversationId: reply.conversationId,
          messageRecordId: reply.messageRecordId,
          replyLength: reply.text.length,
        },
        "Orchestrator assistant returned reply",
      );

      const botPausedBeforeSend = await this.handoff.isBotPaused(
        message.customerPhone,
      );
      if (botPausedBeforeSend) {
        this.logger.info(
          channelMessageLogContext(message),
          "Orchestrator skipped send because bot was paused before delivery",
        );
        return { ok: true, action: "paused_conversation" };
      }

      this.logger.info(
        {
          ...channelMessageLogContext(message),
          messageRecordId: reply.messageRecordId,
        },
        "Orchestrator marking outbound message as prepared",
      );
      await this.automation.markOutboundMessageSent({
        messageRecordId: reply.messageRecordId,
        providerMessageId: reply.messageRecordId,
      });

      this.logger.info(
        {
          ...channelMessageLogContext(message),
          messageRecordId: reply.messageRecordId,
        },
        "Orchestrator sending assistant reply through provider",
      );
      const sent = await this.provider.sendText({
        to: message.customerPhone,
        text: reply.text,
        quotedMessageId: message.messageId,
        quotedParticipant: message.chatId,
        correlationId: reply.messageRecordId,
      });
      this.logger.info(
        {
          ...channelMessageLogContext(message),
          providerMessageId: sent.messageId,
          messageRecordId: reply.messageRecordId,
        },
        "Orchestrator provider sent assistant reply",
      );

      await this.automation.markOutboundMessageSent({
        messageRecordId: reply.messageRecordId,
        providerMessageId: sent.messageId ?? reply.messageRecordId,
        rawPayload: sent.raw,
      });
      this.logger.info(
        {
          ...channelMessageLogContext(message),
          providerMessageId: sent.messageId,
          messageRecordId: reply.messageRecordId,
        },
        "Orchestrator marked outbound message as sent",
      );

      return {
        ok: true,
        action: "replied",
        outboundMessage: {
          text: reply.text,
          conversationId: reply.conversationId,
          messageRecordId: reply.messageRecordId,
          providerMessageId: sent.messageId ?? reply.messageRecordId,
          rawPayload: sent.raw,
        },
      };
    } catch (error) {
      this.logger.error(
        {
          ...channelMessageLogContext(message),
          err: toErrorMessage(error),
        },
        "Orchestrator failed while processing customer message",
      );
      await this.handoff.pauseIndefinitely(
        message.customerPhone,
        `erro: ${toErrorMessage(error)}`,
        "Falha durante processamento automatico da mensagem.",
      );

      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator sending processing-error reply",
      );
      const sent = await this.provider.sendText({
        to: message.customerPhone,
        text: processingErrorReply,
        quotedMessageId: message.messageId,
        quotedParticipant: message.chatId,
      });
      this.logger.info(
        channelMessageLogContext(message),
        "Orchestrator processing-error reply sent",
      );

      return {
        ok: true,
        action: "error_handoff",
        outboundMessage: {
          text: processingErrorReply,
          providerMessageId: sent.messageId,
          rawPayload: sent.raw,
        },
      };
    }
  }

  private async bufferTextMessage(
    message: ChannelInboundMessage & { kind: "text"; text: string },
  ): Promise<OrchestratorResult> {
    if (!hasBufferedAutomation(this.automation) || !this.debounce.enabled) {
      return this.replyWithAssistant({
        message,
        text: message.text,
      });
    }

    const recorded = await this.automation.recordInboundText({
      phone: message.customerPhone,
      text: message.text,
      businessSettings: message.businessSettings,
      virtualAttendantSettings: message.virtualAttendantSettings,
      channelMessage: message,
    });
    const now = new Date();
    const phone = message.customerPhone;
    const key = messageBufferKey(message);
    const existing = this.buffers.get(key);
    const buffer: ConversationMessageBuffer = existing ?? {
      key,
      phone,
      firstMessageAt: now,
      lastMessageAt: now,
      messages: [],
    };

    buffer.lastMessageAt = now;
    buffer.messages.push({
      channelMessage: message,
      text: message.text,
      messageRecordId: recorded.messageRecordId,
      receivedAt: now,
    });
    this.buffers.set(key, buffer);
    this.scheduleBufferedProcessing(buffer);

    this.logger.info(
      {
        ...channelMessageLogContext(message),
        conversationId: recorded.conversationId,
        messageRecordId: recorded.messageRecordId,
        bufferedMessageCount: buffer.messages.length,
        scheduledProcessAt: getScheduledProcessAt(
          buffer,
          this.debounce,
        ).toISOString(),
      },
      "Orchestrator buffered inbound text message",
    );

    return { ok: true, action: "buffered" };
  }

  private scheduleBufferedProcessing(buffer: ConversationMessageBuffer): void {
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    const delayMs = getDebounceDelayMs(buffer, this.debounce);
    buffer.timer = setTimeout(() => {
      void this.flushBufferedMessages(buffer.key).catch((error) => {
        this.logger.error(
          { phone: buffer.phone, err: toErrorMessage(error) },
          "Orchestrator failed to flush buffered messages",
        );
      });
    }, delayMs);
  }

  private cancelBufferedMessages(message: ChannelInboundMessage): void {
    const key = messageBufferKey(message);
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    if (buffer.timer) clearTimeout(buffer.timer);
    this.buffers.delete(key);
    this.logger.info(
      channelMessageLogContext(message),
      "Orchestrator cancelled buffered messages",
    );
  }

  private async flushBufferedMessages(
    key: string,
  ): Promise<OrchestratorResult | null> {
    const buffer = this.buffers.get(key);
    if (!buffer) return null;

    if (buffer.timer) clearTimeout(buffer.timer);
    this.buffers.delete(key);
    const phone = buffer.phone;

    const latest = buffer.messages.at(-1);
    if (!latest) return null;

    const botPaused = await this.handoff.isBotPaused(phone);
    if (botPaused) {
      this.logger.info(
        {
          ...channelMessageLogContext(latest.channelMessage),
          bufferedMessageCount: buffer.messages.length,
        },
        "Orchestrator skipped buffered messages because bot is paused",
      );
      return { ok: true, action: "paused_conversation" };
    }

    const text = buffer.messages
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join("\n");
    return this.replyWithAssistant({
      message: latest.channelMessage,
      text,
      bufferedMessageRecordIds: buffer.messages.map(
        (item) => item.messageRecordId,
      ),
    });
  }
}

function isSelfChatMessage(message: ChannelInboundMessage): boolean {
  const info = readEvolutionInfo(message.raw);
  const chat = normalizeJid(info?.Chat) || normalizeJid(message.chatId);
  const sender = normalizeJid(info?.Sender);
  const senderAlt = normalizeJid(info?.SenderAlt);

  return Boolean(chat && (chat === sender || chat === senderAlt));
}

function messageBufferKey(message: ChannelInboundMessage): string {
  return `${message.tenantId}:${message.channelId}:${message.customerPhone}`;
}

function isTextMessage(
  message: ChannelInboundMessage,
): message is ChannelInboundMessage & { kind: "text"; text: string } {
  return message.kind === "text" && Boolean(message.text?.trim());
}

function isUnsupportedMessagePause(
  pauseContext: BotPauseContext | null | undefined,
): pauseContext is BotPauseContext {
  const reason = pauseContext?.reason;
  return Boolean(
    reason?.startsWith("Mensagem ") &&
    reason.endsWith(" nao suportada pelo bot"),
  );
}

function readEvolutionInfo(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const data = raw.data;
  if (!isRecord(data)) return undefined;
  return isRecord(data.Info) ? data.Info : undefined;
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
  automation: AutomationPort | AssistantService,
): automation is AutomationPort &
  Required<Pick<AutomationPort, "recordInboundText" | "handleBufferedText">> {
  return (
    typeof automation.recordInboundText === "function" &&
    typeof automation.handleBufferedText === "function"
  );
}

function buildDebounceConfig(
  overrides: MessageOrchestratorOptions["debounce"],
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

function getScheduledProcessAt(
  buffer: ConversationMessageBuffer,
  config: MessageDebounceConfig,
): Date {
  const lastMessageAt = buffer.lastMessageAt.getTime();
  const maxRunAt =
    buffer.firstMessageAt.getTime() + config.maxWaitSeconds * 1000;
  const delayMs = getDebounceDelayMs(buffer, config);
  return new Date(Math.min(lastMessageAt + delayMs, maxRunAt));
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
