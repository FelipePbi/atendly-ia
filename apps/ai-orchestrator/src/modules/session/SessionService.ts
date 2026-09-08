import { env } from "../../config/env.js";
import type {
  Prisma,
  PrismaClient,
} from "../../generated/prisma/client.js";
import {
  type AiEligibilityReason,
  categoryFromClassification,
  type CategorySource,
  executionGuardReason,
  type HumanControlSource,
  isSessionExpired,
  resolveEffectiveCategory,
  type SessionCategory,
  sessionExpiresAt,
  type SessionPolicy,
} from "./session-policy.js";

/** Politica de sessao lida da configuracao do processo. */
export function sessionPolicyFromEnv(): SessionPolicy {
  return { inactivitySeconds: env.AI_SESSION_INACTIVITY_SECONDS };
}

/**
 * Retrato serializavel do contato e da sessao vigente.
 *
 * Entra no estado do grafo, entao so carrega decisao ja tomada: nada de
 * conteudo de mensagem, nome de cliente ou payload do transporte.
 */
export interface SessionSnapshot {
  contactId: string;
  sessionId: string;
  externalContactId: string;
  ignored: boolean;
  aiPaused: boolean;
  category: SessionCategory;
  categorySource: CategorySource;
  humanHandling: boolean;
  inboundVersion: number;
  startedAt: string;
  expiresAt: string;
  contextResetAt: string | null;
}

export interface SessionScope {
  tenantId: string;
  channelId: string;
  conversationId: string;
  externalContactId: string;
  customerName?: string | null;
}

/**
 * Porta consumida pelo grafo. Deliberadamente estreita: o grafo resolve o
 * contexto, marca a mensagem do contato, reavalia antes de agir com efeito e
 * assume a sessao quando o humano fala. Nada alem disso.
 */
export interface GraphSessionPort {
  resolveContext(scope: SessionScope, now?: Date): Promise<SessionSnapshot>;
  recordContactMessage(input: {
    tenantId: string;
    sessionId: string;
    now?: Date;
  }): Promise<SessionSnapshot>;
  evaluate(input: {
    tenantId: string;
    sessionId: string;
    observedInboundVersion: number;
    aiEnabled: boolean;
    channelConnected: boolean;
  }): Promise<{ reason: AiEligibilityReason | "input_superseded" | null }>;
  assumeHumanControl(input: {
    tenantId: string;
    sessionId: string;
    source: HumanControlSource;
    actor?: string | null;
    now?: Date;
  }): Promise<SessionSnapshot>;
  setContactAiPaused(input: {
    tenantId: string;
    contactId: string;
    paused: boolean;
    reason?: string;
    now?: Date;
  }): Promise<void>;
  /** `/bot on` pelo WhatsApp e `Retomar IA` pelo painel usam o mesmo caminho. */
  releaseToAi(input: {
    tenantId: string;
    conversationId: string;
    actor?: string | null;
    now?: Date;
  }): Promise<SessionSnapshot | null>;
}

/** Sugestao de categoria emitida pelo agente. Nunca vira override manual. */
export interface CategorySuggestionPort {
  recordCategorySuggestion(input: {
    tenantId: string;
    conversationId: string;
    classification: string | null | undefined;
    provenance: string;
    now?: Date;
  }): Promise<void>;
}

