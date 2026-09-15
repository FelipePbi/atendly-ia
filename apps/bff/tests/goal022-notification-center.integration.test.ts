import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "../src/app.js";
import type { OnboardingState } from "../src/lib/onboarding-state.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  type NotificationReconcileDeps,
  reconcileNotificationCenter,
} from "../src/modules/notifications/reconcile.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal022/WU-03 — a central contra PostgreSQL real.
 *
 * O que só o banco prova, e por isso é provado aqui:
 *
 * - a idempotência é da chave `(tenantId, dedupeKey)`, e não de verificação em
 *   código: materializar a mesma fonte de novo não cria segunda linha;
 * - `readAt` sobrevive à rematerialização enquanto o fato é o mesmo;
 * - condição que deixa de ser reportada recebe `resolvedAt` e **permanece** no
 *   histórico — nada é deletado;
 * - condição resolvida que a fonte volta a reportar **reabre** na mesma linha,
 *   não lida e com o instante do episódio novo: sem isso o `ON CONFLICT DO
 *   NOTHING` emudeceria a central a partir da segunda ocorrência;
 * - `UNKNOWN` de WhatsApp não abre condição e não resolve condição aberta;
 * - `GET /v1/status` reconcilia sem chamada remota a mais e sem mudar a forma
 *   da resposta;
 * - isolamento: negócio A não lê nem resolve nada de B.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

/** Dependências de status: IA responde, Evolution diz o que o teste mandar. */
function stubUpstream(
  options: { whatsappConnected?: boolean; evolutionDown?: boolean } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      if (url.pathname === "/internal/activation-test") {
        return jsonResponse({ data: null, requestId: "up-run" });
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        if (request.method === "PUT") return jsonResponse({ ok: true });
        return jsonResponse({
          data: { enabled: false, tone: "BALANCED", promptVersion: "v1" },
          requestId: "up-config",
        });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: {
            source: "ATENDLY",
            timezone: "America/Sao_Paulo",
            capabilities: {
              manageAvailability: true,
              manageServices: true,
              manageCustomers: true,
              createAppointments: true,
              migrate: true,
              aiActivationReady: true,
            },
            integration: null,
          },
          requestId: "up-calendar",
        });
      }
      if (url.pathname === "/instance/status") {
        if (options.evolutionDown) throw new Error("evolution unreachable");
        return jsonResponse({
          data: {
            connected: options.whatsappConnected ?? false,
            loggedIn: options.whatsappConnected ?? false,
          },
        });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
}

/** Instância WhatsApp sintética: sem ela o resumo de canal não é consultado. */
async function linkWhatsApp(session: SessionHandle): Promise<void> {
  await getPrisma().whatsAppInstance.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      evolutionInstanceName: `goal022-${session.userId}`,
      evolutionInstanceToken: "instance-token",
      status: "CONNECTED",
    },
  });
}

async function readStatus(session: SessionHandle) {
  const response = await app.inject({
    method: "GET",
    url: "/v1/status",
    headers: browserRead(session),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { data: Record<string, unknown> };
}

function notifications(session: SessionHandle, kind: string) {
  return getPrisma().tenantNotification.findMany({
    where: { tenantId: session.tenantId, kind: kind as never },
    orderBy: { createdAt: "asc" },
  });
}

/** Requisição sintética com o negócio da sessão: o motor só precisa disso. */
function requestFor(session: SessionHandle): FastifyRequest {
  return {
    id: "goal022-req",
    tenantContext: {
      userId: session.userId,
      tenantId: session.tenantId,
      role: "OWNER",
    },
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  } as unknown as FastifyRequest;
}

function completeOnboarding(): OnboardingState {
  return {
    business: {
      name: "Studio",
      category: "Beleza",
      timezone: "America/Sao_Paulo",
      modalities: ["ONLINE"],
      address: null,
      contextVersion: 1,
      contextProjectedVersion: 1,
      contextProjectionStatus: "PROJECTED",
    },
    calendar: {
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
      integration: null,
    },
    ai: { tone: "BALANCED" },
    service: { id: "servico-1", active: true },
    availability: {
      rules: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true },
      ],
    },
    whatsapp: null,
    completed: true,
    completedAt: "2026-09-10T12:00:00.000Z",
  } as unknown as OnboardingState;
}

