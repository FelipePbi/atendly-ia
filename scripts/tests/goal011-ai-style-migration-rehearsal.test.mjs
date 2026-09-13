import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import { BACKFILL_MAP, rehearsalTarget } from "../goal011-ai-style-migration-rehearsal.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";

test("the backfill map is the one declared in the migration headers, and CASUAL is untouched", () => {
  assert.deepEqual(BACKFILL_MAP, {
    PROFESSIONAL_OBJECTIVE: "PROFESSIONAL",
    LIGHT_CLOSE: "BALANCED",
  });
});

test("derives two distinct disposable databases for the AI and BFF rehearsals", () => {
  const ai = rehearsalTarget({ BFF_TEST_DATABASE_URL: validUrl }, "ai");
  const bff = rehearsalTarget({ BFF_TEST_DATABASE_URL: validUrl }, "bff");

  assert.equal(ai.name, "atendly_bff_test_goal011_ai");
  assert.equal(bff.name, "atendly_bff_test_goal011_bff");
  assert.notEqual(ai.name, bff.name);

  assert.equal(ai.label, "127.0.0.1:55432/atendly_bff_test_goal011_ai");
  assert.equal(bff.label, "127.0.0.1:55432/atendly_bff_test_goal011_bff");
  // Nenhum rotulo carrega usuario ou senha.
  assert.ok(!ai.label.includes("pgtest"));
  assert.ok(!bff.label.includes("pgtest"));
});

test("refuses to run without an explicit test database URL", () => {
  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "goal011-ai-style-migration-rehearsal.mjs")],
    { cwd: repositoryRoot, env: {}, encoding: "utf8" },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /REFUSED — BFF_TEST_DATABASE_URL is not set/u);
});

test("refuses a database that is not recognised as disposable", () => {
  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "goal011-ai-style-migration-rehearsal.mjs")],
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
    [path.join(repositoryRoot, "scripts", "goal011-ai-style-migration-rehearsal.mjs")],
    {
      cwd: repositoryRoot,
      env: { BFF_TEST_DATABASE_URL: "postgresql://user:pw@db.example.com:5432/bff_test" },
      encoding: "utf8",
    },
  );

  assert.equal(outcome.status, 2);
  assert.match(outcome.stderr, /not loopback/u);
});
