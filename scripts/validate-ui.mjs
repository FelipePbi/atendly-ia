#!/usr/bin/env node

// Gate público do Playwright (Goal031), agora declarando retentativa pelo
// mesmo leitor compartilhado do gate autenticado (Goal033) — Goal038/WU-05.
//
// `npm run validate:ui` continua sendo o comando, continua executando
// `playwright test` (via `npm run test:ui` dentro de `apps/frontend`) e
// continua medindo as cinco larguras declaradas em `playwright.config.ts`. O
// exit code não-zero do Playwright continua sendo o exit code deste passo.
//
// O que muda: ao final, o relatório JSON que o reporter já escreve
// (`apps/frontend/e2e-results/results.json`) é lido pelo leitor compartilhado
// de `./lib/playwright-report.mjs` — o MESMO usado pelo gate autenticado — e a
// saída do passo declara quantos e quais testes precisaram de retentativa,
// com projeto e título pela cadeia de suites.
//
// Relatório ausente, ilegível ou de uma execução anterior é uma falha nomeada
// própria (`ValidateUiReportError`), nunca silêncio — mesmo quando o
// Playwright saiu 0.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

import { isMain, repositoryRoot } from "./lib/gate.mjs";
import {
  extractRetriedTests,
  formatRetriesMessage,
  readPlaywrightReport,
} from "./lib/playwright-report.mjs";

export class ValidateUiReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidateUiReportError";
  }
}

const FRONTEND_DIR = path.join(repositoryRoot, "apps", "frontend");

/**
 * O relatório JSON que `playwright.config.ts` já escreve
 * (`reporter: [..., ["json", { outputFile: "./e2e-results/results.json" }]]`).
 */
export function reportPath() {
  return path.join(FRONTEND_DIR, "e2e-results", "results.json");
}

/**
 * Roda `npm run test:ui` (`playwright test`) dentro de `apps/frontend` e
 * devolve o resultado bruto do subprocesso junto com o instante em que ele
 * começou.
 *
 * Apaga o relatório de uma execução anterior ANTES de subir o Playwright: um
 * relatório que sobrevive a esta linha só pode ter sido escrito por ESTA
 * execução. `notBeforeMs` é a segunda linha de defesa, para o caso raro de o
 * apagamento falhar em silêncio ou o processo ser interrompido antes de
 * escrever o seu.
 */
export function runPlaywright() {
  rmSync(reportPath(), { force: true });
  const notBeforeMs = Date.now();
  const outcome = spawnSync("npm run test:ui", {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
    shell: true,
  });
  return { outcome, notBeforeMs };
}

/**
 * Decide o exit code do passo a partir do resultado bruto do subprocesso.
 * Morto por sinal não tem código de saída: 1 mantém a falha visível em vez de
 * virar `null` e passar por sucesso. `reason`, quando presente, é uma falha
 * do PRÓPRIO subprocesso (não iniciou, ou foi morto) e não o exit code normal
 * do Playwright.
 */
export function resolveExitCode(outcome) {
  if (outcome.error) {
    return {
      exitCode: 1,
      reason: `the gate failed to start: ${outcome.error.message}`,
    };
  }
  if (outcome.signal) {
    return {
      exitCode: 1,
      reason: `the gate was terminated by signal ${outcome.signal}`,
    };
  }
  return { exitCode: outcome.status ?? 1, reason: null };
}

/**
 * Lê o relatório desta execução pelo leitor compartilhado e imprime quantos e
 * quais testes precisaram de retentativa. Relatório ausente, ilegível ou de
 * outra execução lança `ValidateUiReportError`.
 *
 * `targetReportPath` tem o default real (`reportPath()`) e só é declarado
 * como parâmetro para que os testes possam apontar para um arquivo
 * temporário sem tocar `apps/frontend/e2e-results/`.
 */
export function declareRetries(notBeforeMs, targetReportPath = reportPath()) {
  const report = readPlaywrightReport(targetReportPath, {
    notBeforeMs,
    ErrorClass: ValidateUiReportError,
    gateLabel: "the public UI gate",
    runLabel: "this validate:ui run's gate",
  });
  const retried = extractRetriedTests(report);
  console.log(`validate:ui ${formatRetriesMessage("public UI gate", retried)}`);
  return retried;
}

export function main() {
  const { outcome, notBeforeMs } = runPlaywright();
  const { exitCode, reason } = resolveExitCode(outcome);
  if (reason) {
    console.error(`validate:ui FAILED — ${reason}`);
    process.exitCode = exitCode;
    return;
  }
  try {
    declareRetries(notBeforeMs);
  } catch (error) {
    if (error instanceof ValidateUiReportError) {
      console.error(`validate:ui FAILED — ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  process.exitCode = exitCode;
}

if (isMain(import.meta.url)) {
  main();
}
