// Guards permanentes do ensaio do Goal033: recusa ANTES de qualquer conexão
// um destino de banco que não seja descartável, recusa quando uma das duas
// portas fixas já está ocupada, e confere que o dublê do Evolution Go
// registra — nunca aceita em silêncio — qualquer chamada fora das rotas
// declaradas, que é o controle negativo que `rehearse()` depois checa.

import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";

import {
  AuthenticatedUiRehearsalError,
  assertPortsFree,
  createEvolutionDouble,
  resolveRehearsalPlan,
} from "../goal033-authenticated-ui-rehearsal.mjs";

const validUrl =
  "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";

function refusal(environment) {
  try {
    resolveRehearsalPlan(environment);
  } catch (error) {
    assert.ok(
      error instanceof AuthenticatedUiRehearsalError,
      `unexpected error type: ${error}`,
    );
    return error;
  }
  return assert.fail("expected resolveRehearsalPlan to refuse the target");
}

test("refuses to run without an explicit test database URL", () => {
  const error = refusal({});
  assert.match(error.message, /BFF_TEST_DATABASE_URL is not set/u);
});

test("refuses a non-loopback host", () => {
  const error = refusal({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@db.example.com:5432/bff_test",
  });
  assert.match(error.message, /not loopback/u);
});

test("refuses a database that is not recognised as disposable", () => {
  const error = refusal({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff",
  });
  assert.match(error.message, /not recognised as disposable/u);
});

test("accepts a loopback, disposable target and derives its own three databases", () => {
  const plan = resolveRehearsalPlan({ BFF_TEST_DATABASE_URL: validUrl });
  assert.equal(plan.bff.database, "atendly_bff_test_goal033_bff");
  assert.equal(plan.scheduling.database, "atendly_bff_test_goal033_scheduling");
  assert.equal(plan.ai.database, "atendly_bff_test_goal033_ai");
});

function withOccupiedPort(run) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const { port } = server.address();
      run(port).then(
        (value) => server.close(() => resolve(value)),
        (error) => server.close(() => reject(error)),
      );
    });
  });
}

test("refuses when the fixed BFF port is already occupied", async () => {
  await withOccupiedPort(async (occupiedPort) => {
    await assert.rejects(
      () =>
        assertPortsFree({ bff: occupiedPort, frontend: occupiedPort + 1 }),
      (error) =>
        error instanceof AuthenticatedUiRehearsalError &&
        /already in use/u.test(error.message) &&
        error.message.includes("GOAL033_BFF_PORT"),
    );
  });
});

test("refuses when the fixed frontend port is already occupied", async () => {
  await withOccupiedPort(async (occupiedPort) => {
    await assert.rejects(
      () =>
        assertPortsFree({ bff: occupiedPort + 1, frontend: occupiedPort }),
      (error) =>
        error instanceof AuthenticatedUiRehearsalError &&
        /already in use/u.test(error.message) &&
        error.message.includes("GOAL033_FRONTEND_PORT"),
    );
  });
});

// O dublê do Evolution Go é o controle negativo declarado deste ensaio: ele
// responde às rotas conhecidas e REGISTRA — sem nunca aceitar em silêncio —
// qualquer rota fora delas. `rehearse()` lê `evolution.unexpected` depois do
// gate e recusa se houver algum registro ali; este teste confere o registro
// em si, sem subir a pilha inteira.
test("the Evolution double registers known calls and records unexpected ones as negative controls", async () => {
  const evolution = createEvolutionDouble();
  const baseUrl = await evolution.listen();
  try {
    const known = await fetch(new URL("/instance/status", baseUrl));
    assert.equal(known.status, 200);
    assert.equal(evolution.calls.length, 1);
    assert.equal(evolution.calls[0].route, "GET /instance/status");
    assert.equal(evolution.unexpected.length, 0);

    const unknown = await fetch(new URL("/send/media", baseUrl), {
      method: "POST",
    });
    assert.equal(unknown.status, 404);
    assert.equal(evolution.calls.length, 2);
    assert.equal(evolution.unexpected.length, 1);
    assert.equal(evolution.unexpected[0].route, "POST /send/media");
  } finally {
    await evolution.close();
  }
});
