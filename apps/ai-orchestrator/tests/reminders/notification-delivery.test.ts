import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import {
  NotificationDeliveryService,
  type NotificationSettlementPort,
} from "../../src/modules/reminders/NotificationDeliveryService.js";
import type {
  ClaimedNotificationIntent,
  NotificationFacts,
} from "../../src/modules/scheduling-service/types.js";
import type { SessionSnapshot } from "../../src/modules/session/SessionService.js";

const CORRELATION_ID = "notify:appointment-a:REMINDER:FIRST:v3";

function facts(overrides: Partial<NotificationFacts> = {}): NotificationFacts {
  return {
    kind: "REMINDER",
    appointmentStatus: "CONFIRMED",
    customerId: "customer-a",
    customerName: "Ana",
    customerPhone: "5511999999999",
    services: ["Corte"],
    title: null,
    timezone: "America/Sao_Paulo",
    date: "2026-09-16",
    time: "14:30",
    startAt: "2026-09-16T17:30:00.000Z",
    price: null,
    confirmationRequested: true,
    ...overrides,
  };
}

function intent(
  overrides: Partial<ClaimedNotificationIntent> = {},
): ClaimedNotificationIntent {
  return {
    id: "intent-a",
    tenantId: "tenant-a",
    appointmentId: "appointment-a",
    kind: "REMINDER",
    slot: "FIRST",
    appointmentVersion: 3,
    dueAt: "2026-09-15T17:30:00.000Z",
    attemptCount: 0,
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-09-15T17:32:00.000Z",
    // Deterministico a partir da identidade da intencao: e o dono quem o
    // deriva, e ele nao muda entre duas reivindicacoes da mesma intencao.
    correlationId: CORRELATION_ID,
    facts: facts(),
    ...overrides,
  };
}

interface StoredMessage {
  id: string;
  tenantId: string;
  channelId: string;
  conversationId: string;
  correlationId: string | null;
  externalMessageId: string | null;
  direction: string;
  source: string | null;
  role: string;
  body: string;
  deliveryState: string | null;
  deliveryDetail: string | null;
  deliveryAttempts: number;
}

interface HarnessOptions {
  channelStatus?: string;
  credentialProvisioned?: boolean;
  aiEnabled?: boolean;
  tone?: string;
  ignored?: boolean;
  humanHandling?: boolean;
  send?: () => Promise<{ messageId?: string; raw: unknown }>;
  settle?: NotificationSettlementPort["settleNotificationIntent"];
  seedMessages?: StoredMessage[];
}

