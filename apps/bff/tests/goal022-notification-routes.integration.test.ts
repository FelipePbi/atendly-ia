import type { FastifyInstance } from "fastify";
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
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal022/WU-04 — o contrato público da central contra PostgreSQL real.
 *
 * O que só o banco e o servidor HTTP inteiro provam, e por isso é provado
 * aqui: isolamento de tenant em leitura, contagem e escrita; `tenantId`
 * enviado pelo corpo ou pela query nunca escapa da sessão; marcar como lida
 * um id alheio responde exatamente como marcar um id inexistente; a rota de
 * leitura nunca vira `500` quando os donos estão fora do ar.
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

/**
 * Dublê dos donos: por padrão, todas as fontes respondem vazio e o negócio
 * está com onboarding incompleto — condição em que `SETUP_INCOMPLETE` nunca
 * abre (Goal022/WU-03), então nenhuma notificação nasce da reconciliação e os
 * testes seguem só com o que cada caso semeia diretamente no banco.
 *
 * `schedulingDown: true` derruba só as chamadas do Scheduling, deixando a IA
 * respondendo — o que basta para provar que a leitura não vira `500`.
 */
function stubUpstream(options: { schedulingDown?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      if (url.pathname === "/internal/handoffs/awaiting-human") {
        return jsonResponse({ data: [], requestId: "up-awaiting" });
      }
      if (options.schedulingDown) {
        throw new Error("scheduling-service unreachable");
      }
      if (url.pathname === "/internal/notification-intents/failed") {
        return jsonResponse({
          data: { items: [], nextCursor: null },
          requestId: "up-failed",
        });
      }
      if (url.pathname === "/internal/appointment-events/ai-created") {
        return jsonResponse({
          data: { items: [], nextCursor: null },
          requestId: "up-events",
        });
      }
      if (url.pathname === "/internal/calendar/imports") {
        return jsonResponse({
          data: {
            right: { available: true, sessionId: null, completedAt: null },
            session: null,
            history: null,
          },
          requestId: "up-imports",
        });
      }
      if (url.pathname === "/internal/calendar") {
        return jsonResponse({
          data: {
            source: null,
            timezone: null,
            integration: null,
            capabilities: {
              manageAvailability: false,
              manageServices: false,
              manageCustomers: false,
              createAppointments: false,
              migrate: false,
              aiActivationReady: false,
            },
          },
          requestId: "up-calendar",
        });
      }
      throw new Error(
        `Unexpected upstream call: ${request.method} ${url.pathname}`,
      );
    }),
  );
}

async function seedNotification(
  session: SessionHandle,
  overrides: Partial<{
    kind: string;
    level: string;
    shape: string;
    dedupeKey: string;
    subjectId: string | null;
    occurredAt: Date;
    readAt: Date | null;
    resolvedAt: Date | null;
    payload: Record<string, unknown>;
  }> = {},
) {
  return getPrisma().tenantNotification.create({
    data: {
      tenantId: session.tenantId,
      kind: (overrides.kind ?? "IMPORT_COMPLETED") as never,
      level: (overrides.level ?? "INFO") as never,
      shape: (overrides.shape ?? "EVENT") as never,
      dedupeKey:
        overrides.dedupeKey ??
        `IMPORT_COMPLETED:session:${Math.random().toString(36).slice(2)}`,
      subjectId: overrides.subjectId ?? null,
      occurredAt: overrides.occurredAt ?? new Date(),
      readAt: overrides.readAt ?? null,
      resolvedAt: overrides.resolvedAt ?? null,
      payload: overrides.payload ?? {},
    },
  });
}

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

