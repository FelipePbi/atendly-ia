import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  channelMessageLogContext,
  type DiagnosticLogger,
  noopDiagnosticLogger,
} from "../../lib/diagnostic-log.js";
import {
  AppError,
  InfrastructureError,
  toErrorMessage,
} from "../../lib/errors.js";
import type { ChannelInboundMessage } from "../channel/domain/ChannelMessage.js";
import type { RecordedInboundText } from "../channel/InboundMessageProcessor.js";
import { deriveTurnId } from "../graph/graph-state.js";
import {
  audioNotUnderstoodReply,
  documentReceivedReply,
  imageReceivedReply,
  processingErrorReply,
  unsupportedMessageReply,
  videoReceivedReply,
} from "../graph/message-graph.js";
import type {
  KnowledgeSearchResult,
  KnowledgeVectorStore,
} from "../knowledge/knowledge-vector-store.js";
import { markTranscribedAudioTurn } from "../media/audio-turn.js";
import {
  toMessageAttachmentKind,
  toMessageKind,
} from "../media/media-metadata.js";
import { stripMediaBase64 } from "../media/raw-payload-sanitizer.js";
import type { CustomerMemoryPromptItem } from "../memory/customer-memory.js";
import type {
  CustomerMemoryInferencePort,
  CustomerMemoryPromptPort,
} from "../memory/customer-memory-service.js";
import type { TurnAppointmentEvidence } from "../memory/memory-inference.js";
import {
  LangChainModelProvider,
  type ModelInputMessage,
  type ModelProvider,
  type ModelResponse,
  type ModelToolCall,
  type ModelToolResult,
  type ModelTurn,
} from "../model/model-provider.js";
import type { ServiceInstructionPromptItem } from "../prompts/service-instructions.js";
import { buildStyleGreeting } from "../prompts/style.js";
import { buildSystemPrompt, farewellForNow } from "../prompts/system.js";
import type { CategorySuggestionPort } from "../session/SessionService.js";
import {
  AI_CONVERSATION_STYLES,
  type AiTenantSettings,
  normalizeAiSettings,
  resolveAiConversationStyle,
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
  /**
   * Memoria **permitida** da pessoa vinculada ao contato, carregada pelo grafo
   * antes do turno. Vazia ou ausente quando o contato nao tem pessoa vinculada,
   * esta ignorado ou nada foi autorizado — e ai o prompt nao ganha a secao.
   */
  customerMemory?: CustomerMemoryPromptItem[];
  /**
   * Instrucoes privadas do servico em foco desta conversa (Goal078),
   * carregadas pelo grafo antes do turno. Vazio ou ausente quando nao ha
   * servico em foco, quando a leitura falhou ou fora do turno real do canal
   * — e ai o prompt nao ganha a secao.
   */
  serviceInstructions?: ServiceInstructionPromptItem[];
  /**
   * Instante a partir do qual o contexto vale.
   *
   * `Retomar IA` grava a marca na sessao e ela chega aqui: o turno seguinte
   * reavalia a conversa a partir desse ponto em vez de continuar de onde a IA
   * parou antes de o humano assumir.
   */
  contextSince?: string;
}

export interface AssistantReply {
  text: string;
  conversationId: string;
  messageRecordId: string;
  /** Operation-id da tentativa de saida, ja persistido com estado PENDING. */
  correlationId?: string;
  /**
   * A IA decidiu parar sem responder: o contato nao e cliente (ver
   * `isSilentPause`). Nao existe linha de saida; `text` e
   * `messageRecordId` vem vazios.
   */
  silent?: boolean;
}

export interface GenerateSuggestionsInput {
  tenantId: string;
  conversationId: string;
  userId: string;
  requestId: string;
}

/**
 * Recusa propria de sugestao (Goal012/WU-04), na ordem em que a porta de
 * entrada as avalia: regra do contato antes de regra de sessao, privacidade
 * antes de precondicao de atendimento, atendimento antes de configuracao do
 * negocio, configuracao do negocio antes do conteudo textual da mensagem.
 */
export type SuggestionRefusalReason =
  | "CONTACT_IGNORED"
  | "SESSION_PERSONAL"
  | "HUMAN_HANDLING_REQUIRED"
  | "AI_DISABLED"
  | "NO_TEXTUAL_MESSAGE";

export type GenerateSuggestionsResult =
  | {
      ok: true;
      suggestions: string[];
      aiRunId: string;
      promptVersion: string;
    }
  | { ok: false; reason: SuggestionRefusalReason };

