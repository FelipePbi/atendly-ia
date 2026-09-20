import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import {
  RestoreRehearsalError,
  SEEDS,
  assertDumpTools,
  compareInventories,
  normalizeConstraintDefinition,
  refusedSqlState,
  resolveRestorePlan,
  restoreDatabaseName,
  seedService,
} from "../goal028-restore-rehearsal.mjs";
import {
  integrationSteps,
  resolveIntegrationTarget,
} from "../validate-integration.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";
const script = path.join(
  repositoryRoot,
  "scripts",
  "goal028-restore-rehearsal.mjs",
);

function run(env) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
  });
}

/** Inventario minimo, no formato que `inventory` devolve. */
function inventoryOf(overrides = {}) {
  return {
    tables: ["_prisma_migrations", "Tenant"],
    counts: { _prisma_migrations: 12, Tenant: 1 },
    migrations: [
      {
        migration_name: "a",
        checksum: "aaa",
        finished_at: "2026-09-20 00:00:00",
        rolled_back_at: null,
        applied_steps_count: 1,
      },
    ],
    indexes: ['Tenant :: CREATE UNIQUE INDEX "Tenant_pkey" ON public."Tenant"'],
    constraints: ['"Tenant" :: Tenant_pkey :: p :: PRIMARY KEY (id)'],
    enums: ["TenantRole :: OWNER"],
    ...overrides,
  };
}

/**
 * Client sintetico: grava o que foi executado e devolve o que o teste mandar.
 * Nenhuma conexao e aberta em teste nenhum deste arquivo.
 */
function stubClient({ rowCount = 1, failOn = null, failureCode = null } = {}) {
  const executed = [];
  return {
    executed,
    async query(sql) {
      executed.push(sql);
      if (failOn && sql.includes(failOn)) {
        const error = new Error("synthetic refusal");
        error.code = failureCode;
        throw error;
      }
      return { rowCount, rows: [] };
    },
  };
}

test("derives one disposable restore database per service from the source databases", () => {
  const plan = resolveRestorePlan({ BFF_TEST_DATABASE_URL: validUrl });

  assert.deepEqual(
    plan.services.map((service) => service.source.database),
    [
      "atendly_bff_test_goal028_bff",
      "atendly_bff_test_goal028_ai",
      "atendly_bff_test_goal028_scheduling",
    ],
  );
  assert.deepEqual(
    plan.services.map((service) => service.restore.database),
    [
      "atendly_bff_test_goal028_bff_restore",
      "atendly_bff_test_goal028_ai_restore",
      "atendly_bff_test_goal028_scheduling_restore",
    ],
  );
  // O destino do restore nunca e o banco de origem: sobrescrever a origem
  // provaria que o dump volta por cima de si mesmo, que nao e restore.
  for (const service of plan.services) {
    assert.notEqual(service.restore.database, service.source.database);
    assert.notEqual(service.restore.url, service.source.url);
    assert.ok(!service.restore.label.includes("pgtest"));
    assert.ok(!service.source.label.includes("pgtest"));
  }
});

test("the maintenance connection never points at a service database", () => {
  const plan = resolveRestorePlan({ BFF_TEST_DATABASE_URL: validUrl });

  assert.equal(new URL(plan.maintenance).pathname, "/postgres");
});

test("restoreDatabaseName keeps the disposable marker of the source database", () => {
  const derived = restoreDatabaseName("atendly_bff_test_goal028_bff");

  assert.equal(derived, "atendly_bff_test_goal028_bff_restore");
  assert.ok(/(?:^|[_-])test(?:[_-]|$)/iu.test(derived));
});

test("refuses, in process, when the test database URL is absent", () => {
  assert.throws(
    () => resolveRestorePlan({}),
    (error) =>
      error instanceof RestoreRehearsalError &&
      /BFF_TEST_DATABASE_URL is not set/u.test(error.message),
  );
});

