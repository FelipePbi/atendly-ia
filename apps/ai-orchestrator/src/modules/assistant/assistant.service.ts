import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  channelMessageLogContext,
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import { toErrorMessage } from "../../lib/errors.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { KnowledgeSearchResult } from "../knowledge/knowledge-vector-store.js";
import {
  LangChainModelProvider,
  type ModelInputMessage,
  type ModelProvider,
  type ModelResponse,
  type ModelToolCall,
  type ModelToolResult,
  type ModelTurn,
} from "../model/model-provider.js";
import { buildSystemPrompt } from "../prompts/system.js";
import {
  type AiTenantSettings,
  normalizeAiSettings,
} from "../tenant-config/ai-settings.js";
import {
  type BusinessContext,
  businessContextConfigured,
  normalizeBusinessContext,
} from "../tenant-config/business-context.js";
import { AssistantToolRegistry } from "../tools/assistant-tools.js";

export interface IncomingAssistantMessage {
  phone: string;
  text: string;
  channelMessage?: ChannelInboundMessage;
  businessContext?: BusinessContext;
  aiSettings?: AiTenantSettings;
  whatsappMessageId?: string;
  customerName?: string | null;
  rawPayload?: unknown;
  knowledgeRequested?: boolean;
  retrievedKnowledge?: KnowledgeSearchResult[];
}

export interface AssistantReply {
  text: string;
  conversationId: string;
  messageRecordId: string;
}

export interface AssistantGraphSession {
  conversationId: string;
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  inputMessageIds: string[];
  phone: string;
  customerName?: string | null;
  businessContext: BusinessContext;
  instructions: string;
  input: ModelInputMessage[];
  turns: ModelTurn[];
  iteration: number;
  aiRunId?: string;
  immediateDecision?: AiDecision;
  lastResponseText?: string;
}

export interface AssistantGraphAgentStep {
  session: AssistantGraphSession;
  response?: ModelResponse;
}

export interface AssistantGraphToolStep {
  session: AssistantGraphSession;
  toolResults: ModelToolResult[];
}

export type ConversationStage =
  | "NEW_CONTACT"
  | "QUALIFYING_CONTACT"
  | "GENERAL_CONVERSATION"
  | "SERVICE_DISCOVERY"
  | "SERVICE_EXPLANATION"
  | "SCHEDULING_INTEREST"
  | "COLLECTING_SCHEDULING_INFO"
  | "CHECKING_AVAILABILITY"
  | "WAITING_CLIENT_SLOT_CHOICE"
  | "CONFIRMING_APPOINTMENT"
  | "APPOINTMENT_CREATED"
  | "POST_APPOINTMENT"
  | "HUMAN_HANDOFF"
  | "AI_PAUSED";

export type ContactClassification =
  | "potential_customer"
  | "existing_customer"
  | "supplier_or_partner"
  | "personal_contact"
  | "spam"
  | "unknown";

export type AiDecisionAction =
  | "send_message"
  | "call_tool"
  | "create_appointment"
  | "update_appointment_draft"
  | "pause_ai"
  | "handoff_human"
  | "do_nothing";

export interface ServiceSelection {
  serviceId: string | number;
  name: string;
  durationMinutes: number;
  price: number;
}

export interface AppointmentDraft {
  customerName?: string;
  customerPhone: string;
  services: ServiceSelection[];
  desiredDate?: string;
  desiredPeriod?: "morning" | "afternoon" | "evening";
  selectedStartDateTime?: string;
  selectedEndDateTime?: string;
  totalDurationMinutes?: number;
  totalPrice?: number;
  professionalId?: string;
  notes?: string;
  status:
    | "draft"
    | "waiting_info"
    | "checking_availability"
    | "waiting_confirmation"
    | "confirmed"
    | "cancelled";
}

export interface ConversationMemory {
  summary: string;
  pendingTopics: string[];
  knownCustomerInfo: {
    name?: string;
    preferredDays?: string[];
    preferredPeriods?: string[];
    interestedServices?: string[];
    objections?: string[];
  };
  lastIntent?: string;
  lastStage?: ConversationStage;
  updatedAt: string;
}

export interface AiDecision {
  action: AiDecisionAction;
  messages?: string[];
  toolName?: string;
  toolInput?: Record<string, unknown>;
  appointmentDraftPatch?: Partial<AppointmentDraft>;
  pauseReason?: string;
  conversationStage?: ConversationStage;
  classification?: ContactClassification;
  confidence: number;
  internalNotes?: string;
}