export interface AssistantGraphSession {
  conversationId: string;
  tenantId: string;
  channelId: string;
  userId: string;
  requestId: string;
  inputMessageIds: string[];
  /**
   * Turno de entrada deste ciclo (`deriveTurnId`). Chega as tools pelo
   * contexto de execucao: rascunho preparado neste turno nao pode ser
   * confirmado neste turno.
   */
  turnId: string;
  phone: string;
  customerName?: string | null;
  businessContext: BusinessContext;
  instructions: string;
  /** Versao do prompt efetivamente montado para este turno, ver `derivePromptVersion`. */
  promptVersion: string;
  input: ModelInputMessage[];
  turns: ModelTurn[];
  iteration: number;
  aiRunId?: string;
  immediateDecision?: AiDecision;
  lastResponseText?: string;
  /** Ver `confirmationWithoutDraftNudge`: no maximo um aviso por turno. */
  confirmationNudged?: boolean;
  /** Ver `describedToolCallNudge`: no maximo um aviso por turno. */
  toolCallNudged?: boolean;
  /** Ver `claimWithoutEffectNudge`: no maximo um aviso por turno. */
  claimNudged?: boolean;
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

/**
 * Textos que o produto emite por conta própria, sem passar pelo modelo:
 * handoffs/pausas determinísticos e fallbacks de decisão malformada. Conjunto
 * fechado — coberto por `PRODUCT_OWN_TEXTS` e testado em
 * `tests/assistant/assistant.service.test.ts`. Um texto novo emitido pelo
 * produto precisa entrar aqui, senão o teste de fechamento acusa.
 */
const PRODUCT_OWN_FIXED_TEXTS = {
  handoffToTeam:
    "Vou chamar uma pessoa da equipe pra te responder com atenção por aqui, tá?",
  iterationLimitFallback:
    "Vou chamar a profissional para continuar seu atendimento.",
  incompleteBusinessContextHandoff:
    "Vou deixar essa conversa para a profissional responder, tá?",
  humanRequestedOrSensitiveComplaint:
    "Sinto muito por isso. Vou chamar uma pessoa da equipe pra te atender com atenção por aqui, tá?",
  supplierOrPartner:
    "Oi! Vou deixar essa mensagem para a equipe verificar e te responder direitinho, tá bom?",
  personalContact:
    "Vou deixar essa mensagem para ela responder pessoalmente.",
  genericReplyFallback: "Certo, vou te ajudar por aqui.",
  /**
   * Substitui a resposta do modelo que afirma um efeito que o turno nao
   * gravou (QA A-01 / Goal057): ver `guardCommitmentClaim`.
   */
  commitmentNotRecorded:
    "Ainda não ficou registrado na agenda. Posso confirmar agora pra você?",
} as const;

/**
 * Tipo de efeito que uma resposta pode afirmar (QA A-01 / Goal057). A serie
 * recorrente (`pendingAction.type === "recurring"`) afirma com o vocabulario
 * de `schedule`.
 */
export type CommitmentClaimKind = "schedule" | "reschedule" | "cancel";

/**
 * Vocabulario de afirmacao de efeito, por tipo. Conjunto fechado, escrito ja
 * na forma normalizada de `normalizeCommitmentText` (minusculas, sem acento,
 * letra repetida colapsada) e casado como palavra inteira: "remarcado" nao
 * conta como "marcado". Fora de proposito: "reservado" e "pre-agendado" (o
 * hold segura o horario, nao marca), e o infinitivo/subjuntivo de pergunta ou
 * intencao ("posso confirmar?", "quer que eu confirme?", "vou confirmar").
 */
/**
 * "confirmado"/"confirmei" e "marcado"/"marquei" nao dizem sozinhos qual
 * operacao foi feita — "Cancelamento confirmado!" e "Sua remarcacao foi
 * confirmada" afirmam efeito com essas mesmas palavras. Por isso entram no
 * vocabulario dos tres tipos, e nao so em `schedule`.
 */
const COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS = Object.freeze([
  "confirmado",
  "confirmada",
  "confirmados",
  "confirmadas",
  "confirmei",
  "marcado",
  "marcada",
  "marcados",
  "marcadas",
  "marquei",
]);

export const COMMITMENT_CLAIM_VOCABULARY: Readonly<
  Record<CommitmentClaimKind, readonly string[]>
> = Object.freeze({
  schedule: Object.freeze([
    "agendado",
    "agendada",
    "agendados",
    "agendadas",
    "agendei",
    "agendamento feito",
    "agendamento criado",
    ...COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS,
  ]),
  reschedule: Object.freeze([
    "remarcado",
    "remarcada",
    "remarcados",
    "remarcadas",
    "remarquei",
    "reagendado",
    "reagendada",
    "reagendados",
    "reagendadas",
    "reagendei",
    ...COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS,
  ]),
  cancel: Object.freeze([
    "cancelado",
    "cancelada",
    "cancelados",
    "canceladas",
    "cancelei",
    "desmarcado",
    "desmarcada",
    "desmarcados",
    "desmarcadas",
    "desmarquei",
    ...COMMITMENT_CLAIM_GENERIC_CONFIRM_TERMS,
  ]),
});

/**
 * Janela de negacao, em palavras: um termo do vocabulario precedido de
 * negador ate esta distancia, na mesma oracao (virgula, ponto e afins cortam
 * a janela), nao e afirmacao — "ainda nao esta confirmado", "nao ficou
 * marcado".
 */
export const COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS = 3;

const COMMITMENT_CLAIM_NEGATORS: ReadonlySet<string> = new Set([
  "nao",
  "nem",
  "nunca",
  "sem",
]);

/**
 * Travessão normalizado fora da resposta da IA (D-073/U-06): U+2014 sempre
 * vira vírgula, porque nunca é intervalo, só pausa de fala. U+2013 só
 * normaliza cercado de espaço, que também é pausa de fala; sem espaço ("10–11")
 * é faixa numérica e continua intacta.
 */
export function normalizeModelDashes(text: string): string {
  if (!/[—–]/.test(text)) return text;
  return text
    .replace(/[ \t]*—+[ \t]*/g, ", ")
    .replace(/(?<=\S)[ \t]–[ \t](?=\S)/g, ", ")
    .replace(/^[ \t]*,[ \t]*/gm, "")
    .replace(/,[ \t]*$/gm, "")
    .replace(/,{2,}/g, ",")
    .replace(/,[ \t]*([.!?,])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** Minusculas, sem acento e com letra repetida colapsada ("confirmadoo"). */
export function normalizeCommitmentText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/([a-z])\1+/g, "$1");
}

/** Tipos de efeito que `text` afirma, na ordem de `COMMITMENT_CLAIM_VOCABULARY`. */
export function findCommitmentClaims(text: string): CommitmentClaimKind[] {
  const normalized = normalizeCommitmentText(text);
  return (Object.keys(COMMITMENT_CLAIM_VOCABULARY) as CommitmentClaimKind[])
    .filter((kind) =>
      COMMITMENT_CLAIM_VOCABULARY[kind].some((term) =>
        affirmsCommitmentTerm(normalized, term),
      ),
    );
}

function affirmsCommitmentTerm(normalized: string, term: string): boolean {
  const pattern = new RegExp(
    `(?<![a-z0-9])${term.replace(/ /g, "\\s+")}(?![a-z0-9])`,
    "g",
  );
  for (const match of normalized.matchAll(pattern)) {
    const before = normalized.slice(0, match.index);
    // "pre-agendado" / "pre agendado": rascunho, nao efeito.
    if (/(?<![a-z0-9])pre[\s-]$/.test(before)) continue;
    const clause = before.split(/[.,;:!?\n]/).pop() ?? "";
    const words = clause.match(/[a-z0-9]+/g) ?? [];
    const negated = words
      .slice(-COMMITMENT_CLAIM_NEGATION_WINDOW_WORDS)
      .some((word) => COMMITMENT_CLAIM_NEGATORS.has(word));
    if (!negated) return true;
  }
  return false;
}

/** Tipo de efeito que confirmaria o rascunho `pendingAction.type`. */
function commitmentKindOfPendingAction(
  pendingActionType: string,
): CommitmentClaimKind | undefined {
  switch (pendingActionType) {
    case "schedule":
    case "recurring":
      return "schedule";
    case "reschedule":
      return "reschedule";
    case "cancel":
      return "cancel";
    default:
      return undefined;
  }
}

/**
 * `PRODUCT_OWN_FIXED_TEXTS` mais a saudação de estilo, nos três tons, mais os
 * textos de cliente que `message-graph.ts` emite por conta própria (fora do
 * modelo). `imageHandoffSummary` não entra: é resumo de `Handoff`, não texto
 * de cliente.
 */
export const PRODUCT_OWN_TEXTS: readonly string[] = [
  ...Object.values(PRODUCT_OWN_FIXED_TEXTS),
  ...AI_CONVERSATION_STYLES.map((style) => buildStyleGreeting(style)),
  unsupportedMessageReply,
  processingErrorReply,
  audioNotUnderstoodReply,
  imageReceivedReply,
  documentReceivedReply,
  videoReceivedReply,
];

const defaultHandoffMessage = PRODUCT_OWN_FIXED_TEXTS.handoffToTeam;

export class AssistantService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: DiagnosticLogger = noopDiagnosticLogger,
    private readonly modelProvider: ModelProvider = new LangChainModelProvider(),
    private readonly tools = new AssistantToolRegistry(prisma),
    /**
     * Sugestao de categoria. A classificacao do agente sai daqui como
     * **sugestao com proveniencia**; ela nunca escreve override manual nem
     * decide sozinha se a IA responde.
     */
    private readonly sessions?: CategorySuggestionPort,
    /**
     * Memoria da pessoa (Goal012). Opcional: sem a porta, o turno segue
     * exatamente como antes e nenhuma memoria e inferida — nunca o contrario.
     * O modo sugestao tambem carrega memoria permitida no prompt, por isso a
     * porta cobre os dois papeis: quem injeta `CustomerMemoryService` (que
     * implementa ambos) satisfaz os dois sem mudar a assinatura.
     */
    private readonly customerMemory?: CustomerMemoryInferencePort &
      Partial<CustomerMemoryPromptPort>,
    /**
     * Conhecimento textual do negocio (Goal012). Usado so pelo modo sugestao
     * para recuperar trechos antes de montar o prompt — o turno normal recupera
     * pelo grafo (`MessageGraphWorkflow`), que ja tem sua propria instancia.
     */
    private readonly knowledge?: KnowledgeVectorStore,
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
  ): Promise<RecordedInboundText> {
    const channelMessage = requireChannelMessage(input.channelMessage);
    const customerName = channelMessage.customerName ?? input.customerName;
    const externalMessageId =
      channelMessage.messageId ?? input.whatsappMessageId;
    // Base64 nunca chega a `Message.rawPayload`: os bytes vivem no
    // `ProcessedEvent` so enquanto o evento esta pendente (Goal013).
    const rawPayload = stripMediaBase64(
      channelMessage.raw ?? input.rawPayload,
    );
    const baseContext = channelMessageLogContext(channelMessage);
    const attachmentKind = toMessageAttachmentKind(channelMessage.kind);
    const media = channelMessage.media;

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
    let message: { id: string };
    try {
      message = await this.prisma.message.create({
        data: {
          tenantId: channelMessage.tenantId,
          channelId: channelMessage.channelId,
          conversationId: conversation.id,
          direction: "INBOUND",
          source: "CUSTOMER",
          role: "user",
          body: input.text,
          kind: toMessageKind(channelMessage.kind),
          externalMessageId,
          rawPayload: rawPayload as object,
        },
      });
    } catch (error) {
      if (!externalMessageId || !isUniqueViolation(error)) throw error;
      return this.reuseRecordedInbound({
        tenantId: channelMessage.tenantId,
        channelId: channelMessage.channelId,
        externalMessageId,
        logContext: baseContext,
      });
    }
    if (attachmentKind) {
      await this.prisma.messageAttachment.create({
        data: {
          tenantId: channelMessage.tenantId,
          messageId: message.id,
          kind: attachmentKind,
          mimetype: media?.mimetype,
          fileName: media?.fileName,
          sizeBytes: media?.sizeBytes,
          durationSeconds: media?.durationSeconds,
          mediaUrl: media?.mediaUrl,
          tooLarge: media?.tooLarge ?? false,
        },
      });
    }
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

  /**
   * Retry de lote (a inbox reexecuta o lote inteiro quando ele falha): a
   * mensagem gravada na tentativa anterior e reaproveitada. Antes disso a chave
   * unica de `externalMessageId` derrubava todo retry e a conversa ficava presa
   * ate o dead-letter, sem a IA responder mais nada (validacao de 2026-10-11).
   * Se a IA ja gravou resposta depois dela, o turno nao roda de novo.
   */
  private async reuseRecordedInbound(input: {
    tenantId: string;
    channelId: string;
    externalMessageId: string;
    logContext: Record<string, unknown>;
  }): Promise<RecordedInboundText> {
    const existing = await this.prisma.message.findUnique({
      where: {
        tenantId_channelId_externalMessageId: {
          tenantId: input.tenantId,
          channelId: input.channelId,
          externalMessageId: input.externalMessageId,
        },
      },
      select: {
        id: true,
        conversationId: true,
        createdAt: true,
        direction: true,
      },
    });
    if (!existing || existing.direction !== "INBOUND") {
      throw new Error(
        "Inbound message id collided with a message that is not inbound.",
      );
    }
    const answer = await this.prisma.message.findFirst({
      where: {
        conversationId: existing.conversationId,
        direction: "OUTBOUND",
        source: "AI",
        createdAt: { gt: existing.createdAt },
      },
      select: { id: true },
    });
    this.logger.info(
      {
        ...input.logContext,
        conversationId: existing.conversationId,
        messageRecordId: existing.id,
        alreadyAnswered: Boolean(answer),
      },
      "Assistant reused inbound message recorded by an earlier attempt",
    );
    return {
      conversationId: existing.conversationId,
      messageRecordId: existing.id,
      ...(answer ? { alreadyAnswered: true } : {}),
    };
  }

  async prepareGraphTurn(
    input: IncomingAssistantMessage & {
      messageRecordIds: string[];
      turnId?: string;
    },
  ): Promise<AssistantGraphSession> {
    const channelMessage = requireChannelMessage(input.channelMessage);
    const phone = channelMessage.customerPhone;
    const customerName = channelMessage.customerName ?? input.customerName;
    const conversation = await this.upsertActiveConversation(
      channelMessage,
      customerName,
    );
    const contextSince = input.contextSince
      ? new Date(input.contextSince)
      : undefined;
    const recentMessages = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(contextSince && !Number.isNaN(contextSince.getTime())
          ? { createdAt: { gte: contextSince } }
          : {}),
      },
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
    const prompt = buildSystemPrompt({
      state,
      groupedMessages: input.text,
      currentDateTime: new Date().toISOString(),
      businessContext,
      aiSettings,
      knowledgeRequested: input.knowledgeRequested,
      retrievedKnowledge: input.retrievedKnowledge,
      customerMemory: input.customerMemory,
      serviceInstructions: input.serviceInstructions,
    });

    return {
      conversationId: conversation.id,
      tenantId: channelMessage.tenantId,
      channelId: channelMessage.channelId,
      userId: channelMessage.userId,
      requestId: channelMessage.requestId,
      inputMessageIds: input.messageRecordIds,
      // Sem turno vindo do grafo, a derivacao e a mesma: o turno e a mensagem
      // que entrou, nunca o relogio.
      turnId: input.turnId ?? deriveTurnId(channelMessage),
      phone,
      customerName,
      businessContext,
      instructions: prompt.text,
      promptVersion: prompt.version,
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
            PRODUCT_OWN_FIXED_TEXTS.iterationLimitFallback,
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
    if (
      response.toolCalls.length === 0 &&
      !session.claimNudged &&
      (await this.claimsEffectWithoutConfirming(session, aiRunId, response.text))
    ) {
      this.logger.warn(
        {
          requestId: session.requestId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          aiRunId,
        },
        "Assistant claimed an effect it did not confirm; asking the model to confirm first",
      );
      return this.invokeGraphAgent({
        ...session,
        aiRunId,
        claimNudged: true,
        input: [...session.input, claimWithoutEffectNudge()],
      });
    }
    if (
      response.toolCalls.length === 0 &&
      !session.toolCallNudged &&
      describesToolCallInsteadOfCalling(response.text)
    ) {
      this.logger.warn(
        {
          requestId: session.requestId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          aiRunId,
        },
        "Assistant described a tool call in the decision instead of calling it; asking the model to call it",
      );
      return this.invokeGraphAgent({
        ...session,
        aiRunId,
        toolCallNudged: true,
        input: [...session.input, describedToolCallNudge()],
      });
    }
    if (
      response.toolCalls.length === 0 &&
      !session.confirmationNudged &&
      (await this.asksConfirmationWithoutDraft(session, response.text))
    ) {
      this.logger.warn(
        {
          requestId: session.requestId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          aiRunId,
        },
        "Assistant asked for confirmation without a prepared draft; asking the model to prepare first",
      );
      return this.invokeGraphAgent({
        ...session,
        aiRunId,
        confirmationNudged: true,
        input: [...session.input, confirmationWithoutDraftNudge()],
      });
    }
    return {
      session: {
        ...session,
        aiRunId,
        lastResponseText: response.text || session.lastResponseText,
      },
      response,
    };
  }

  /**
   * Pergunta de confirmacao sem nada preparado (validacao de 2026-10-11): a IA
   * perguntou "Posso confirmar design de sobrancelha na sexta as 18h?" sem
   * chamar action=prepare, e o "sim" da cliente caiu em
   * NO_PENDING_CONFIRMATION. A regra do prompt sozinha nao segurou; aqui a
   * resposta e devolvida ao modelo uma vez, pedindo o prepare antes.
   */
  /**
   * Validacao de 2026-10-12: no "pode" da cliente, com o rascunho preparado, a
   * IA respondeu "Agendado com sucesso" sem chamar action=confirm (copiou o
   * padrao das respostas anteriores). `guardCommitmentClaim` barrava a
   * mentira, mas a cliente tinha de confirmar duas vezes. Antes de chegar ao
   * guard, o modelo recebe um aviso para confirmar de verdade.
   */
  private async claimsEffectWithoutConfirming(
    session: AssistantGraphSession,
    aiRunId: string,
    responseText: string,
  ): Promise<boolean> {
    const decision = parseAiDecision(responseText);
    const claims = findCommitmentClaims((decision.messages ?? []).join(" "));
    if (claims.length === 0) return false;
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: session.conversationId },
    });
    const pendingAction = normalizeStoredState(conversation?.state)
      .pendingAction;
    if (!isRecord(pendingAction) || typeof pendingAction.type !== "string") {
      return false;
    }
    const claimType = commitmentKindOfPendingAction(pendingAction.type);
    if (!claimType || !claims.includes(claimType)) return false;
    const confirmed = await this.loadTurnConfirmedEffects(
      session.tenantId,
      aiRunId,
    );
    return !confirmed.has(claimType);
  }

  private async recentAssistantTexts(conversationId: string): Promise<string[]> {
    // Melhor esforco: sem o historico, a resposta sai como o modelo escreveu.
    try {
      const messages = await this.prisma.message.findMany({
        where: { conversationId, direction: "OUTBOUND", source: "AI" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { body: true },
      });
      return (messages ?? []).map((message) => message.body ?? "");
    } catch {
      return [];
    }
  }

  private async asksConfirmationWithoutDraft(
    session: AssistantGraphSession,
    responseText: string,
  ): Promise<boolean> {
    const decision = parseAiDecision(responseText);
    const text = normalizeText((decision.messages ?? []).join(" "));
    if (!asksBookingConfirmation(text)) return false;
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: session.conversationId },
    });
    const pendingAction = normalizeStoredState(conversation?.state)
      .pendingAction;
    return !(isRecord(pendingAction) && typeof pendingAction.type === "string");
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
        // Erro de infraestrutura (Goal011) nunca chega ao modelo com o
        // detalhe real: `graphToolFailure` ja devolve mensagem/codigo
        // sanitizados nesse caso. O log, sim, guarda o detalhe real —
        // sempre com requestId e aiRunId — porque e o unico lugar que deve
        // ve-lo.
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
            infrastructure: error instanceof InfrastructureError,
            error: toErrorMessage(error),
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
          PRODUCT_OWN_FIXED_TEXTS.iterationLimitFallback,
      );
    await this.applyDecision({
      conversationId: session.conversationId,
      phone: session.phone,
      customerName: session.customerName,
      inputMessageIds: session.inputMessageIds,
      promptVersion: session.promptVersion,
      decision,
      aiRunId: session.aiRunId,
    });
    if (isSilentPause(decision)) {
      // A conversa ja ficou pausada para a profissional em `applyDecision`;
      // nada sai para o contato.
      if (session.aiRunId) {
        await this.prisma.aiRun.update({
          where: { id: session.aiRunId },
          data: {
            status: "SUCCEEDED",
            outputText: response?.text ?? session.lastResponseText ?? "",
            completedAt: new Date(),
          },
        });
      }
      this.logger.info(
        {
          requestId: session.requestId,
          tenantId: session.tenantId,
          conversationId: session.conversationId,
          aiRunId: session.aiRunId,
          pauseReason: decision.pauseReason,
          classification: decision.classification,
        },
        "Assistant paused silently for a contact that is not a customer",
      );
      return {
        text: "",
        conversationId: session.conversationId,
        messageRecordId: "",
        silent: true,
      };
    }
    const text = dropRepeatedPriceAndDuration(
      alignFarewellToNow(
        await this.guardCommitmentClaim(
          session,
          restorePortugueseAccents(
            normalizeModelDashes(composeReplyText(decision)),
          ),
        ),
        new Date().toISOString(),
        session.businessContext.timezone,
      ),
      await this.recentAssistantTexts(session.conversationId),
      latestCustomerText(session),
    );
    // A saida existe antes de qualquer chamada ao transporte, com
    // `correlationId` estavel: e ele que viaja como id da mensagem no envio e
    // que o recibo do Go reconcilia depois.
    const assistantMessage = await this.prisma.message.create({
      data: {
        tenantId: session.tenantId,
        channelId: session.channelId,
        conversationId: session.conversationId,
        direction: "OUTBOUND",
        source: "AI",
        role: "assistant",
        body: text,
        correlationId: `ai-${randomUUID()}`,
        deliveryState: "PENDING",
        deliveryUpdatedAt: new Date(),
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
      correlationId: assistantMessage.correlationId ?? undefined,
    };
  }

  /**
   * A resposta nao afirma efeito que o turno nao gravou (QA A-01 / Goal057).
   *
   * Violacao e a conjuncao: o texto afirma um efeito K; ha rascunho
   * `pendingAction` de tipo K nao consumido em `Conversation.state`; e nenhuma
   * `AiToolCall` `SUCCEEDED` deste `AiRun` confirmou K. A evidencia sai do
   * ledger, nunca do JSON da decisao. Na violacao sai o texto fixo
   * `commitmentNotRecorded`, sem segunda chamada ao modelo e sem handoff; o
   * `AiRun.outputText` continua com a saida original. Afirmacao sem rascunho
   * pendente passa: sem ler a agenda, nao ha como distingui-la de fato
   * verdadeiro.
   */
  private async guardCommitmentClaim(
    session: AssistantGraphSession,
    text: string,
  ): Promise<string> {
    const claims = findCommitmentClaims(text);
    if (claims.length === 0) return text;
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: session.conversationId },
    });
    const pendingAction = normalizeStoredState(conversation?.state)
      .pendingAction;
    if (!isRecord(pendingAction) || typeof pendingAction.type !== "string") {
      return text;
    }
    const claimType = commitmentKindOfPendingAction(pendingAction.type);
    if (!claimType || !claims.includes(claimType)) return text;
    const confirmed = await this.loadTurnConfirmedEffects(
      session.tenantId,
      session.aiRunId,
    );
    if (confirmed.has(claimType)) return text;
    this.logger.warn(
      {
        requestId: session.requestId,
        tenantId: session.tenantId,
        conversationId: session.conversationId,
        aiRunId: session.aiRunId,
        claimType,
        pendingActionType: pendingAction.type,
      },
      "AI reply claimed an effect the turn did not record",
    );
    return PRODUCT_OWN_FIXED_TEXTS.commitmentNotRecorded;
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
        promptVersion: session.promptVersion,
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

  /**
   * Sugestoes de resposta para o atendimento humano (Goal012/WU-04).
   *
   * Nao e um turno de conversa: nao passa pelo grafo, nao grava mensagem de
   * entrada (`recordInboundText`), nao aplica `sessionGate` e nao envia nada
   * (`sendResponse`). E uma invocacao direta do modelo, com o mesmo prompt de
   * politica/estilo, o conhecimento recuperado e a memoria permitida, mas com
   * um binding **somente leitura** — nenhuma tool com efeito chega ao modelo,
   * entao nenhum hold, rascunho, Message, outbox ou envio pode nascer daqui.
   *
   * A porta de entrada e a regra inteira, na ordem do produto: contato
   * ignorado e sessao pessoal recusam antes de qualquer leitura; sugestao so
   * faz sentido com atendimento humano **vigente** (e exatamente o oposto da
   * elegibilidade da IA para o turno normal); e a IA precisa estar ligada para
   * o negocio, senao nao ha prompt de negocio configurado para seguir.
   */
  async generateSuggestions(
    input: GenerateSuggestionsInput,
  ): Promise<GenerateSuggestionsResult> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: input.tenantId, id: input.conversationId },
      select: {
        id: true,
        channelId: true,
        contactId: true,
        externalContactId: true,
        humanHandoff: true,
        state: true,
      },
    });
    if (!conversation) {
      throw new AppError(
        "Conversation was not found while generating suggestions.",
        { statusCode: 404, code: "CONVERSATION_NOT_FOUND" },
      );
    }

    const contact = conversation.contactId
      ? await this.prisma.contact.findUnique({
          where: {
            tenantId_id: {
              tenantId: input.tenantId,
              id: conversation.contactId,
            },
          },
          select: { ignored: true, categoryOverride: true },
        })
      : null;
    if (contact?.ignored) return { ok: false, reason: "CONTACT_IGNORED" };
    // Mesma checagem dupla de `CustomerMemoryService.recordTurnInference`: o
    // override do contato e a categoria efetiva da sessao (que ja o reflete,
    // ver `SessionService.setCategoryOverride`) sao verificados separadamente,
    // para uma sessao nova ainda nao sincronizada nao escapar da regra.
    if (contact?.categoryOverride === "PERSONAL") {
      return { ok: false, reason: "SESSION_PERSONAL" };
    }

    const session = await this.prisma.conversationSession.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
      select: { category: true, humanHandling: true },
    });
    if (session?.category === "PERSONAL") {
      return { ok: false, reason: "SESSION_PERSONAL" };
    }

    // Oposto da elegibilidade do turno normal (`session-policy.ts`): la, humano
    // atendendo tira a IA do caminho; aqui, sugestao so existe **para** quem
    // esta atendendo. Sem atendimento humano vigente, nao ha para quem sugerir.
    const humanHandling = session?.humanHandling ?? conversation.humanHandoff;
    if (!humanHandling) {
      return { ok: false, reason: "HUMAN_HANDLING_REQUIRED" };
    }

    const tenantConfig = await this.prisma.aiTenantConfig.findUnique({
      where: { tenantId: input.tenantId },
      select: { enabled: true, tone: true, settings: true },
    });
    if (!tenantConfig?.enabled) return { ok: false, reason: "AI_DISABLED" };

    const businessContext = normalizeBusinessContext(tenantConfig.settings);
    const aiSettings = normalizeAiSettings({
      aiEnabled: tenantConfig.enabled,
      tone: resolveAiConversationStyle(tenantConfig.tone),
    });

    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId: input.conversationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const lastInboundMessage = recentMessages.find(
      (message) => message.direction === "INBOUND",
    );
    // Mensagem de midia (imagem, documento sem legenda, etc.) grava `body`
    // vazio no estoque (`InboundMessageProcessor`/`MessageGraphWorkflow`): sem
    // texto do cliente para embasar a sugestao, a porta recusa antes de tocar
    // o modelo, o mesmo padrao das demais recusas proprias acima. Audio e a
    // excecao: a transcricao concluida do ultimo audio vale como texto, pelo
    // mesmo marcador que o turno normal usa (Goal013/WU-05); sem transcricao
    // concluida (pendente, falhou ou foi ignorada), continua sem texto.
    let lastInboundText = lastInboundMessage?.body?.trim()
      ? lastInboundMessage.body
      : undefined;
    if (!lastInboundText && lastInboundMessage?.kind === "AUDIO") {
      const attachment = await this.prisma.messageAttachment.findFirst({
        where: {
          tenantId: input.tenantId,
          messageId: lastInboundMessage.id,
          kind: "AUDIO",
        },
        orderBy: { createdAt: "asc" },
      });
      if (attachment?.transcriptStatus === "DONE" && attachment.transcript?.trim()) {
        lastInboundText = markTranscribedAudioTurn(attachment.transcript.trim());
      }
    }
    if (!lastInboundText) {
      return { ok: false, reason: "NO_TEXTUAL_MESSAGE" };
    }
    const chronologicalMessages: ModelInputMessage[] = recentMessages
      .reverse()
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content:
          message.id === lastInboundMessage?.id ? lastInboundText : message.body,
      }));

    const retrievedKnowledge = await this.retrieveSuggestionKnowledge(
      input.tenantId,
      lastInboundText,
    );

    const prompt = buildSystemPrompt({
      state: conversation.state ?? {},
      groupedMessages: lastInboundText,
      currentDateTime: new Date().toISOString(),
      businessContext,
      aiSettings,
      knowledgeRequested: retrievedKnowledge.length > 0,
      retrievedKnowledge,
      customerMemory: await this.loadSuggestionMemory(
        input.tenantId,
        conversation.contactId,
      ),
      mode: "suggestion",
    });

    const aiRun = await this.prisma.aiRun.create({
      data: {
        tenantId: input.tenantId,
        channelId: conversation.channelId,
        conversationId: input.conversationId,
        provider: "openai",
        model: env.OPENAI_MODEL,
        promptVersion: prompt.version,
        kind: "SUGGESTION",
        inputMessageIds: [],
      },
    });

    try {
      const suggestions = await this.runSuggestionModel({
        instructions: prompt.text,
        messages: chronologicalMessages,
        toolContext: {
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          channelId: conversation.channelId,
          userId: input.userId,
          requestId: input.requestId,
          turnId: `suggestion:${aiRun.id}`,
          phone: conversation.externalContactId,
          businessContext,
          aiRunId: aiRun.id,
        },
      });
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: "SUCCEEDED",
          outputText: JSON.stringify({ suggestions }),
          completedAt: new Date(),
        },
      });
      return {
        ok: true,
        suggestions,
        aiRunId: aiRun.id,
        promptVersion: prompt.version,
      };
    } catch (error) {
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: "FAILED",
          error: toErrorMessage(error),
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Laco de invocacao do modo sugestao: mesmo formato tools-then-respond do
   * turno normal, mas com o binding somente leitura (`createReadOnlyDefinitions`
   * / `executeReadOnly`) e sem `AiToolCall` de auditoria — nao ha efeito para
   * auditar, e o `AiRun` com `kind = SUGGESTION` ja registra a execucao.
   */
  private async runSuggestionModel(input: {
    instructions: string;
    messages: ModelInputMessage[];
    toolContext: Parameters<AssistantToolRegistry["createReadOnlyDefinitions"]>[0];
  }): Promise<string[]> {
    const turns: ModelTurn[] = [];
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const response = await this.modelProvider.invoke({
        instructions: input.instructions,
        messages: input.messages,
        turns,
        tools: this.tools.createReadOnlyDefinitions(input.toolContext),
      });
      if (response.toolCalls.length === 0) {
        return parseSuggestions(response.text);
      }
      const toolResults: ModelToolResult[] = [];
      for (const call of response.toolCalls) {
        const result = await this.tools.executeReadOnly(
          call,
          input.toolContext,
        );
        toolResults.push({
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
        });
      }
      turns.push({ response, toolResults });
    }
    // Limite de iteracoes: devolve o que o modelo ja tiver dito por texto, ou
    // nenhuma sugestao — nunca lanca por esgotar tentativas de leitura.
    const lastText = turns[turns.length - 1]?.response.text ?? "";
    return parseSuggestions(lastText);
  }

  private async retrieveSuggestionKnowledge(
    tenantId: string,
    query: string | undefined,
  ): Promise<KnowledgeSearchResult[]> {
    if (!this.knowledge || !query?.trim()) return [];
    try {
      return await this.knowledge.search({
        tenantId,
        query,
        limit: env.KNOWLEDGE_SEARCH_LIMIT,
      });
    } catch (error) {
      this.logger.warn(
        { tenantId, err: toErrorMessage(error) },
        "Suggestion knowledge retrieval failed",
      );
      return [];
    }
  }

  private async loadSuggestionMemory(
    tenantId: string,
    contactId: string | null,
  ): Promise<CustomerMemoryPromptItem[]> {
    if (!this.customerMemory?.loadForPrompt) return [];
    try {
      return await this.customerMemory.loadForPrompt({ tenantId, contactId });
    } catch (error) {
      this.logger.warn(
        { tenantId, err: toErrorMessage(error) },
        "Suggestion customer memory load failed",
      );
      return [];
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
        // Eco de mensagem que o dono ja enviou pelo proprio WhatsApp: o
        // transporte e quem contou, entao a entrega e fato observado.
        deliveryState: "SENT",
        deliveryUpdatedAt: new Date(),
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

  /**
   * Transicao de entrega da saida persistida.
   *
   * `SENT` so e escrito com evidencia do transporte; `UNKNOWN` guarda a
   * tentativa cujo desfecho nao da para afirmar e espera reconciliacao;
   * `FAILED` registra o motivo visivel de nao ter saido.
   */
  async markOutboundDelivery(input: {
    messageRecordId: string;
    state: "SENT" | "FAILED" | "UNKNOWN";
    providerMessageId?: string;
    rawPayload?: unknown;
    detail?: string;
  }): Promise<void> {
    this.logger.info(
      {
        messageRecordId: input.messageRecordId,
        deliveryState: input.state,
        deliveryDetail: input.detail,
      },
      "Assistant recording outbound delivery state",
    );
    await this.prisma.message.update({
      where: { id: input.messageRecordId },
      data: {
        ...(input.state === "SENT"
          ? {
              externalMessageId: input.providerMessageId,
              rawPayload: input.rawPayload as object,
            }
          : {}),
        deliveryState: input.state,
        deliveryDetail: input.detail ?? null,
        deliveryUpdatedAt: new Date(),
        ...(input.state === "SENT"
          ? {}
          : { deliveryAttempts: { increment: 1 } }),
      },
    });
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
    await this.markOutboundDelivery({ ...input, state: "SENT" });
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

  /**
   * Memoria da pessoa a partir do que este turno **confirmou**.
   *
   * Roda depois de a decisao estar aplicada e **nunca** derruba o turno: a
   * resposta a cliente ja foi decidida, e falhar em lembrar de uma preferencia
   * nao pode custar a conversa. Quem decide se o turno pode virar memoria e o
   * servico, que checa contato vinculado, ignore, sessao pessoal e atendimento
   * humano contra o banco.
   *
   * O que o turno confirmou nao sai do JSON da decisao — o modelo pode
   * escrever `status: "confirmed"` num rascunho que ninguem marcou. Sai das
   * `AiToolCall` deste `AiRun`: so agendamento que existe no Scheduling vira
   * preferencia da pessoa.
   */
  private async inferCustomerMemory(input: {
    tenantId: string;
    conversationId: string;
    inputMessageIds: string[];
    appointment?: AppointmentDraft;
    aiRunId?: string;
  }): Promise<void> {
    if (!this.customerMemory) return;
    try {
      const evidence = await this.loadTurnAppointmentEvidence(
        input.tenantId,
        input.aiRunId,
      );
      const outcome = await this.customerMemory.recordTurnInference({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        appointment: input.appointment,
        evidence,
        sourceMessageIds: input.inputMessageIds,
      });
      if (outcome.skipped) {
        this.logger.info(
          {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            reason: outcome.skipped,
          },
          "Customer memory inference skipped",
        );
      }
    } catch (error) {
      this.logger.warn(
        {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          err: toErrorMessage(error),
        },
        "Customer memory inference failed",
      );
    }
  }

  /**
   * O que este turno confirmou de verdade, lido do rastro de auditoria.
   *
   * `AiToolCall` so fica `SUCCEEDED` quando a tool devolveu `ok`, entao uma
   * confirmacao aqui e um agendamento que existe no Scheduling. `prepare` nao
   * conta: preparar e segurar horario para a cliente decidir, nao marcar.
   */
  private async loadTurnAppointmentEvidence(
    tenantId: string,
    aiRunId?: string,
  ): Promise<TurnAppointmentEvidence> {
    if (!aiRunId) {
      return { appointmentConfirmed: false, recurringSeriesConfirmed: false };
    }
    const calls = await this.prisma.aiToolCall.findMany({
      where: {
        tenantId,
        aiRunId,
        status: "SUCCEEDED",
        name: { in: ["create_appointment", "confirm_recurring_appointments"] },
      },
      select: { name: true, arguments: true },
    });
    const recurringSeriesConfirmed = calls.some(
      (call) => call.name === "confirm_recurring_appointments",
    );
    const appointmentConfirmed =
      recurringSeriesConfirmed ||
      calls.some(
        (call) =>
          call.name === "create_appointment" &&
          isRecord(call.arguments) &&
          call.arguments.action === "confirm",
      );
    return { appointmentConfirmed, recurringSeriesConfirmed };
  }

  /**
   * Efeitos que este turno gravou, lidos do rastro de auditoria como em
   * `loadTurnAppointmentEvidence`: so `confirm` conta, `prepare` nao.
   */
  private async loadTurnConfirmedEffects(
    tenantId: string,
    aiRunId?: string,
  ): Promise<ReadonlySet<CommitmentClaimKind>> {
    const confirmed = new Set<CommitmentClaimKind>();
    if (!aiRunId) return confirmed;
    const calls = await this.prisma.aiToolCall.findMany({
      where: {
        tenantId,
        aiRunId,
        status: "SUCCEEDED",
        name: {
          in: [
            "create_appointment",
            "confirm_recurring_appointments",
            "reschedule_appointment",
            "cancel_appointment",
          ],
        },
      },
      select: { name: true, arguments: true },
    });
    for (const call of calls) {
      if (call.name === "confirm_recurring_appointments") {
        confirmed.add("schedule");
        continue;
      }
      if (!isRecord(call.arguments) || call.arguments.action !== "confirm") {
        continue;
      }
      if (call.name === "create_appointment") confirmed.add("schedule");
      if (call.name === "reschedule_appointment") confirmed.add("reschedule");
      if (call.name === "cancel_appointment") confirmed.add("cancel");
    }
    return confirmed;
  }

  private async applyDecision(input: {
    conversationId: string;
    phone: string;
    customerName?: string | null;
    inputMessageIds: string[];
    promptVersion: string;
    decision: AiDecision;
    /** Turno auditado: e nele que estao as tools que confirmaram alguma coisa. */
    aiRunId?: string;
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
        promptVersion: input.promptVersion,
      },
      conversationMemory: memory,
      appointmentDraft,
      aiDecisionLogs: [
        {
          inputMessageIds: input.inputMessageIds,
          promptVersion: input.promptVersion,
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

    // Sugestao, nunca override: se a profissional ja decidiu a categoria, a
    // decisao dela continua valendo e a sugestao fica registrada ao lado.
    await this.sessions?.recordCategorySuggestion({
      tenantId: conversation.tenantId,
      conversationId: input.conversationId,
      classification,
      provenance: `agent:${input.promptVersion}`,
    });

    await this.inferCustomerMemory({
      tenantId: conversation.tenantId,
      conversationId: input.conversationId,
      inputMessageIds: input.inputMessageIds,
      appointment: appointmentDraft,
      aiRunId: input.aiRunId,
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
    messages: [PRODUCT_OWN_FIXED_TEXTS.incompleteBusinessContextHandoff],
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
    turnId: session.turnId,
    phone: session.phone,
    customerName: session.customerName,
    businessContext: session.businessContext,
    aiRunId,
  };
}

/**
 * Mensagem generica para falha de infraestrutura (Goal011): nunca descreve o
 * problema real (autenticacao, timeout, indisponibilidade, 5xx) porque isso
 * nao e algo que a cliente ou o modelo devam ver ou tentar interpretar. Quem
 * trata o detalhe real e o log, em `recordToolResults`.
 */
const INFRASTRUCTURE_TOOL_FAILURE_MESSAGE =
  "Não foi possível completar essa ação agora. Tente novamente em instantes ou peça para falar com a equipe.";

function graphToolFailure(
  session: AssistantGraphSession,
  call: ModelToolCall,
  error: unknown,
) {
  const aiRunId = session.aiRunId ?? "missing-ai-run";
  const isInfrastructure = error instanceof InfrastructureError;
  return {
    ok: false as const,
    requestId: session.requestId,
    tenantId: session.tenantId,
    aiRunId,
    toolCallId: call.id,
    idempotencyKey: `${aiRunId}:${call.id}:${call.name}`,
    error: {
      // Erro de dominio chega ao modelo com o codigo proprio dele (ver
      // `DomainError`/`SchedulingClient`), para poder oferecer alternativa.
      // Erro de infraestrutura vira sempre o mesmo codigo/mensagem
      // genericos, sem nenhum detalhe do problema real.
      code: isInfrastructure ? "TOOL_INFRASTRUCTURE_ERROR" : errorCode(error),
      message: isInfrastructure
        ? INFRASTRUCTURE_TOOL_FAILURE_MESSAGE
        : toErrorMessage(error),
    },
  };
}

function errorCode(error: unknown): string {
  return error instanceof AppError && error.code
    ? error.code
    : "TOOL_EXECUTION_FAILED";
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
      messages: [PRODUCT_OWN_FIXED_TEXTS.humanRequestedOrSensitiveComplaint],
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
      messages: [PRODUCT_OWN_FIXED_TEXTS.supplierOrPartner],
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
      messages: [PRODUCT_OWN_FIXED_TEXTS.personalContact],
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
      messages: [buildStyleGreeting(aiSettings.tone)],
      conversationStage: "QUALIFYING_CONTACT",
      classification: "unknown",
      confidence: 0.92,
      internalNotes:
        "Primeira mensagem generica; nao oferecer servicos antes de entender o motivo do contato.",
    };
  }

  return null;
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
    messages: [raw.trim() || PRODUCT_OWN_FIXED_TEXTS.genericReplyFallback],
    conversationStage: "GENERAL_CONVERSATION",
    classification: "potential_customer",
    confidence: 0.6,
    internalNotes:
      "Resposta do modelo nao veio em JSON estruturado; convertida para send_message.",
  };
}

/**
 * Motivos de pausa em que o contato nao e cliente. Pelo vault (05-WhatsApp,
 * "Mensagem ambigua"), quando fica claro que a conversa e pessoal a IA para de
 * responder; validacao de 2026-10-11: uma amiga oferecendo botox e
 * progressiva recebeu resposta como se fosse cliente.
 */
const SILENT_PAUSE_REASONS: ReadonlySet<string> = new Set([
  "personal_contact",
  "supplier_or_partner",
  "spam",
]);

export function isSilentPause(decision: AiDecision): boolean {
  if (decision.action !== "pause_ai") return false;
  return (
    SILENT_PAUSE_REASONS.has(decision.pauseReason ?? "") ||
    SILENT_PAUSE_REASONS.has(decision.classification ?? "")
  );
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

  return PRODUCT_OWN_FIXED_TEXTS.genericReplyFallback;
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

/**
 * Sugestoes do modo sugestao: `{ "suggestions": [...] }`, ate 3, cada uma
 * aparada e nao vazia. Resposta fora do formato nunca lanca — vira uma unica
 * sugestao com o texto bruto, mesma tolerancia de `parseAiDecision` para
 * saida do modelo fora do JSON esperado.
 */
function parseSuggestions(raw: string): string[] {
  const parsed = parseJsonLike(extractJsonCandidate(raw));
  if (isRecord(parsed)) {
    const suggestions = parseStringArray(parsed.suggestions)
      .map((suggestion) => suggestion.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (suggestions.length > 0) return suggestions;
  }
  const fallback = raw.trim();
  return fallback ? [fallback] : [];
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

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || code === "23505";
}

/**
 * A resposta pede para a cliente confirmar um agendamento ("Posso confirmar
 * ...?", "Posso marcar ...?"). Texto ja normalizado por `normalizeText`.
 */
export function asksBookingConfirmation(normalized: string): boolean {
  if (!normalized.includes("?")) return false;
  return (
    /\bposso (confirmar|marcar|agendar|reservar|fechar)\b/u.test(normalized) ||
    /\bpode(mos)? (confirmar|marcar|agendar|fechar)\b/u.test(normalized) ||
    /\b(confirmo|confirma) (pra|para) (voce|vc|ti)\b/u.test(normalized)
  );
}

function confirmationWithoutDraftNudge(): ModelInputMessage {
  return {
    role: "user",
    content:
      "[Aviso interno, nao e mensagem da cliente] Sua resposta pede confirmacao de agendamento, mas nenhum horario foi preparado. Chame create_appointment com action=prepare agora, com o servico, a data e o horario combinados, e so depois pergunte se pode marcar. Nao mencione este aviso.",
  };
}

/**
 * Validacao de 2026-10-11: no "sim" da cliente a IA devolveu a decisao
 * `{"action":"call_tool","messages":[""],...}` com a nota "falta chamar
 * create_appointment action=confirm", sem chamar a tool. A cliente recebeu o
 * fallback generico e nada foi confirmado.
 */
export function describesToolCallInsteadOfCalling(responseText: string): boolean {
  const decision = parseAiDecision(responseText);
  if (decision.action !== "call_tool" && decision.action !== "create_appointment") {
    return false;
  }
  const messages = (decision.messages ?? []).map((m) => m.trim()).filter(Boolean);
  return messages.length === 0;
}

function describedToolCallNudge(): ModelInputMessage {
  return {
    role: "user",
    content:
      "[Aviso interno, nao e mensagem da cliente] Voce descreveu uma acao no JSON em vez de chamar a tool. Chame a tool agora de verdade (por exemplo create_appointment com action=confirm) e so depois responda a cliente com o resultado. Nao mencione este aviso.",
  };
}

function claimWithoutEffectNudge(): ModelInputMessage {
  return {
    role: "user",
    content:
      "[Aviso interno, nao e mensagem da cliente] Sua resposta diz que o agendamento foi feito, mas voce nao chamou a tool para confirmar. Se a cliente acabou de aceitar o horario preparado, chame create_appointment com action=confirm agora e so depois responda com o resultado. Nao mencione este aviso.",
  };
}

/**
 * A despedida usa a parte do dia certa no fuso do negocio (validacao de
 * 2026-10-12: "tenha uma otima tarde" a meia-noite, mesmo com a frase certa no
 * prompt; o modelo copiava a das respostas anteriores).
 */
export function alignFarewellToNow(
  text: string,
  iso: string,
  timeZone: string,
): string {
  const farewell = farewellForNow(iso, timeZone);
  // "Te vejo hoje" soa estranho (validacao de 2026-10-12, atendimento as 14h
  // marcado a 00h47): para o mesmo dia, "te vejo mais tarde".
  text = text.replace(/\b(te) vejo hoje\b/giu, (_match, te: string) => `${te} vejo mais tarde`);
  return text.replace(
    /tenha (um|uma) [oó]tim[oa] (dia|tarde|noite)/giu,
    (match) => (match[0] === "T" ? farewell[0].toUpperCase() + farewell.slice(1) : farewell),
  );
}

/**
 * Palavras que o modelo copia sem acento do prompt (que e todo em ASCII):
 * "amanha", "as 9h", "Tambem", "pra voce" (validacao de 2026-10-12, mesmo com
 * a regra 25 pedindo acentuacao). So entram aqui palavras sem outra leitura
 * valida sem acento; "esta", "e", "ate" e "so" ficam de fora por ambiguidade.
 */
const ACCENT_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bamanha\b/giu, "amanhã"],
  [/\bvoce\b/giu, "você"],
  [/\bvoces\b/giu, "vocês"],
  [/\btambem\b/giu, "também"],
  [/\bnao\b/giu, "não"],
  [/\bhorario\b/giu, "horário"],
  [/\bhorarios\b/giu, "horários"],
  [/\bservico\b/giu, "serviço"],
  [/\bservicos\b/giu, "serviços"],
  [/\bduracao\b/giu, "duração"],
  [/\bmanutencao\b/giu, "manutenção"],
  [/\bterca\b/giu, "terça"],
  [/\bsabado\b/giu, "sábado"],
  [/\bdisponivel\b/giu, "disponível"],
  [/\bdisponiveis\b/giu, "disponíveis"],
  [/\botim([oa])\b/giu, "ótim$1"],
  [/\bas (\d{1,2}h)/gu, "às $1"],
  [/\bAs (\d{1,2}h)/gu, "Às $1"],
];

export function restorePortugueseAccents(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ACCENT_FIXES) {
    result = result.replace(pattern, (match, ...groups) => {
      const fixed = replacement.replace(/\$(\d)/g, (_, index: string) =>
        String(groups[Number(index) - 1] ?? ""),
      );
      // Preserva maiuscula inicial ("Tambem" -> "Também").
      return match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
        ? fixed[0].toUpperCase() + fixed.slice(1)
        : fixed;
    });
  }
  return result;
}

function latestCustomerText(session: AssistantGraphSession): string {
  const last = [...(session.input ?? [])]
    .reverse()
    .find((message) => message.role === "user");
  return last?.content ?? "";
}

/**
 * Tira a frase de duracao e valor ja dita antes na conversa (validacao de
 * 2026-10-12: "O design de sobrancelha leva 40 min e custa R$ 35" em toda
 * oferta, mesmo com o prompt pedindo para dizer uma vez so). Se a cliente
 * perguntou valor ou tempo nesta mensagem, a frase fica.
 */
export function dropRepeatedPriceAndDuration(
  text: string,
  previousAssistantTexts: readonly string[],
  customerText: string,
): string {
  const asked = /(quanto|valor|pre[cç]o|custa|demora|dura[cç][aã]o|quanto tempo)/iu.test(
    customerText,
  );
  if (asked) return text;
  const previous = previousAssistantTexts.join("\n");
  const paragraphs = text.split(/\n\n/);
  const kept = paragraphs
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !isRepeatedPriceOrDuration(sentence, previous))
        .join(" "),
    )
    .filter((paragraph) => paragraph.trim().length > 0);
  return kept.length > 0 ? kept.join("\n\n") : text;
}

function isRepeatedPriceOrDuration(sentence: string, previous: string): boolean {
  const prices = sentence.match(/R\$\s?\d+(?:[.,]\d+)?/gu) ?? [];
  const durations = sentence.match(/\d+\s?min\b|\d+h\d*\s?de dura[cç][aã]o/giu) ?? [];
  const facts = [...prices, ...durations];
  if (facts.length === 0) return false;
  // A frase so sai se for so isso: valor/duracao ja ditos, sem horario novo.
  if (/\b(\d{1,2}h(\d{2})?)\b(?!\s?de dura)/u.test(sentence.replace(/\d+\s?min\b/giu, ""))) {
    return false;
  }
  const normalize = (value: string) => value.replace(/\s+/g, "");
  const said = normalize(previous);
  return facts.every((fact) => said.includes(normalize(fact)));
}