test("refuses a destination that is not recognised as disposable", () => {
  assert.throws(
    () =>
      resolveRestorePlan({
        BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff",
      }),
    (error) =>
      error instanceof RestoreRehearsalError &&
      /not recognised as disposable/u.test(error.message) &&
      !error.message.includes("pw@"),
  );
});

test("refuses a destination that is not loopback", () => {
  assert.throws(
    () =>
      resolveRestorePlan({
        BFF_TEST_DATABASE_URL:
          "postgresql://user:pw@db.example.com:5432/atendly_bff_test",
      }),
    (error) =>
      error instanceof RestoreRehearsalError &&
      /is not loopback/u.test(error.message),
  );
});

test("the script exits 2 — never 0 and never skip — when the target is refused", () => {
  // Sem variavel de ambiente. A recusa pode vir da ausencia da ferramenta ou
  // da ausencia da variavel, dependendo da maquina; as duas sao exit 2, e
  // nenhuma delas e sucesso.
  const withoutUrl = run({});
  assert.equal(withoutUrl.status, 2);
  assert.match(
    withoutUrl.stderr,
    /goal028:restore-rehearsal REFUSED — (?:BFF_TEST_DATABASE_URL is not set|pg_dump is not available|pg_restore is not available)/u,
  );

  const notDisposable = run({
    ...process.env,
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff",
  });
  assert.equal(notDisposable.status, 2);
  assert.match(notDisposable.stderr, /goal028:restore-rehearsal REFUSED — /u);
  assert.ok(!notDisposable.stderr.includes("pw@"));
});

test("refuses when pg_dump or pg_restore is missing from PATH, instead of skipping", () => {
  const missing = (absent) => (tool) =>
    tool === absent
      ? { error: new Error("spawnSync ENOENT"), status: null, stdout: "" }
      : { status: 0, stdout: `${tool} (PostgreSQL) 18.4\n` };

  for (const tool of ["pg_dump", "pg_restore"]) {
    assert.throws(
      () => assertDumpTools(missing(tool)),
      (error) =>
        error instanceof RestoreRehearsalError &&
        new RegExp(`${tool} is not available on PATH`, "u").test(
          error.message,
        ) &&
        /refuses to run/u.test(error.message),
      `${tool} missing must refuse`,
    );
  }

  // Ferramenta presente porem quebrada (exit != 0) tambem recusa.
  assert.throws(
    () => assertDumpTools(() => ({ status: 127, stdout: "" })),
    (error) => error instanceof RestoreRehearsalError,
  );
});

test("reports the version of both tools when they are available", () => {
  const versions = assertDumpTools((tool) => ({
    status: 0,
    stdout: `${tool} (PostgreSQL) 18.4\n`,
  }));

  assert.deepEqual(versions, {
    pg_dump: "pg_dump (PostgreSQL) 18.4",
    pg_restore: "pg_restore (PostgreSQL) 18.4",
  });
});

// Par REAL observado contra PostgreSQL 18.4: `pg_dump` grava a definicao
// deparsada e o restore a reanalisa, e o parser achata o AND aninhado. O
// significado e o mesmo; so o agrupamento muda.
test("the deparse/reparse round trip of pg_dump is not a lost constraint", () => {
  const atSource =
    '(((("granularityMinutes" >= 5) AND ("granularityMinutes" <= 120)) AND (("granularityMinutes" % 5) = 0) AND ("minLeadMinutes" >= 0)))';
  const afterRestore =
    '(("granularityMinutes" >= 5) AND ("granularityMinutes" <= 120) AND (("granularityMinutes" % 5) = 0) AND ("minLeadMinutes" >= 0))';

  assert.equal(
    normalizeConstraintDefinition(atSource),
    normalizeConstraintDefinition(afterRestore),
  );
});

