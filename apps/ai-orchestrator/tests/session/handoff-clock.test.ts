import { describe, expect, it, vi } from "vitest";

import { HandoffService } from "../../src/modules/handoff/HandoffService.js";

/**
 * Prisma em dobro, reduzido ao que a pausa le e escreve.
 *
 * O ponto do teste e o relogio: `handoffPausedUntil` vencido nao pode devolver
 * a conversa a IA enquanto o humano ainda esta atendendo dentro da sessao.
 */
function fakePrisma(conversation: {
  id: string;
  humanHandoff: boolean;
  handoffPausedUntil: Date | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    prisma: {
      conversation: {
        findUnique: async () => conversation,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return conversation;
        },
      },
    } as never,
  };
}

const scope = { tenantId: "tenant-1", channelId: "channel-1" };
const past = new Date("2026-09-07T09:00:00.000Z");
const now = new Date("2026-09-07T10:00:00.000Z");

describe("relogio da pausa e sessao", () => {
  it("nao devolve a conversa a IA enquanto o humano atende na sessao vigente", async () => {
    const store = fakePrisma({
      id: "conversation-1",
      humanHandoff: true,
      handoffPausedUntil: past,
    });
    const sessions = {
      isHumanControlActive: vi.fn().mockResolvedValue(true),
    };
    const handoff = new HandoffService(store.prisma, scope, sessions);

    await expect(handoff.isBotPaused("5511999999999", now)).resolves.toBe(true);
    // Nenhuma retomada silenciosa: o estado da conversa nao foi reescrito.
    expect(store.updates).toHaveLength(0);
    expect(sessions.isHumanControlActive).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        conversationId: "conversation-1",
      }),
    );
  });

  it("o relogio vencido volta a valer quando a sessao ja expirou", async () => {
    const store = fakePrisma({
      id: "conversation-1",
      humanHandoff: true,
      handoffPausedUntil: past,
    });
    const sessions = {
      isHumanControlActive: vi.fn().mockResolvedValue(false),
    };
    const handoff = new HandoffService(store.prisma, scope, sessions);

    await expect(handoff.isBotPaused("5511999999999", now)).resolves.toBe(false);
    expect(store.updates).toEqual([
      { humanHandoff: false, status: "ACTIVE", handoffPausedUntil: null },
    ]);
  });

  it("pausa indefinida continua indefinida", async () => {
    const store = fakePrisma({
      id: "conversation-1",
      humanHandoff: true,
      handoffPausedUntil: null,
    });
    const handoff = new HandoffService(store.prisma, scope);

    await expect(handoff.isBotPaused("5511999999999", now)).resolves.toBe(true);
    expect(store.updates).toHaveLength(0);
  });
});