interface WaitingEntry {
  conversationId: string;
  /** Nome quando a conversa tem um; `null` quando não. Nunca telefone. */
  contactName: string | null;
  reason: string;
  openedAt: string;
}

function centreDeps(options: {
  waiting?: WaitingEntry[];
  aiFails?: boolean;
}): NotificationReconcileDeps {
  return {
    readOnboardingState: async () => completeOnboarding(),
    ai: {
      listConversationsAwaitingHuman: async () => {
        if (options.aiFails) throw new Error("ai-orchestrator unreachable");
        return options.waiting ?? [];
      },
    } as unknown as NotificationReconcileDeps["ai"],
    scheduling: {
      listFailedNotificationIntents: async () => ({
        items: [],
        nextCursor: null,
      }),
      listAiCreatedAppointmentEvents: async () => ({
        items: [],
        nextCursor: null,
      }),
      importState: async () => ({ history: null }),
    } as unknown as NotificationReconcileDeps["scheduling"],
  };
}

const WAITING: WaitingEntry = {
  conversationId: "conversa-1",
  contactName: "Marina",
  reason: "EXPLICIT_REQUEST",
  openedAt: "2026-09-15T12:30:00.000Z",
};

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)("Goal022: central contra PostgreSQL", () => {
  it("GET /v1/status abre a condição sem mudar a forma da resposta", async () => {
    const owner = await business("status-opens");
    await linkWhatsApp(owner);
    stubUpstream({ whatsappConnected: false });

    const body = await readStatus(owner);
    expect(Object.keys(body.data).sort()).toEqual([
      "ai",
      "degraded",
      "whatsapp",
    ]);

    const rows = await notifications(owner, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.level).toBe("CRITICAL");
    expect(rows[0]?.shape).toBe("CONDITION");
    expect(rows[0]?.resolvedAt).toBeNull();
    expect(rows[0]?.dedupeKey).toBe("WHATSAPP_DISCONNECTED:tenant");
  });

  it("reconciliar de novo não cria segunda linha e preserva readAt", async () => {
    const owner = await business("status-idempotent");
    await linkWhatsApp(owner);
    stubUpstream({ whatsappConnected: false });

    await readStatus(owner);
    const [first] = await notifications(owner, "WHATSAPP_DISCONNECTED");
    const readAt = new Date();
    await getPrisma().tenantNotification.update({
      where: { id: first!.id },
      data: { readAt },
    });

    await readStatus(owner);
    const rows = await notifications(owner, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt?.toISOString()).toBe(readAt.toISOString());
    expect(rows[0]?.occurredAt.toISOString()).toBe(
      first!.occurredAt.toISOString(),
    );
  });

  it("a chave única é do banco: a segunda inserção da mesma identidade é recusada", async () => {
    const owner = await business("unique-key");
    await expect(
      getPrisma().tenantNotification.create({
        data: {
          tenantId: owner.tenantId,
          kind: "IMPORT_COMPLETED",
          level: "INFO",
          shape: "EVENT",
          dedupeKey: "IMPORT_COMPLETED:session:sessao-1",
          subjectId: "sessao-1",
          occurredAt: new Date(),
          payload: { sessionId: "sessao-1" },
        },
      }),
    ).resolves.toBeTruthy();

    await expect(
      getPrisma().tenantNotification.create({
        data: {
          tenantId: owner.tenantId,
          kind: "IMPORT_COMPLETED",
          level: "INFO",
          shape: "EVENT",
          dedupeKey: "IMPORT_COMPLETED:session:sessao-1",
          subjectId: "sessao-1",
          occurredAt: new Date(),
          payload: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("UNKNOWN não abre condição e não resolve condição já aberta", async () => {
    const owner = await business("status-unknown");
    await linkWhatsApp(owner);

    stubUpstream({ whatsappConnected: false });
    await readStatus(owner);
    vi.unstubAllGlobals();

    stubUpstream({ evolutionDown: true });
    const body = await readStatus(owner);
    expect((body.data.whatsapp as { status: string }).status).toBe("UNKNOWN");

    const rows = await notifications(owner, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).toBeNull();
  });

  it("o canal volta e a condição é resolvida, permanecendo no histórico", async () => {
    const owner = await business("status-resolves");
    await linkWhatsApp(owner);

    stubUpstream({ whatsappConnected: false });
    await readStatus(owner);
    vi.unstubAllGlobals();

    stubUpstream({ whatsappConnected: true });
    await readStatus(owner);

    const rows = await notifications(owner, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).not.toBeNull();
  });

  it("o canal cai de novo depois de voltar e a condição reabre, não lida", async () => {
    const owner = await business("status-reopens");
    await linkWhatsApp(owner);

    stubUpstream({ whatsappConnected: false });
    await readStatus(owner);
    const [first] = await notifications(owner, "WHATSAPP_DISCONNECTED");
    await getPrisma().tenantNotification.update({
      where: { id: first!.id },
      data: { readAt: new Date() },
    });
    vi.unstubAllGlobals();

    stubUpstream({ whatsappConnected: true });
    await readStatus(owner);
    vi.unstubAllGlobals();

    // A segunda queda colide com a chave `(tenantId, dedupeKey)` da primeira:
    // é o UPDATE da reabertura, e não o INSERT, que faz a central reportar.
    stubUpstream({ whatsappConnected: false });
    await readStatus(owner);

    const rows = await notifications(owner, "WHATSAPP_DISCONNECTED");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).toBeNull();
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[0]?.occurredAt.getTime()).toBeGreaterThan(
      first!.occurredAt.getTime(),
    );
  });

  it("condição de cliente esperando abre, resolve e nunca é deletada", async () => {
    const owner = await business("waiting-human");
    const request = requestFor(owner);

    const opened = await reconcileNotificationCenter(
      request,
      centreDeps({ waiting: [WAITING] }),
      { force: true },
    );
    expect(opened.reconciled).toBe(true);
    expect(await notifications(owner, "CUSTOMER_WAITING_HUMAN")).toHaveLength(
      1,
    );

    const closed = await reconcileNotificationCenter(
      request,
      centreDeps({ waiting: [] }),
      { force: true },
    );
    expect(closed.degraded).toEqual([]);
    const rows = await notifications(owner, "CUSTOMER_WAITING_HUMAN");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolvedAt).not.toBeNull();

    // E volta a esperar: mesma conversa, mesma linha, aberta de novo com o
    // instante do episódio novo.
    const again = "2026-09-15T18:00:00.000Z";
    await reconcileNotificationCenter(
      request,
      centreDeps({ waiting: [{ ...WAITING, openedAt: again }] }),
      { force: true },
    );
    const reopened = await notifications(owner, "CUSTOMER_WAITING_HUMAN");
    expect(reopened).toHaveLength(1);
    expect(reopened[0]?.resolvedAt).toBeNull();
    expect(reopened[0]?.occurredAt.toISOString()).toBe(again);
  });

  it("fonte indisponível não lança e deixa o kind intocado", async () => {
    const owner = await business("degraded-source");
    const request = requestFor(owner);

    await reconcileNotificationCenter(
      request,
      centreDeps({ waiting: [WAITING] }),
      {
        force: true,
      },
    );
    const result = await reconcileNotificationCenter(
      request,
      centreDeps({ aiFails: true }),
      { force: true },
    );

    expect(result.reconciled).toBe(true);
    expect(result.degraded).toEqual(["AWAITING_HUMAN"]);
    const rows = await notifications(owner, "CUSTOMER_WAITING_HUMAN");
    expect(rows[0]?.resolvedAt).toBeNull();
  });

  it("isolamento: a reconciliação de B não lê nem resolve nada de A", async () => {
    const a = await business("isolation-a");
    const b = await business("isolation-b");

    await reconcileNotificationCenter(
      requestFor(a),
      centreDeps({ waiting: [WAITING] }),
      { force: true },
    );
    await reconcileNotificationCenter(
      requestFor(b),
      centreDeps({ waiting: [] }),
      {
        force: true,
      },
    );

    const mine = await notifications(a, "CUSTOMER_WAITING_HUMAN");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.resolvedAt).toBeNull();
    expect(await notifications(b, "CUSTOMER_WAITING_HUMAN")).toHaveLength(0);
  });
});
