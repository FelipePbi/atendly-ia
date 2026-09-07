#!/usr/bin/env node

// `validate:core` — builds e suítes locais que não dependem de banco de dados.
//
// Fora deste gate, de propósito: o teste de integração do BFF, que exige um
// PostgreSQL descartável e roda em `validate:integration`.

import {
  isMain,
  printSummary,
  runGate,
  STATUS,
} from "./lib/gate.mjs";

const npm = (cwd, name, ...args) => ({
  name,
  cwd,
  command: "npm",
  args,
});

export const coreSteps = [
  // contracts primeiro: os apps consumidores compilam contra o build dele.
  npm("packages/contracts", "build:contracts", "run", "build"),
  npm("apps/scheduling-service", "build:scheduling-service", "run", "build"),
  npm("apps/ai-orchestrator", "build:ai-orchestrator", "run", "build"),
  npm("apps/bff", "build:bff", "run", "build"),
  npm("apps/frontend", "build:frontend", "run", "build"),
  npm("apps/health-worker", "check:health-worker", "run", "check"),

  npm("apps/ai-orchestrator", "test:ai-orchestrator", "test"),

  {
    name: "build:evolution-go",
    cwd: "apps/evolution-go",
    command: "go",
    args: ["build", "./..."],
  },
  {
    name: "vet:evolution-go",
    cwd: "apps/evolution-go",
    command: "go",
    args: ["vet", "./..."],
  },
  {
    name: "test:evolution-go",
    cwd: "apps/evolution-go",
    command: "go",
    args: ["test", "-count=1", "./..."],
  },

  {
    name: "test:gate-scripts",
    cwd: ".",
    command: "node",
    args: ["--test", "scripts/tests/**/*.test.mjs"],
  },
  {
    name: "audit:static",
    cwd: ".",
    command: "node",
    args: ["scripts/final-production-audit.mjs"],
  },

  // Declarados explicitamente para que "sem suíte" não se confunda com
  // "suíte aprovada".
  {
    name: "test:bff",
    cwd: "apps/bff",
    skip: "only the integration suite exists; it runs in validate:integration",
  },
  {
    name: "test:scheduling-service",
    cwd: "apps/scheduling-service",
    skip: "package has no automated test suite",
  },
  {
    name: "test:contracts",
    cwd: "packages/contracts",
    skip: "package has no automated test suite",
  },
  {
    name: "test:frontend",
    cwd: "apps/frontend",
    skip: "package has no automated test suite",
  },
  {
    name: "test:health-worker",
    cwd: "apps/health-worker",
    skip: "package has no automated test suite; only the syntax check runs",
  },
];

export function main() {
  const { results, exitCode } = runGate("validate:core", coreSteps);
  printSummary("validate:core", results);
  if (exitCode !== 0) {
    console.error(
      "\nvalidate:core FAILED — see the failed steps above. Nothing here proves database persistence; run validate:integration for that.",
    );
  } else {
    console.log(
      `\nvalidate:core PASSED — ${results.filter((item) => item.status === STATUS.skipped).length} step(s) skipped and reported above; database persistence is validated only by validate:integration.`,
    );
  }
  return exitCode;
}

if (isMain(import.meta.url)) process.exit(main());
