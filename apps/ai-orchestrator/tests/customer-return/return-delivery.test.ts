import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../src/lib/errors.js";
import {
  returnDestinationDigits,
  ReturnDeliveryService,
} from "../../src/modules/customer-return/ReturnDeliveryService.js";
import { reconcileReturnReplies } from "../../src/modules/customer-return/ReturnDeliveryWorker.js";
import type {
  ClaimedReturnTarget,
  ReturnFacts,
  SettleReturnTargetInput,
} from "../../src/modules/customer-return/return-types.js";
import type { SessionSnapshot } from "../../src/modules/session/SessionService.js";

/**
 * Entrega da mensagem de retorno (D-206) pelo mesmo caminho dos lembretes:
 * IA e canal do negócio, contato ignorado e conversa pessoal, a lista de
 * validação local, o sandbox do negócio (D-199), o telefone da agenda com ou
 * sem o 9º dígito caindo na conversa que já existe, e a saída gravada antes
 * do transporte com `correlationId` determinístico.
 */

const CORRELATION_ID = "return:target-a:initial";

function facts(overrides: Partial<ReturnFacts> = {}): ReturnFacts {
  return {
    kind: "RENEWAL",
    followUp: false,
    customerId: "customer-a",
    customerName: "Adriana Souza",
    customerPhone: "+55 55 99693-6463",
    serviceName: "Manutenção 5D",
    timezone: "America/Sao_Paulo",
    today: "2026-10-19",
    expectedDate: "2026-10-22",
    intervalDays: 15,
    intervalSource: "SERVICE",
    lastVisitDate: "2026-10-07",
    daysSinceLastVisit: 12,
    offeredSlots: [
      { date: "2026-10-23", time: "17:30" },
      { date: "2026-10-24", time: "18:00" },
    ],
    habit: { weekdays: [5, 6], bandStart: "16:00", bandEnd: "19:00" },
    incentive: null,
    messageTemplate: null,
    ...overrides,
  };
}

function target(
  overrides: Partial<ClaimedReturnTarget> = {},
): ClaimedReturnTarget {
  return {
    id: "target-a",
    tenantId: "tenant-a",
    campaignId: "campaign-a",
    leaseKind: "INITIAL",
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-10-19T12:02:00.000Z",
    correlationId: CORRELATION_ID,
    sentAt: null,
    facts: facts(),
    ...overrides,
  };
}

interface StoredMessage {
  id: string;
  conversationId: string;
  correlationId: string | null;
  direction: string;
  source: string | null;
  role: string;
  body: string;
  deliveryState: string | null;
  createdAt: Date;
}

interface HarnessOptions {
  aiEnabled?: boolean;
  channelStatus?: string;
  ignored?: boolean;
  category?: SessionSnapshot["category"];
  sandbox?: { enabled: boolean; exceptionPhones: string[] };
  existingConversations?: string[];
  seedMessages?: StoredMessage[];
  replyAllowList?: string;
  send?: () => Promise<{ messageId?: string; raw: unknown }>;
}

