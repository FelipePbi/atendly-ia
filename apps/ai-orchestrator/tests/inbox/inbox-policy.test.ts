import { describe, expect, it } from "vitest";

import {
  buildConversationKey,
  conversationWindowMs,
  type ConversationWindowPolicy,
  isAmbiguousFirstContact,
  isDeadLettered,
  nextRetryDelayMs,
  sanitizeInboxError,
  technicalEventDisposition,
} from "../../src/modules/inbox/inbox-policy.js";
import {
  classifyEvolutionEvent,
  mapEvolutionReceipt,
} from "../../src/modules/channel/adapters/evolution/EvolutionInboundMapper.js";

const retry = { maxAttempts: 5, baseSeconds: 15, maxSeconds: 900 };

describe("inbox retry policy", () => {
  it("backs off exponentially up to the configured ceiling", () => {
    expect(nextRetryDelayMs(1, retry)).toBe(15_000);
    expect(nextRetryDelayMs(2, retry)).toBe(30_000);
    expect(nextRetryDelayMs(3, retry)).toBe(60_000);
    // O teto existe para que um destino fora do ar não empurre a retomada
    // para daqui a horas.
    expect(nextRetryDelayMs(12, retry)).toBe(900_000);
  });

  it("dead-letters only after the attempt limit", () => {
    expect(isDeadLettered(4, retry)).toBe(false);
    expect(isDeadLettered(5, retry)).toBe(true);
  });

  it("keeps secrets out of the persisted error", () => {
    const sanitized = sanitizeInboxError(
      new Error("send failed apikey=super-secret-value token: abcdef"),
    );
    expect(sanitized).not.toContain("super-secret-value");
    expect(sanitized).toContain("apikey=[redacted]");
    expect(sanitized).toContain("token=[redacted]");
  });

  it("serialises by conversation, not by message", () => {
    const key = buildConversationKey({
      tenantId: "tenant-a",
      channelId: "channel-a",
      externalContactId: "5511999999999",
    });
    expect(key).toBe("tenant-a:channel-a:5511999999999");
  });

  it("discards only high-volume technical noise", () => {
    expect(technicalEventDisposition("Presence")).toBe("discard");
    expect(technicalEventDisposition("ChatPresence")).toBe("discard");
    expect(technicalEventDisposition("Connected")).toBe("record");
    expect(technicalEventDisposition("LoggedOut")).toBe("record");
    expect(technicalEventDisposition("QRCode")).toBe("record");
  });
});

describe("evolution event classification", () => {
  const messageEvent = {
    event: "Message",
    instanceId: "instance-1",
    data: {
      Info: { ID: "3EB0", Chat: "5511999999999@s.whatsapp.net" },
      Message: { conversation: "Oi" },
    },
  };

  it("classifies message events with a stable dedupe key", () => {
    const classification = classifyEvolutionEvent(messageEvent);
    expect(classification.kind).toBe("message");
    expect(classification.eventKey).toBe("evolution-go:instance-1:3EB0");
    expect(classifyEvolutionEvent(messageEvent).eventKey).toBe(
      classification.eventKey,
    );
  });

  it("classifies receipts as reconciliation work", () => {
    const classification = classifyEvolutionEvent({
      event: "Receipt",
      instanceId: "instance-1",
      state: "Delivered",
      data: {
        MessageIDs: ["ai-operation-1"],
        Chat: "5511999999999@s.whatsapp.net",
      },
    });
    expect(classification.kind).toBe("receipt");
    expect(classification.eventKey).toContain("receipt:delivered");
  });

  it("classifies remaining events as technical instead of rejecting them", () => {
    for (const event of ["Presence", "Connected", "QRCode", "LoggedOut"]) {
      const classification = classifyEvolutionEvent({
        event,
        instanceId: "instance-1",
        data: { Timestamp: "2026-09-07T12:00:00Z" },
      });
      expect(classification.kind).toBe("technical");
      expect(classification.eventKey).toContain(event);
    }
  });

  it("still refuses payloads that are not readable events", () => {
    expect(classifyEvolutionEvent(null).kind).toBe("invalid");
    expect(classifyEvolutionEvent({}).kind).toBe("invalid");
    expect(classifyEvolutionEvent({ event: "Message" }).reason).toBe(
      "missing_instance_id",
    );
  });

  it("maps Delivered and Read receipts to the transport ids they acknowledge", () => {
    const delivered = mapEvolutionReceipt({
      event: "Receipt",
      instanceId: "instance-1",
      state: "Delivered",
      data: { MessageIDs: ["op-1", "op-2"], Chat: "551199@s.whatsapp.net" },
    });
    expect(delivered).toMatchObject({
      state: "delivered",
      messageIds: ["op-1", "op-2"],
    });

    const read = mapEvolutionReceipt({
      event: "Receipt",
      instanceId: "instance-1",
      state: "ReadSelf",
      data: { MessageIDs: ["op-1"] },
    });
    expect(read?.state).toBe("read");

    expect(
      mapEvolutionReceipt({
        event: "Receipt",
        instanceId: "instance-1",
        state: "Delivered",
        data: {},
      }),
    ).toBeNull();
  });
});