interface StoredConversationState extends Record<string, unknown> {
  aiConversation?: {
    aiEnabledForChat: boolean;
    stage: ConversationStage;
    classification: ContactClassification;
    pauseReason?: string;
    lastProcessedMessageIds?: string[];
    lastAiResponseAt?: string;
    promptVersion?: string;
  };
  conversationMemory?: ConversationMemory;
  appointmentDraft?: AppointmentDraft;
  aiDecisionLogs?: Array<{
    inputMessageIds: string[];
    promptVersion: string;
    action: AiDecisionAction;
    confidence: number;
    toolName?: string;
    pauseReason?: string;
    internalNotes?: string;
    createdAt: string;
  }>;
}

const defaultHandoffMessage =
  "Vou chamar uma pessoa da equipe pra te responder com atencao por aqui, ta?";

export class AssistantService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly modelProvider: ModelProvider = new LangChainModelProvider(),
    private readonly tools = new AssistantToolRegistry(prisma),
  ) {}

  async handleIncomingText(
    input: IncomingAssistantMessage,
  ): Promise<AssistantReply> {
    const recorded = await this.recordInboundText(input);
    return this.handleBufferedText({
      ...input,
      messageRecordIds: [recorded.messageRecordId],
    });
  }

  async recordInboundText(
    input: IncomingAssistantMessage,
  ): Promise<Pick<AssistantReply, "conversationId" | "messageRecordId">> {
    const channelMessage = requireChannelMessage(input.channelMessage);
    const customerName = channelMessage.customerName ?? input.customerName;
    const externalMessageId =
      channelMessage.messageId ?? input.whatsappMessageId;
    const rawPayload = channelMessage.raw ?? input.rawPayload;
    const baseContext = channelMessageLogContext(channelMessage);

    this.logger.info(baseContext, "Assistant recording inbound text");

    const conversation = await this.upsertActiveConversation(
      channelMessage,
      customerName,
    );
    this.logger.info(
      {
        ...baseContext,
        conversationId: conversation.id,
      },
      "Assistant upserted conversation",
    );

    this.logger.info(
      {
        ...baseContext,
        conversationId: conversation.id,
        externalMessageId,
      },
      "Assistant saving inbound message",
    );
    const message = await this.prisma.message.create({
      data: {
        tenantId: channelMessage.tenantId,
        channelId: channelMessage.channelId,
        conversationId: conversation.id,
        direction: "INBOUND",
        source: "CUSTOMER",
        role: "user",
        body: input.text,
        externalMessageId,
        rawPayload: rawPayload as object,
      },
    });
    this.logger.info(
      {
        ...baseContext,
        conversationId: conversation.id,
      },
      "Assistant saved inbound message",
    );

    return {
      conversationId: conversation.id,
      messageRecordId: message.id,
    };
  }

  async prepareGraphTurn(
    input: IncomingAssistantMessage & { messageRecordIds: string[] },
  ): Promise<AssistantGraphSession> {
    const channelMessage = requireChannelMessage(input.channelMessage);
    const phone = channelMessage.customerPhone;
    const customerName = channelMessage.customerName ?? input.customerName;
    const conversation = await this.upsertActiveConversation(
      channelMessage,
      customerName,
    );
    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const chronologicalMessages: ModelInputMessage[] = recentMessages
      .reverse()
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.body,
      }));
    const state = normalizeStoredState(conversation.state);
    const businessContext = normalizeBusinessContext(
      input.businessContext ?? channelMessage.businessContext,
    );
    const aiSettings = normalizeAiSettings(
      input.aiSettings ?? channelMessage.aiSettings,
    );
    const previousMessageCount = Math.max(
      0,
      chronologicalMessages.length - input.messageRecordIds.length,
    );
    const immediateDecision = !businessContextConfigured(businessContext)
      ? incompleteBusinessContextDecision()
      : buildImmediateDecision(input.text, previousMessageCount, aiSettings);

    return {
      conversationId: conversation.id,
      tenantId: channelMessage.tenantId,
      channelId: channelMessage.channelId,
      userId: channelMessage.userId,
      requestId: channelMessage.requestId,
      inputMessageIds: input.messageRecordIds,
      phone,
      customerName,
      businessContext,
      instructions: buildSystemPrompt({
        state,
        promptVersion: env.AI_PROMPT_VERSION,
        groupedMessages: input.text,
        currentDateTime: new Date().toISOString(),
        businessContext,
        aiSettings,
        knowledgeRequested: input.knowledgeRequested,
        retrievedKnowledge: input.retrievedKnowledge,
      }),
      input: chronologicalMessages,
      turns: [],
      iteration: 0,
      immediateDecision: immediateDecision ?? undefined,
    };
  }

  async invokeGraphAgent(
    session: AssistantGraphSession,
  ): Promise<AssistantGraphAgentStep> {
    if (session.immediateDecision) return { session };
    if (session.iteration >= 5) {
      return {
        session,
        response: {
          id: `iteration-limit:${session.aiRunId ?? session.conversationId}`,
          text:
            session.lastResponseText ||
            "Vou chamar a profissional para continuar seu atendimento.",
          toolCalls: [],
          continuation: null,
        },
      };
    }

    const aiRunId =
      session.aiRunId ?? (await this.createGraphAiRun(session)).id;
    const toolContext = graphToolContext(session, aiRunId);
    const response = await this.modelProvider.invoke({
      instructions: session.instructions,
      messages: session.input,
      turns: session.turns,
      tools: this.tools.createDefinitions(toolContext),
    });
    return {
      session: {
        ...session,
        aiRunId,
        lastResponseText: response.text || session.lastResponseText,
      },
      response,
    };
  }

  async executeGraphTools(
    session: AssistantGraphSession,
    calls: ModelToolCall[],
  ): Promise<AssistantGraphToolStep> {
    if (!session.aiRunId) {
      throw new Error("Graph tool execution requires an AiRun.");
    }
    const toolContext = graphToolContext(session, session.aiRunId);
    const toolResults: ModelToolResult[] = [];

    for (const call of calls) {
      const existing = await this.prisma.aiToolCall.findFirst({
        where: {
          tenantId: session.tenantId,
          aiRunId: session.aiRunId,
          externalCallId: call.id,
          name: call.name,
        },
      });
      if (existing?.completedAt && existing.result) {
        this.logger.info(
          {
            requestId: session.requestId,
            tenantId: session.tenantId,
            conversationId: session.conversationId,
            aiRunId: session.aiRunId,
            toolCallId: existing.id,
            externalToolCallId: call.id,
            toolName: call.name,
            status: existing.status,
            replayed: true,
          },
          "AI tool call replayed from persisted result",
        );
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(existing.result),
        });
        continue;
      }

      const toolCall =
        existing ??
        (await this.prisma.aiToolCall.create({
          data: {
            tenantId: session.tenantId,
            aiRunId: session.aiRunId,
            externalCallId: call.id,
            name: call.name,
            arguments: toInputJsonObject(call.args),
            status: "STARTED",
          },
        }));

      this.logger.info(
        {
          requestId: session.requestId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          aiRunId: session.aiRunId,
          toolCallId: toolCall.id,
          externalToolCallId: call.id,
          toolName: call.name,
          status: "STARTED",
        },
        "AI tool call started",
      );

      try {
        const result = await this.tools.execute(call, toolContext);
        await this.prisma.aiToolCall.update({
          where: { id: toolCall.id },
          data: {
            result: toInputJsonObject(result),
            status: result.ok ? "SUCCEEDED" : "FAILED",
            error: result.ok ? null : result.error.message,
            completedAt: new Date(),
          },
        });
        this.logger.info(
          {
            requestId: session.requestId,
            tenantId: session.tenantId,
            conversationId: session.conversationId,
            aiRunId: session.aiRunId,
            toolCallId: toolCall.id,
            externalToolCallId: call.id,
            toolName: call.name,
            status: result.ok ? "SUCCEEDED" : "FAILED",
          },
          "AI tool call completed",
        );
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
        });
      } catch (error) {
        const result = graphToolFailure(session, call, error);
        await this.prisma.aiToolCall.update({
          where: { id: toolCall.id },
          data: {
            result: toInputJsonObject(result),
            status: "FAILED",
            error: result.error.message,
            completedAt: new Date(),
          },
        });
        this.logger.error(
          {
            requestId: session.requestId,
            tenantId: session.tenantId,
            conversationId: session.conversationId,
            aiRunId: session.aiRunId,
            toolCallId: toolCall.id,
            externalToolCallId: call.id,
            toolName: call.name,
            status: "FAILED",
            error: result.error.message,
          },
          "AI tool call failed",
        );
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
        });
      }
    }

    return { session, toolResults };
  }

  advanceGraphTurn(
    session: AssistantGraphSession,
    response: ModelResponse,
    toolResults: ModelToolResult[],
  ): AssistantGraphSession {
    return {
      ...session,
      turns: [...session.turns, { response, toolResults }],
      iteration: session.iteration + 1,
    };
  }

  async completeGraphTurn(
    session: AssistantGraphSession,
    response?: ModelResponse,
  ): Promise<AssistantReply> {
    const decision =
      session.immediateDecision ??
      parseAiDecision(
        response?.text ||
          session.lastResponseText ||
          "Vou chamar a profissional para continuar seu atendimento.",
      );
    await this.applyDecision({
      conversationId: session.conversationId,
      phone: session.phone,
      customerName: session.customerName,
      inputMessageIds: session.inputMessageIds,
      decision,
    });
    const text = composeReplyText(decision);
    const assistantMessage = await this.prisma.message.create({
      data: {
        tenantId: session.tenantId,
        channelId: session.channelId,
        conversationId: session.conversationId,
        direction: "OUTBOUND",
        source: "AI",
        role: "assistant",
        body: text,
      },
    });
    if (session.aiRunId) {
      await this.prisma.aiRun.update({
        where: { id: session.aiRunId },
        data: {
          status: "SUCCEEDED",
          outputText: response?.text ?? session.lastResponseText ?? text,
          completedAt: new Date(),
        },
      });
    }
    return {
      text,
      conversationId: session.conversationId,
      messageRecordId: assistantMessage.id,
    };
  }

  async failGraphTurn(
    session: AssistantGraphSession | undefined,
    error: unknown,
  ): Promise<void> {
    if (!session?.aiRunId) return;
    await this.prisma.aiRun.update({
      where: { id: session.aiRunId },
      data: {
        status: "FAILED",
        error: toErrorMessage(error),
        completedAt: new Date(),
      },
    });
  }

  private createGraphAiRun(session: AssistantGraphSession) {
    return this.prisma.aiRun.create({
      data: {
        tenantId: session.tenantId,
        channelId: session.channelId,
        conversationId: session.conversationId,
        provider: "openai",
        model: env.OPENAI_MODEL,
        promptVersion: env.AI_PROMPT_VERSION,
        inputMessageIds: session.inputMessageIds,
      },
    });
  }

  async handleBufferedText(
    input: IncomingAssistantMessage & { messageRecordIds: string[] },
  ): Promise<AssistantReply> {
    let session = await this.prepareGraphTurn(input);
    try {
      while (true) {
        const step = await this.invokeGraphAgent(session);
        session = step.session;
        if (!step.response || step.response.toolCalls.length === 0) {
          return this.completeGraphTurn(session, step.response);
        }
        const toolStep = await this.executeGraphTools(
          session,
          step.response.toolCalls,
        );
        session = this.advanceGraphTurn(
          toolStep.session,
          step.response,
          toolStep.toolResults,
        );
      }
    } catch (error) {
      await this.failGraphTurn(session, error);
      throw error;
    }
  }

  async recordManualOutboundText(
    input: IncomingAssistantMessage,
  ): Promise<Pick<AssistantReply, "conversationId" | "messageRecordId">> {
    const channelMessage = requireChannelMessage(input.channelMessage);
    const phone = channelMessage.customerPhone;
    const customerName = channelMessage.customerName ?? input.customerName;
    const externalMessageId =
      channelMessage.messageId ?? input.whatsappMessageId;
    const rawPayload = channelMessage.raw ?? input.rawPayload;
    const baseContext = channelMessageLogContext(channelMessage);

    this.logger.info(baseContext, "Assistant recording manual outbound text");
    const conversation = await this.prisma.conversation.upsert({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: channelMessage.tenantId,
          channelId: channelMessage.channelId,
          externalContactId: phone,
        },
      },
      update: {
        customerName: customerName ?? undefined,
      },
      create: {
        tenantId: channelMessage.tenantId,
        channelId: channelMessage.channelId,
        externalContactId: phone,
        customerName: customerName ?? null,
        state: {},
      },
    });

    const message = await this.prisma.message.create({
      data: {
        tenantId: channelMessage.tenantId,
        channelId: channelMessage.channelId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        source: "OWNER",
        role: "assistant",
        body: input.text,
        externalMessageId,
        rawPayload: rawPayload as object,
      },
    });

    this.logger.info(
      {
        ...baseContext,
        conversationId: conversation.id,
        messageRecordId: message.id,
      },
      "Assistant recorded manual outbound text",
    );

    return {
      conversationId: conversation.id,
      messageRecordId: message.id,
    };
  }

  async markOutboundMessageSent(input: {
    messageRecordId: string;
    providerMessageId?: string;
    rawPayload?: unknown;
  }): Promise<void> {
    this.logger.info(
      {
        messageRecordId: input.messageRecordId,
        providerMessageId: input.providerMessageId,
        hasRawPayload: input.rawPayload !== undefined,
      },
      "Assistant marking outbound message",
    );
    await this.prisma.message.update({
      where: { id: input.messageRecordId },
      data: {
        externalMessageId: input.providerMessageId,
        rawPayload: input.rawPayload as object,
      },
    });
    this.logger.info(
      {
        messageRecordId: input.messageRecordId,
        providerMessageId: input.providerMessageId,
        hasRawPayload: input.rawPayload !== undefined,
      },
      "Assistant marked outbound message",
    );
  }

  private async upsertActiveConversation(
    channelMessage: ChannelInboundMessage,
    customerName?: string | null,
  ) {
    return this.prisma.conversation.upsert({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: channelMessage.tenantId,
          channelId: channelMessage.channelId,
          externalContactId: channelMessage.customerPhone,
        },
      },
      update: {
        customerName: customerName ?? undefined,
        status: "ACTIVE",
        humanHandoff: false,
        handoffPausedUntil: null,
      },
      create: {
        tenantId: channelMessage.tenantId,
        channelId: channelMessage.channelId,
        externalContactId: channelMessage.customerPhone,
        customerName: customerName ?? null,
        state: {},
      },
    });
  }

  private async applyDecision(input: {
    conversationId: string;
    phone: string;
    customerName?: string | null;
    inputMessageIds: string[];
    decision: AiDecision;
  }): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: input.conversationId },
    });
    if (!conversation) {
      throw new Error("Conversation was not found while applying AI decision.");
    }
    const state = normalizeStoredState(conversation?.state);
    const now = new Date().toISOString();
    const stage =
      input.decision.conversationStage ??
      inferStageFromDecision(input.decision, state);
    const classification =
      input.decision.classification ??
      inferClassificationFromDecision(input.decision, state);
    const appointmentDraft = mergeAppointmentDraft({
      existing: state.appointmentDraft,
      patch: input.decision.appointmentDraftPatch,
      phone: input.phone,
      customerName: input.customerName ?? undefined,
    });
    const memory = updateConversationMemory({
      existing: state.conversationMemory,
      decision: input.decision,
      stage,
      classification,
      appointmentDraft,
      customerName: input.customerName ?? undefined,
      updatedAt: now,
    });

    const nextState: StoredConversationState = {
      ...state,
      aiConversation: {
        aiEnabledForChat:
          !conversation.humanHandoff &&
          input.decision.action !== "pause_ai" &&
          input.decision.action !== "handoff_human",
        stage,
        classification,
        pauseReason: input.decision.pauseReason,
        lastProcessedMessageIds: input.inputMessageIds,
        lastAiResponseAt: now,
        promptVersion: env.AI_PROMPT_VERSION,
      },
      conversationMemory: memory,
      appointmentDraft,
      aiDecisionLogs: [
        {
          inputMessageIds: input.inputMessageIds,
          promptVersion: env.AI_PROMPT_VERSION,
          action: input.decision.action,
          confidence: input.decision.confidence,
          toolName: input.decision.toolName,
          pauseReason: input.decision.pauseReason,
          internalNotes: input.decision.internalNotes,
          createdAt: now,
        },
        ...(state.aiDecisionLogs ?? []),
      ].slice(0, 20),
    };

    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        currentIntent: input.decision.action,
        state: nextState as Prisma.InputJsonValue,
      },
    });

    if (
      input.decision.action === "pause_ai" ||
      input.decision.action === "handoff_human"
    ) {
      await this.prisma.conversation.update({
        where: { id: input.conversationId },
        data: {
          humanHandoff: true,
          status: "HUMAN_HANDOFF",
          handoffPausedUntil: null,
        },
      });
      const existingHandoff = await this.prisma.handoff.findFirst({
        where: {
          tenantId: conversation.tenantId,
          channelId: conversation.channelId,
          conversationId: input.conversationId,
          status: "OPEN",
        },
      });
      if (!existingHandoff) {
        await this.prisma.handoff.create({
          data: {
            tenantId: conversation.tenantId,
            channelId: conversation.channelId,
            conversationId: input.conversationId,
            externalContactId: input.phone,
            reason: input.decision.pauseReason ?? "manual_handoff",
            summary: input.decision.internalNotes ?? null,
            status: "OPEN",
          },
        });
      }
    }
  }
}