function harness(options: HarnessOptions = {}) {
  const messages = new Map<string, StoredMessage>(
    (options.seedMessages ?? []).map((message) => [message.id, message]),
  );
  const conversations = new Map<
    string,
    { id: string; customerName: string | null }
  >();
  // Ordem real das chamadas: e assim que "a saida existe antes do transporte"
  // deixa de ser uma afirmacao e vira observacao.
  const trace: string[] = [];
  let sequence = 0;

  const prisma = {
    channelConnection: {
      findUnique: async () => ({
        id: "channel-a",
        tenantId: "tenant-a",
        provider: "EVOLUTION_GO",
        externalInstanceId: "instance-a",
        status: options.channelStatus ?? "ACTIVE",
        credentialCipher: "sealed",
        credentialVersion: 1,
      }),
    },
    aiTenantConfig: {
      findUnique: async () => ({
        enabled: options.aiEnabled ?? true,
        tone: options.tone ?? "BALANCED",
        settings: {},
      }),
    },
    conversation: {
      upsert: vi.fn(
        async (args: {
          where: {
            tenantId_channelId_externalContactId: {
              tenantId: string;
              channelId: string;
              externalContactId: string;
            };
          };
          create: { customerName: string | null };
        }) => {
          trace.push("conversation.upsert");
          const key =
            args.where.tenantId_channelId_externalContactId.externalContactId;
          const existing = conversations.get(key);
          if (existing) return { ...existing, externalContactId: key };
          const created = {
            id: "conversation-a",
            customerName: args.create.customerName,
          };
          conversations.set(key, created);
          return { ...created, externalContactId: key };
        },
      ),
    },
    message: {
      findUnique: async (args: {
        where: {
          tenantId_channelId_correlationId: { correlationId: string };
        };
      }) => {
        const correlationId =
          args.where.tenantId_channelId_correlationId.correlationId;
        for (const message of messages.values()) {
          if (message.correlationId === correlationId) return message;
        }
        return null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        trace.push("message.create");
        const data = args.data as unknown as StoredMessage;
        for (const message of messages.values()) {
          if (message.correlationId === data.correlationId) {
            throw new AppError("Unique constraint failed.", {
              code: "P2002",
            });
          }
        }
        sequence += 1;
        const created: StoredMessage = {
          ...data,
          id: `message-${sequence}`,
          deliveryAttempts: 0,
          deliveryDetail: null,
        };
        messages.set(created.id, created);
        return created;
      },
    },
  };

  const outbox = {
    markSent: vi.fn(async (input: { messageRecordId: string }) => {
      const message = messages.get(input.messageRecordId);
      if (message) {
        message.deliveryState = "SENT";
        message.deliveryDetail = null;
      }
    }),
    markUndelivered: vi.fn(
      async (input: {
        messageRecordId: string;
        state: string;
        detail: string;
      }) => {
        const message = messages.get(input.messageRecordId);
        if (message) {
          message.deliveryState = input.state;
          message.deliveryDetail = input.detail;
          message.deliveryAttempts += 1;
        }
      },
    ),
  };

  const snapshot: SessionSnapshot = {
    contactId: "contact-a",
    sessionId: "session-a",
    externalContactId: "5511999999999",
    ignored: options.ignored ?? false,
    aiPaused: false,
    category: "UNCLASSIFIED",
    categorySource: "AUTOMATIC",
    humanHandling: options.humanHandling ?? false,
    inboundVersion: 0,
    startedAt: "2026-09-15T00:00:00.000Z",
    expiresAt: "2026-09-16T00:00:00.000Z",
    contextResetAt: null,
  };
  const sessions = {
    resolveContext: vi.fn(async () => {
      trace.push("sessions.resolveContext");
      return snapshot;
    }),
  };

  // Transporte duble em toda a suite: nenhuma mensagem sai para um numero
  // real, e o gate operacional deste Goal continua declarado.
  const send =
    options.send ?? (async () => ({ messageId: "wa-1", raw: { ok: true } }));
  const sendText = vi.fn(async () => {
    trace.push("provider.sendText");
    return send();
  });

  const settleNotificationIntent = vi.fn(
    options.settle ?? (async () => ({ applied: true })),
  );

  const service = new NotificationDeliveryService({
    prisma: prisma as never,
    settlement: { settleNotificationIntent } as NotificationSettlementPort,
    sessions,
    channels: {
      resolveChannelCredential: () => {
        if (options.credentialProvisioned === false) {
          throw new AppError("Channel credential is not provisioned.", {
            statusCode: 409,
            code: "CHANNEL_CREDENTIAL_NOT_PROVISIONED",
          });
        }
        return "wa_credential";
      },
    },
    outbox,
    providerFactory: () => ({ sendText: sendText as never }),
  });

  return {
    service,
    messages,
    trace,
    outbox,
    sessions,
    sendText,
    settleNotificationIntent,
    prisma,
  };
}

