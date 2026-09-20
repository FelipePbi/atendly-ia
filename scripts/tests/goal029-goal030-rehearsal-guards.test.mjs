// Guards permanentes dos ensaios do Goal029 e do Goal030: os dois abrem mão
// de segurança de rede (recriam bancos inteiros com FORCE) e por isso
// precisam recusar, ANTES de qualquer conexão, qualquer alvo que não seja
// loopback ou que não carregue a marca de descartável — nunca com skip,
// sempre com exit 2 e sem nenhuma credencial na saída.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";
import {
  TimezoneRehearsalError,
  resolveRehearsalPlan as resolveGoal029Plan,
} from "../goal029-timezone-reconciliation-rehearsal.mjs";
import {
  JourneyRehearsalError,
  resolveRehearsalPlan as resolveGoal030Plan,
} from "../goal030-mvp-journey-rehearsal.mjs";

const validUrl = "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff_test";
const notLoopbackUrl =
  "postgresql://pgtest:pgtest@db.example.com:55432/atendly_bff_test";
const notDisposableUrl =
  "postgresql://pgtest:pgtest@127.0.0.1:55432/atendly_bff";

const rehearsals = [
  {
    label: "goal029",
    script: path.join(
      repositoryRoot,
      "scripts",
      "goal029-timezone-reconciliation-rehearsal.mjs",
    ),
    resolvePlan: resolveGoal029Plan,
    ErrorClass: TimezoneRehearsalError,
    refusalPrefix: "goal029:timezone-reconciliation-rehearsal REFUSED — ",
  },
  {
    label: "goal030",
    script: path.join(
      repositoryRoot,
      "scripts",
      "goal030-mvp-journey-rehearsal.mjs",
    ),
    resolvePlan: resolveGoal030Plan,
    ErrorClass: JourneyRehearsalError,
    refusalPrefix: "goal030:mvp-journey-rehearsal REFUSED — ",
  },
];

function run(script, extraEnv) {
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  });
}

function runWithoutTarget(script) {
  const env = { ...process.env };
  delete env.BFF_TEST_DATABASE_URL;
  return spawnSync(process.execPath, [script], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
  });
}

for (const { label, script, resolvePlan, ErrorClass, refusalPrefix } of rehearsals) {
  test(`${label}: refuses a destination that is not loopback`, () => {
    assert.throws(
      () => resolvePlan({ BFF_TEST_DATABASE_URL: notLoopbackUrl }),
      (error) =>
        error instanceof ErrorClass &&
        /is not loopback/u.test(error.message) &&
        !error.message.includes("pgtest:pgtest@"),
    );
  });

  test(`${label}: refuses a database name that is not recognised as disposable`, () => {
    assert.throws(
      () => resolvePlan({ BFF_TEST_DATABASE_URL: notDisposableUrl }),
      (error) =>
        error instanceof ErrorClass &&
        /not recognised as disposable/u.test(error.message) &&
        !error.message.includes("pgtest:pgtest@"),
    );
  });

  test(`${label}: accepts a loopback, disposable target`, () => {
    const plan = resolvePlan({ BFF_TEST_DATABASE_URL: validUrl });

    assert.equal(plan.host, "127.0.0.1");
  });

  test(`${label}: the script exits 2 — never 0 and never skip — with its own message, and prints no credential`, () => {
    const notLoopback = run(script, { BFF_TEST_DATABASE_URL: notLoopbackUrl });
    assert.equal(notLoopback.status, 2);
    assert.match(
      notLoopback.stderr,
      new RegExp(`${refusalPrefix}.*is not loopback`, "u"),
    );
    assert.ok(!notLoopback.stdout.includes("pgtest:pgtest@"));
    assert.ok(!notLoopback.stderr.includes("pgtest:pgtest@"));

    const notDisposable = run(script, { BFF_TEST_DATABASE_URL: notDisposableUrl });
    assert.equal(notDisposable.status, 2);
    assert.match(
      notDisposable.stderr,
      new RegExp(`${refusalPrefix}.*not recognised as disposable`, "u"),
    );
    assert.ok(!notDisposable.stdout.includes("pgtest:pgtest@"));
    assert.ok(!notDisposable.stderr.includes("pgtest:pgtest@"));
  });

  test(`${label}: the script refuses with exit 2 and no credential when the target is entirely unset`, () => {
    const outcome = runWithoutTarget(script);

    assert.equal(outcome.status, 2);
    assert.match(outcome.stderr, new RegExp(`^${refusalPrefix}`, "u"));
    assert.ok(!outcome.stdout.includes("pgtest:pgtest@"));
    assert.ok(!outcome.stderr.includes("pgtest:pgtest@"));
  });
}