function incompleteBusinessContextDecision(): AiDecision {
  return {
    action: "handoff_human",
    messages: ["Vou deixar essa conversa para a profissional responder, ta?"],
    pauseReason: "manual_handoff",
    conversationStage: "HUMAN_HANDOFF",
    classification: "potential_customer",
    confidence: 1,
    internalNotes:
      "IA bloqueada porque as configuracoes do negocio estao incompletas.",
  };
}

function graphToolContext(session: AssistantGraphSession, aiRunId: string) {
  return {
    conversationId: session.conversationId,
    tenantId: session.tenantId,
    channelId: session.channelId,
    userId: session.userId,
    requestId: session.requestId,
    phone: session.phone,
    customerName: session.customerName,
    businessContext: session.businessContext,
    aiRunId,
  };
}

function graphToolFailure(
  session: AssistantGraphSession,
  call: ModelToolCall,
  error: unknown,
) {
  const aiRunId = session.aiRunId ?? "missing-ai-run";
  return {
    ok: false as const,
    requestId: session.requestId,
    tenantId: session.tenantId,
    aiRunId,
    toolCallId: call.id,
    idempotencyKey: `${aiRunId}:${call.id}:${call.name}`,
    error: {
      code: "TOOL_EXECUTION_FAILED",
      message: toErrorMessage(error),
    },
  };
}

