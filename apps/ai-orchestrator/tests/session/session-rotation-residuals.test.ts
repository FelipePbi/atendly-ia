import { describe, expect, it } from "vitest";

import { SessionService } from "../../src/modules/session/SessionService.js";
import { createFakePrisma } from "./support/fake-prisma.js";

/**
 * Resíduos do Goal005 verificados na rotação de sessão.
 *
 * 1. quando o espelho legado (`Conversation.humanHandoff`) é limpo porque uma
 *    sessão nova nasceu, o handoff `OPEN` daquela conversa também é resolvido —
 *    sem isso a fila de atendimento humano acusava pendência para sempre;
 * 2. uma segunda abertura concorrente da mesma conversa não duplica sessão: o
 *    índice único parcial em SQL faz a inserção falhar e o serviço absorve o
 *    conflito relendo a sessão que venceu.
 */

const TENANT = "tenant-1";
const CHANNEL = "channel-1";
const CONVERSATION = "conversation-1";
const CONTACT_PHONE = "5511999999999";

function subject() {
  const { store, prisma } = createFakePrisma();
  store.conversation.rows.push({
    id: CONVERSATION,
    tenantId: TENANT,
    channelId: CHANNEL,
    externalContactId: CONTACT_PHONE,
    customerName: "Maria",
    status: "HUMAN_HANDOFF",
    humanHandoff: true,
    handoffPausedUntil: null,
    contactId: null,
    state: {},
  });
  return {
    store,
    prisma,
    sessions: new SessionService(prisma, { inactivitySeconds: 60 }),
  };
}

const scope = {
  tenantId: TENANT,
  channelId: CHANNEL,
  conversationId: CONVERSATION,
  externalContactId: CONTACT_PHONE,
  customerName: "Maria",
};

describe("session rotation residuals", () => {
  it("resolves the OPEN handoff when the legacy mirror is cleared", async () => {
    const { store, sessions } = subject();
    store.handoff.rows.push({
      id: "handoff-1",
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT_PHONE,
      reason: "OWNER_TAKEOVER",
      status: "OPEN",
      resolvedAt: null,
    });

    await sessions.resolveContext(scope);

    const handoff = store.handoff.rows[0];
    expect(handoff.status).toBe("RESOLVED");
    expect(handoff.resolvedAt).toBeInstanceOf(Date);
    expect(store.conversation.rows[0].humanHandoff).toBe(false);
  });

  it("leaves the handoff open when the mirror was not cleared", async () => {
    const { store, sessions } = subject();
    // Pausa explícita do contato atravessa a troca de sessão: o espelho fica
    // como está, e o handoff também.
    store.conversation.rows[0].humanHandoff = true;
    store.handoff.rows.push({
      id: "handoff-1",
      tenantId: TENANT,
      channelId: CHANNEL,
      conversationId: CONVERSATION,
      externalContactId: CONTACT_PHONE,
      reason: "OWNER_TAKEOVER",
      status: "OPEN",
      resolvedAt: null,
    });
    store.contact.rows.push({
      id: "contact-existing",
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: CONTACT_PHONE,
      displayName: "Maria",
      ignored: false,
      aiPaused: true,
      categoryOverride: null,
      categoryOverrideAt: null,
      categoryOverrideBy: null,
    });

    await sessions.resolveContext(scope);

    expect(store.handoff.rows[0].status).toBe("OPEN");
    expect(store.conversation.rows[0].humanHandoff).toBe(true);
  });

  it("absorbs a concurrent second open session instead of duplicating it", async () => {
    const { store, prisma, sessions } = subject();
    // Simula o índice único parcial: a segunda abertura concorrente perde.
    const table = prisma.conversationSession as unknown as {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
    const original = table.create.bind(table);
    let attempted = false;
    table.create = async (args) => {
      if (attempted) return original(args);
      attempted = true;
      await original({ data: { ...args.data, id: "session-winner" } });
      const error = new Error("unique violation") as Error & { code: string };
      error.code = "P2002";
      throw error;
    };

    const snapshot = await sessions.resolveContext(scope);

    expect(snapshot.sessionId).toBe("session-winner");
    expect(
      store.conversationSession.rows.filter((row) => row.endedAt == null),
    ).toHaveLength(1);
  });
});