export class SessionService implements GraphSessionPort, CategorySuggestionPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly policy: SessionPolicy = sessionPolicyFromEnv(),
  ) {}

  /**
   * Contato e sessao vigente do canal.
   *
   * Cria o que faltar e rotaciona a sessao expirada por inatividade **do
   * contato**. A sessao nova volta a `Nao classificadas` a menos que exista
   * override manual, que atravessa a troca — e por isso que "nova sessao pode
   * reavaliar a intencao" nao desfaz uma decisao da profissional.
   */
  async resolveContext(
    scope: SessionScope,
    now = new Date(),
  ): Promise<SessionSnapshot> {
    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_channelId_externalContactId: {
          tenantId: scope.tenantId,
          channelId: scope.channelId,
          externalContactId: scope.externalContactId,
        },
      },
      update: scope.customerName ? { displayName: scope.customerName } : {},
      create: {
        tenantId: scope.tenantId,
        channelId: scope.channelId,
        externalContactId: scope.externalContactId,
        displayName: scope.customerName ?? null,
      },
    });

    await this.prisma.conversation.updateMany({
      where: {
        tenantId: scope.tenantId,
        id: scope.conversationId,
        contactId: null,
      },
      data: { contactId: contact.id },
    });

    const open = await this.prisma.conversationSession.findFirst({
      where: {
        tenantId: scope.tenantId,
        conversationId: scope.conversationId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    if (open && !isSessionExpired({ expiresAt: open.expiresAt, now })) {
      return this.refreshCategory(open, contact);
    }

    if (open) {
      // Expirou: a sessao anterior fecha com motivo, e nada dela e carregado
      // para a nova alem do que e do contato.
      await this.prisma.conversationSession.updateMany({
        where: { tenantId: scope.tenantId, id: open.id, endedAt: null },
        data: { endedAt: now, endedReason: "contact_inactivity" },
      });
    }

    const effective = resolveEffectiveCategory({
      override: contact.categoryOverride,
      suggestion: null,
    });
    const created = await this.prisma.conversationSession.create({
      data: {
        tenantId: scope.tenantId,
        channelId: scope.channelId,
        conversationId: scope.conversationId,
        contactId: contact.id,
        startedAt: now,
        expiresAt: sessionExpiresAt(now, this.policy),
        category: effective.category,
        categorySource: effective.source,
        categoryUpdatedAt: contact.categoryOverrideAt,
        categoryUpdatedBy: contact.categoryOverrideBy,
      },
    });
    await this.syncLegacyPauseMirror(scope, contact);
    return toSnapshot(created, contact);
  }

  async recordContactMessage(input: {
    tenantId: string;
    sessionId: string;
    now?: Date;
  }): Promise<SessionSnapshot> {
    const now = input.now ?? new Date();
    const session = await this.prisma.conversationSession.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.sessionId } },
      data: {
        lastContactMessageAt: now,
        expiresAt: sessionExpiresAt(now, this.policy),
        inboundVersion: { increment: 1 },
      },
    });
    const contact = await this.requireContact(input.tenantId, session.contactId);
    return toSnapshot(session, contact);
  }

  async evaluate(input: {
    tenantId: string;
    sessionId: string;
    observedInboundVersion: number;
    aiEnabled: boolean;
    channelConnected: boolean;
  }): Promise<{ reason: AiEligibilityReason | "input_superseded" | null }> {
    const session = await this.prisma.conversationSession.findUnique({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.sessionId } },
    });
    if (!session) return { reason: "human_handling" };
    const contact = await this.requireContact(input.tenantId, session.contactId);
    return {
      reason: executionGuardReason({
        contactIgnored: contact.ignored,
        contactAiPaused: contact.aiPaused,
        category: session.category,
        humanHandling: session.humanHandling,
        aiEnabled: input.aiEnabled,
        channelConnected: input.channelConnected,
        observedInboundVersion: input.observedInboundVersion,
        currentInboundVersion: session.inboundVersion,
      }),
    };
  }

  /**
   * Envio manual assume a sessao.
   *
   * Uma transacao so: marca o atendimento humano na sessao e no espelho legado
   * da conversa. Nao existe "assumir depois de enviar" — quando a resposta
   * automatica chegar ao guard de envio, o controle humano ja esta gravado.
   */
  async assumeHumanControl(input: {
    tenantId: string;
    sessionId: string;
    source: HumanControlSource;
    actor?: string | null;
    now?: Date;
  }): Promise<SessionSnapshot> {
    const now = input.now ?? new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversationSession.update({
        where: {
          tenantId_id: { tenantId: input.tenantId, id: input.sessionId },
        },
        data: {
          humanHandling: true,
          humanHandlingSince: now,
          humanHandlingSource: input.source,
          humanHandlingBy: input.actor ?? null,
        },
      });
      await tx.conversation.updateMany({
        where: { tenantId: input.tenantId, id: updated.conversationId },
        data: { humanHandoff: true, status: "HUMAN_HANDOFF" },
      });
      return updated;
    });
    const contact = await this.requireContact(input.tenantId, session.contactId);
    return toSnapshot(session, contact);
  }

  async setContactAiPaused(input: {
    tenantId: string;
    contactId: string;
    paused: boolean;
    reason?: string;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    await this.prisma.contact.updateMany({
      where: { tenantId: input.tenantId, id: input.contactId },
      data: {
        aiPaused: input.paused,
        aiPausedAt: input.paused ? now : null,
        aiPausedReason: input.paused ? (input.reason ?? null) : null,
      },
    });
  }

  /**
   * Sugestao do agente gravada com proveniencia.
   *
   * Nunca toca `categoryOverride` nem `categorySource: MANUAL`: se existe
   * override, a categoria vigente continua sendo a da profissional e a sugestao
   * fica registrada ao lado, para o painel poder explicar a divergencia.
   */
  async recordCategorySuggestion(input: {
    tenantId: string;
    conversationId: string;
    classification: string | null | undefined;
    provenance: string;
    now?: Date;
  }): Promise<void> {
    const suggestion = categoryFromClassification(input.classification);
    if (!suggestion) return;
    const now = input.now ?? new Date();
    const session = await this.prisma.conversationSession.findFirst({
      where: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return;
    const contact = await this.requireContact(input.tenantId, session.contactId);
    const effective = resolveEffectiveCategory({
      override: contact.categoryOverride,
      suggestion,
    });
    await this.prisma.conversationSession.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: session.id } },
      data: {
        suggestedCategory: suggestion,
        suggestionProvenance: input.provenance,
        suggestedAt: now,
        category: effective.category,
        categorySource: effective.source,
      },
    });
  }

  /** Override manual da categoria: decisao da profissional, vale por contato. */
  async setCategoryOverride(input: {
    tenantId: string;
    conversationId: string;
    category: SessionCategory | null;
    actor?: string | null;
    now?: Date;
  }): Promise<SessionSnapshot | null> {
    const now = input.now ?? new Date();
    const session = await this.currentSession(
      input.tenantId,
      input.conversationId,
    );
    if (!session) return null;
    const contact = await this.prisma.contact.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: session.contactId } },
      data: {
        categoryOverride: input.category,
        categoryOverrideAt: input.category ? now : null,
        categoryOverrideBy: input.category ? (input.actor ?? null) : null,
      },
    });
    const effective = resolveEffectiveCategory({
      override: contact.categoryOverride,
      suggestion: session.suggestedCategory,
    });
    const updated = await this.prisma.conversationSession.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: session.id } },
      data: {
        category: effective.category,
        categorySource: effective.source,
        categoryUpdatedAt: input.category ? now : null,
        categoryUpdatedBy: input.category ? (input.actor ?? null) : null,
      },
    });
    return toSnapshot(updated, contact);
  }

  /**
   * Contato ignorado: regra do contato, prevalece sobre a sessao e sobre
   * qualquer categoria. Marcar registra autor e origem; desmarcar preserva o
   * historico da marcacao anterior apenas no log da aplicacao, nunca apagando
   * mensagem.
   */
  async setIgnored(input: {
    tenantId: string;
    conversationId: string;
    ignored: boolean;
    actor?: string | null;
    source?: string;
    now?: Date;
  }): Promise<SessionSnapshot | null> {
    const now = input.now ?? new Date();
    const session = await this.currentSession(
      input.tenantId,
      input.conversationId,
    );
    if (!session) return null;
    const contact = await this.prisma.contact.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: session.contactId } },
      data: {
        ignored: input.ignored,
        ignoredAt: input.ignored ? now : null,
        ignoredBy: input.ignored ? (input.actor ?? null) : null,
        ignoredSource: input.ignored ? (input.source ?? "panel") : null,
      },
    });
    return toSnapshot(session, contact);
  }

  /**
   * `Retomar IA`.
   *
   * Devolve a conversa a IA e marca `contextResetAt`: o proximo turno reavalia
   * o contexto atual em vez de continuar do ponto anterior. Tool pendente do
   * contexto antigo nao e retomada — o rascunho volta a pedir confirmacao.
   */
  async releaseToAi(input: {
    tenantId: string;
    conversationId: string;
    actor?: string | null;
    now?: Date;
  }): Promise<SessionSnapshot | null> {
    const now = input.now ?? new Date();
    const session = await this.currentSession(
      input.tenantId,
      input.conversationId,
    );
    if (!session) return null;
    const updated = await this.prisma.conversationSession.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: session.id } },
      data: {
        humanHandling: false,
        humanHandlingSince: null,
        humanHandlingSource: null,
        humanHandlingBy: null,
        contextResetAt: now,
      },
    });
    await this.setContactAiPaused({
      tenantId: input.tenantId,
      contactId: session.contactId,
      paused: false,
      now,
    });
    await this.resetPendingContext(input.tenantId, input.conversationId);
    const contact = await this.requireContact(input.tenantId, session.contactId);
    return toSnapshot(updated, contact);
  }

  /** Sessao vigente da conversa, sem criar nada. */
  async currentSession(tenantId: string, conversationId: string) {
    return this.prisma.conversationSession.findFirst({
      where: { tenantId, conversationId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
  }

  /** Controle humano vivo numa sessao que ainda nao expirou. */
  async isHumanControlActive(input: {
    tenantId: string;
    conversationId: string;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const session = await this.currentSession(
      input.tenantId,
      input.conversationId,
    );
    if (!session) return false;
    if (isSessionExpired({ expiresAt: session.expiresAt, now })) return false;
    return session.humanHandling;
  }

  /**
   * O espelho legado da conversa acompanha a sessao.
   *
   * `Conversation.humanHandoff` sobrevivia a troca de sessao: com o relogio
   * nulo ou no ano 9999, `isBotPaused` devolvia `true` antes mesmo de consultar
   * a sessao, e a conversa ficava em `paused_conversation` para sempre depois
   * de um atendimento humano. Ao abrir a sessao nova — que nasce sem
   * atendimento humano — o espelho volta a `ACTIVE`.
   *
   * O que atravessa a troca de sessao continua atravessando: `/bot off` e
   * `/ia_pause` sao pausa do contato (`aiPaused`) e contato ignorado e regra do
   * contato. Nesses casos o espelho fica como esta.
   */
  private async syncLegacyPauseMirror(
    scope: SessionScope,
    contact: ContactRow,
  ): Promise<void> {
    if (contact.aiPaused || contact.ignored) return;
    await this.prisma.conversation.updateMany({
      where: {
        tenantId: scope.tenantId,
        id: scope.conversationId,
        humanHandoff: true,
      },
      data: {
        humanHandoff: false,
        status: "ACTIVE",
        handoffPausedUntil: null,
      },
    });
  }

  private async refreshCategory(
    session: SessionRow,
    contact: ContactRow,
  ): Promise<SessionSnapshot> {
    const effective = resolveEffectiveCategory({
      override: contact.categoryOverride,
      suggestion: session.suggestedCategory,
    });
    if (
      session.category === effective.category &&
      session.categorySource === effective.source
    ) {
      return toSnapshot(session, contact);
    }
    const updated = await this.prisma.conversationSession.update({
      where: { tenantId_id: { tenantId: session.tenantId, id: session.id } },
      data: { category: effective.category, categorySource: effective.source },
    });
    return toSnapshot(updated, contact);
  }

  /**
   * Troca de sessao nao retoma tool pendente do contexto antigo.
   *
   * O rascunho volta a `waiting_info` para que a proxima resposta reconfirme o
   * que estava combinado, em vez de concluir sozinha um agendamento decidido
   * antes de o humano assumir.
   */
  private async resetPendingContext(
    tenantId: string,
    conversationId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, id: conversationId },
      select: { id: true, state: true },
    });
    const state = conversation?.state;
    if (!isRecord(state)) return;

    const next: Record<string, unknown> = { ...state };
    if (isRecord(state.aiConversation)) {
      next.aiConversation = {
        ...state.aiConversation,
        aiEnabledForChat: true,
        stage: "GENERAL_CONVERSATION",
        lastProcessedMessageIds: [],
      };
    }
    if (
      isRecord(state.appointmentDraft) &&
      typeof state.appointmentDraft.status === "string" &&
      ["checking_availability", "waiting_confirmation"].includes(
        state.appointmentDraft.status,
      )
    ) {
      next.appointmentDraft = {
        ...state.appointmentDraft,
        status: "waiting_info",
      };
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { state: next as Prisma.InputJsonValue },
    });
  }

  private async requireContact(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { tenantId_id: { tenantId, id: contactId } },
    });
    if (!contact) {
      throw new Error("Contact was not found for the conversation session.");
    }
    return contact;
  }
}

type SessionRow = Awaited<
  ReturnType<PrismaClient["conversationSession"]["create"]>
>;
type ContactRow = Awaited<ReturnType<PrismaClient["contact"]["create"]>>;

export function toSnapshot(
  session: SessionRow,
  contact: ContactRow,
): SessionSnapshot {
  return {
    contactId: contact.id,
    sessionId: session.id,
    externalContactId: contact.externalContactId,
    ignored: contact.ignored,
    aiPaused: contact.aiPaused,
    category: session.category,
    categorySource: session.categorySource,
    humanHandling: session.humanHandling,
    inboundVersion: session.inboundVersion,
    startedAt: session.startedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    contextResetAt: session.contextResetAt?.toISOString() ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
