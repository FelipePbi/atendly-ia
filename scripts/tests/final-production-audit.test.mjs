import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

// scripts/final-production-audit.mjs:278 fed group_discard_is_not_configuration
// only appsSources = sourceFiles("apps"), which never collects .env.example or
// docker-compose.yml (extension filter is .cjs/.js/.jsx/.mjs/.ts/.tsx). This
// runs the real script — not the pure finder — against a real .env.example
// mutated to reintroduce EVOLUTION_IGNORE_GROUPS, so a regression that puts
// the extension filter back cannot pass silently.
test("group_discard_is_not_configuration catches EVOLUTION_IGNORE_GROUPS reappearing in a real .env.example, not just source files", () => {
  const envExamplePath = path.join(
    repositoryRoot,
    "apps",
    "ai-orchestrator",
    ".env.example",
  );
  const original = readFileSync(envExamplePath, "utf8");
  try {
    writeFileSync(envExamplePath, `${original}\nEVOLUTION_IGNORE_GROUPS=true\n`);

    const outcome = spawnSync(
      process.execPath,
      [path.join(repositoryRoot, "scripts", "final-production-audit.mjs")],
      { cwd: repositoryRoot, env: process.env, encoding: "utf8" },
    );

    const lines = outcome.stdout.trim().split("\n");
    const check = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.name === "group_discard_is_not_configuration");

    assert.ok(check, "group_discard_is_not_configuration must be reported");
    assert.equal(check.ok, false);
    assert.match(check.details, /apps\/ai-orchestrator\/\.env\.example/u);
    assert.equal(outcome.status, 1);
  } finally {
    writeFileSync(envExamplePath, original);
  }
});
