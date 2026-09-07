import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import {
  assertDriverResolvesSameDestination,
  driverDestination,
  IntegrationTargetError,
  integrationSteps,
  resolveIntegrationTarget,
} from "../validate-integration.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";

function refusal(environment) {
  try {
    resolveIntegrationTarget(environment);
  } catch (error) {
    assert.ok(
      error instanceof IntegrationTargetError,
      `unexpected error type: ${error}`,
    );
    return error;
  }
  return assert.fail("expected resolveIntegrationTarget to refuse the target");
}

test("refuses to run without an explicit test database URL", () => {
  const error = refusal({});
  assert.match(error.message, /BFF_TEST_DATABASE_URL is not set/u);
  assert.match(error.message, /will not fall back/u);
});

test("refuses an inherited DATABASE_URL as a substitute", () => {
  // Um DATABASE_URL herdado do shell ou do .env não habilita o gate.
  refusal({ DATABASE_URL: validUrl });
});

test("refuses a database that is not marked as disposable", () => {
  const error = refusal({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff",
  });
  assert.match(error.message, /not recognised as disposable/u);
});

test("refuses a non-loopback host", () => {
  const error = refusal({
    BFF_TEST_DATABASE_URL: "postgresql://user:pw@db.example.com:5432/bff_test",
  });
  assert.match(error.message, /not loopback/u);
});

test("refuses a non-postgres protocol", () => {
  refusal({ BFF_TEST_DATABASE_URL: "mysql://user:pw@127.0.0.1:3306/bff_test" });
});

test("accepts a disposable loopback database without leaking credentials", () => {
  const target = resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: validUrl });
  assert.equal(target.database, "atendly_bff_test");
  assert.equal(target.label, "127.0.0.1:55432/atendly_bff_test");
  assert.ok(!target.label.includes("pgtest"), "label must not carry credentials");
});

test("points the subprocess at the declared test database with synthetic secrets", () => {
  const steps = integrationSteps(
    resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: validUrl }),
  );
  assert.deepEqual(
    steps.map((step) => step.name),
    [
      "generate:bff-prisma-client",
      "migrate:bff-test-database",
      "test:bff-integration",
    ],
  );
  for (const step of steps) {
    assert.equal(step.cwd, "apps/bff");
    // Nunca depender do fallback embutido em apps/bff/prisma.config.ts.
    assert.equal(step.env.DATABASE_URL, validUrl);
    assert.equal(step.env.DIRECT_DATABASE_URL, validUrl);
    assert.equal(step.env.BFF_RUN_INTEGRATION_TESTS, "true");
    assert.ok(step.env.JWT_SECRET.startsWith("integration-only-"));
  }
});

// R2-02: um checkout limpo não tem `apps/bff/src/generated/prisma`; sem gerar o
// client antes, a suíte falha na importação.
test("generates the Prisma client before migrating or testing", () => {
  const steps = integrationSteps(
    resolveIntegrationTarget({ BFF_TEST_DATABASE_URL: validUrl }),
  );
  const generate = steps[0];
  assert.equal(generate.name, "generate:bff-prisma-client");
  assert.deepEqual(
    [generate.command, ...generate.args],
    ["npx", "prisma", "generate"],
  );
  const order = steps.map((step) => step.name);
  assert.ok(
    order.indexOf("generate:bff-prisma-client") <
      order.indexOf("migrate:bff-test-database"),
  );
  assert.ok(
    order.indexOf("migrate:bff-test-database") <
      order.indexOf("test:bff-integration"),
  );
});

// R2-01: parâmetros de query redirecionam o driver sem mudar a autoridade da
// URL. Estes casos são exatamente o bypass reportado no review002.
const REDIRECTING_QUERIES = [
  "host=outside.invalid&port=6432",
  "host=outside.invalid",
  "port=6432",
  "hostaddr=203.0.113.7",
  "dbname=another_test",
  "service=production",
  "servicefile=C:/synthetic/pg_service.conf",
  "passfile=C:/synthetic/pgpass",
  "options=-c%20search_path%3Dinjected",
];

for (const query of REDIRECTING_QUERIES) {
  test(`refuses a URL whose query can redirect the driver: ${query}`, () => {
    const error = refusal({ BFF_TEST_DATABASE_URL: `${validUrl}?${query}` });
    assert.match(error.message, /are not allowed in BFF_TEST_DATABASE_URL/u);
  });
}

test("the reported bypass really moves the driver, and is now refused", () => {
  const exploit = `${validUrl}?host=outside.invalid&port=6432`;

  // O driver do BFF (`pg`) obedece à query: sem o guard, o alvo anunciado e o
  // alvo real divergem. Nenhuma conexão é aberta aqui.
  const resolved = driverDestination(exploit);
  assert.equal(resolved.host, "outside.invalid");
  assert.equal(resolved.port, "6432");
  assert.equal(resolved.database, "atendly_bff_test");

  refusal({ BFF_TEST_DATABASE_URL: exploit });
});

test("the effective destination is compared against the validated one", () => {
  assert.throws(
    () =>
      assertDriverResolvesSameDestination(validUrl, {
        host: "127.0.0.1",
        port: "9999",
        database: "atendly_bff_test",
      }),
    IntegrationTargetError,
  );
  assert.doesNotThrow(() =>
    assertDriverResolvesSameDestination(validUrl, {
      host: "127.0.0.1",
      port: "55432",
      database: "atendly_bff_test",
    }),
  );
});

test("keeps accepting harmless connection options", () => {
  for (const query of [
    "sslmode=disable",
    "schema=public",
    "connect_timeout=5&application_name=gate",
    "connection_limit=1&pool_timeout=10",
  ]) {
    const target = resolveIntegrationTarget({
      BFF_TEST_DATABASE_URL: `${validUrl}?${query}`,
    });
    assert.equal(target.label, "127.0.0.1:55432/atendly_bff_test");
  }
});

test("the CLI exits non-zero and runs no step when the URL is missing", () => {
  const environment = { ...process.env };
  delete environment.BFF_TEST_DATABASE_URL;

  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "validate-integration.mjs")],
    { cwd: repositoryRoot, env: environment, encoding: "utf8" },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /validate:integration REFUSED/u);
  assert.doesNotMatch(
    outcome.stdout,
    /migrate:bff-test-database|test:bff-integration/u,
    "no step may run before the target is accepted",
  );
});