test("normalisation still separates a constraint that really changed", () => {
  const atSource = 'CHECK ((source = \'ATENDLY\'::"CalendarSource"))';

  for (const changed of [
    'CHECK ((source = \'MINHA_AGENDA\'::"CalendarSource"))',
    'CHECK ((source <> \'ATENDLY\'::"CalendarSource"))',
    'CHECK ((target = \'ATENDLY\'::"CalendarSource"))',
  ]) {
    assert.notEqual(
      normalizeConstraintDefinition(atSource),
      normalizeConstraintDefinition(changed),
      `${changed} must not normalise to the same definition`,
    );
  }
});

test("accepts a restored database identical to the source", () => {
  assert.deepEqual(compareInventories(inventoryOf(), inventoryOf()), []);
});

test("reports a table whose row count did not survive the restore", () => {
  const problems = compareInventories(
    inventoryOf(),
    inventoryOf({ counts: { _prisma_migrations: 12, Tenant: 0 } }),
  );

  assert.ok(
    problems.some((problem) =>
      /table "Tenant" holds 1 row\(s\) at the source and 0 after the restore/u.test(
        problem,
      ),
    ),
  );
});

test("reports a table that the restore lost and one it invented", () => {
  const lost = compareInventories(
    inventoryOf(),
    inventoryOf({ tables: ["_prisma_migrations"], counts: { _prisma_migrations: 12 } }),
  );
  assert.ok(
    lost.some((problem) =>
      /table "Tenant" is missing from the restored database/u.test(problem),
    ),
  );

  const invented = compareInventories(
    inventoryOf({ tables: ["_prisma_migrations"], counts: { _prisma_migrations: 12 } }),
    inventoryOf(),
  );
  assert.ok(
    invented.some((problem) =>
      /table "Tenant" exists only in the restored database/u.test(problem),
    ),
  );
});

test("reports a migration history that did not come back intact", () => {
  const problems = compareInventories(
    inventoryOf(),
    inventoryOf({ migrations: [] }),
  );

  assert.ok(
    problems.some((problem) =>
      /_prisma_migrations did not survive the restore intact/u.test(problem),
    ),
  );
});

test("reports an index, a named constraint and an enum value lost in the restore", () => {
  const problems = compareInventories(
    inventoryOf(),
    inventoryOf({ indexes: [], constraints: [], enums: [] }),
  );

  assert.ok(
    problems.some((problem) => /index\(es\) lost in the restore/u.test(problem)),
  );
  assert.ok(
    problems.some((problem) =>
      /named constraint\(s\) lost in the restore/u.test(problem),
    ),
  );
  assert.ok(
    problems.some((problem) =>
      /enum value\(s\) lost in the restore/u.test(problem),
    ),
  );
});

test("reports a constraint that only the restored database carries", () => {
  const problems = compareInventories(
    inventoryOf({ constraints: [] }),
    inventoryOf(),
  );

  assert.ok(
    problems.some((problem) =>
      /named constraint\(s\) present only in the restored database/u.test(
        problem,
      ),
    ),
  );
});

test("the seed of each service is the declared minimal chain, not the whole domain", () => {
  const tables = Object.fromEntries(
    Object.entries(SEEDS).map(([service, seed]) => [
      service,
      seed.inserts.map((step) => step.table),
    ]),
  );

  assert.deepEqual(tables.bff, [
    "User",
    "UserSession",
    "Tenant",
    "TenantMember",
    "TenantNotification",
  ]);
  assert.deepEqual(tables.ai, [
    "ChannelConnection",
    "Conversation",
    "Message",
    "ProcessedEvent",
  ]);
  assert.deepEqual(tables.scheduling, [
    "CalendarSettings",
    "Customer",
    "Service",
    "Appointment",
    "AppointmentItem",
  ]);

  // Toda fixture e sintetica e reconhecivel, e nenhuma delas e credencial.
  for (const seed of Object.values(SEEDS)) {
    for (const step of seed.inserts) {
      assert.ok(
        step.sql.includes("'goal028-"),
        `${step.table} must seed identifiers prefixed with goal028-`,
      );
    }
    assert.ok(seed.cleanup.length > 0, "every seed must be repeatable");
  }
});

