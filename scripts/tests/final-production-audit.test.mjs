import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { repositoryRoot } from "../lib/gate.mjs";

test("an unconfigured health check is reported as skipped, not as passed", () => {
  const environment = { ...process.env };
  delete environment.PRODUCTION_HEALTH_TARGETS;

  const outcome = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "final-production-audit.mjs")],
    { cwd: repositoryRoot, env: environment, encoding: "utf8" },
  );

  assert.equal(outcome.status, 0);

  const lines = outcome.stdout.trim().split("\n");
  const health = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find((entry) => entry?.name === "production_health");
  assert.ok(health, "production_health must be reported");
  assert.equal(health.skipped, true);

  const summary = JSON.parse(outcome.stdout.slice(outcome.stdout.lastIndexOf("{")));
  assert.equal(summary.kind, "static-regex-audit");
  assert.equal(summary.skipped, 1);
  assert.deepEqual(summary.skippedChecks, ["production_health"]);
  assert.equal(summary.passed, summary.total - summary.skipped);
  assert.ok(
    summary.passed < summary.total,
    "a skipped check must not be counted as passed",
  );
});