function toInputJsonObject(value: object): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = toInputJsonValue(item);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

function toInputJsonValue(
  value: unknown,
): Prisma.InputJsonValue | null | undefined {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toInputJsonValue(item) ?? null);
  }
  if (typeof value === "object") return toInputJsonObject(value);
  return undefined;
}

function requireChannelMessage(
  message: ChannelInboundMessage | undefined,
): ChannelInboundMessage {
  if (!message) {
    throw new Error("Trusted channel context is required.");
  }
  return message;
}

function buildImmediateDecision(
  text: string,
  previousMessageCount: number,
  aiSettings: AiTenantSettings,
): AiDecision | null {
  const normalized = normalizeText(text);

  if (isHumanRequested(normalized) || isSensitiveComplaint(normalized)) {
    return {
      action: "handoff_human",
      messages: [
        "Sinto muito por isso. Vou chamar uma pessoa da equipe pra te atender com atencao por aqui, ta?",
      ],
      pauseReason: "complaint_or_sensitive",
      conversationStage: "HUMAN_HANDOFF",
      classification: "potential_customer",
      confidence: 0.96,
      internalNotes:
        "Pedido de humano ou reclamacao sensivel detectado antes de chamar o modelo.",
    };
  }

  if (isSupplierOrPartner(normalized)) {
    return {
      action: "pause_ai",
      messages: [
        "Oi! Vou deixar essa mensagem para a equipe verificar e te responder direitinho, ta bom?",
      ],
      pauseReason: "supplier_or_partner",
      conversationStage: "AI_PAUSED",
      classification: "supplier_or_partner",
      confidence: 0.93,
      internalNotes: "Contato aparenta ser fornecedor ou parceiro.",
    };
  }

  if (isPersonalContact(normalized)) {
    return {
      action: "pause_ai",
      messages: ["Vou deixar essa mensagem para ela responder pessoalmente."],
      pauseReason: "personal_contact",
      conversationStage: "AI_PAUSED",
      classification: "personal_contact",
      confidence: 0.9,
      internalNotes: "Contato aparenta ser pessoal e fora do escopo comercial.",
    };
  }

  if (previousMessageCount === 0 && isOnlyGenericGreeting(normalized)) {
    return {
      action: "send_message",
      messages: [genericGreetingReply(aiSettings)],
      conversationStage: "QUALIFYING_CONTACT",
      classification: "unknown",
      confidence: 0.92,
      internalNotes:
        "Primeira mensagem generica; nao oferecer servicos antes de entender o motivo do contato.",
    };
  }

  return null;
}

