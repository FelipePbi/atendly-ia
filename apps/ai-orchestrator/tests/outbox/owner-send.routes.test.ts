import { randomBytes } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY_V1 = randomBytes(32).toString("base64");
const ROOT = "root-internal-secret-with-32-chars-min";

vi.stubEnv("INTERNAL_SERVICE_TOKEN", ROOT);
vi.stubEnv("CHANNEL_CREDENTIAL_KEYS", `v1:${KEY_V1}`);
vi.stubEnv("CHANNEL_CREDENTIAL_ACTIVE_KEY_ID", "v1");
vi.stubEnv("EVOLUTION_BASE_URL", "http://evolution.invalid");

const [{ registerInternalRoutes }, { expectedToken }, cipher] =
  await Promise.all([
    import("../../src/modules/internal/routes.js"),
    import("../../src/lib/internal-credentials.js"),
    import("../../src/lib/channel-credentials.js"),
  ]);

const sealed = cipher.sealChannelCredential("wa_synthetic_owner_credential_1", {
  tenantId: "tenant-a",
  externalInstanceId: "instance-a",
});

const channel = {
  id: "channel-a",
  tenantId: "tenant-a",
  userId: "user-a",
  provider: "EVOLUTION_GO",
  externalInstanceId: "instance-a",
  status: "ACTIVE",
  credentialCipher: sealed.envelope,
  credentialKeyId: sealed.keyId,
  credentialVersion: sealed.version,
};

interface StoredMessage {
  id: string;
  tenantId: string;
  channelId: string;
  conversationId: string;
  externalMessageId: string | null;
  correlationId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  source: "CUSTOMER" | "AI" | "OWNER" | null;
  role: string;
  body: string;
  rawPayload: unknown;
  createdAt: Date;
  deliveryState: "PENDING" | "SENT" | "FAILED" | "UNKNOWN" | null;
  deliveryDetail: string | null;
  deliveryAttempts: number;
  deliveryUpdatedAt: Date | null;
}

function fakePrisma() {
  const messages = new Map<string, StoredMessage>();
  const deleted: string[] = [];
  let sequence = 0;

  const prisma = {
    conversation: {
      findFirst: async () => ({
        id: "conversation-a",
        tenantId: "tenant-a",
        channelId: "channel-a",
        externalContactId: "5511999999999",
        humanHandoff: true,
        status: "HUMAN_HANDOFF",
        messages: [],
        handoffs: [],
        channel,
      }),
      update: async () => ({}),
    },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        sequence += 1;
        const row: StoredMessage = {
          id: `message-${sequence}`,
          createdAt: new Date(),
          externalMessageId: null,
          correlationId: null,
          rawPayload: null,
          deliveryState: null,
          deliveryDetail: null,
          deliveryAttempts: 0,
          deliveryUpdatedAt: null,
          ...(data as unknown as Partial<StoredMessage>),
        } as StoredMessage;
        messages.set(row.id, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = messages.get(where.id);
        if (!row) throw new Error("message not found");
        const patch = { ...data } as Record<string, unknown>;
        if (
          patch.deliveryAttempts &&
          typeof patch.deliveryAttempts === "object"
        ) {
          patch.deliveryAttempts =
            row.deliveryAttempts +
            ((patch.deliveryAttempts as { increment: number }).increment ?? 0);
        }
        const updated = {
          ...row,
          ...(patch as unknown as Partial<StoredMessage>),
        } as StoredMessage;
        messages.set(where.id, updated);
        return updated;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = messages.get(where.id);
        if (!row) throw new Error("message not found");
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
        messages.delete(where.id);
        return {};
      },
    },
  } as never;

  return { prisma, messages, deleted };
}

async function buildApp(prisma: never) {
  const app = Fastify();
  await registerInternalRoutes(app, prisma, {
    inbox: { countDeadLetters: async () => 0 },
  });
  return app;
}

function sendOwnerMessage(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: "/internal/conversations/conversation-a/messages",
    headers: {
      authorization: `Bearer ${expectedToken("command")}`,
      "x-service-audience": "ai-orchestrator",
      "x-tenant-id": "tenant-a",
      "x-user-id": "user-a",
    },
    payload: { text: "Consigo te atender amanhã às 10h" },
  });
}

describe("owner outbound message", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await app?.close();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("returns SENT with the transport id when the send succeeds", async () => {
    const store = fakePrisma();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ key: { id: "wa-sent-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    app = await buildApp(store.prisma);

    const response = await sendOwnerMessage(app);

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({
      deliveryState: "SENT",
      deliveryDetail: null,
    });
    expect(store.deleted).toHaveLength(0);
  });

  it("keeps a timed-out attempt as UNKNOWN instead of deleting it", async () => {
    const store = fakePrisma();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        }),
      ),
    );
    app = await buildApp(store.prisma);

    const response = await sendOwnerMessage(app);

    // A tentativa continua existindo: apagar era exatamente o que fazia a
    // profissional achar que não mandou nada e mandar de novo.
    expect(store.deleted).toHaveLength(0);
    expect([...store.messages.values()]).toHaveLength(1);
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({
      deliveryState: "UNKNOWN",
      deliveryDetail: "transport_timeout",
    });
    const stored = [...store.messages.values()][0];
    expect(stored.correlationId).toMatch(/^owner-/u);
  });

  it("reports a definite transport rejection as FAILED, with the reason", async () => {
    const store = fakePrisma();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid number" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    app = await buildApp(store.prisma);

    const response = await sendOwnerMessage(app);

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({
      deliveryState: "FAILED",
      deliveryDetail: "transport_rejected_http_422",
    });
    expect(store.deleted).toHaveLength(0);
  });

  it("reports the Goal003 transition window as an explicit failure", async () => {
    const store = fakePrisma();
    const unprovisioned = {
      ...store,
      prisma: {
        ...(store.prisma as object),
        conversation: {
          findFirst: async () => ({
            id: "conversation-a",
            tenantId: "tenant-a",
            channelId: "channel-a",
            externalContactId: "5511999999999",
            humanHandoff: true,
            status: "HUMAN_HANDOFF",
            messages: [],
            handoffs: [],
            channel: {
              ...channel,
              credentialCipher: null,
              credentialVersion: 0,
            },
          }),
          update: async () => ({}),
        },
      } as never,
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    app = await buildApp(unprovisioned.prisma);

    const response = await sendOwnerMessage(app);

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({
      deliveryState: "FAILED",
      deliveryDetail: "channel_credential_not_projected",
    });
    // Nada saiu, e a mensagem da profissional continua registrada.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.deleted).toHaveLength(0);
  });
});
