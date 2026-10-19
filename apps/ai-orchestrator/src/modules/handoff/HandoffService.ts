import type { PrismaClient } from "../../generated/prisma/client.js";
import { messageCorrelationIdOf } from "../outbox/message-dispatch.js";

export const BOT_OFF_PAUSE_UNTIL = new Date("9999-12-31T23:59:59.000Z");

export interface HandoffPauseInput {
  phone: string;
  reason: string;
  summary?: string;
  pauseUntil?: Date | null;
}

export interface BotPauseContext {
  phone: string;
  reason?: string;
  summary?: string | null;
  pauseUntil?: Date | null;
  handoffId?: string;
}

export interface HandoffTenantScope {
  tenantId: string;
  channelId: string;
}

/** Motivo gravado pela rota de takeover do dono (`/internal/conversations/:id/takeover`). */
export const OWNER_TAKEOVER_REASON = "OWNER_TAKEOVER";

export interface ConversationAwaitingHuman {
  conversationId: string;
  /**
   * Nome do contato quando a conversa ja tem um, e `null` quando nao tem.
   *
   * **Nunca o telefone**, nem cru nem formatado: esta leitura atravessa a
   * fronteira interna e alimenta `payload` de notificacao persistida, onde
   * telefone nao pode entrar (Goal022 criterio 5). Sem nome, quem exibe usa a
   * frase generica da especie; a identificacao completa continua na tela de
   * Conversas, que le a conversa direto.
   */
  contactName: string | null;
  reason: string;
  openedAt: Date;
}

/**
 * Quem esta aguardando humano, por tenant (Goal022/WU-02).
 *
 * `pauseForHuman` cria uma linha `Handoff` OPEN sem checar se ja existe uma
 * para a mesma conversa, entao pode haver mais de uma. Aqui elas colapsam em
 * **uma** entrada por conversa, pela mais antiga: e o instante em que a
 * conversa comecou a esperar, nao o da ultima tentativa. Handoff de takeover
 * do dono (`OWNER_TAKEOVER`) nunca e a fonte da entrada, porque a profissional
 * assumindo a conversa nao e cliente esperando por ela.
 */
export async function listConversationsAwaitingHuman(
  prisma: PrismaClient,
  tenantId: string,
  limit: number,
): Promise<ConversationAwaitingHuman[]> {
  const handoffs = await prisma.handoff.findMany({
    where: {
      tenantId,
      status: "OPEN",
      conversationId: { not: null },
      reason: { not: OWNER_TAKEOVER_REASON },
    },
    orderBy: { createdAt: "asc" },
    include: {
      conversation: { select: { customerName: true } },
    },
  });

  const byConversation = new Map<string, ConversationAwaitingHuman>();
  for (const handoff of handoffs) {
    const conversationId = handoff.conversationId;
    if (!conversationId || byConversation.has(conversationId)) continue;
    byConversation.set(conversationId, {
      conversationId,
      contactName: contactName(handoff.conversation?.customerName ?? null),
      reason: handoff.reason,
      openedAt: handoff.createdAt,
    });
  }

  return [...byConversation.values()].slice(0, limit);
}

/**
 * Nome quando existe, `null` quando nao.
 *
 * Diferente das telas de Conversas, esta leitura **nao** cai no telefone
 * formatado como identificacao alternativa. A tela mostra telefone porque o
 * dono ja esta olhando a propria conversa; aqui o valor sai do servico, cruza
 * o BFF e fica gravado em `TenantNotification.payload` — e telefone gravado
 * continua sendo telefone, formatado ou nao.
 */