describe("notification delivery", () => {
  it("dismisses the intent with a reason when the contact is ignored", async () => {
    const world = harness({ ignored: true });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("DISMISSED");
    expect(outcome.reason).toBe("CONTACT_IGNORED");
    expect(world.sendText).not.toHaveBeenCalled();
    expect(world.messages.size).toBe(0);
    expect(world.settleNotificationIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: "intent-a",
        leaseToken: "lease-1",
        outcome: "DISMISSED",
        reason: "CONTACT_IGNORED",
      }),
    );
  });

  it("fails auditably with a reason when the tenant channel is not connected", async () => {
    const world = harness({ channelStatus: "DISCONNECTED" });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toBe("CHANNEL_NOT_CONNECTED");
    expect(outcome.detail).toBeTruthy();
    expect(world.sendText).not.toHaveBeenCalled();
  });

  it("treats a channel without a projected credential as not connected", async () => {
    const world = harness({ credentialProvisioned: false });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toBe("CHANNEL_NOT_CONNECTED");
  });

  it("dismisses the intent with a reason when the AI is not enabled", async () => {
    const world = harness({ aiEnabled: false });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("DISMISSED");
    expect(outcome.reason).toBe("AI_NOT_ENABLED");
    expect(world.sendText).not.toHaveBeenCalled();
    expect(world.messages.size).toBe(0);
  });

  it("dispensa por IA desligada mesmo sem canal, sem inventar falha operacional", async () => {
    // Goal025/WU-04: e o estado da conta cujo dono pediu a exclusao — a IA
    // desligada e o canal derrubado na mesma passada. A aptidao da IA e
    // avaliada primeiro, entao a intencao pendente termina DISMISSED com
    // AI_NOT_ENABLED, do vocabulario fechado vigente, e nao FAILED com
    // CHANNEL_NOT_CONNECTED — que viraria alerta REMINDER_FAILED na central
    // contra uma conta que esta desligada porque assim foi pedido.
    const world = harness({ aiEnabled: false, channelStatus: "DISCONNECTED" });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("DISMISSED");
    expect(outcome.reason).toBe("AI_NOT_ENABLED");
    expect(world.sendText).not.toHaveBeenCalled();
    expect(world.settleNotificationIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "DISMISSED",
        reason: "AI_NOT_ENABLED",
      }),
    );
  });

  it("writes the same factual body in the three styles", async () => {
    const bodies = new Map<string, string>();
    for (const tone of ["PROFESSIONAL", "BALANCED", "CASUAL"]) {
      const world = harness({ tone });
      await world.service.deliver(intent());
      const [message] = [...world.messages.values()];
      bodies.set(tone, message.body);
    }

    expect(bodies.size).toBe(3);
    for (const body of bodies.values()) {
      // Data e hora saem prontas da intencao, iguais nos tres.
      expect(body).toContain("no dia 2026-09-16 às 14:30");
      expect(body).toContain("Corte");
    }
    expect(new Set(bodies.values()).size).toBe(3);
  });

  it("persists the outbound row before calling the transport", async () => {
    const world = harness();

    await world.service.deliver(intent());

    expect(world.trace.indexOf("message.create")).toBeGreaterThanOrEqual(0);
    expect(world.trace.indexOf("message.create")).toBeLessThan(
      world.trace.indexOf("provider.sendText"),
    );
    const [message] = [...world.messages.values()];
    expect(message.correlationId).toBe(CORRELATION_ID);
    expect(message.direction).toBe("OUTBOUND");
    expect(message.source).toBe("AI");
    expect(message.deliveryState).toBe("SENT");
  });

  it("does not produce a second message when the intent is claimed again after a failure before settlement", async () => {
    // Primeira volta: entrega acontece e a liquidacao cai — exatamente a
    // janela em que o processo morre depois de enviar.
    const first = harness({
      settle: async () => {
        throw new AppError("upstream is down", { statusCode: 503 });
      },
    });
    await first.service.deliver(intent());
    expect(first.sendText).toHaveBeenCalledTimes(1);
    expect(first.messages.size).toBe(1);

    // Segunda volta: o lease venceu, o dono devolveu a intencao e ela foi
    // reivindicada de novo — com o MESMO `correlationId` deterministico.
    const stored = [...first.messages.values()];
    const second = harness({ seedMessages: stored });
    const outcome = await second.service.deliver(intent());

    expect(second.sendText).not.toHaveBeenCalled();
    expect(second.messages.size).toBe(1);
    expect(outcome.deduplicated).toBe(true);
    expect(outcome.outcome).toBe("SENT");
    expect(outcome.correlationId).toBe(CORRELATION_ID);
  });

  it("does not resend when a previous attempt exists whose delivery cannot be asserted", async () => {
    const world = harness({
      seedMessages: [
        {
          id: "message-1",
          tenantId: "tenant-a",
          channelId: "channel-a",
          conversationId: "conversation-a",
          correlationId: CORRELATION_ID,
          externalMessageId: CORRELATION_ID,
          direction: "OUTBOUND",
          source: "AI",
          role: "assistant",
          body: "lembrete",
          deliveryState: "UNKNOWN",
          deliveryDetail: "transport_timeout",
          deliveryAttempts: 1,
        },
      ],
    });

    const outcome = await world.service.deliver(intent());

    expect(world.sendText).not.toHaveBeenCalled();
    expect(world.messages.size).toBe(1);
    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toBe("TRANSPORT_UNKNOWN");
    // A tentativa continua la: nada foi apagado.
    expect(world.messages.get("message-1")?.deliveryState).toBe("UNKNOWN");
  });

  it("does not take human control of the session", async () => {
    const world = harness();

    await world.service.deliver(intent());

    const snapshot = await world.sessions.resolveContext();
    expect(snapshot.humanHandling).toBe(false);
    // A porta que a entrega recebe nao tem como assumir o atendimento.
    expect(Object.keys(world.sessions).includes("assumeHumanControl")).toBe(
      false,
    );
  });

  it("resolves contact and conversation through the inbound path", async () => {
    const world = harness();

    await world.service.deliver(intent());

    expect(world.prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_channelId_externalContactId: {
            tenantId: "tenant-a",
            channelId: "channel-a",
            externalContactId: "5511999999999",
          },
        },
      }),
    );
    expect(world.sessions.resolveContext).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-a",
        externalContactId: "5511999999999",
      }),
    );
    // A conversa e resolvida antes da sessao, como no processamento de entrada.
    expect(world.trace.indexOf("conversation.upsert")).toBeLessThan(
      world.trace.indexOf("sessions.resolveContext"),
    );
  });

  it("classifies a refused transport as a failure and keeps the attempt", async () => {
    const world = harness({
      send: async () => {
        throw new AppError("Evolution refused the message.", {
          statusCode: 422,
          code: "EVOLUTION_SEND_FAILED",
        });
      },
    });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toBe("TRANSPORT_FAILED");
    expect(outcome.detail).toBe("transport_rejected_http_422");
    expect(world.outbox.markUndelivered).toHaveBeenCalledWith(
      expect.objectContaining({ state: "FAILED" }),
    );
    // A tentativa nao e apagada.
    const [message] = [...world.messages.values()];
    expect(message.deliveryState).toBe("FAILED");
    expect(message.deliveryDetail).toBe("transport_rejected_http_422");
  });

  it("classifies an unprovable transport outcome as unknown, never as delivered", async () => {
    const world = harness({
      send: async () => {
        throw new AppError("Evolution timed out.", {
          statusCode: 504,
          code: "EVOLUTION_SEND_TIMEOUT",
        });
      },
    });

    const outcome = await world.service.deliver(intent());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toBe("TRANSPORT_UNKNOWN");
    const [message] = [...world.messages.values()];
    expect(message.deliveryState).toBe("UNKNOWN");
  });

  it("dismisses a customer phone that is not a dialable number", async () => {
    const world = harness();

    const outcome = await world.service.deliver(
      intent({ facts: facts({ customerPhone: "n/d" }) }),
    );

    expect(outcome.outcome).toBe("DISMISSED");
    expect(outcome.reason).toBe("CUSTOMER_WITHOUT_PHONE");
    expect(world.sendText).not.toHaveBeenCalled();
  });

  /**
   * O gate operacional declarado deste Goal: nenhuma mensagem sai para um
   * numero real. O transporte e sempre duble, e nenhuma suite afirma que o
   * WhatsApp recebeu coisa alguma.
   */
  it("never asserts that the real WhatsApp received a message", () => {
    for (const file of [
      "notification-delivery.test.ts",
      "notification-delivery-worker.test.ts",
      "notification-message.test.ts",
    ]) {
      const source = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      );
      // Montados por concatenacao de proposito: escritos inteiros, eles
      // apareceriam neste proprio arquivo e a busca se acharia sozinha.
      for (const forbidden of [
        `Evolution${"Provider"}`,
        `EVOLUTION_${"BASE_URL"}`,
        `fetch${"("}`,
        `und${"ici"}`,
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("does not take the owner message path, which assumes human control", () => {
    // Sem comentarios: o servico **documenta** por que nao usa a rota da
    // profissional, e a documentacao nao pode reprovar a propria prova.
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/modules/reminders/NotificationDeliveryService.ts",
          import.meta.url,
        ),
      ),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");

    expect(source).not.toContain("assumeHumanControl");
    expect(source).not.toContain("/internal/conversations/");
    expect(source).not.toContain("HandoffService");
  });
});