test("seeds the whole chain in one transaction and counts the rows per table", async () => {
  const client = stubClient({ rowCount: 1 });

  const seeded = await seedService(client, SEEDS.scheduling);

  assert.equal(client.executed[0], "BEGIN");
  assert.equal(client.executed.at(-1), "COMMIT");
  // A limpeza vem antes do primeiro INSERT: o ensaio repete sobre um banco que
  // ja recebeu a semente.
  const firstInsert = client.executed.findIndex((sql) =>
    sql.startsWith("INSERT"),
  );
  const lastDelete = client.executed.findLastIndex((sql) =>
    sql.startsWith("DELETE"),
  );
  assert.ok(lastDelete < firstInsert);
  assert.deepEqual(seeded, {
    CalendarSettings: 1,
    Customer: 1,
    Service: 1,
    Appointment: 1,
    AppointmentItem: 1,
  });
});

test("a failed seed rolls back and never leaves half a chain behind", async () => {
  const client = stubClient({ failOn: '"Appointment"' });

  await assert.rejects(() => seedService(client, SEEDS.scheduling));
  assert.equal(client.executed.at(-1), "ROLLBACK");
  assert.ok(!client.executed.includes("COMMIT"));
});

test("refusedSqlState reports the SQLSTATE of a refused statement and always rolls back", async () => {
  const refused = stubClient({ failOn: "MINHA_AGENDA", failureCode: "23514" });
  const outcome = await refusedSqlState(
    refused,
    `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA'`,
  );

  assert.equal(outcome.state, "23514");
  assert.equal(refused.executed.at(-1), "ROLLBACK");
});

test("refusedSqlState reports an accepted statement, with the rows it would have changed", async () => {
  const accepted = stubClient({ rowCount: 1 });
  const outcome = await refusedSqlState(
    accepted,
    `UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA'`,
  );

  // Nao e sucesso: quem chama exige `23514` e falha com `null`.
  assert.equal(outcome.state, null);
  assert.equal(outcome.rowCount, 1);
  assert.equal(accepted.executed.at(-1), "ROLLBACK");
});

test("the script declares the Evolution Go exclusion in its own comment", () => {
  const source = readFileSync(script, "utf8");

  assert.match(source, /EXCLUSAO DECLARADA — Evolution Go/u);
  assert.match(source, /cria as proprias tabelas em codigo Go/u);
  assert.match(source, /nao versiona historico de migrations/u);
});

test("the script proves the Goal027 lock against the RESTORED database", () => {
  const source = readFileSync(script, "utf8");

  assert.match(source, /CalendarSettings_source_atendly_check/u);
  assert.match(source, /23514/u);
  // A tentativa e um UPDATE real, e a linha alvo precisa existir no destino.
  assert.match(source, /UPDATE "CalendarSettings" SET "source" = 'MINHA_AGENDA'/u);
  assert.match(source, /an UPDATE that reaches no row proves nothing/u);
});

test("validate:integration runs the restore rehearsal as a named step of its own", () => {
  const target = resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: validUrl });
  const names = integrationSteps(target).map((step) => step.name);
  const step = integrationSteps(target).find(
    (candidate) => candidate.name === "rehearse:goal028-restore",
  );

  assert.ok(step, "the gate must declare the Goal028 restore rehearsal step");
  assert.equal(step.command, "node");
  assert.deepEqual(step.args, ["scripts/goal028-restore-rehearsal.mjs"]);
  // Nenhum passo do gate pode nascer com skip declarado.
  assert.equal(step.skip, undefined);
  // Depois do ensaio de release, que e quem produz os bancos de origem.
  assert.ok(
    names.indexOf("rehearse:goal028-restore") >
      names.indexOf("rehearse:goal028-release-migrations"),
  );
});