function genericGreetingReply(settings: AiTenantSettings): string {
  if (settings.tone === "PROFESSIONAL_OBJECTIVE") {
    return "Olá, tudo bem? Como posso te ajudar hoje?";
  }

  return "Oii, tudo bem? Como posso te ajudar hoje?";
}

function parseAiDecision(raw: string): AiDecision {
  const parsed = parseJsonLike(extractJsonCandidate(raw));
  if (isRecord(parsed) && isAiDecisionAction(parsed.action)) {
    return {
      action: parsed.action,
      messages: parseStringArray(parsed.messages).slice(0, 3),
      toolName:
        typeof parsed.toolName === "string" ? parsed.toolName : undefined,
      toolInput: isRecord(parsed.toolInput) ? parsed.toolInput : undefined,
      appointmentDraftPatch: isRecord(parsed.appointmentDraftPatch)
        ? parsed.appointmentDraftPatch
        : undefined,
      pauseReason:
        typeof parsed.pauseReason === "string" ? parsed.pauseReason : undefined,
      conversationStage: isConversationStage(parsed.conversationStage)
        ? parsed.conversationStage
        : undefined,
      classification: isContactClassification(parsed.classification)
        ? parsed.classification
        : undefined,
      confidence:
        typeof parsed.confidence === "number"
          ? clamp(parsed.confidence, 0, 1)
          : 0.7,
      internalNotes:
        typeof parsed.internalNotes === "string"
          ? parsed.internalNotes
          : undefined,
    };
  }

  return {
    action: "send_message",
    messages: [raw.trim() || "Certo, vou te ajudar por aqui."],
    conversationStage: "GENERAL_CONVERSATION",
    classification: "potential_customer",
    confidence: 0.6,
    internalNotes:
      "Resposta do modelo nao veio em JSON estruturado; convertida para send_message.",
  };
}

