import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal029/WU-05 — propagação de `BusinessProfile.timezone` (dono) para o
 * Scheduling (réplica) em `PATCH /v1/settings/business` (D-010), contra
 * dublê HTTP do Scheduling e da IA.
 *
 * O que é provado, contra o Scheduling real substituído por dublê:
 * - mudar o fuso do negócio propaga exatamente uma escrita ao Scheduling;
 * - não mudar o fuso não gera chamada nenhuma — provado pela lista de
 *   chamadas recebidas pelo dublê, não por leitura visual da resposta;
 * - o Scheduling recusando a propagação não derruba a gravação do negócio
 *   nem vira 500: a resposta continua 200 e a não convergência fica legível;
 * - `businessContextPayload` enviado à IA continua derivando de
 *   `BusinessProfile.timezone`, sem projeção nova de fuso.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/**
 * `timezone: null` é o tenant sem `CalendarSettings`, e nesse caso `source` é
 * `null` e as capacidades de agenda são todas `false` — a amarra do serviço
 * real (Goal027), preservada aqui para que uma escrita indevida apareça como
 * agenda ligada, não só como uma chamada a mais.
 */
function calendarPayload(overrides: Record<string, unknown> = {}) {
  const timezone =
    "timezone" in overrides
      ? (overrides.timezone as string | null)
      : "America/Sao_Paulo";
  const hasCalendar = timezone !== null;
  return {
    source: hasCalendar ? "ATENDLY" : null,
    timezone,
    integration: null,
    capabilities: {
      manageAvailability: hasCalendar,
      manageServices: hasCalendar,
      manageCustomers: hasCalendar,
      createAppointments: hasCalendar,
      migrate: hasCalendar,
      aiActivationReady: hasCalendar,
    },
    ...overrides,
  };
}