describe.skipIf(!RUN_INTEGRATION)(
  "Goal022/WU-04: contrato público da central",
  () => {
    it("nega as cinco rotas sem sessão", async () => {
      const routes: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> =
        [
          { method: "GET", url: "/v1/notifications" },
          { method: "GET", url: "/v1/notifications/summary" },
          { method: "POST", url: "/v1/notifications/read" },
          { method: "GET", url: "/v1/notifications/preferences" },
          { method: "PATCH", url: "/v1/notifications/preferences" },
        ];
      for (const route of routes) {
        const response = await app.inject({
          method: route.method,
          url: route.url,
        });
        expect(response.statusCode).toBe(401);
      }
    });

    it("tenant A não lê, não conta e não marca como lida notificação de B", async () => {
      const a = await business("routes-isolation-a");
      const b = await business("routes-isolation-b");
      stubUpstream();

      await seedNotification(a, { level: "ATTENTION" });
      const theirs = await seedNotification(b, { level: "CRITICAL" });

      const list = await app.inject({
        method: "GET",
        url: "/v1/notifications",
        headers: browserRead(a),
      });
      expect(list.statusCode).toBe(200);
      const listBody = list.json() as {
        data: { items: Array<{ id: string }>; total: number };
      };
      expect(listBody.data.total).toBe(1);
      expect(listBody.data.items.map((item) => item.id)).not.toContain(
        theirs.id,
      );

      const summary = await app.inject({
        method: "GET",
        url: "/v1/notifications/summary",
        headers: browserRead(a),
      });
      const summaryBody = summary.json() as {
        data: { unreadCount: number; byLevel: Record<string, number> };
      };
      expect(summaryBody.data.unreadCount).toBe(1);
      expect(summaryBody.data.byLevel.CRITICAL).toBe(0);

      // Query com tenantId estranho não muda o escopo: a sessão decide.
      const listWithForeignTenantId = await app.inject({
        method: "GET",
        url: `/v1/notifications?tenantId=${b.tenantId}`,
        headers: browserRead(a),
      });
      expect(
        (listWithForeignTenantId.json() as { data: { total: number } }).data
          .total,
      ).toBe(1);
    });

    it("marcar como lida um id alheio responde igual a marcar um id inexistente", async () => {
      const a = await business("routes-read-alien");
      const b = await business("routes-read-alien-target");
      const theirs = await seedNotification(b);

      const alienAttempt = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(a),
        payload: { id: theirs.id },
      });
      const inexistentAttempt = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(a),
        payload: { id: "does-not-exist" },
      });

      expect(alienAttempt.statusCode).toBe(inexistentAttempt.statusCode);
      expect(
        (alienAttempt.json() as { data: unknown }).data,
      ).toEqual((inexistentAttempt.json() as { data: unknown }).data);
      expect(
        (alienAttempt.json() as { data: { updated: number } }).data.updated,
      ).toBe(0);

      // A notificação de B continua intocada.
      const untouched = await getPrisma().tenantNotification.findUniqueOrThrow(
        { where: { id: theirs.id } },
      );
      expect(untouched.readAt).toBeNull();
    });

    it("POST /v1/notifications/read é idempotente, sozinho e com `all`", async () => {
      const owner = await business("routes-read-idempotent");
      const mine = await seedNotification(owner);

      const first = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(owner),
        payload: { id: mine.id },
      });
      expect(
        (first.json() as { data: { updated: number } }).data.updated,
      ).toBe(1);

      const second = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(owner),
        payload: { id: mine.id },
      });
      expect(
        (second.json() as { data: { updated: number } }).data.updated,
      ).toBe(0);

      await seedNotification(owner);
      await seedNotification(owner);
      const markAll = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(owner),
        payload: { all: true },
      });
      expect(
        (markAll.json() as { data: { updated: number } }).data.updated,
      ).toBe(2);

      const markAllAgain = await app.inject({
        method: "POST",
        url: "/v1/notifications/read",
        headers: browserMutation(owner),
        payload: { all: true },
      });
      expect(
        (markAllAgain.json() as { data: { updated: number } }).data.updated,
      ).toBe(0);
    });

    it("GET /v1/notifications filtra por nível, não lidas e resolvidas, com teto de página", async () => {
      const owner = await business("routes-filters");
      stubUpstream();

      await seedNotification(owner, { level: "INFO", readAt: new Date() });
      await seedNotification(owner, { level: "ATTENTION" });
      await seedNotification(owner, {
        level: "CRITICAL",
        shape: "CONDITION",
        resolvedAt: new Date(),
      });
      await seedNotification(owner, { level: "CRITICAL", shape: "CONDITION" });

      const byLevel = await app.inject({
        method: "GET",
        url: "/v1/notifications?level=CRITICAL",
        headers: browserRead(owner),
      });
      expect(
        (byLevel.json() as { data: { total: number } }).data.total,
      ).toBe(2);

      const unreadOnly = await app.inject({
        method: "GET",
        url: "/v1/notifications?unread=true",
        headers: browserRead(owner),
      });
      expect(
        (unreadOnly.json() as { data: { total: number } }).data.total,
      ).toBe(3);

      const resolvedOnly = await app.inject({
        method: "GET",
        url: "/v1/notifications?resolved=true",
        headers: browserRead(owner),
      });
      expect(
        (resolvedOnly.json() as { data: { total: number } }).data.total,
      ).toBe(1);

      const capped = await app.inject({
        method: "GET",
        url: "/v1/notifications?limit=200",
        headers: browserRead(owner),
      });
      expect(capped.statusCode).toBe(400);
    });

    it("com Scheduling fora, GET /v1/notifications responde 200 com o que tem", async () => {
      const owner = await business("routes-scheduling-down");
      stubUpstream({ schedulingDown: true });
      await seedNotification(owner);

      const response = await app.inject({
        method: "GET",
        url: "/v1/notifications",
        headers: browserRead(owner),
      });
      expect(response.statusCode).toBe(200);
      expect(
        (response.json() as { data: { total: number } }).data.total,
      ).toBe(1);
    });

    it("preferências: default desligado, PATCH grava e GET reflete", async () => {
      const owner = await business("routes-preferences");

      const before = await app.inject({
        method: "GET",
        url: "/v1/notifications/preferences",
        headers: browserRead(owner),
      });
      expect(
        (before.json() as { data: { aiAppointmentCreated: boolean } }).data
          .aiAppointmentCreated,
      ).toBe(false);

      const patch = await app.inject({
        method: "PATCH",
        url: "/v1/notifications/preferences",
        headers: browserMutation(owner),
        payload: { aiAppointmentCreated: true },
      });
      expect(patch.statusCode).toBe(200);

      const after = await app.inject({
        method: "GET",
        url: "/v1/notifications/preferences",
        headers: browserRead(owner),
      });
      expect(
        (after.json() as { data: { aiAppointmentCreated: boolean } }).data
          .aiAppointmentCreated,
      ).toBe(true);
    });
  },
);
