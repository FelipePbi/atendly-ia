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
import { classifySendFailure } from "../outbox/outbox-policy.js";
import type { GraphSessionPort } from "../session/SessionService.js";
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

/**
 * Porta de cancelamento da resposta ainda nao enviada.
 *
 * Mensagem nova na mesma conversa durante uma execucao pede reavaliacao: a
 * saida ja persistida e cancelada antes de chamar o transporte, em vez de sair
 * respondendo a um contexto que o cliente acabou de mudar.
 */
export interface OutboundGate {
  shouldCancel(): Promise<string | null>;
  /**
   * Pede a reavaliacao da saida pendente desta conversa.
   *
   * E o mesmo supersede do Goal004, agora acionado tambem quando o humano
   * assume: a resposta automatica que ainda nao saiu deixa de sair.
   */
  requestCancel?(reason: string): Promise<void>;
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
  outboundGate?: OutboundGate;
  /**
   * Contato, sessao, categoria e controle humano persistidos.
   *
   * Opcional para o caminho legado que ainda nao a injeta; quando ausente, o
   * grafo cai na politica anterior (handoff + pausa por relogio) e nao inventa
   * categoria nem ignore.
   */
  sessions?: GraphSessionPort;
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
        session: undefined,
        observedInboundVersion: 0,
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