function composeReplyText(decision: AiDecision): string {
  const messages = (decision.messages ?? [])
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (messages.length > 0) return messages.join("\n\n");

  if (decision.action === "pause_ai" || decision.action === "handoff_human") {
    return defaultHandoffMessage;
  }

  return "Certo, vou te ajudar por aqui.";
}

function normalizeStoredState(value: unknown): StoredConversationState {
  if (!isRecord(value)) return {};
  return { ...value };
}

function inferStageFromDecision(
  decision: AiDecision,
  state: StoredConversationState,
): ConversationStage {
  if (decision.action === "handoff_human") return "HUMAN_HANDOFF";
  if (decision.action === "pause_ai") return "AI_PAUSED";
  if (decision.action === "create_appointment") return "APPOINTMENT_CREATED";
  if (decision.action === "update_appointment_draft")
    return "COLLECTING_SCHEDULING_INFO";
  if (
    decision.toolName?.includes("horarios") ||
    decision.toolName === "check_availability"
  )
    return "CHECKING_AVAILABILITY";
  return state.aiConversation?.stage ?? "GENERAL_CONVERSATION";
}

function inferClassificationFromDecision(
  decision: AiDecision,
  state: StoredConversationState,
): ContactClassification {
  if (decision.pauseReason === "supplier_or_partner")
    return "supplier_or_partner";
  if (decision.pauseReason === "personal_contact") return "personal_contact";
  if (decision.pauseReason === "spam") return "spam";
  return state.aiConversation?.classification ?? "potential_customer";
}