function contactName(customerName: string | null): string | null {
  const trimmed = customerName?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Leitura de sessao usada pela pausa.
 *
 * Existe para que o relogio de `handoffPausedUntil` deixe de significar
 * "retorno silencioso": dentro de uma sessao viva com humano atendendo, o
 * vencimento do relogio nao devolve a conversa a IA.
 */
export interface HandoffSessionReader {
  isHumanControlActive(input: {
    tenantId: string;
    conversationId: string;
    now?: Date;
  }): Promise<boolean>;
}

export class HandoffService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scope: HandoffTenantScope,
    private readonly sessions?: HandoffSessionReader,
  ) {}

  async isBotPaused(phone: string, now = new Date()): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_externalContactId: {
          ...this.scope,
          externalContactId: phone,
        },
      },
    });

    if (!conversation?.humanHandoff) return false;
    if (!conversation.handoffPausedUntil) return true;
    if (conversation.handoffPausedUntil > now) return true;

    // O relogio venceu. Ele so vale como expiracao da sessao: se o humano
    // ainda esta atendendo dentro de uma sessao viva, a IA nao volta sozinha —
    // volta por `Retomar IA` explicito.
    const humanStillHandling = await this.sessions?.isHumanControlActive({
      tenantId: this.scope.tenantId,
      conversationId: conversation.id,
      now,
    });
    if (humanStillHandling) return true;

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        humanHandoff: false,
        status: "ACTIVE",
        handoffPausedUntil: null,
      },
    });
    return false;
  }

  async getBotPauseContext(phone: string): Promise<BotPauseContext | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_externalContactId: {
          ...this.scope,
          externalContactId: phone,
        },
      },
      include: {
        handoffs: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!conversation?.humanHandoff) return null;

    const handoff = conversation.handoffs[0];
    return {
      phone,
      reason: handoff?.reason,
      summary: handoff?.summary,
      pauseUntil: conversation.handoffPausedUntil,
      handoffId: handoff?.id,
    };
  }

  async isBotOutboundMessage(messageId: string): Promise<boolean> {
    const message = await this.prisma.message.findUnique({
      where: {
        tenantId_channelId_externalMessageId: {
          ...this.scope,
          externalMessageId: messageId,
        },
      },
    });
    if (message) return message.direction === "OUTBOUND";

    // Eco de mensagem da plataforma pela `correlationId` da linha (D-208). As
    // partes anteriores a ultima saem como `<correlationId>-p<n>` — resposta
    // da IA (`ai-...`), lembrete e aviso (`notify:...`) e retorno
    // (`return:...`) — e a ultima com o proprio `correlationId`, que a linha
    // da IA so ganha como `externalMessageId` depois de marcada enviada: o eco
    // pode chegar antes. Sem isto, parte da plataforma viraria atividade
    // manual e poria a conversa em "Você atendendo".
    const sent = await this.prisma.message.findUnique({
      where: {
        tenantId_channelId_correlationId: {
          ...this.scope,
          correlationId: messageCorrelationIdOf(messageId),
        },
      },
    });
    return sent?.direction === "OUTBOUND";
  }

  async pauseForHuman(input: HandoffPauseInput): Promise<void> {
    const conversation = await this.prisma.conversation.upsert({
      where: {
        tenantId_channelId_externalContactId: {
          ...this.scope,
          externalContactId: input.phone,
        },
      },
      update: {
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: input.pauseUntil ?? null,
      },
      create: {
        ...this.scope,
        externalContactId: input.phone,
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        handoffPausedUntil: input.pauseUntil ?? null,
        state: {},
      },
    });

    await this.prisma.handoff.create({
      data: {
        ...this.scope,
        conversationId: conversation.id,
        externalContactId: input.phone,
        reason: input.reason,
        summary: input.summary ?? null,
        status: "OPEN",
      },
    });
  }

  async pauseIndefinitely(
    phone: string,
    reason: string,
    summary?: string,
  ): Promise<void> {
    await this.pauseForHuman({
      phone,
      reason,
      summary,
      pauseUntil: BOT_OFF_PAUSE_UNTIL,
    });
  }

  async resumeBot(phone: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_channelId_externalContactId: {
          ...this.scope,
          externalContactId: phone,
        },
      },
    });

    const resolvedAt = new Date();

    if (conversation) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          humanHandoff: false,
          status: "ACTIVE",
          handoffPausedUntil: null,
        },
      });
    }

    await this.prisma.handoff.updateMany({
      where: {
        ...this.scope,
        externalContactId: phone,
        status: "OPEN",
      },
      data: {
        status: "RESOLVED",
        resolvedAt,
      },
    });
  }
}
