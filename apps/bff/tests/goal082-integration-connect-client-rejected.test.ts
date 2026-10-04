import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  assertDisposableTarget,
  browserMutation,
  cleanupBusinesses,
  registerBusiness,
  RUN_INTEGRATION,
  type SessionHandle,
} from "./helpers/integration.js";

/**
 * Goal082/WU-02 — a recusa da identificação do app pelo portal
 * (`MINHA_AGENDA_CLIENT_REJECTED`, falha da Avenly) chega do Scheduling com
 * 503 e o BFF a repassa como `UPSTREAM_ERROR` com o mesmo 503, não 502, e com
 * `details.upstreamCode` igual. `MINHA_AGENDA_AUTH_FAILED` (422) e
 * `MINHA_AGENDA_NOT_CONFIGURED` (503) seguem como no Goal060. O Scheduling é
 * um dobro HTTP.
 */
let app: FastifyInstance;
const created: SessionHandle[] = [];

function stubScheduling(payload: unknown, status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
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

describe.skipIf(!RUN_INTEGRATION)(
  "Goal082/WU-02: MINHA_AGENDA_CLIENT_REJECTED no POST /v1/calendar/integration/connect",
  () => {
    it.each([
      {
        code: "MINHA_AGENDA_CLIENT_REJECTED",
        message: "Minha Agenda rejected the application credential.",
        status: 503,
      },
      {
        code: "MINHA_AGENDA_NOT_CONFIGURED",
        message: "The Minha Agenda origin is not configured on this environment.",
        status: 503,
      },
      {
        code: "MINHA_AGENDA_AUTH_FAILED",
        message: "Minha Agenda authentication failed: invalid credentials.",
        status: 422,
      },
    ])(
      "$code chega como UPSTREAM_ERROR com status $status e o upstreamCode",
      async ({ code, message, status }) => {
        if (created.length === 0) {
          created.push(await registerBusiness(app, "goal082-connect-rejected"));
        }
        const owner = created[0]!;
        stubScheduling(
          {
            error: { code, message, details: { originStatus: 401 } },
            requestId: `upstream-${code}`,
          },
          status,
        );

        const response = await app.inject({
          method: "POST",
          url: "/v1/calendar/integration/connect",
          headers: browserMutation(owner),
          payload: { email: "dono@example.invalid", password: "s3nha-forte" },
        });

        expect(response.statusCode).toBe(status);
        expect(response.json().error).toMatchObject({
          code: "UPSTREAM_ERROR",
          details: { upstreamCode: code },
        });
      },
    );
  },
);
