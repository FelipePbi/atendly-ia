import assert from "node:assert/strict";
import test from "node:test";

import { coreSteps } from "../validate-core.mjs";
import { runGate, runStep, STATUS } from "../lib/gate.mjs";

const failingStep = {
  name: "synthetic-failure",
  cwd: ".",
  command: "node",
  args: ["scripts/tests/fixtures/failing-step.mjs"],
};
const passingStep = {
  name: "synthetic-success",
  cwd: ".",
  command: "node",
  args: ["scripts/tests/fixtures/passing-step.mjs"],
};

test("a failing subprocess is reported as failed and never as exit 0", () => {
  const outcome = runStep(failingStep);
  assert.equal(outcome.status, STATUS.failed);
  assert.match(outcome.detail, /exit code 3/u);

  const gate = runGate("synthetic", [passingStep, failingStep]);
  assert.equal(gate.exitCode, 1);
  assert.equal(gate.results[0].status, STATUS.passed);
  assert.equal(gate.results[1].status, STATUS.failed);
});

test("steps after a failure are not_run instead of passed", () => {
  const gate = runGate("synthetic", [failingStep, passingStep]);
  assert.equal(gate.exitCode, 1);
  assert.equal(gate.results[1].status, STATUS.notRun);
  assert.equal(
    gate.results.filter((item) => item.status === STATUS.passed).length,
    0,
  );
});

test("a command that cannot be executed is a failure", () => {
  const outcome = runStep({
    name: "missing-binary",
    cwd: ".",
    command: "atendly-command-that-does-not-exist",
    args: [],
  });
  assert.equal(outcome.status, STATUS.failed);
});

test("a declared skip never counts as passed", () => {
  const gate = runGate("synthetic", [
    { name: "no-suite", cwd: ".", skip: "package has no test suite" },
  ]);
  assert.equal(gate.exitCode, 0);
  assert.equal(gate.results[0].status, STATUS.skipped);
  assert.equal(gate.results[0].detail, "package has no test suite");
});

test("validate:core declares the Scheduling Service build", () => {
  const scheduling = coreSteps.find(
    (step) => step.cwd === "apps/scheduling-service" && !step.skip,
  );
  assert.ok(scheduling, "Scheduling Service must be part of validate:core");
  assert.equal(scheduling.name, "build:scheduling-service");
  assert.deepEqual([scheduling.command, ...scheduling.args], [
    "npm",
    "run",
    "build",
  ]);

  const executed = coreSteps.filter((step) => !step.skip).map((s) => s.name);
  assert.ok(
    executed.indexOf("build:contracts") <
      executed.indexOf("build:scheduling-service"),
    "contracts must build before the consuming apps",
  );
  for (const expected of [
    "build:contracts",
    "build:scheduling-service",
    "build:ai-orchestrator",
    "build:bff",
    "build:frontend",
    "check:health-worker",
    "test:ai-orchestrator",
    "build:evolution-go",
    "vet:evolution-go",
    "test:evolution-go",
  ]) {
    assert.ok(executed.includes(expected), `missing core step: ${expected}`);
  }
});

test("validate:core does not run the BFF integration suite", () => {
  const bff = coreSteps.find((step) => step.name === "test:bff");
  assert.ok(bff.skip, "BFF integration must be left to validate:integration");
});
