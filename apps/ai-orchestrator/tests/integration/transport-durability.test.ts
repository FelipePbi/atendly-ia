import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { buildConversationKey } from "../../src/modules/inbox/inbox-policy.js";
import { InboxStore } from "../../src/modules/inbox/InboxStore.js";
import { OutboxStore } from "../../src/modules/outbox/OutboxStore.js";

// Persistência e concorrência reais.
//
// Roda apenas com AI_TEST_DATABASE_URL apontando para o banco descartável já
// preparado pelo ensaio da migration — o mesmo PostgreSQL usado em produção,
// provisionado só para o gate. Sem a variável a suíte é pulada, para que o gate
// local não dependa de banco pessoal; validate:integration a fornece.
const databaseUrl = process.env.AI_TEST_DATABASE_URL?.trim();

const TENANT = "tenant-it";
const CHANNEL = "channel-it";
const CONTACT_A = "5511900000001";
const CONTACT_B = "5511900000002";

const retry = { maxAttempts: 5, baseSeconds: 1, maxSeconds: 10 };
const claimOptions = {
  owner: "worker-a",
  leaseMs: 60_000,
  groupWindowMs: 10_000,
  batchLimit: 10,
};

describe.skipIf(!databaseUrl)("durable transport against PostgreSQL", () => {
  let prisma: PrismaClient;
  let inbox: InboxStore;
  let outbox: OutboxStore;

  const messageEvent = (
    key: string,
    contact: string,
    availableInMs = 0,
  ) => ({
    tenantId: TENANT,
    channelId: CHANNEL,
    eventKey: key,
    messageId: key,
    eventType: "message",
    conversationKey: buildConversationKey({
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: contact,
    }),
    rawPayload: { event: "Message", data: { Info: { ID: key } } },
    availableInMs,
  });

  const mediaEvent = (key: string, contact: string) => ({
    tenantId: TENANT,
    channelId: CHANNEL,
    eventKey: key,
    messageId: key,
    eventType: "message",
    conversationKey: buildConversationKey({
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: contact,
    }),
    rawPayload: {
      event: "Message",
      data: {
        Info: { ID: key },
        Message: {
          audioMessage: { mimetype: "audio/ogg", fileSHA256: "aGVsbG8=" },
          base64: "d2hhdHNhcHAtYXVkaW8=",
        },
      },
    },
  });

  // Politica de janela do teste, explicita para nao depender da configuracao do
  // processo: fragmentos de 8 s a 35 s (limite de 60 s desde o primeiro) e
  // espera de mensagem ambigua de 2 min, ate 5 min desde a primeira.
  const policy = {
    minSeconds: 8,
    maxSeconds: 35,
    maxWaitSeconds: 60,
    ambiguousSeconds: 120,
    ambiguousMaxWaitSeconds: 300,
  };

  const windowTarget = (contact: string) => ({
    tenantId: TENANT,
    channelId: CHANNEL,
    externalContactId: contact,
    conversationKey: buildConversationKey({
      tenantId: TENANT,
      channelId: CHANNEL,
      externalContactId: contact,
    }),
  });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    inbox = new InboxStore(prisma, retry);
    outbox = new OutboxStore(prisma);

    await prisma.channelConnection.upsert({
      where: { tenantId_id: { tenantId: TENANT, id: CHANNEL } },
      update: {},
      create: {
        id: CHANNEL,
        tenantId: TENANT,
        userId: "user-it",
        provider: "EVOLUTION_GO",
        externalInstanceId: "instance-it",
      },
    });
    await prisma.conversation.upsert({
      where: {
        tenantId_channelId_id: {
          tenantId: TENANT,
          channelId: CHANNEL,
          id: "conversation-it",
        },
      },
      update: {},
      create: {
        id: "conversation-it",
        tenantId: TENANT,
        channelId: CHANNEL,
        externalContactId: CONTACT_A,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({ where: { tenantId: TENANT } });
    // O claim não é escopado por tenant: sobra de outra suíte apareceria como
    // candidata aqui. `LEGACY` fica, porque é fixture do ensaio e nunca volta
    // para a fila.
    await prisma.processedEvent.deleteMany({
      where: { status: { not: "LEGACY" } },
    });
  });

  it("dedupes on the unique key and never counts a duplicate as new work", async () => {
    const first = await inbox.record(messageEvent("evt-dup", CONTACT_A));
    const second = await inbox.record(messageEvent("evt-dup", CONTACT_A));

    expect(first).toMatchObject({ stored: true, duplicate: false });
    expect(second).toMatchObject({ stored: false, duplicate: true });
    expect(
      await prisma.processedEvent.count({ where: { tenantId: TENANT } }),
    ).toBe(1);
  });

  it("holds an event until its fragment window closes and then claims the group", async () => {
    await inbox.record(messageEvent("evt-frag-1", CONTACT_A, 3_000));
    await inbox.record(messageEvent("evt-frag-2", CONTACT_A, 3_000));

    expect(await inbox.claimNext(claimOptions)).toBeNull();

    const claim = await inbox.claimNext({
      ...claimOptions,
      now: new Date(Date.now() + 4_000),
    });
    expect(claim?.events.map((event) => event.eventKey)).toEqual([
      "evt-frag-1",
      "evt-frag-2",
    ]);
  });

  it("runs one claim at a time per conversation and distinct conversations in parallel", async () => {
    await inbox.record(messageEvent("evt-serial-1", CONTACT_A));
    await inbox.record(messageEvent("evt-serial-2", CONTACT_A));

    const [left, right] = await Promise.all([
      inbox.claimNext({ ...claimOptions, owner: "worker-a" }),
      inbox.claimNext({ ...claimOptions, owner: "worker-b" }),
    ]);
    const claimed = [left, right].filter(Boolean);
    expect(claimed).toHaveLength(1);
    // Em ordem de recebimento, e sem deixar o segundo evento para trás.
    expect(claimed[0]?.events.map((event) => event.eventKey)).toEqual([
      "evt-serial-1",
      "evt-serial-2",
    ]);

    await inbox.record(messageEvent("evt-other-conversation", CONTACT_B));
    const parallel = await inbox.claimNext({
      ...claimOptions,
      owner: "worker-c",
    });
    expect(parallel?.events[0]?.eventKey).toBe("evt-other-conversation");
  });

  it("claims a free conversation instead of stopping behind a busy one", async () => {
    // Cabeca ocupada: o evento mais antigo pendente e de uma conversa que ja
    // esta PROCESSING com lease vivo. Selecionar so a cabeca global parava a
    // fila inteira atras dela — nenhuma outra conversa era atendida enquanto a
    // ocupada rodava LLM, tools e envio.
    await inbox.record(messageEvent("evt-head-a1", CONTACT_A));
    const busy = await inbox.claimNext(claimOptions);
    expect(busy?.events.map((event) => event.eventKey)).toEqual([
      "evt-head-a1",
    ]);

    await inbox.record(messageEvent("evt-head-a2", CONTACT_A));
    await inbox.record(messageEvent("evt-head-b1", CONTACT_B));

    const claim = await inbox.claimNext({ ...claimOptions, owner: "worker-b" });
    expect(claim?.events.map((event) => event.eventKey)).toEqual([
      "evt-head-b1",
    ]);

    // E a conversa ocupada continua serializada: o evento novo dela espera o
    // lease vivo terminar, em vez de ser executado em paralelo.
    expect(
      await inbox.claimNext({ ...claimOptions, owner: "worker-c" }),
    ).toBeNull();
    await inbox.complete({
      ids: busy!.events.map((event) => event.id),
      leaseToken: busy!.leaseToken,
      status: "DONE",
    });
    const afterBusy = await inbox.claimNext({
      ...claimOptions,
      owner: "worker-d",
    });
    expect(afterBusy?.events.map((event) => event.eventKey)).toEqual([
      "evt-head-a2",
    ]);
  });

  it("recalculates the fragment window over the persisted inbox", async () => {
    const now = new Date();
    await inbox.record(messageEvent("evt-window-1", CONTACT_A, 8_000));
    const first = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_A),
      text: "quero marcar um horario",
      policy,
      now,
    });
    expect(first?.pendingFragments).toBe(1);
    expect(first!.availableAt.getTime() - now.getTime()).toBe(8_000);

    // Fragmento novo da mesma conversa estende a espera do grupo inteiro: e
    // isto que o `Map` em memoria fazia e que precisava passar a valer sobre o
    // que esta gravado.
    await inbox.record(messageEvent("evt-window-2", CONTACT_A, 8_000));
    const later = new Date(now.getTime() + 3_000);
    const second = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_A),
      text: "para amanha de manha, se possivel",
      policy,
      now: later,
    });
    expect(second?.pendingFragments).toBe(2);
    expect(second!.availableAt.getTime() - later.getTime()).toBe(12_000);

    const pending = await prisma.processedEvent.findMany({
      where: { tenantId: TENANT, status: "RECEIVED" },
      select: { nextAttemptAt: true },
    });
    expect(pending).toHaveLength(2);
    for (const row of pending) {
      expect(row.nextAttemptAt?.getTime()).toBe(second!.availableAt.getTime());
    }

    expect(
      await inbox.claimNext({
        ...claimOptions,
        now: new Date(second!.availableAt.getTime() - 1_000),
      }),
    ).toBeNull();
    const claim = await inbox.claimNext({
      ...claimOptions,
      now: new Date(second!.availableAt.getTime() + 1_000),
    });
    expect(claim?.events.map((event) => event.eventKey)).toEqual([
      "evt-window-1",
      "evt-window-2",
    ]);
  });

  it("never extends the fragment window past the max wait since the first fragment", async () => {
    const now = new Date();
    await inbox.record(messageEvent("evt-window-cap", CONTACT_A, 8_000));
    // Sequencia longa: o limite desde o primeiro fragmento decide, e nao os
    // 18 s que o texto longo pediria.
    const late = new Date(now.getTime() + 58_000);
    const capped = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_A),
      text: "a".repeat(300),
      policy,
      now: late,
    });
    const waited = capped!.availableAt.getTime() - late.getTime();
    expect(waited).toBeLessThan(18_000);
    expect(waited).toBeLessThanOrEqual(4_000);
  });

  it("holds the first ambiguous message of a contact without history", async () => {
    const now = new Date();
    await inbox.record(messageEvent("evt-ambiguous", CONTACT_B, 8_000));
    const window = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_B),
      text: "Oi",
      policy,
      now,
    });

    expect(window?.ambiguousFirstContact).toBe(true);
    // Cerca de dois minutos, nao os 8 s da janela de fragmento.
    expect(window!.availableAt.getTime() - now.getTime()).toBe(120_000);
    expect(
      await inbox.claimNext({
        ...claimOptions,
        now: new Date(now.getTime() + 60_000),
      }),
    ).toBeNull();
    const claim = await inbox.claimNext({
      ...claimOptions,
      now: new Date(now.getTime() + 125_000),
    });
    expect(claim?.events[0]?.eventKey).toBe("evt-ambiguous");
  });

  it("stops the ambiguous wait as soon as the person says what they want", async () => {
    const now = new Date();
    await inbox.record(messageEvent("evt-ambiguous-1", CONTACT_B, 8_000));
    await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_B),
      text: "Oi",
      policy,
      now,
    });

    await inbox.record(messageEvent("evt-ambiguous-2", CONTACT_B, 8_000));
    const second = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_B),
      text: "queria marcar amanha",
      policy,
      now,
    });
    expect(second?.ambiguousFirstContact).toBe(false);
    expect(second!.availableAt.getTime() - now.getTime()).toBe(12_000);
  });

  it("does not make a known contact wait for an ambiguous first message", async () => {
    // Historico e do transporte: existe conversa e ela ja trocou mensagem. Nao
    // ha interpretacao de conteudo aqui — isso e do Goal005.
    await prisma.message.create({
      data: {
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: "conversation-it",
        direction: "INBOUND",
        role: "user",
        body: "conversa anterior",
      },
    });
    const now = new Date();
    await inbox.record(messageEvent("evt-known-contact", CONTACT_A, 8_000));
    const window = await inbox.applyConversationWindow({
      ...windowTarget(CONTACT_A),
      text: "Oi",
      policy,
      now,
    });

    expect(window?.ambiguousFirstContact).toBe(false);
    expect(window!.availableAt.getTime() - now.getTime()).toBe(8_000);
  });

  it("does not steal a live lease and recovers only an expired one", async () => {
    await inbox.record(messageEvent("evt-lease", CONTACT_A));

    const first = await inbox.claimNext(claimOptions);
    expect(first?.events).toHaveLength(1);
    expect(await inbox.claimNext({ ...claimOptions, owner: "worker-b" })).toBeNull();

    // Lease vencido: o evento volta a ser reivindicável, e só então.
    await prisma.processedEvent.updateMany({
      where: { tenantId: TENANT },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const recovered = await inbox.claimNext({
      ...claimOptions,
      owner: "worker-b",
    });
    expect(recovered?.events[0]?.eventKey).toBe("evt-lease");
    expect(recovered?.events[0]?.attempts).toBe(2);
    expect(recovered?.leaseToken).not.toBe(first?.leaseToken);
  });

  it("fences the old lease out of the result", async () => {
    await inbox.record(messageEvent("evt-fence", CONTACT_A));
    const first = await inbox.claimNext(claimOptions);
    await prisma.processedEvent.updateMany({
      where: { tenantId: TENANT },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const second = await inbox.claimNext({ ...claimOptions, owner: "worker-b" });

    const stale = await inbox.complete({
      ids: first!.events.map((event) => event.id),
      leaseToken: first!.leaseToken,
      status: "DONE",
    });
    expect(stale).toBe(0);

    const applied = await inbox.complete({
      ids: second!.events.map((event) => event.id),
      leaseToken: second!.leaseToken,
      status: "DONE",
    });
    expect(applied).toBe(1);
  });

  it("resumes exactly once after a crash between the ACK and the processing", async () => {
    await inbox.record(messageEvent("evt-crash", CONTACT_A));
    const crashed = await inbox.claimNext(claimOptions);
    expect(crashed?.events).toHaveLength(1);

    // Processo caiu sem concluir: o lease vence e outro worker assume.
    await prisma.processedEvent.updateMany({
      where: { tenantId: TENANT },
      data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    const resumed = await inbox.claimNext({ ...claimOptions, owner: "worker-b" });
    expect(resumed?.events[0]?.eventKey).toBe("evt-crash");

    await inbox.complete({
      ids: resumed!.events.map((event) => event.id),
      leaseToken: resumed!.leaseToken,
      status: "DONE",
      result: { kind: "message" },
    });

    // E uma vez concluído, nunca mais volta para a fila.
    expect(await inbox.claimNext({ ...claimOptions, owner: "worker-c" })).toBeNull();
    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-crash" },
    });
    expect(stored.status).toBe("DONE");
    expect(stored.completedAt).not.toBeNull();
  });

  it("dead-letters after the attempt limit without replaying anything", async () => {
    const strict = new InboxStore(prisma, {
      maxAttempts: 1,
      baseSeconds: 1,
      maxSeconds: 5,
    });
    await strict.record(messageEvent("evt-dead", CONTACT_A));
    const claim = await strict.claimNext(claimOptions);

    const outcome = await strict.fail({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      error: new Error("assistant is down apikey=super-secret"),
      retryable: true,
    });

    expect(outcome).toEqual({ retrying: false, deadLettered: true });
    expect(await strict.countDeadLetters(TENANT)).toBe(1);
    expect(await strict.claimNext(claimOptions)).toBeNull();

    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-dead" },
    });
    expect(stored.status).toBe("FAILED");
    expect(stored.error).not.toContain("super-secret");
  });

  it("strips the inline base64 once the event is concluded (DONE)", async () => {
    await inbox.record(mediaEvent("evt-media-done", CONTACT_A));
    const claim = await inbox.claimNext(claimOptions);

    await inbox.complete({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      status: "DONE",
      result: { kind: "message" },
    });

    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-media-done" },
    });
    const rawPayload = stored.rawPayload as {
      data: { Message: Record<string, unknown> };
    };
    expect(rawPayload.data.Message).not.toHaveProperty("base64");
    // O resto do proto de midia continua: e a chave do download sob demanda.
    expect(rawPayload.data.Message.audioMessage).toEqual({
      mimetype: "audio/ogg",
      fileSHA256: "aGVsbG8=",
    });
  });

  it("strips the inline base64 once the event is dead-lettered (FAILED)", async () => {
    const strict = new InboxStore(prisma, {
      maxAttempts: 1,
      baseSeconds: 1,
      maxSeconds: 5,
    });
    await strict.record(mediaEvent("evt-media-dead", CONTACT_A));
    const claim = await strict.claimNext(claimOptions);

    await strict.fail({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      error: new Error("assistant is down"),
      retryable: true,
    });

    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-media-dead" },
    });
    const rawPayload = stored.rawPayload as {
      data: { Message: Record<string, unknown> };
    };
    expect(stored.status).toBe("FAILED");
    expect(rawPayload.data.Message).not.toHaveProperty("base64");
  });

  it("keeps the inline base64 while an event is only retrying", async () => {
    await inbox.record(mediaEvent("evt-media-retry", CONTACT_A));
    const claim = await inbox.claimNext(claimOptions);

    await inbox.fail({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      error: new Error("transient"),
      retryable: true,
    });

    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-media-retry" },
    });
    const rawPayload = stored.rawPayload as {
      data: { Message: Record<string, unknown> };
    };
    expect(stored.status).toBe("RECEIVED");
    // Ainda vai tentar de novo: os bytes continuam disponiveis para o retry.
    expect(rawPayload.data.Message.base64).toBe("d2hhdHNhcHAtYXVkaW8=");
  });

  it("retries with backoff before giving up", async () => {
    await inbox.record(messageEvent("evt-retry", CONTACT_A));
    const claim = await inbox.claimNext(claimOptions);

    const outcome = await inbox.fail({
      ids: claim!.events.map((event) => event.id),
      leaseToken: claim!.leaseToken,
      error: new Error("transient"),
      retryable: true,
    });

    expect(outcome).toEqual({ retrying: true, deadLettered: false });
    const stored = await prisma.processedEvent.findFirstOrThrow({
      where: { tenantId: TENANT, eventKey: "evt-retry" },
    });
    expect(stored.status).toBe("RECEIVED");
    expect(stored.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    // Ainda dentro do backoff: não é reivindicável agora.
    expect(await inbox.claimNext(claimOptions)).toBeNull();
  });

  it("flags a running conversation for re-evaluation when a new event arrives", async () => {
    await inbox.record(messageEvent("evt-super-1", CONTACT_A));
    const claim = await inbox.claimNext(claimOptions);
    const ids = claim!.events.map((event) => event.id);
    expect(await inbox.isSupersedeRequested(ids)).toBe(false);

    await inbox.record(messageEvent("evt-super-2", CONTACT_A));
    await inbox.requestSupersede(claim!.conversationKey!);

    expect(await inbox.isSupersedeRequested(ids)).toBe(true);
  });

  it("reconciles an unknown delivery from the transport receipt", async () => {
    const message = await prisma.message.create({
      data: {
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: "conversation-it",
        direction: "OUTBOUND",
        source: "AI",
        role: "assistant",
        body: "Resposta",
        correlationId: "ai-operation-it",
        deliveryState: "UNKNOWN",
        deliveryDetail: "transport_timeout",
      },
    });

    const reconciled = await outbox.reconcileFromReceipt({
      tenantId: TENANT,
      channelId: CHANNEL,
      messageIds: ["ai-operation-it"],
      state: "delivered",
    });

    expect(reconciled).toBe(1);
    const stored = await prisma.message.findUniqueOrThrow({
      where: { id: message.id },
    });
    expect(stored.deliveryState).toBe("SENT");
    expect(stored.deliveryDetail).toBe("reconciled_receipt_delivered");
  });

  it("does not reconcile a receipt that belongs to another channel", async () => {
    await prisma.message.create({
      data: {
        tenantId: TENANT,
        channelId: CHANNEL,
        conversationId: "conversation-it",
        direction: "OUTBOUND",
        source: "AI",
        role: "assistant",
        body: "Resposta",
        correlationId: "ai-operation-other",
        deliveryState: "UNKNOWN",
      },
    });

    const reconciled = await outbox.reconcileFromReceipt({
      tenantId: TENANT,
      channelId: "channel-of-another-business",
      messageIds: ["ai-operation-other"],
      state: "read",
    });

    expect(reconciled).toBe(0);
  });

  it("keeps the legacy replay fixture readable", async () => {
    // Linhas semeadas pelo ensaio da migration: saída antiga sem prova de
    // entrega continua legível e marcada como incerta, nunca como enviada.
    const legacy = await prisma.message.findMany({
      where: { tenantId: "tenant-legacy", direction: "OUTBOUND" },
      orderBy: { id: "asc" },
    });
    expect(legacy.length).toBeGreaterThan(0);
    for (const row of legacy) {
      expect(row.deliveryState).toBe("UNKNOWN");
      expect(row.deliveryDetail).toBe("legacy_backfill_no_delivery_evidence");
    }
    const legacyEvents = await prisma.processedEvent.findMany({
      where: { tenantId: "tenant-legacy" },
    });
    expect(legacyEvents.length).toBeGreaterThan(0);
    for (const event of legacyEvents) {
      expect(event.status).toBe("LEGACY");
      expect(event.rawPayload).toBeTruthy();
    }
  });
});
