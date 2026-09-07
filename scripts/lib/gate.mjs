// Primitivas dos gates de validação (`validate:core` e `validate:integration`).
//
// Regras que este módulo garante:
// - todo passo executa um subprocesso real e qualquer erro dele (status != 0,
//   sinal, ou falha ao iniciar) marca o passo como `failed`;
// - a primeira falha interrompe o gate e os passos restantes ficam `not_run`,
//   nunca `passed`;
// - passos declaradamente sem execução ficam `skipped`, com motivo, e também
//   não contam como `passed`;
// - o código de saída do processo é diferente de zero sempre que houver
//   `failed`.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const STATUS = Object.freeze({
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  notRun: "not_run",
});

export function isMain(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(moduleUrl));
}

function childEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) {
      delete environment[key];
    } else {
      environment[key] = String(value);
    }
  }
  return environment;
}

function describe(step) {
  return [step.command, ...(step.args ?? [])].join(" ");
}

// No Windows `npm`/`npx` são arquivos .cmd e o Node recusa executá-los sem
// shell (EINVAL, correção do CVE-2024-27980). Por isso a linha de comando é
// montada como string única e entregue ao shell — o formato com `shell: true`
// que não passa argumentos soltos para o interpretador. Tokens fora de um
// conjunto seguro são citados para que nem o cmd.exe nem o sh expandam
// curingas como `**/*.test.mjs`.
const SAFE_TOKEN = /^[A-Za-z0-9_@:%+=./,-]+$/u;

function commandLine(step) {
  return [step.command, ...(step.args ?? [])]
    .map((token) => (SAFE_TOKEN.test(token) ? token : JSON.stringify(token)))
    .join(" ");
}

export function runStep(step) {
  const outcome = spawnSync(commandLine(step), {
    cwd: path.join(repositoryRoot, step.cwd ?? "."),
    env: childEnvironment(step.env),
    stdio: "inherit",
    shell: true,
  });

  if (outcome.error) {
    return {
      status: STATUS.failed,
      detail: `failed to start: ${outcome.error.message}`,
    };
  }
  if (outcome.signal) {
    return {
      status: STATUS.failed,
      detail: `terminated by signal ${outcome.signal}`,
    };
  }
  if (outcome.status !== 0) {
    // status null sem error também cai aqui: ausência de código de saída
    // conhecido nunca vira sucesso.
    return { status: STATUS.failed, detail: `exit code ${outcome.status}` };
  }
  return { status: STATUS.passed, detail: "exit code 0" };
}

export function runGate(gateName, steps) {
  const results = [];
  let failureSeen = false;

  for (const step of steps) {
    const base = {
      name: step.name,
      command: step.skip ? null : describe(step),
      cwd: step.cwd ?? ".",
    };

    if (failureSeen) {
      results.push({
        ...base,
        status: STATUS.notRun,
        detail: "not executed after a previous failure",
      });
      continue;
    }
    if (step.skip) {
      results.push({ ...base, status: STATUS.skipped, detail: step.skip });
      continue;
    }

    console.log(`\n[${gateName}] ${step.name}: ${describe(step)} (${base.cwd})`);
    const outcome = runStep(step);
    results.push({ ...base, ...outcome });
    if (outcome.status === STATUS.failed) failureSeen = true;
  }

  return { results, exitCode: failureSeen ? 1 : 0 };
}

export function printSummary(gateName, results) {
  const byStatus = (status) => results.filter((item) => item.status === status);
  console.log(`\n=== ${gateName} summary ===`);
  for (const item of results) {
    console.log(`${item.status.padEnd(8)} ${item.name} — ${item.detail}`);
  }
  console.log(
    JSON.stringify(
      {
        gate: gateName,
        total: results.length,
        passed: byStatus(STATUS.passed).length,
        failed: byStatus(STATUS.failed).length,
        skipped: byStatus(STATUS.skipped).length,
        notRun: byStatus(STATUS.notRun).length,
        failedSteps: byStatus(STATUS.failed).map((item) => item.name),
        skippedSteps: byStatus(STATUS.skipped).map((item) => item.name),
        notRunSteps: byStatus(STATUS.notRun).map((item) => item.name),
      },
      null,
      2,
    ),
  );
}
