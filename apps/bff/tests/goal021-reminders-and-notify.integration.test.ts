import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  ALLOWED_ORIGIN,
  assertDisposableTarget,
  browserMutation,
  browserRead,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Rotas públicas do Goal021/WU-009 — contra sessão real.
 *
 * O que é do BFF, e só aqui pode ser provado: as rotas novas de configuração
 * de lembrete resolvem o negócio pela sessão autenticada e exigem CSRF na
 * escrita, como as demais; a leitura do estado de envio de um agendamento
 * resolve o negócio do mesmo jeito; `notifyCustomer` omitido em
 * cancelar/remarcar não é enviado ao Scheduling como pedido de aviso, e
 * `notifyCustomer: true` o é.
 * A regra em si — que aviso nasce, que lembrete é recomputado — é provada nas
 * suítes do Scheduling; aqui o Scheduling é um dobro HTTP.
 *
 * Sem banco descartável declarado (`BFF_RUN_INTEGRATION_TESTS`), a suíte é
 * pulada de forma declarada, como as demais suítes de integração do BFF.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

interface UpstreamCall {
  method: string;
  url: string;
  tenantId: string | null;
  idempotencyKey: string | null;
  body: string | null;
}

const upstream: UpstreamCall[] = [];

function stubScheduling(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input as RequestInfo, init);
      upstream.push({
        method: request.method,
        url: request.url,
        tenantId: request.headers.get("x-tenant-id"),
        idempotencyKey: request.headers.get("idempotency-key"),
        body:
          request.method === "GET" || request.method === "DELETE"
            ? null
            : await request.text(),
      });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function reminderConfigPayload(overrides: Record<string, unknown> = {}) {
  return {
    configured: false,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1440 }],
    ...overrides,
  };
}

function notificationPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "ntf-1",
    kind: "REMINDER",
    slot: "FIRST",
    appointmentVersion: 1,
    state: "SENT",
    reason: null,
    dueAt: "2026-09-19T12:00:00.000Z",
    sentAt: "2026-09-19T12:00:04.000Z",
    settledAt: "2026-09-19T12:00:04.000Z",
    ...overrides,
  };
}

function appointmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "appointment-1",
    source: "USER",
    title: null,
    date: "2026-09-20",
    startTime: "09:00",
    endTime: "10:00",
    durationMinutes: 60,
    customerId: "customer-1",
    customer: {
      id: "customer-1",
      name: "Thaís",
      phone: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    services: [],
    totalPrice: null,
    totalPriceType: "NONE",
    comments: null,
    status: "CONFIRMED",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    seriesId: null,
    ...overrides,
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
  await app?.close();
});