function harness(options: HarnessOptions = {}) {
  const messages: StoredMessage[] = [...(options.seedMessages ?? [])];
  const conversations = new Map<string, { id: string }>(
    (options.existingConversations ?? []).map((key) => [
      key,
      { id: `conversation-${key}` },
    ]),
  );
  const trace: string[] = [];
  const invitations: Array<Record<string, unknown>> = [];

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
      findUnique: async (args?: { select?: Record<string, boolean> }) => {
        if (args?.select?.sandboxEnabled) {
          return {
            sandboxEnabled: options.sandbox?.enabled ?? false,
            sandboxExceptionPhones: options.sandbox?.exceptionPhones ?? [],
            sandboxUpdatedAt: null,
          };
        }
        return {
          enabled: options.aiEnabled ?? true,
          tone: "BALANCED",
          settings: {},
        };
      },
    },
    conversation: {
      findMany: async (args: {
        where: { externalContactId: { in: string[] } };
      }) =>
        args.where.externalContactId.in
          .filter((key) => conversations.has(key))
          .map((key) => ({ externalContactId: key })),
      upsert: async (args: {
        where: {
          tenantId_channelId_externalContactId: { externalContactId: string };
        };
      }) => {
        const key =
          args.where.tenantId_channelId_externalContactId.externalContactId;
        trace.push(`conversation:${key}`);
        const existing = conversations.get(key) ?? {
          id: `conversation-${key}`,
        };
        conversations.set(key, existing);
        return { ...existing, externalContactId: key, customerName: null };
      },
    },
    message: {
      findMany: async () => [],
      findFirst: async (args: {
        where: { conversationId: string; createdAt: { gt: Date } };
      }) =>
        messages.find(
          (message) =>
            message.direction === "INBOUND" &&
            message.conversationId === args.where.conversationId &&
            message.createdAt > args.where.createdAt.gt,
        ) ?? null,
      findUnique: async (args: {
        where: { tenantId_channelId_correlationId: { correlationId: string } };
      }) =>
        messages.find(
          (message) =>
            message.correlationId ===
            args.where.tenantId_channelId_correlationId.correlationId,
        ) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        trace.push("message.create");
        const data = args.data as unknown as StoredMessage;
        if (messages.some((m) => m.correlationId === data.correlationId)) {
          throw new AppError("Unique constraint failed.", { code: "P2002" });
        }
        const created = {
          ...data,
          id: `message-${messages.length + 1}`,
          createdAt: new Date(),
        };
        messages.push(created);
        return created;
      },
    },
    contact: {},
    returnInvitation: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        invitations.push(args.create);
        return args.create;
      },
      updateMany: async () => ({ count: 1 }),
    },
  };

  const snapshot = (externalContactId: string): SessionSnapshot => ({
    contactId: "contact-a",
    sessionId: "session-a",
    externalContactId,
    ignored: options.ignored ?? false,
    aiPaused: false,
    category: options.category ?? "UNCLASSIFIED",
    categorySource: "AUTOMATIC",
    humanHandling: false,
    inboundVersion: 0,
    startedAt: "2026-10-19T00:00:00.000Z",
    expiresAt: "2026-10-20T00:00:00.000Z",
    contextResetAt: null,
  });
  const sessions = {
    resolveContext: vi.fn(async (scope: { externalContactId: string }) =>
      snapshot(scope.externalContactId),
    ),
  };
  const send =
    options.send ?? (async () => ({ messageId: "wa-1", raw: { ok: true } }));
  const sendText = vi.fn(async (input: { to: string; text: string }) => {
    trace.push(`send:${input.to}`);
    return send();
  });
  const settled: SettleReturnTargetInput[] = [];
  const service = new ReturnDeliveryService({
    prisma: prisma as never,
    settlement: {
      settleReturnTarget: async (input) => {
        settled.push(input);
      },
    },
    sessions,
    channels: { resolveChannelCredential: () => "wa_credential" },
    outbox: {
      markSent: vi.fn(async (input: { messageRecordId: string }) => {
        const message = messages.find((m) => m.id === input.messageRecordId);
        if (message) message.deliveryState = "SENT";
      }),
      markUndelivered: vi.fn(
        async (input: { messageRecordId: string; state: string }) => {
          const message = messages.find((m) => m.id === input.messageRecordId);
          if (message) message.deliveryState = input.state;
        },
      ),
    },
    // Como o adapter do canal (D-199): o gate do sandbox decide antes do
    // transporte dublê.
    providerFactory: ({ sandbox }) => ({
      sendText: async (input) =>
        (await sandbox.intercept(input)) ?? ((await sendText(input)) as never),
    }),
    replyAllowList: options.replyAllowList ?? "",
  });
  return { service, messages, trace, sendText, settled, invitations };
}

