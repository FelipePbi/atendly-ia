import type { PrismaClient } from "../../generated/prisma/client.js";

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

    return message?.direction === "OUTBOUND";
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