function mergeAppointmentDraft(input: {
  existing?: AppointmentDraft;
  patch?: Partial<AppointmentDraft>;
  phone: string;
  customerName?: string;
}): AppointmentDraft | undefined {
  if (!input.existing && !input.patch) return undefined;

  const draft: AppointmentDraft = {
    customerPhone: input.phone,
    services: [],
    status: "draft",
    ...input.existing,
    ...input.patch,
  };

  draft.customerName =
    input.patch?.customerName ?? draft.customerName ?? input.customerName;
  draft.customerPhone =
    input.patch?.customerPhone ?? draft.customerPhone ?? input.phone;
  draft.services = input.patch?.services ?? draft.services ?? [];

  if (draft.services.length > 0) {
    const bufferMinutes =
      Math.max(0, env.AI_BUFFER_BETWEEN_SERVICES_MINUTES) *
      Math.max(0, draft.services.length - 1);
    draft.totalDurationMinutes =
      input.patch?.totalDurationMinutes ??
      draft.totalDurationMinutes ??
      draft.services.reduce(
        (total, service) => total + Number(service.durationMinutes || 0),
        0,
      ) + bufferMinutes;
    draft.totalPrice =
      input.patch?.totalPrice ??
      draft.totalPrice ??
      draft.services.reduce(
        (total, service) => total + Number(service.price || 0),
        0,
      );
  }

  if (
    draft.selectedStartDateTime &&
    draft.totalDurationMinutes &&
    !draft.selectedEndDateTime
  ) {
    const start = new Date(draft.selectedStartDateTime);
    if (!Number.isNaN(start.getTime())) {
      draft.selectedEndDateTime = new Date(
        start.getTime() + draft.totalDurationMinutes * 60_000,
      ).toISOString();
    }
  }

  return draft;
}