describe.skipIf(!RUN_INTEGRATION)(
  "Goal021: configuração de lembrete e notifyCustomer em cancelar/remarcar",
  () => {
    it("lê a configuração de lembrete resolvendo o negócio pela sessão", async () => {
      const owner = await registerBusiness(app, "goal021-reminders-a");
      const other = await registerBusiness(app, "goal021-reminders-b");
      created.push(owner, other);
      stubScheduling({
        data: reminderConfigPayload(),
        requestId: "upstream-reminders",
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/settings/reminders?tenantId=${other.tenantId}`,
        headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: reminderConfigPayload(),
        requestId: expect.any(String),
      });
      expect(upstream).toHaveLength(1);
      expect(upstream[0].method).toBe("GET");
      expect(upstream[0].url).toMatch(/\/internal\/reminder-settings$/);
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].tenantId).not.toBe(other.tenantId);
    });

    it("recusa a leitura da configuração de lembrete sem sessão", async () => {
      stubScheduling({
        data: reminderConfigPayload(),
        requestId: "upstream-anon",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/settings/reminders",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
      expect(upstream).toHaveLength(0);
    });

    it("grava a configuração de lembrete com CSRF, repassando o corpo ao Scheduling", async () => {
      const owner = created[0]!;
      const updated = reminderConfigPayload({
        configured: true,
        confirmationEnabled: true,
        pricePolicy: "WHEN_FIXED",
        rules: [
          { slot: "FIRST", leadMinutes: 1440 },
          { slot: "SECOND", leadMinutes: 60 },
        ],
      });
      stubScheduling({ data: updated, requestId: "upstream-patch" });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/reminders",
        headers: browserMutation(owner),
        payload: {
          confirmationEnabled: true,
          pricePolicy: "WHEN_FIXED",
          rules: [
            { slot: "FIRST", leadMinutes: 1440 },
            { slot: "SECOND", leadMinutes: 60 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(updated);
      expect(upstream[0].method).toBe("PATCH");
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(JSON.parse(upstream[0].body ?? "{}")).toEqual({
        confirmationEnabled: true,
        pricePolicy: "WHEN_FIXED",
        rules: [
          { slot: "FIRST", leadMinutes: 1440 },
          { slot: "SECOND", leadMinutes: 60 },
        ],
      });
    });

    it("recusa por CSRF a gravação da configuração de lembrete antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: reminderConfigPayload(),
        requestId: "upstream-csrf",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/reminders",
        headers: { ...browserRead(owner), origin: ALLOWED_ORIGIN },
        payload: { rules: [] },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("CSRF_TOKEN_REJECTED");
      expect(upstream).toHaveLength(0);
    });

    it("repassa a mensagem de exemplo ao Scheduling e a devolve (D-197)", async () => {
      const owner = created[0]!;
      const messageExample =
        "Oii, {nome}! 💛\nSeu {servico} é {data}, às {hora}.";
      const updated = reminderConfigPayload({
        configured: true,
        messageExample,
      });
      stubScheduling({ data: updated, requestId: "upstream-example" });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/reminders",
        headers: browserMutation(owner),
        payload: {
          messageExample,
          rules: [{ slot: "FIRST", leadMinutes: 1440 }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.messageExample).toBe(messageExample);
      expect(JSON.parse(upstream[0].body ?? "{}")).toMatchObject({
        messageExample,
      });
    });

    it("recusa mensagem de exemplo com horário escrito à mão antes de chamar o Scheduling (D-197)", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: reminderConfigPayload(),
        requestId: "upstream-example-invalid",
      });

      for (const messageExample of [
        "Te espero às 15h30!",
        "Oi {cliente}!",
        "x".repeat(601),
      ]) {
        const response = await app.inject({
          method: "PATCH",
          url: "/v1/settings/reminders",
          headers: browserMutation(owner),
          payload: { messageExample, rules: [] },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
      }
      expect(upstream).toHaveLength(0);
    });

    it("recusa mais de dois lembretes antes de chamar o Scheduling", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: reminderConfigPayload(),
        requestId: "upstream-validation",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/settings/reminders",
        headers: browserMutation(owner),
        payload: {
          rules: [
            { slot: "FIRST", leadMinutes: 1440 },
            { slot: "SECOND", leadMinutes: 60 },
            { slot: "FIRST", leadMinutes: 30 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
      expect(upstream).toHaveLength(0);
    });

    it("lê o estado de envio de um agendamento resolvendo o negócio pela sessão", async () => {
      const owner = created[0]!;
      const other = created[1]!;
      stubScheduling({
        data: [
          notificationPayload(),
          notificationPayload({
            id: "ntf-2",
            kind: "CHANGE_NOTICE",
            slot: "CHANGE_NOTICE",
            appointmentVersion: 2,
            state: "PENDING",
            sentAt: null,
            settledAt: null,
          }),
        ],
        requestId: "upstream-notifications",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/appointments/appointment-1/notifications",
        headers: { ...browserRead(owner), "x-tenant-id": other.tenantId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(2);
      expect(response.json().data[0]).toEqual(notificationPayload());
      expect(upstream).toHaveLength(1);
      expect(upstream[0].method).toBe("GET");
      expect(upstream[0].url).toMatch(
        /\/internal\/appointments\/appointment-1\/notifications$/,
      );
      expect(upstream[0].tenantId).toBe(owner.tenantId);
      expect(upstream[0].tenantId).not.toBe(other.tenantId);
    });

    it("recusa sem sessão a leitura do estado de envio de um agendamento", async () => {
      stubScheduling({ data: [], requestId: "upstream-notifications-anon" });

      const response = await app.inject({
        method: "GET",
        url: "/v1/appointments/appointment-1/notifications",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
      expect(upstream).toHaveLength(0);
    });

    it("omite notifyCustomer ao remarcar quando o corpo não o envia", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: appointmentPayload(),
        requestId: "upstream-reschedule-omit",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/appointments/appointment-1/reschedule",
        headers: { ...browserMutation(owner), "idempotency-key": "resched-1" },
        payload: { date: "2026-09-21", startTime: "09:00" },
      });

      expect(response.statusCode).toBe(200);
      const forwarded = JSON.parse(upstream[0].body ?? "{}");
      expect(forwarded.notifyCustomer).toBeUndefined();
    });

    it("repassa notifyCustomer: true ao remarcar quando pedido explicitamente", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: appointmentPayload(),
        requestId: "upstream-reschedule-notify",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/appointments/appointment-1/reschedule",
        headers: { ...browserMutation(owner), "idempotency-key": "resched-2" },
        payload: {
          date: "2026-09-21",
          startTime: "09:00",
          notifyCustomer: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const forwarded = JSON.parse(upstream[0].body ?? "{}");
      expect(forwarded.notifyCustomer).toBe(true);
    });

    it("omite notifyCustomer ao cancelar quando o corpo não o envia", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: appointmentPayload({ status: "CANCELLED" }),
        requestId: "upstream-cancel-omit",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/appointments/appointment-1/cancel",
        headers: { ...browserMutation(owner), "idempotency-key": "cancel-1" },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const forwarded = JSON.parse(upstream[0].body ?? "{}");
      expect(forwarded.notifyCustomer).toBeUndefined();
    });

    it("repassa notifyCustomer: true ao cancelar quando pedido explicitamente", async () => {
      const owner = created[0]!;
      stubScheduling({
        data: appointmentPayload({ status: "CANCELLED" }),
        requestId: "upstream-cancel-notify",
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/appointments/appointment-1/cancel",
        headers: { ...browserMutation(owner), "idempotency-key": "cancel-2" },
        payload: { notifyCustomer: true, reason: "Cliente pediu outro dia" },
      });

      expect(response.statusCode).toBe(200);
      const forwarded = JSON.parse(upstream[0].body ?? "{}");
      expect(forwarded.notifyCustomer).toBe(true);
      expect(forwarded.comments).toBe("Cliente pediu outro dia");
    });
  },
);
