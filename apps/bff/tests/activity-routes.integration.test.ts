import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
 * `GET /v1/activity` (D-176) contra sessão real.
 *
 * O que é do BFF: o negócio sai só da sessão (query não escolhe tenant), as
 * mudanças de configuração e conta que o próprio BFF grava entram no registro
 * com o antes e o depois — nunca a senha —, e a página intercala o que
 * Scheduling e IA devolvem. Scheduling e IA são um dobro HTTP que responde
 * pelo tenant do cabeçalho.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];
const upstream: Array<{ url: string; tenantId: string | null }> = [];

function stubSources() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const tenantId = request.headers.get("x-tenant-id");
      upstream.push({ url: request.url, tenantId });
      const source = request.url.includes(":3003") ? "scheduling" : "ai";
      return new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: `${source}-row`,
                sequence: "1",
                occurredAt: "2026-01-01T00:00:00.000Z",
                actorType: "AI",
                actorId: null,
                area: source === "scheduling" ? "AGENDA" : "CONVERSATIONS",
                action:
                  source === "scheduling"
                    ? "appointment.created"
                    : "conversation.handoff_requested",
                entityType: source === "scheduling" ? "appointment" : "conversation",
                entityId: `${source}-entity`,
                entityLabel: `${source} de ${tenantId}`,
                changes: [],
                details: null,
              },
            ],
            hasMore: false,
          },
          requestId: "upstream-request",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
}

async function readActivity(session: SessionHandle, query = "") {
  const response = await app.inject({
    method: "GET",
    url: `/v1/activity${query ? `?${query}` : ""}`,
    headers: browserRead(session),
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().data as {
    items: Array<{
      id: string;
      actor: string;
      area: string;
      action: string;
      entity: { label: string | null };
      changes: Array<{ field: string; before: unknown; after: unknown }>;
    }>;
    nextCursor: string | null;
  };
}

beforeAll(async () => {
  if (!RUN_INTEGRATION) return;
  app = await buildApp();
  await app.ready();
  await assertDisposableTarget();
});

afterEach(() => {
  vi.unstubAllGlobals();
  upstream.length = 0;
});

afterAll(async () => {
  if (!RUN_INTEGRATION) return;
  await cleanupBusinesses(created);
  await app.close();
});

describe.skipIf(!RUN_INTEGRATION)("GET /v1/activity", () => {
  it("registra a edição do perfil com o antes e o depois e intercala as fontes", async () => {
    const a = await registerBusiness(app, "activity-a");
    created.push(a);

    const renamed = await app.inject({
      method: "PATCH",
      url: "/v1/account/profile",
      headers: browserMutation(a),
      payload: { name: "Fixture renomeada" },
    });
    expect(renamed.statusCode).toBe(200);

    stubSources();
    const page = await readActivity(a);
    expect(page.items[0]).toMatchObject({
      id: expect.stringMatching(/^bff:/u),
      actor: "USER",
      area: "SETTINGS",
      action: "account.profile_updated",
      changes: [
        { field: "name", before: "Fixture activity-a", after: "Fixture renomeada" },
      ],
    });
    expect(page.items.map((item) => item.entity.label)).toEqual(
      expect.arrayContaining([
        `scheduling de ${a.tenantId}`,
        `ai de ${a.tenantId}`,
      ]),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("nunca mostra o registro de outro negócio, nem pedindo pela query", async () => {
    const a = await registerBusiness(app, "activity-iso-a");
    const b = await registerBusiness(app, "activity-iso-b");
    created.push(a, b);

    await app.inject({
      method: "PATCH",
      url: "/v1/account/profile",
      headers: browserMutation(a),
      payload: { name: "Só do A" },
    });

    stubSources();
    const page = await readActivity(b, `tenantId=${a.tenantId}`);
    expect(page.items.some((item) => item.action === "account.profile_updated")).toBe(false);
    expect(JSON.stringify(page)).not.toContain(a.tenantId);
    expect(upstream.length).toBeGreaterThan(0);
    for (const call of upstream) {
      expect(call.url).toContain("/internal/activity");
      expect(call.tenantId).toBe(b.tenantId);
    }
  });

  it("registra a troca de senha sem guardar senha nem hash", async () => {
    const a = await registerBusiness(app, "activity-pw");
    created.push(a);
    const changed = await app.inject({
      method: "PATCH",
      url: "/v1/auth/password",
      headers: browserMutation(a),
      payload: {
        currentPassword: a.password,
        newPassword: "Integration-only-456",
        confirmPassword: "Integration-only-456",
      },
    });
    expect(changed.statusCode, changed.body).toBe(200);

    const rows = await getPrisma().activityLog.findMany({
      where: { tenantId: a.tenantId, action: "account.password_changed" },
    });
    expect(rows).toHaveLength(1);
    const user = await getPrisma().user.findUniqueOrThrow({
      where: { id: a.userId },
    });
    const text = JSON.stringify(rows, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    expect(text).not.toContain("Integration-only");
    expect(text).not.toContain(user.passwordHash);
  });

  it("recusa filtro inválido sem chamar nenhuma fonte", async () => {
    const a = await registerBusiness(app, "activity-bad");
    created.push(a);
    stubSources();
    const response = await app.inject({
      method: "GET",
      url: "/v1/activity?area=FINANCEIRO",
      headers: browserRead(a),
    });
    expect(response.statusCode).toBe(400);
    expect(upstream).toHaveLength(0);
  });
});
