import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import {
  ReleaseRehearsalError,
  assertExtensionsAvailable,
  assertRequiredBinaries,
  compareAppliedMigrations,
  migrationsFingerprint,
  readMigrationDirectories,
  readRequiredExtensions,
  redactConnectionStrings,
  resolveRehearsalPlan,
  serviceDatabaseName,
} from "../goal028-release-rehearsal.mjs";
import { integrationSteps, resolveIntegrationTarget } from "../validate-integration.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";
const script = path.join(repositoryRoot, "scripts", "goal028-release-rehearsal.mjs");

function run(env) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
  });
}

function migrationTree(entries) {
  const root = mkdtempSync(path.join(tmpdir(), "goal028-migrations-"));
  for (const [name, sql] of Object.entries(entries)) {
    mkdirSync(path.join(root, name));
    if (sql !== null) writeFileSync(path.join(root, name, "migration.sql"), sql);
  }
  return root;
}

test("derives one disposable database per service from the validated target", () => {
  const plan = resolveRehearsalPlan({ BFF_TEST_DATABASE_URL: validUrl });

  assert.deepEqual(
    plan.services.map((service) => service.database),
    [
      "atendly_bff_test_goal028_bff",
      "atendly_bff_test_goal028_ai",
      "atendly_bff_test_goal028_scheduling",
    ],
  );
  assert.deepEqual(
    plan.services.map((service) => service.label),
    [
      "127.0.0.1:55432/atendly_bff_test_goal028_bff",
      "127.0.0.1:55432/atendly_bff_test_goal028_ai",
      "127.0.0.1:55432/atendly_bff_test_goal028_scheduling",
    ],
  );
  // Nenhum rotulo carrega usuario ou senha, e nenhum banco de ensaio anterior
  // e reaproveitado: a prova e de banco limpo.
  for (const service of plan.services) {
    assert.ok(!service.label.includes("pgtest"));
    assert.ok(!/_goal0(0[3-9]|1[0-9]|2[1-7])$/u.test(service.database));
  }
});

test("the maintenance connection never points at a service database", () => {
  const plan = resolveRehearsalPlan({ BFF_TEST_DATABASE_URL: validUrl });

  assert.equal(new URL(plan.maintenance).pathname, "/postgres");
});

test("serviceDatabaseName keeps the disposable marker of the base database", () => {
  assert.equal(
    serviceDatabaseName("atendly_bff_test", "goal028_bff"),
    "atendly_bff_test_goal028_bff",
  );
});

test("redactConnectionStrings strips credentials from anything printed", () => {
  const output = redactConnectionStrings(
    'Datasource "db" at postgresql://pgtest:s3cret@127.0.0.1:55432/atendly_bff_test',
  );

  assert.ok(!output.includes("s3cret"));
  assert.ok(!output.includes("pgtest"));
  assert.match(output, /postgresql:\/\/\*\*\*@127\.0\.0\.1:55432/u);
});

test("reads the expected migration count from the tree, not from a literal", () => {
  const root = migrationTree({
    "20260101000000_one": "SELECT 1;",
    "20260102000000_two": "SELECT 2;",
    // Diretorio sem `migration.sql` nao e migration e nao entra na contagem.
    "20260103000000_not_a_migration": null,
  });

  assert.deepEqual(readMigrationDirectories(root), [
    "20260101000000_one",
    "20260102000000_two",
  ]);
});

test("reads the required server extensions from the migration SQL", () => {
  const root = migrationTree({
    "20260101000000_one": "CREATE EXTENSION IF NOT EXISTS vector;\nSELECT 1;",
    "20260102000000_two": 'CREATE EXTENSION "pgcrypto";',
  });

  assert.deepEqual(
    readRequiredExtensions(root, readMigrationDirectories(root)),
    ["pgcrypto", "vector"],
  );
});

test("the three services of the tree declare the migrations the rehearsal counts", () => {
  const counts = Object.fromEntries(
    ["bff", "ai-orchestrator", "scheduling-service"].map((app) => [
      app,
      readMigrationDirectories(
        path.join(repositoryRoot, "apps", app, "prisma", "migrations"),
      ).length,
    ]),
  );

  // Nao e a contagem esperada escrita a mao: e a prova de que a leitura da
  // arvore enxerga migration em cada um dos tres servicos.
  for (const [app, total] of Object.entries(counts)) {
    assert.ok(total > 0, `${app} must declare at least one migration`);
  }
});

test("accepts a history whose applied rows match the tree", () => {
  const rows = [
    {
      migration_name: "a",
      finished_at: "2026-09-20 00:00:00",
      rolled_back_at: null,
      applied_steps_count: 1,
    },
    {
      migration_name: "b",
      finished_at: "2026-09-20 00:00:01",
      rolled_back_at: null,
      applied_steps_count: 3,
    },
  ];

  assert.deepEqual(compareAppliedMigrations(["a", "b"], rows), []);
});