function updateConversationMemory(input: {
  existing?: ConversationMemory;
  decision: AiDecision;
  stage: ConversationStage;
  classification: ContactClassification;
  appointmentDraft?: AppointmentDraft;
  customerName?: string;
  updatedAt: string;
}): ConversationMemory {
  const interestedServices =
    input.appointmentDraft?.services
      .map((service) => service.name)
      .filter(Boolean) ??
    input.existing?.knownCustomerInfo.interestedServices ??
    [];
  const pendingTopics = new Set(input.existing?.pendingTopics ?? []);

  if (
    input.stage === "COLLECTING_SCHEDULING_INFO" ||
    input.stage === "CONFIRMING_APPOINTMENT"
  ) {
    pendingTopics.add("agendamento_em_andamento");
  }
  if (
    input.stage === "APPOINTMENT_CREATED" ||
    input.stage === "POST_APPOINTMENT"
  ) {
    pendingTopics.delete("agendamento_em_andamento");
  }

  return {
    summary:
      input.existing?.summary ??
      (input.customerName
        ? `Atendimento iniciado com ${input.customerName}.`
        : "Atendimento iniciado via WhatsApp."),
    pendingTopics: [...pendingTopics],
    knownCustomerInfo: {
      ...input.existing?.knownCustomerInfo,
      name: input.customerName ?? input.existing?.knownCustomerInfo.name,
      interestedServices,
    },
    lastIntent: input.decision.action,
    lastStage: input.stage,
    updatedAt: input.updatedAt,
  };
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseJsonLike(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isAiDecisionAction(value: unknown): value is AiDecisionAction {
  return (
    value === "send_message" ||
    value === "call_tool" ||
    value === "create_appointment" ||
    value === "update_appointment_draft" ||
    value === "pause_ai" ||
    value === "handoff_human" ||
    value === "do_nothing"
  );
}

function isConversationStage(value: unknown): value is ConversationStage {
  return (
    value === "NEW_CONTACT" ||
    value === "QUALIFYING_CONTACT" ||
    value === "GENERAL_CONVERSATION" ||
    value === "SERVICE_DISCOVERY" ||
    value === "SERVICE_EXPLANATION" ||
    value === "SCHEDULING_INTEREST" ||
    value === "COLLECTING_SCHEDULING_INFO" ||
    value === "CHECKING_AVAILABILITY" ||
    value === "WAITING_CLIENT_SLOT_CHOICE" ||
    value === "CONFIRMING_APPOINTMENT" ||
    value === "APPOINTMENT_CREATED" ||
    value === "POST_APPOINTMENT" ||
    value === "HUMAN_HANDOFF" ||
    value === "AI_PAUSED"
  );
}

function isContactClassification(
  value: unknown,
): value is ContactClassification {
  return (
    value === "potential_customer" ||
    value === "existing_customer" ||
    value === "supplier_or_partner" ||
    value === "personal_contact" ||
    value === "spam" ||
    value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isOnlyGenericGreeting(normalized: string): boolean {
  const compact = normalized.replace(/[!.,?'"()[\]{}\-_/\\]+/g, "").trim();
  if (!/[a-z0-9]/.test(compact)) return true;
  return [
    "oi",
    "ola",
    "oie",
    "oii",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "td bem",
    "ta ai",
    "to por aqui",
    "alo",
  ].includes(compact);
}

function isSupplierOrPartner(normalized: string): boolean {
  return (
    normalized.includes("distribuidora") ||
    normalized.includes("fornecedor") ||
    normalized.includes("parceiro") ||
    normalized.includes("pedido dos produtos") ||
    normalized.includes("tabela nova") ||
    normalized.includes("nota fiscal")
  );
}

function isPersonalContact(normalized: string): boolean {
  return (
    normalized.includes("amiga") ||
    normalized.includes("festa hoje") ||
    normalized.includes("voce vai") ||
    normalized.includes("familia") ||
    normalized.includes("pessoal")
  );
}

function isHumanRequested(normalized: string): boolean {
  return (
    normalized.includes("falar com humano") ||
    normalized.includes("falar com alguem") ||
    normalized.includes("quero atendimento humano") ||
    normalized.includes("chama a profissional") ||
    normalized.includes("me passa para")
  );
}

function isSensitiveComplaint(normalized: string): boolean {
  return (
    normalized.includes("nao gostei") ||
    normalized.includes("ficou falhada") ||
    normalized.includes("reclamacao") ||
    normalized.includes("quero reclamar") ||
    normalized.includes("alergia") ||
    normalized.includes("machucou") ||
    normalized.includes("irritacao")
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