describe("entrega da mensagem de retorno", () => {
  it("grava a saída antes do transporte, envia pela conversa da cliente e liquida SENT com o texto", async () => {
    const world = harness({ existingConversations: ["555596936463"] });

    const outcome = await world.service.deliver(target());

    expect(outcome.outcome).toBe("SENT");
    // A agenda tem o 9º dígito; a conversa que já existe não: o envio cai nela.
    expect(world.trace).toEqual([
      "conversation:555596936463",
      "message.create",
      "send:555596936463",
    ]);
    expect(world.messages[0]).toMatchObject({
      correlationId: CORRELATION_ID,
      direction: "OUTBOUND",
      source: "AI",
      role: "assistant",
      deliveryState: "SENT",
    });
    expect(world.messages[0].body).toContain(
      "Seu atendimento de Manutenção 5D completa 15 dias",
    );
    expect(world.settled).toEqual([
      expect.objectContaining({
        targetId: "target-a",
        leaseToken: "lease-1",
        outcome: "SENT",
        reason: null,
        messageBody: world.messages[0].body,
      }),
    ]);
    // A conversa guarda o que foi oferecido, para a IA continuar dali.
    expect(world.invitations[0]).toMatchObject({
      targetId: "target-a",
      conversationId: "conversation-555596936463",
      kind: "RENEWAL",
      serviceName: "Manutenção 5D",
      expectedDate: "2026-10-22",
    });
  });

  it("telefone da agenda sem DDI ganha o 55", () => {
    expect(returnDestinationDigits("(55) 99693-6463")).toBe("5555996936463");
    expect(returnDestinationDigits("+55 11 98888-0000")).toBe("5511988880000");
  });

  it("modo sandbox (D-199): não sai para a cliente, mas conta como enviada", async () => {
    const world = harness({ sandbox: { enabled: true, exceptionPhones: [] } });

    const outcome = await world.service.deliver(target());

    expect(outcome.outcome).toBe("SENT");
    expect(world.sendText).not.toHaveBeenCalled();
    expect(world.messages[0].deliveryState).toBe("SENT");
  });

  it("IA desligada ou canal fora do ar: adia, sem mensagem", async () => {
    for (const options of [
      { aiEnabled: false },
      { channelStatus: "DISCONNECTED" },
    ]) {
      const world = harness(options);
      const outcome = await world.service.deliver(target());
      expect(outcome).toMatchObject({ outcome: "DEFERRED", reason: null });
      expect(world.messages).toHaveLength(0);
      expect(world.settled[0]).toMatchObject({ outcome: "DEFERRED" });
    }
  });

  it("contato ignorado, conversa pessoal e número fora da lista local: pula com motivo", async () => {
    const cases: Array<[HarnessOptions, string]> = [
      [{ ignored: true }, "CONTACT_IGNORED"],
      [{ category: "PERSONAL" }, "PERSONAL_CONTACT"],
      [{ replyAllowList: "5511000000000" }, "NOT_ALLOWED_LOCALLY"],
    ];
    for (const [options, reason] of cases) {
      const world = harness(options);
      const outcome = await world.service.deliver(target());
      expect(outcome).toMatchObject({ outcome: "SKIPPED", reason });
      expect(world.sendText).not.toHaveBeenCalled();
      expect(world.messages).toHaveLength(0);
    }
  });

  it("lembrete único não sai para quem já respondeu", async () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    const world = harness({
      existingConversations: ["555596936463"],
      seedMessages: [
        {
          id: "inbound-1",
          conversationId: "conversation-555596936463",
          correlationId: null,
          direction: "INBOUND",
          source: null,
          role: "user",
          body: "oi! pode ser sexta",
          deliveryState: null,
          createdAt: new Date("2026-10-16T12:00:00.000Z"),
        },
      ],
    });

    const outcome = await world.service.deliver(
      target({
        leaseKind: "FOLLOW_UP",
        correlationId: "return:target-a:followup",
        sentAt: sentAt.toISOString(),
        facts: facts({ followUp: true }),
      }),
    );

    expect(outcome).toMatchObject({ outcome: "SKIPPED", reason: "REPLIED" });
    expect(world.sendText).not.toHaveBeenCalled();
  });

  it("reivindicação repetida depois de uma queda não vira segunda mensagem", async () => {
    const world = harness({
      seedMessages: [
        {
          id: "message-1",
          conversationId: "conversation-a",
          correlationId: CORRELATION_ID,
          direction: "OUTBOUND",
          source: "AI",
          role: "assistant",
          body: "Oi, Adriana!",
          deliveryState: "SENT",
          createdAt: new Date(),
        },
      ],
    });

    const outcome = await world.service.deliver(target());

    expect(outcome).toMatchObject({ outcome: "SENT", deduplicated: true });
    expect(world.sendText).not.toHaveBeenCalled();
  });

  it("transporte que recusa vira falha com motivo, e a saída fica gravada", async () => {
    const world = harness({
      send: async () => {
        throw new AppError("Evolution rejected the message.", {
          statusCode: 400,
          code: "EVOLUTION_SEND_REJECTED",
        });
      },
    });

    const outcome = await world.service.deliver(target());

    expect(outcome.outcome).toBe("FAILED");
    expect(outcome.reason).toMatch(/^TRANSPORT_/u);
    expect(world.messages).toHaveLength(1);
    expect(world.invitations).toHaveLength(0);
  });
});

describe("respostas aos convites", () => {
  it("marca como respondido e relata ao dono quem escreveu depois do envio", async () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    const updates: Array<{ id: string; repliedAt: Date }> = [];
    const prisma = {
      returnInvitation: {
        findMany: async () => [
          {
            id: "invitation-a",
            tenantId: "tenant-a",
            targetId: "target-a",
            conversationId: "conversation-a",
            sentAt,
          },
          {
            id: "invitation-b",
            tenantId: "tenant-a",
            targetId: "target-b",
            conversationId: "conversation-b",
            sentAt,
          },
        ],
        update: async (args: {
          where: { id: string };
          data: { repliedAt: Date };
        }) => {
          updates.push({ id: args.where.id, repliedAt: args.data.repliedAt });
        },
      },
      message: {
        findFirst: async (args: { where: { conversationId: string } }) =>
          args.where.conversationId === "conversation-a"
            ? { createdAt: new Date("2026-10-16T09:00:00.000Z") }
            : null,
      },
    };
    const reportReturnReply = vi.fn(async () => undefined);

    const marked = await reconcileReturnReplies(
      prisma as never,
      { reportReturnReply },
      new Date("2026-10-19T12:00:00.000Z"),
    );

    expect(marked).toBe(1);
    expect(reportReturnReply).toHaveBeenCalledWith("tenant-a", "target-a");
    expect(updates).toEqual([
      { id: "invitation-a", repliedAt: new Date("2026-10-16T09:00:00.000Z") },
    ]);
  });
});