test("reports a migration that the tree declares and the database never applied", () => {
  const rows = [
    {
      migration_name: "a",
      finished_at: "2026-09-20 00:00:00",
      rolled_back_at: null,
      applied_steps_count: 1,
    },
  ];

  const problems = compareAppliedMigrations(["a", "b"], rows);

  assert.ok(problems.some((problem) => /applied 1 migration\(s\) but the tree declares 2/u.test(problem)));
  assert.ok(problems.some((problem) => /never applied: b/u.test(problem)));
});

test("reports a row applied from outside the tree", () => {
  const rows = [
    {
      migration_name: "ghost",
      finished_at: "2026-09-20 00:00:00",
      rolled_back_at: null,
      applied_steps_count: 1,
    },
  ];

  assert.ok(
    compareAppliedMigrations(["a"], rows).some((problem) =>
      /applied but absent from the tree: ghost/u.test(problem),
    ),
  );
});

test("reports a rolled back, an unfinished and a stepless migration", () => {
  const rows = [
    {
      migration_name: "a",
      finished_at: "2026-09-20 00:00:00",
      rolled_back_at: "2026-09-20 00:00:05",
      applied_steps_count: 1,
    },
    {
      migration_name: "b",
      finished_at: null,
      rolled_back_at: null,
      applied_steps_count: 1,
    },
    {
      migration_name: "c",
      finished_at: "2026-09-20 00:00:02",
      rolled_back_at: null,
      applied_steps_count: 0,
    },
  ];

  const problems = compareAppliedMigrations(["a", "b", "c"], rows);

  assert.ok(problems.some((problem) => /rolled back: a/u.test(problem)));
  assert.ok(problems.some((problem) => /finished_at IS NULL: b/u.test(problem)));
  assert.ok(problems.some((problem) => /applied_steps_count < 1: c/u.test(problem)));
});

test("the fingerprint changes when a second deploy would touch _prisma_migrations", () => {
  const before = [
    {
      migration_name: "a",
      checksum: "aaa",
      finished_at: "2026-09-20 00:00:00",
      rolled_back_at: null,
      applied_steps_count: 1,
    },
  ];
  const after = [
    ...before,
    {
      migration_name: "b",
      checksum: "bbb",
      finished_at: "2026-09-20 00:01:00",
      rolled_back_at: null,
      applied_steps_count: 1,
    },
  ];

  assert.deepEqual(migrationsFingerprint(before), migrationsFingerprint(before));
  assert.notDeepEqual(migrationsFingerprint(before), migrationsFingerprint(after));
});

test("refuses to run without an explicit test database URL", () => {
  const outcome = run({});

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /REFUSED — BFF_TEST_DATABASE_URL is not set/u);
});

test("refuses a destination that is not recognised as disposable", () => {
  const outcome = run({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff",
  });

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /not recognised as disposable/u);
  assert.ok(!outcome.stderr.includes("pw@"));
});

test("refuses a destination that is not loopback", () => {
  const outcome = run({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@db.example.com:5432/atendly_bff_test",
  });

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /is not loopback/u);
  assert.ok(!outcome.stderr.includes("pw@"));
});

test("refuses when the Prisma CLI of a service is not installed", () => {
  assert.throws(
    () => assertRequiredBinaries([{ name: "ghost", app: "service-that-does-not-exist" }]),
    (error) =>
      error instanceof ReleaseRehearsalError &&
      /The Prisma CLI is not installed for apps\/service-that-does-not-exist/u.test(
        error.message,
      ),
  );
});

// Client sintetico: devolve as extensoes que o "servidor" ofereceria, sem
// abrir conexao nenhuma.
function stubClient(availableNames) {
  return class {
    async connect() {}
    async query(_sql, [required]) {
      return {
        rows: required
          .filter((name) => availableNames.includes(name))
          .map((name) => ({ name })),
      };
    }
    async end() {}
  };
}

test("refuses when the server does not offer an extension the history requires", async () => {
  await assert.rejects(
    assertExtensionsAvailable(stubClient([]), "postgresql://x/postgres", ["vector"]),
    (error) =>
      error instanceof ReleaseRehearsalError &&
      /does not offer the extension\(s\) vector/u.test(error.message),
  );
});

test("accepts when every required extension is available, and when none is required", async () => {
  await assertExtensionsAvailable(stubClient(["vector"]), "postgresql://x/postgres", [
    "vector",
  ]);
  // Lista vazia nao abre conexao: o Client sintetico lancaria se fosse usado.
  await assertExtensionsAvailable(
    class {
      async connect() {
        throw new Error("must not connect when nothing is required");
      }
    },
    "postgresql://x/postgres",
    [],
  );
});

test("validate:integration runs the rehearsal as a named step of its own", () => {
  const target = resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: validUrl });
  const step = integrationSteps(target).find(
    (candidate) => candidate.name === "rehearse:goal028-release-migrations",
  );

  assert.ok(step, "the gate must declare the Goal028 release rehearsal step");
  assert.equal(step.command, "node");
  assert.deepEqual(step.args, ["scripts/goal028-release-rehearsal.mjs"]);
  // Nenhum passo do gate pode nascer com skip declarado.
  assert.equal(step.skip, undefined);
});
