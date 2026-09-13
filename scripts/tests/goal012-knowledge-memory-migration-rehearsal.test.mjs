import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import { rehearsalTarget } from "../goal012-knowledge-memory-migration-rehearsal.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";

test("derives a disposable database dedicated to the Goal012 rehearsal", () => {
  const target = rehearsalTarget({ BFF_TEST_DATABASE_URL: validUrl });

  assert.equal(target.name, "atendly_bff_test_goal012");
  assert.equal(target.label, "127.0.0.1:55432/atendly_bff_test_goal012");
  // Nenhum rotulo carrega usuario ou senha.
  assert.ok(!target.label.includes("pgtest"));
});

test("refuses to run without an explicit test database URL", () => {
  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "goal012-knowledge-memory-migration-rehearsal.mjs")],
    { cwd: repositoryRoot, env: {}, encoding: "utf8" },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /REFUSED — BFF_TEST_DATABASE_URL is not set/u);
});

test("refuses a database that is not recognised as disposable", () => {
  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "goal012-knowledge-memory-migration-rehearsal.mjs")],
    {
      cwd: repositoryRoot,
      env: { BFF_TEST_DATABASE_URL: "postgresql://user:pw@127.0.0.1:5432/atendly_bff" },
      encoding: "utf8",
    },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /not recognised as disposable/u);
});

test("refuses a non-loopback host", () => {
  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "goal012-knowledge-memory-migration-rehearsal.mjs")],
    {
      cwd: repositoryRoot,
      env: { BFF_TEST_DATABASE_URL: "postgresql://user:pw@db.example.com:5432/bff_test" },
      encoding: "utf8",
    },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /not loopback/u);
});
