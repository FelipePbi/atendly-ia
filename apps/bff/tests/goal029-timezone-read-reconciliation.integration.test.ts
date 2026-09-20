import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import {
  assertDisposableTarget,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal029 — os dois pontos de reconciliação de leitura, exercidos pelas rotas
 * públicas de verdade (`GET /v1/settings` e `GET /v1/calendar`), não pelo
 * módulo isolado.
 *
 * O dublê do Scheduling aqui guarda o fuso da réplica em memória e deixa o
 * `PATCH /internal/calendar` alterá-lo, exatamente como o serviço real faz:
 * sem isso, uma segunda leitura continuaria vendo a divergência antiga e a
 * prova de idempotência seria trivialmente verdadeira.
 *
 * O que é provado, rota a rota:
 * - um tenant divergente (dono já mudou, réplica ficou para trás) converge na
 *   leitura, com exatamente uma escrita ao Scheduling;
 * - a resposta da leitura devolve o fuso convergido, não o valor velho;
 * - a segunda leitura sobre o mesmo tenant não escreve de novo (idempotente);
 * - um tenant já convergido não gera escrita nenhuma;
 * - o Scheduling recusando a escrita de convergência não derruba a leitura:
 *   ela responde 200 e a divergência fica legível, sem 500 e sem afirmar
 *   convergência que não houve.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

interface Upstream {
  calls: UpstreamCall[];
  /**
   * O fuso da réplica como o dublê o guarda, depois de qualquer escrita.
   * `null` é "não existe `CalendarSettings`", como no serviço real.
   */
  replicaTimezone(): string | null;
}

/**
 * As capacidades de agenda do serviço real são "tem `CalendarSettings`"
 * (Goal027). O dublê mantém essa amarra: sem a linha elas são todas `false` e
 * `source` é `null`. É isso que torna visível o efeito de uma escrita indevida
 * numa rota de leitura — ela ligaria a agenda de um negócio que nunca a
 * escolheu.
 */
function capabilities(hasCalendar: boolean) {
  return {
    manageAvailability: hasCalendar,
    manageServices: hasCalendar,
    manageCustomers: hasCalendar,
    createAppointments: hasCalendar,
    migrate: hasCalendar,
    aiActivationReady: hasCalendar,
  };
}

/**
 * Dublê HTTP do Scheduling com réplica que existe de verdade entre chamadas.
 * `rejectWrites` recusa só a escrita de convergência, mantendo a leitura de
 * pé — é o caso em que a reconciliação falha sem que a leitura tenha falhado.
 */
function stubScheduling(options: {
  replicaTimezone: string | null;
  rejectWrites?: boolean;
}): Upstream {
  const calls: UpstreamCall[] = [];
  let replica: string | null = options.replicaTimezone;
  // O `PATCH /internal/calendar` do serviço real é um `upsert`: sobre tenant
  // sem a linha ele **cria**, com `source: ATENDLY`. O dublê reproduz isso de
  // propósito — se a reconciliação voltar a escrever aí, o teste vê a agenda
  // aparecer, não só uma chamada a mais.
  const overview = () => ({
    source: replica === null ? null : "ATENDLY",
    timezone: replica,
    integration: null,
    capabilities: capabilities(replica !== null),
  });

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
        if (options.rejectWrites) {
          return new Response(
            JSON.stringify({ error: { code: "UPSTREAM_DOWN" } }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        }
        replica = String((body as { timezone?: string })?.timezone ?? replica);
        return new Response(
          JSON.stringify({ data: overview(), requestId: "upstream-configure" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/calendar") {
        return new Response(
          JSON.stringify({ data: overview(), requestId: "upstream-calendar" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.pathname === "/internal/availability-settings") {
        return new Response(
          JSON.stringify({
            data: { timezone: replica, rules: [] },
            requestId: "upstream-availability",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: null, requestId: "upstream" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  return { calls, replicaTimezone: () => replica };
}

function calendarWrites(calls: UpstreamCall[]): UpstreamCall[] {
  return calls.filter(
    (call) => call.method === "PATCH" && call.path === "/internal/calendar",
  );
}

/**
 * Um negócio cujo dono (`BusinessProfile.timezone`) já mudou e cuja réplica
 * ficou para trás — o estado que qualquer base que passou por
 * `PATCH /v1/settings/business` antes deste Goal carrega hoje. A gravação do
 * dono é feita direto no Prisma de propósito: passar pela rota de negócio
 * propagaria, e o que estes testes precisam é justamente da divergência
 * preexistente que só a leitura pode resolver.
 */
async function divergentBusiness(
  label: string,
  ownerTimezone: string,
): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  await getPrisma().businessProfile.update({
    where: { tenantId: session.tenantId },
    data: { timezone: ownerTimezone },
  });
  return session;
}

/**
 * Um negócio recém-registrado: o dono já existe (`POST /v1/auth/register`
 * grava `BusinessProfile.timezone` como `America/Sao_Paulo`) e o negócio nunca
 * escolheu agenda, então `CalendarSettings` não existe. O dono e a réplica
 * "divergem" só porque a réplica não está lá — e é aí que a reconciliação não
 * pode escrever.
 */
async function businessWithoutCalendar(label: string): Promise<SessionHandle> {
  const session = await registerBusiness(app, label);
  created.push(session);
  return session;
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
  "Goal029: GET /v1/settings reconcilia o fuso na leitura",
  () => {
    it("converge um tenant divergente com exatamente uma escrita e devolve o fuso do dono", async () => {
      const owner = await divergentBusiness("read-settings-diverged", "America/Bahia");
      const upstream = stubScheduling({ replicaTimezone: "America/Sao_Paulo" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const writes = calendarWrites(upstream.calls);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.body).toEqual({
        source: "ATENDLY",
        timezone: "America/Bahia",
      });
      // A réplica do dublê realmente mudou de valor: a convergência é efeito
      // observado, não o que a resposta afirma.
      expect(upstream.replicaTimezone()).toBe("America/Bahia");

      const body = response.json().data;
      expect(body.business.timezone).toBe("America/Bahia");
      expect(body.calendar.timezone).toBe("America/Bahia");
    });

    it("segunda leitura sobre o tenant já convergido não escreve de novo", async () => {
      const owner = await divergentBusiness("read-settings-idempotent", "America/Bahia");
      const upstream = stubScheduling({ replicaTimezone: "America/Sao_Paulo" });

      const first = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });
      expect(first.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(1);

      const second = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      expect(second.statusCode).toBe(200);
      expect(second.json().data.calendar.timezone).toBe("America/Bahia");
      // Nenhuma escrita nova: a segunda passada encontra as duas cópias iguais.
      expect(calendarWrites(upstream.calls)).toHaveLength(1);
    });

    it("tenant já convergido não gera escrita nenhuma", async () => {
      const owner = await divergentBusiness("read-settings-converged", "America/Bahia");
      const upstream = stubScheduling({ replicaTimezone: "America/Bahia" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(0);
    });

    it("negócio que nunca escolheu agenda não ganha CalendarSettings na leitura", async () => {
      const owner = await businessWithoutCalendar("read-settings-no-calendar");
      const upstream = stubScheduling({ replicaTimezone: null });

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      // Nenhuma escrita: réplica ausente não é réplica divergente.
      expect(calendarWrites(upstream.calls)).toHaveLength(0);
      expect(upstream.replicaTimezone()).toBeNull();

      const body = response.json().data;
      expect(body.business.timezone).toBe("America/Sao_Paulo");
      // A rota pública continua dizendo "sem agenda". Uma escrita aqui teria
      // virado `source: ATENDLY` com todas as capacidades em `true`.
      expect(body.calendar.source).toBeNull();
      expect(body.calendar.timezone).toBeNull();
      expect(body.calendar.capabilities).toEqual({
        manageAvailability: false,
        manageServices: false,
        manageCustomers: false,
        createAppointments: false,
        migrate: false,
        aiActivationReady: false,
      });
    });

    it("Scheduling recusando a escrita de convergência não vira 500 e deixa a divergência legível", async () => {
      const owner = await divergentBusiness("read-settings-write-down", "America/Bahia");
      const upstream = stubScheduling({
        replicaTimezone: "America/Sao_Paulo",
        rejectWrites: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(1);
      const body = response.json().data;
      expect(body.business.timezone).toBe("America/Bahia");
      // A réplica sai com o valor que continua gravado no Scheduling, ao lado
      // do dono divergente na mesma resposta.
      expect(body.calendar.timezone).toBe("America/Sao_Paulo");
    });
  },
);

describe.skipIf(!RUN_INTEGRATION)(
  "Goal029: GET /v1/calendar reconcilia o fuso na leitura",
  () => {
    it("converge um tenant divergente com exatamente uma escrita e devolve o fuso do dono", async () => {
      const owner = await divergentBusiness("read-calendar-diverged", "America/Manaus");
      const upstream = stubScheduling({ replicaTimezone: "America/Recife" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      const writes = calendarWrites(upstream.calls);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.body).toEqual({
        source: "ATENDLY",
        timezone: "America/Manaus",
      });
      expect(upstream.replicaTimezone()).toBe("America/Manaus");
      // É este `timezone` que a agenda do frontend usa para renderizar dia,
      // semana, mês, formulário e bloqueios.
      expect(response.json().data.timezone).toBe("America/Manaus");
    });

    it("segunda leitura sobre o tenant já convergido não escreve de novo", async () => {
      const owner = await divergentBusiness("read-calendar-idempotent", "America/Manaus");
      const upstream = stubScheduling({ replicaTimezone: "America/Recife" });

      const first = await app.inject({
        method: "GET",
        url: "/v1/calendar",
        headers: browserRead(owner),
      });
      expect(first.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(1);

      const second = await app.inject({
        method: "GET",
        url: "/v1/calendar",
        headers: browserRead(owner),
      });

      expect(second.statusCode).toBe(200);
      expect(second.json().data.timezone).toBe("America/Manaus");
      expect(calendarWrites(upstream.calls)).toHaveLength(1);
    });

    it("negócio que nunca escolheu agenda não ganha CalendarSettings na leitura", async () => {
      const owner = await businessWithoutCalendar("read-calendar-no-calendar");
      const upstream = stubScheduling({ replicaTimezone: null });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(0);
      expect(upstream.replicaTimezone()).toBeNull();

      const body = response.json().data;
      expect(body.source).toBeNull();
      expect(body.timezone).toBeNull();
      expect(body.capabilities).toEqual({
        manageAvailability: false,
        manageServices: false,
        manageCustomers: false,
        createAppointments: false,
        migrate: false,
        aiActivationReady: false,
      });
    });

    it("Scheduling recusando a escrita de convergência não vira 500 e deixa a divergência legível", async () => {
      const owner = await divergentBusiness("read-calendar-write-down", "America/Manaus");
      const upstream = stubScheduling({
        replicaTimezone: "America/Recife",
        rejectWrites: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/calendar",
        headers: browserRead(owner),
      });

      expect(response.statusCode).toBe(200);
      expect(calendarWrites(upstream.calls)).toHaveLength(1);
      // Sem convergência, a rota devolve o fuso que continua gravado no
      // Scheduling — nunca o do dono, que seria afirmar o efeito que falhou.
      expect(response.json().data.timezone).toBe("America/Recife");
    });
  },
);
