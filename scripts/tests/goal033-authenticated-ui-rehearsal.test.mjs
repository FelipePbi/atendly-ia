// Guards permanentes do ensaio do Goal033: recusa ANTES de qualquer conexão
// um destino de banco que não seja descartável, recusa quando uma das duas
// portas fixas já está ocupada, e confere que o dublê do Evolution Go
// registra — nunca aceita em silêncio — qualquer chamada fora das rotas
// declaradas, que é o controle negativo que `rehearse()` depois checa.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AuthenticatedUiRehearsalError,
  assertPortsFree,
  createEvolutionDouble,
  extractRetriedTests,
  readGateReport,
  resolveRehearsalPlan,
  SEED,
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

// Goal058 (QA SV-01): o gate salva 45 minutos pelo formulário num serviço
// semeado só para isso e o devolve à duração com que nasceu. Se ele fosse um
// dos serviços que outras medidas nomeiam, ou nascesse com 45, o caso não
// provaria nada ou mudaria o que o resto do gate mede.
test("seeds a service of its own for the duration case, apart from every other seeded service", () => {
  const { durationService, catalogService, onboardingService } = SEED;
  assert.ok(durationService, "SEED.durationService is missing");
  assert.notEqual(durationService.name, catalogService.name);
  assert.notEqual(durationService.name, onboardingService.name);
  assert.equal(durationService.durationMinutes, 60);
  assert.notEqual(durationService.durationMinutes, 45);
  assert.ok(
    durationService.price > 0 && durationService.priceType === "FIXED",
    "the form refuses a fixed price without a value, so the seeded service needs one",
  );
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

// WU-04 (Goal037): a retentativa do gate autenticado precisa deixar de ser
// invisível quando o processo termina com sucesso. `extractRetriedTests` é o
// leitor do relatório JSON que o Playwright já escreve; estes testes provam
// que ele acha o teste `flaky` (falhou numa tentativa, passou na seguinte)
// dentro de suites aninhadas, e que ele nomeia projeto e título — nunca só um
// dos dois.
test("extractRetriedTests finds a flaky test nested inside describe blocks and names project and title", () => {
  const report = {
    suites: [
      {
        title: "authenticated-matrix.spec.ts",
        suites: [
          {
            title: "Agenda",
            specs: [
              {
                title: "shows the booked appointment",
                tests: [
                  {
                    projectName: "mobile-360",
                    status: "flaky",
                  },
                  {
                    projectName: "desktop-1440",
                    status: "expected",
                  },
                ],
              },
            ],
          },
        ],
        specs: [],
      },
    ],
  };
  assert.deepEqual(extractRetriedTests(report), [
    { project: "mobile-360", title: "Agenda > shows the booked appointment" },
  ]);
});

// WU-FIX-001 (Goal037, rodada 2): o spec real usa o MESMO título
// ("measured, logged in") em toda rota, um `test.describe(route.name, ...)`
// por rota. `spec.title` sozinho colapsaria dois flakies de rotas diferentes
// no mesmo registro, escondendo qual dos dois retentou de verdade.
test("extractRetriedTests distinguishes two flaky tests that share the same spec title across different describe blocks", () => {
  const report = {
    suites: [
      {
        title: "authenticated-matrix.spec.ts",
        specs: [],
        suites: [
          {
            title: "agenda",
            specs: [
              {
                title: "measured, logged in",
                tests: [{ projectName: "desktop-1440", status: "flaky" }],
              },
            ],
          },
          {
            title: "clientes",
            specs: [
              {
                title: "measured, logged in",
                tests: [{ projectName: "desktop-1440", status: "flaky" }],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(extractRetriedTests(report), [
    { project: "desktop-1440", title: "agenda > measured, logged in" },
    { project: "desktop-1440", title: "clientes > measured, logged in" },
  ]);
});

test("extractRetriedTests returns an empty list when every test passed on its first attempt", () => {
  const report = {
    suites: [
      {
        title: "authenticated-matrix.spec.ts",
        specs: [
          {
            title: "shows the booked appointment",
            tests: [{ projectName: "mobile-360", status: "expected" }],
          },
        ],
        suites: [],
      },
    ],
  };
  assert.deepEqual(extractRetriedTests(report), []);
});

test("readGateReport refuses with its own error when the report file is missing", () => {
  const missingPath = path.join(
    mkdtempSync(path.join(os.tmpdir(), "goal033-report-")),
    "results.json",
  );
  assert.throws(
    () => readGateReport(missingPath),
    (error) =>
      error instanceof AuthenticatedUiRehearsalError &&
      /is missing/u.test(error.message),
  );
});

test("readGateReport refuses with its own error when the report file is not valid JSON", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "goal033-report-"));
  const reportPath = path.join(directory, "results.json");
  writeFileSync(reportPath, "{not json", "utf8");
  try {
    assert.throws(
      () => readGateReport(reportPath),
      (error) =>
        error instanceof AuthenticatedUiRehearsalError &&
        /not valid JSON/u.test(error.message),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// WU-04 (Goal038): o relatório lido precisa provar que pertence à execução
// que acabou de rodar, não a uma anterior — `notBeforeMs` é o instante em que
// o gate desta execução começou a rodar.
test("readGateReport accepts a report written after this execution's gate started", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "goal033-report-"));
  const reportPath = path.join(directory, "results.json");
  try {
    const notBeforeMs = Date.now() - 1_000;
    writeFileSync(reportPath, JSON.stringify({ suites: [] }), "utf8");
    assert.deepEqual(readGateReport(reportPath, notBeforeMs), { suites: [] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("readGateReport refuses a report written before this execution's gate started, naming it a previous execution", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "goal033-report-"));
  const reportPath = path.join(directory, "results.json");
  try {
    writeFileSync(reportPath, JSON.stringify({ suites: [] }), "utf8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(reportPath, past, past);
    const notBeforeMs = Date.now();
    assert.throws(
      () => readGateReport(reportPath, notBeforeMs),
      (error) =>
        error instanceof AuthenticatedUiRehearsalError &&
        /previous execution/u.test(error.message),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