  /**
   * Ordem do grafo depois do Goal005.
   *
   * A inbox deixou de depender da decisao de IA: `operationalGuard` continua
   * recusando duplicata e desviando a atividade do dono, mas nao encerra mais
   * a execucao por IA desligada, pausa, sessao pessoal ou contato ignorado.
   * Ele apenas **anota** a decisao; quem encerra e `sessionGate`, ja depois de
   * `recordInbound`. Assim a mensagem do cliente existe em `Message` antes de
   * qualquer decisao, e o conteudo bloqueado nunca chega a
   * `understandMessage`, ao RAG, ao modelo nem a memoria.
   */
  private buildGraph(checkpointer: BaseCheckpointSaver) {
    return new StateGraph(MessageGraphState)
      .addNode("loadRuntimeContext", (state) => this.loadRuntimeContext(state))
      .addNode("loadConversation", (state) => this.loadConversation(state))
      .addNode("loadSession", (state) => this.loadSession(state))
      .addNode("operationalGuard", (state) => this.operationalGuard(state))
      .addNode("ownerActivity", (state) => this.handleOwnerActivity(state))
      .addNode("understandMessage", (state) => this.understandMessage(state))
      .addNode("recordInbound", (state) => this.recordInbound(state))
      .addNode("sessionGate", (state) => this.sessionGate(state))
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
      .addEdge("loadConversation", "loadSession")
      .addEdge("loadSession", "operationalGuard")
      .addConditionalEdges("operationalGuard", routeAfterGuard, {
        end: END,
        owner: "ownerActivity",
        buffer: "bufferInbound",
        record: "recordInbound",
      })
      .addEdge("ownerActivity", END)
      .addEdge("bufferInbound", END)
      .addEdge("recordInbound", "sessionGate")
      .addConditionalEdges(
        "sessionGate",
        (state) => (state.result ? "end" : "understand"),
        { end: END, understand: "understandMessage" },
      )
      .addConditionalEdges("understandMessage", routeAfterUnderstanding, {
        end: END,
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

  /**
   * Contato e sessao vigentes, antes de qualquer decisao.
   *
   * A sessao rotaciona sozinha aqui quando expirou por inatividade do contato:
   * a nova sessao volta a IA se o contato for elegivel — e nunca se ele estiver
   * ignorado, porque `ignored` e regra do contato.
   */
  private async loadSession(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const sessions = this.dependencies.sessions;
    if (!sessions) return {};
    const message = state.inboundMessage;
    const session = await sessions.resolveContext({
      tenantId: state.tenantId,
      channelId: state.channelId,
      conversationId: state.conversationId,
      externalContactId:
        state.conversation.externalContactId ?? message.customerPhone,
      customerName: message.customerName,
    });
    return { session, observedInboundVersion: session.inboundVersion };
  }

  /**
   * Recusa o que nao e trabalho de conversa e anota por que a IA nao deve
   * responder. Nao encerra a execucao por politica: o encerramento acontece em
   * `sessionGate`, depois de a mensagem estar persistida.
   */
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

    // Regra do contato antes de tudo: conteudo de contato ignorado e de sessao
    // pessoal nao pode ser lido por classificacao, modelo, RAG nem memoria.
    if (state.session?.ignored) return { guardDecision: "ignored_contact" };
    if (state.session?.category === "PERSONAL") {
      return { guardDecision: "personal_session" };
    }

    if (state.guardDecision === "channel_disconnected") return {};

    if (!env.EVOLUTION_BOT_ENABLED || !state.tenantConfig.aiEnabled) {
      return { guardDecision: "bot_disabled" };
    }

    const paused = await this.dependencies.handoff.isBotPaused(
      message.customerPhone,
    );
    if (!paused && !state.session?.humanHandling) {
      return { guardDecision: "enabled" };
    }

    const pauseContext = await this.dependencies.handoff.getBotPauseContext?.(
      message.customerPhone,
    );
    if (
      paused &&
      isTextMessage(message) &&
      isUnsupportedMessagePause(pauseContext)
    ) {
      await this.dependencies.handoff.resumeBot(message.customerPhone);
      return {
        guardDecision: "enabled",
        conversation: {
          ...state.conversation,
          status: "ACTIVE",
          humanHandoff: false,
        },
      };
    }

    const humanTakeover =
      Boolean(state.session?.humanHandling) ||
      state.conversation.humanHandoff ||
      state.conversation.status === "HUMAN_HANDOFF";
    return { guardDecision: humanTakeover ? "human_takeover" : "paused" };
  }

  /**
   * Onde a decisao de nao processar vira fim de execucao.
   *
   * Roda depois de `recordInbound`: a mensagem do cliente ja existe em
   * `Message` e continua aparecendo na lista de conversas do BFF, mesmo com a
   * IA desligada, em handoff, em sessao pessoal ou com contato ignorado.
   */
  private sessionGate(
    state: MessageGraphStateValue,
  ): MessageGraphStateUpdate {
    switch (state.guardDecision) {
      case "ignored_contact":
        return { result: { ok: true, action: "ignored_contact" } };
      case "personal_session":
        return { result: { ok: true, action: "personal_session" } };
      case "channel_disconnected":
        return { result: { ok: true, action: "channel_disconnected" } };
      case "bot_disabled":
        return { result: { ok: true, action: "bot_disabled" } };
      case "paused":
      case "human_takeover":
        return { result: { ok: true, action: "paused_conversation" } };
      default:
        return {};
    }
  }

  private understandMessage(
    state: MessageGraphStateValue,
  ): MessageGraphStateUpdate {
    if (!isTextMessage(state.inboundMessage)) return { intent: "unsupported" };
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
      await this.setContactAiPaused(state, true, "command:/ia_pause");
      return {
        intent: "owner_activity",
        result: { ok: true, action: "ai_pause_command" },
      };
    }
    if (command === "/bot on") {
      await this.dependencies.handoff.resumeBot(message.customerPhone);
      await this.releaseSessionToAi(state);
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
      await this.setContactAiPaused(state, true, "command:/bot off");
      return {
        intent: "owner_activity",
        result: { ok: true, action: "bot_paused" },
      };
    }

    // Mensagem manual da profissional pelo WhatsApp: assume a sessao antes de
    // registrar. A resposta automatica que ainda nao saiu e cancelada; nenhuma
    // mensagem automatica anuncia a troca para o cliente.
    await this.assumeHumanControl(state, "WHATSAPP");
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

  /**
   * Assume a sessao para o humano e cancela a saida automatica pendente.
   *
   * A ordem importa: o controle humano e gravado antes de o cancelamento ser
   * pedido, entao a execucao concorrente que chegar ao guard de envio ja
   * encontra o estado novo.
   */
  private async assumeHumanControl(
    state: MessageGraphStateValue,
    source: "WHATSAPP" | "ATENDLY",
  ): Promise<void> {
    const sessions = this.dependencies.sessions;
    if (sessions && state.session) {
      await sessions.assumeHumanControl({
        tenantId: state.tenantId,
        sessionId: state.session.sessionId,
        source,
      });
    }
    await this.dependencies.outboundGate?.requestCancel?.(
      "human_took_over_the_session",
    );
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
    // Fragmento diferido tambem e interacao do contato: renova a sessao e
    // avanca a versao de entrada.
    const sessions = this.dependencies.sessions;
    const session =
      sessions && state.session
        ? await sessions.recordContactMessage({
            tenantId: state.tenantId,
            sessionId: state.session.sessionId,
          })
        : undefined;
    return {
      bufferedRecord: recorded,
      ...(session
        ? { session, observedInboundVersion: session.inboundVersion }
        : {}),
      result: { ok: true, action: "buffered" },
    };
  }

  /**
   * `/bot on` e `Retomar IA` na sessao vigente.
   *
   * Limpar so a pausa do contato nao bastava: se a profissional ja tinha
   * respondido manualmente, `ConversationSession.humanHandling` continuava
   * verdadeiro e o guard mantinha a conversa em atendimento humano. O comando
   * passa pelo mesmo caminho do painel — libera a sessao, marca a reavaliacao
   * de contexto e limpa a pausa do contato.
   */
  private async releaseSessionToAi(
    state: MessageGraphStateValue,
  ): Promise<void> {
    const sessions = this.dependencies.sessions;
    if (!sessions) return;
    const released = await sessions.releaseToAi({
      tenantId: state.tenantId,
      conversationId: state.conversationId,
    });
    // Sem sessao vigente nao ha o que liberar, mas a pausa do contato existe
    // mesmo assim e o comando precisa desfaze-la.
    if (!released) await this.setContactAiPaused(state, false);
  }

  private async setContactAiPaused(
    state: MessageGraphStateValue,
    paused: boolean,
    reason?: string,
  ): Promise<void> {
    const sessions = this.dependencies.sessions;
    if (!sessions || !state.session) return;
    await sessions.setContactAiPaused({
      tenantId: state.tenantId,
      contactId: state.session.contactId,
      paused,
      reason,
    });
  }

  /**
   * Persiste a mensagem do cliente antes de qualquer decisao de IA.
   *
   * O guard nao encerra mais antes deste no: com a IA desligada, em handoff,
   * em sessao pessoal ou com contato ignorado, a mensagem existe do mesmo
   * jeito. So o que ja foi gravado no lote (`inputMessageIds`) e pulado.
   */
  private async recordInbound(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    const update: MessageGraphStateUpdate = {};
    if (
      state.inputMessageIds.length === 0 &&
      isTextMessage(state.inboundMessage) &&
      hasRecordInboundAutomation(this.dependencies.automation) &&
      hasGraphAutomation(this.dependencies.automation)
    ) {
      const recorded = await this.dependencies.automation.recordInboundText({
        phone: state.inboundMessage.customerPhone,
        text: state.inboundText,
        businessContext: state.inboundMessage.businessContext,
        aiSettings: state.inboundMessage.aiSettings,
        channelMessage: state.inboundMessage,
      });
      update.inputMessageIds = [recorded.messageRecordId];
    }

    // Interacao do contato renova a sessao e avanca a versao de entrada, que e
    // o que os guards de tool e de envio comparam depois.
    const sessions = this.dependencies.sessions;
    if (sessions && state.session && isTextMessage(state.inboundMessage)) {
      const session = await sessions.recordContactMessage({
        tenantId: state.tenantId,
        sessionId: state.session.sessionId,
      });
      update.session = session;
      update.observedInboundVersion = session.inboundVersion;
    }
    return update;
  }

  /**
   * Guard deterministico antes de agir com efeito.
   *
   * Rele o estado persistido e compara versao de entrada, controle humano,
   * elegibilidade global, categoria e ignore. Sem porta de sessao ligada, cai
   * na politica anterior de pausa.
   */
  private async executionBlockReason(
    state: MessageGraphStateValue,
  ): Promise<string | null> {
    const sessions = this.dependencies.sessions;
    if (!sessions || !state.session) return null;
    const { reason } = await sessions.evaluate({
      tenantId: state.tenantId,
      sessionId: state.session.sessionId,
      observedInboundVersion: state.observedInboundVersion,
      aiEnabled: env.EVOLUTION_BOT_ENABLED && state.tenantConfig.aiEnabled,
      channelConnected: state.guardDecision !== "channel_disconnected",
    });
    return reason;
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
            // `Retomar IA` reavalia o contexto atual: o turno seguinte le a
            // conversa a partir do instante da retomada, nao do ponto anterior.
            contextSince: state.session?.contextResetAt ?? undefined,
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
    // Guard antes de tool com efeito: o humano pode ter assumido, o contato
    // pode ter sido ignorado e o cliente pode ter falado de novo enquanto o
    // modelo pensava. Nada com efeito roda sobre contexto vencido.
    const blocked = await this.executionBlockReason(state);
    if (blocked) {
      this.logger.info(
        {
          ...channelMessageLogContext(state.inboundMessage),
          reason: blocked,
        },
        "LangGraph skipped a tool with effect because the turn is no longer eligible",
      );
      return {
        result: {
          ok: true,
          action:
            blocked === "input_superseded"
              ? "superseded"
              : blocked === "contact_ignored"
                ? "ignored_contact"
                : blocked === "session_personal"
                  ? "personal_session"
                  : "paused_conversation",
        },
      };
    }
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
      // A saida ja existe persistida; ela nao sera enviada porque o humano
      // assumiu. Fica falha com motivo, nao apagada nem presumida enviada.
      await this.recordDelivery(state.response.messageRecordId, {
        state: "FAILED",
        detail: "paused_before_send",
      });
      return {
        result: { ok: true, action: "paused_conversation" },
      };
    }

    // Nada e marcado como enviado aqui: ate o Goal004 este no confirmava a
    // saida antes de qualquer chamada ao transporte, e o envio que falhasse
    // depois ficava indistinguivel de um envio bem-sucedido.
    return {};
  }

  private async recordDelivery(
    messageRecordId: string | undefined,
    delivery: {
      state: "SENT" | "FAILED" | "UNKNOWN";
      providerMessageId?: string;
      rawPayload?: unknown;
      detail?: string;
    },
  ): Promise<void> {
    if (!messageRecordId) return;
    const automation = this.dependencies.automation;
    if (automation.markOutboundDelivery) {
      await automation.markOutboundDelivery({ messageRecordId, ...delivery });
      return;
    }
    if (delivery.state === "SENT") {
      await automation.markOutboundMessageSent({
        messageRecordId,
        providerMessageId: delivery.providerMessageId,
        rawPayload: delivery.rawPayload,
      });
    }
  }

  private async sendResponse(
    state: MessageGraphStateValue,
  ): Promise<MessageGraphStateUpdate> {
    if (!state.response) {
      throw new Error("LangGraph sendResponse received an empty response.");
    }
    const message = state.inboundMessage;

    const cancelReason =
      (await this.executionBlockReason(state)) ??
      (await this.dependencies.outboundGate?.shouldCancel());
    if (cancelReason) {
      await this.recordDelivery(state.response.messageRecordId, {
        state: "FAILED",
        detail: cancelReason,
      });
      this.logger.info(
        {
          ...channelMessageLogContext(message),
          messageRecordId: state.response.messageRecordId,
          reason: cancelReason,
        },
        "LangGraph cancelled a response that had not been sent yet",
      );
      return { result: { ok: true, action: "superseded" } };
    }

    const correlationId =
      state.response.correlationId ?? state.response.messageRecordId;
    let sent: Awaited<ReturnType<WhatsAppProvider["sendText"]>>;
    try {
      sent = await this.dependencies.provider.sendText({
        to: message.customerPhone,
        text: state.response.text,
        quotedMessageId: message.messageId,
        quotedParticipant: message.chatId,
        correlationId,
        requestId: message.requestId,
      });
    } catch (error) {
      const classification = classifySendFailure(error);
      await this.recordDelivery(state.response.messageRecordId, {
        state: classification.state,
        detail: classification.detail,
      });
      this.logger.error(
        {
          ...channelMessageLogContext(message),
          messageRecordId: state.response.messageRecordId,
          deliveryState: classification.state,
          deliveryDetail: classification.detail,
          err: toErrorMessage(error),
        },
        "LangGraph could not confirm the outbound message",
      );
      // Retry so quando a falha comprovadamente aconteceu antes do envio: o
      // inbox retenta o evento. `unknown` nunca e reenviado — muda de estado
      // por reconciliacao, nao por nova tentativa.
      if (classification.retryable) throw error;
      return { result: { ok: true, action: "send_failed" } };
    }

    const response = {
      ...state.response,
      providerMessageId: sent.messageId ?? correlationId,
      rawPayload: sent.raw,
    };
    await this.recordDelivery(state.response.messageRecordId, {
      state: "SENT",
      providerMessageId: sent.messageId ?? correlationId,
      rawPayload: sent.raw,
    });
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

/**
 * Saida do guard operacional.
 *
 * `owner` desvia a atividade manual da profissional, que nao e mensagem de
 * cliente e nao entra na inbox como INBOUND. `buffer` e o lote diferido, que
 * ja persiste o fragmento. Todo o resto vai para `record`: a decisao de nao
 * processar acontece depois, em `sessionGate`.
 */
function routeAfterGuard(
  state: MessageGraphStateValue,
): "end" | "owner" | "buffer" | "record" {
  if (state.result) return "end";
  const message = state.inboundMessage;
  if (message.fromMe && !isSelfChatMessage(message)) return "owner";
  if (state.deferResponse && isTextMessage(message)) return "buffer";
  return "record";
}

function routeAfterUnderstanding(
  state: MessageGraphStateValue,
): "end" | "retrieval" | "agent" {
  if (state.result) return "end";
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