function stubUpstream(options: {
  configureCalendarStatus?: number;
  calendarTimezone?: string | null;
} = {}): UpstreamCall[] {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      const url = new URL(request.url);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      calls.push({ method: request.method, path: url.pathname, body });

      if (url.pathname === "/internal/calendar" && request.method === "PATCH") {
        if (options.configureCalendarStatus && options.configureCalendarStatus >= 400) {
          return new Response(
            JSON.stringify({ error: { code: "UPSTREAM_DOWN" } }),
            { status: options.configureCalendarStatus, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            data: calendarPayload({ timezone: (body as { timezone?: string })?.timezone }),
            requestId: "upstream-configure",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({
            data: calendarPayload({
              timezone:
                options.calendarTimezone === undefined
                  ? "America/Sao_Paulo"
                  : options.calendarTimezone,
            }),
            requestId: "upstream-calendar",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // `GET /v1/settings` lê a disponibilidade sempre que o calendário é
      // `ATENDLY`, e a resposta dela tem esquema próprio. O dublê precisa
      // responder de verdade: um corpo vazio aqui faria a leitura falhar por
      // esquema, não pelo que estes testes anunciam provar.
      if (url.pathname === "/internal/availability-settings") {
        return new Response(
          JSON.stringify({
            data: {
              timezone: options.calendarTimezone ?? "America/Sao_Paulo",
              rules: [],
            },
            requestId: "upstream-availability",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/ai-tenant-config") {
        return new Response(JSON.stringify({ ok: true, config: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

async function business(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
}

function configureCalendarCalls(calls: UpstreamCall[]): UpstreamCall[] {
  return calls.filter(
    (call) => call.method === "PATCH" && call.path === "/internal/calendar",
  );
}

function aiConfigCalls(calls: UpstreamCall[]): UpstreamCall[] {
  return calls.filter(
    (call) => call.method === "PUT" && call.path === "/internal/ai-tenant-config",
  );
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

describe.skipIf(!RUN_INTEGRATION)("Goal029/WU-05: propagação do fuso do negócio", () => {
  it("mudar o fuso do negócio propaga exatamente uma escrita ao Scheduling", async () => {
    const owner = await business("propagation-changes");
    const calls = stubUpstream({ calendarTimezone: "America/Sao_Paulo" });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio",
        category: "Beleza",
        timezone: "America/New_York",
      },
    });

    expect(response.statusCode).toBe(200);
    const writes = configureCalendarCalls(calls);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toMatchObject({
      source: "AVENLY",
      timezone: "America/New_York",
    });
  });

  it("fuso enviado igual ao gravado não gera nenhuma chamada de escrita ao Scheduling", async () => {
    const owner = await business("propagation-unchanged");
    // O negócio nasce com "America/Sao_Paulo" (default do cadastro); a
    // réplica já observada bate com o mesmo valor, então nem a reconciliação
    // de leitura em settingsState encontra divergência para resolver.
    const calls = stubUpstream({ calendarTimezone: "America/Sao_Paulo" });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio",
        category: "Beleza",
        timezone: "America/Sao_Paulo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(configureCalendarCalls(calls)).toHaveLength(0);
  });

  it("negócio sem agenda escolhida não ganha CalendarSettings pela propagação", async () => {
    const owner = await business("propagation-no-calendar");
    const calls = stubUpstream({ calendarTimezone: null });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio",
        category: "Beleza",
        timezone: "America/New_York",
      },
    });

    expect(response.statusCode).toBe(200);
    // O dono muda; a réplica não existe, e reconciliação replica valor — não
    // cria agenda. Criar aqui ligaria a agenda de um negócio que nunca a
    // escolheu, pelo caminho de gravar o nome do negócio.
    expect(configureCalendarCalls(calls)).toHaveLength(0);

    const row = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(row.timezone).toBe("America/New_York");

    const body = response.json().data;
    expect(body.business.timezone).toBe("America/New_York");
    expect(body.calendar.source).toBeNull();
    expect(body.calendar.timezone).toBeNull();
  });

  it("Scheduling recusando a propagação não derruba a gravação do negócio nem vira 500", async () => {
    const owner = await business("propagation-scheduling-down");
    const calls = stubUpstream({
      configureCalendarStatus: 503,
      calendarTimezone: "America/Sao_Paulo",
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio",
        category: "Beleza",
        timezone: "America/New_York",
      },
    });

    // A resposta não é 500: a falha de propagação nunca vira erro da
    // requisição que já gravou o dono no BFF.
    expect(response.statusCode).toBe(200);
    expect(configureCalendarCalls(calls)).toHaveLength(1);

    const row = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    // O dono permanece gravado mesmo com o Scheduling tendo recusado a réplica.
    expect(row.timezone).toBe("America/New_York");

    // A não convergência fica legível: a réplica na resposta continua o
    // valor antigo, divergente do dono que acabou de ser gravado.
    const body = response.json().data;
    expect(body.business.timezone).toBe("America/New_York");
    expect(body.calendar.timezone).not.toBe("America/New_York");
  });

  it("businessContextPayload enviado à IA continua derivando de BusinessProfile.timezone", async () => {
    const owner = await business("propagation-ai-context");
    const calls = stubUpstream({ calendarTimezone: "America/Sao_Paulo" });

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/business",
      headers: browserMutation(owner),
      payload: {
        name: "Studio",
        category: "Beleza",
        timezone: "America/New_York",
      },
    });
    expect(response.statusCode).toBe(200);

    const projections = aiConfigCalls(calls);
    expect(projections).toHaveLength(1);
    const businessContext = projections[0]?.body?.businessContext as
      | { timezone?: string }
      | undefined;
    // Nenhuma projeção nova de fuso: o valor enviado à IA é o mesmo
    // BusinessProfile.timezone que acabou de ser gravado, não um campo à parte.
    expect(businessContext?.timezone).toBe("America/New_York");

    const row = await getPrisma().businessProfile.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(businessContext?.timezone).toBe(row.timezone);
  });
});