// Janela da conversa: a politica adaptativa de fragmentos e a espera da
// mensagem ambigua exigidas pelo item 2 do Goal004, calculadas fora do banco
// para que os degraus fiquem legiveis. O efeito sobre a inbox persistida esta
// em tests/integration/transport-durability.test.ts.
describe("conversation window policy", () => {
  const policy: ConversationWindowPolicy = {
    minSeconds: 8,
    maxSeconds: 35,
    maxWaitSeconds: 60,
    ambiguousSeconds: 120,
    ambiguousMaxWaitSeconds: 300,
  };
  const now = new Date("2026-09-07T12:00:00.000Z");
  const base = {
    firstEventAt: now,
    firstContact: false,
    now,
    policy,
  };

  it("waits the minimum for a single short fragment", () => {
    expect(
      conversationWindowMs({
        ...base,
        text: "quero marcar",
        pendingFragments: 1,
      }),
    ).toBe(8_000);
  });

  it("extends the window for long text or several fragments", () => {
    expect(
      conversationWindowMs({
        ...base,
        text: "a".repeat(120),
        pendingFragments: 1,
      }),
    ).toBe(12_000);
    expect(
      conversationWindowMs({
        ...base,
        text: "curto",
        pendingFragments: 2,
      }),
    ).toBe(12_000);
    expect(
      conversationWindowMs({
        ...base,
        text: "a".repeat(300),
        pendingFragments: 1,
      }),
    ).toBe(18_000);
    expect(
      conversationWindowMs({
        ...base,
        text: "curto",
        pendingFragments: 4,
      }),
    ).toBe(18_000);
  });

  it("shortens the window when the person is chasing an answer", () => {
    expect(
      conversationWindowMs({
        ...base,
        text: "???",
        pendingFragments: 3,
      }),
    ).toBe(4_000);
  });

  it("never pushes the answer past the max wait since the first fragment", () => {
    // Sequencia longa: a janela continua sendo recalculada, mas o limite desde
    // o primeiro fragmento e o que decide.
    expect(
      conversationWindowMs({
        ...base,
        text: "a".repeat(300),
        pendingFragments: 5,
        firstEventAt: new Date(now.getTime() - 55_000),
      }),
    ).toBe(5_000);
    expect(
      conversationWindowMs({
        ...base,
        text: "a".repeat(300),
        pendingFragments: 5,
        firstEventAt: new Date(now.getTime() - 90_000),
      }),
    ).toBe(0);
  });

  it("waits about two minutes for the first ambiguous message of a new contact", () => {
    const input = {
      ...base,
      text: "Oi",
      pendingFragments: 1,
      firstContact: true,
    };
    expect(isAmbiguousFirstContact(input)).toBe(true);
    expect(conversationWindowMs(input)).toBe(120_000);
    // Conta desde o primeiro evento, nao desde agora.
    expect(
      conversationWindowMs({
        ...input,
        firstEventAt: new Date(now.getTime() - 90_000),
      }),
    ).toBe(30_000);
  });

  it("caps the ambiguous wait at the configured maximum since the first message", () => {
    const input = {
      ...base,
      text: "bom dia",
      pendingFragments: 1,
      firstContact: true,
      policy: { ...policy, ambiguousSeconds: 600 },
    };
    expect(conversationWindowMs(input)).toBe(300_000);
    expect(
      conversationWindowMs({
        ...input,
        firstEventAt: new Date(now.getTime() - 400_000),
      }),
    ).toBe(0);
  });

  it("stops waiting once the person says what they want", () => {
    // Segundo fragmento, contato conhecido ou pedido explicito: nao e mais
    // mensagem ambigua e a janela volta a ser de fragmento.
    expect(
      isAmbiguousFirstContact({
        text: "Oi",
        pendingFragments: 2,
        firstContact: true,
      }),
    ).toBe(false);
    expect(
      isAmbiguousFirstContact({
        text: "Oi",
        pendingFragments: 1,
        firstContact: false,
      }),
    ).toBe(false);
    expect(
      isAmbiguousFirstContact({
        text: "oi, queria marcar amanha",
        pendingFragments: 1,
        firstContact: true,
      }),
    ).toBe(false);
    expect(
      conversationWindowMs({
        ...base,
        text: "Oi",
        pendingFragments: 2,
        firstContact: true,
      }),
    ).toBe(12_000);
  });

  it("extends the ambiguous wait while the next fragments stay ambiguous", () => {
    // "oi" ... "bom dia": a pessoa ainda nao disse o que quer, entao a espera
    // recomeca a partir do fragmento novo em vez de responder saudacao com
    // saudacao.
    const input = {
      ...base,
      text: "bom dia",
      pendingTexts: ["oi", "bom dia"],
      pendingFragments: 2,
      firstContact: true,
      firstEventAt: new Date(now.getTime() - 110_000),
    };
    expect(isAmbiguousFirstContact(input)).toBe(true);
    expect(conversationWindowMs(input)).toBe(120_000);
  });

  it("stops extending at the configured ceiling since the first message", () => {
    const input = {
      ...base,
      text: "opa",
      pendingTexts: ["oi", "ola", "opa"],
      pendingFragments: 3,
      firstContact: true,
      // Teto de 300 s: faltam 40 s, e nao os 120 s da espera reiniciada.
      firstEventAt: new Date(now.getTime() - 260_000),
    };
    expect(conversationWindowMs(input)).toBe(40_000);
    expect(
      conversationWindowMs({
        ...input,
        firstEventAt: new Date(now.getTime() - 320_000),
      }),
    ).toBe(0);
  });

  it("goes back to the fragment window as soon as one fragment says something", () => {
    const input = {
      ...base,
      text: "queria marcar amanha",
      pendingTexts: ["oi", "queria marcar amanha"],
      pendingFragments: 2,
      firstContact: true,
    };
    expect(isAmbiguousFirstContact(input)).toBe(false);
    expect(conversationWindowMs(input)).toBe(12_000);
  });

  it("recognises composed greetings as ambiguous, not as a request", () => {
    expect(
      isAmbiguousFirstContact({
        text: "oi bom dia",
        pendingFragments: 1,
        firstContact: true,
      }),
    ).toBe(true);
    expect(
      isAmbiguousFirstContact({
        text: "ola tudo bem?",
        pendingFragments: 1,
        firstContact: true,
      }),
    ).toBe(true);
  });
});
