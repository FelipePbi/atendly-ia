// Regressão do WU-05 (Goal038): o gate público (`npm run validate:ui`)
// declara retentativa pelo MESMO leitor compartilhado do gate autenticado
// (`./lib/playwright-report.mjs`), sem mudar a semântica de saída do comando.
//
// Quatro cenários que o critério de aceite nomeia:
//   1. verde limpo — nenhuma retentativa;
//   2. verde com flaky — retentativa declarada, com projeto e título;
//   3. relatório velho — recusado como execução anterior, erro nomeado;
//   4. Playwright vermelho — o exit code não-zero do Playwright continua
//      sendo o exit code do passo.
//
// `runPlaywright()` sobe o subprocesso real e não é exercitado aqui (mesmo
// motivo pelo qual `goal033-authenticated-ui-rehearsal.test.mjs` nunca chama
// `rehearse()`): os testes cobrem as funções puras e reusáveis que decidem o
// comportamento observável — `declareRetries` e `resolveExitCode`.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ValidateUiReportError,
  declareRetries,
  reportPath,
  resolveExitCode,
} from "../validate-ui.mjs";

function tempReportPath() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "validate-ui-report-"));
  return {
    file: path.join(directory, "results.json"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("reportPath points at apps/frontend/e2e-results/results.json, where playwright.config.ts writes it", () => {
  const relative = reportPath().split(path.sep).join("/");
  assert.ok(relative.endsWith("apps/frontend/e2e-results/results.json"), relative);
});

test("clean green: declareRetries reports zero retries when every test passed on its first attempt", () => {
  const { file, cleanup } = tempReportPath();
  try {
    const report = {
      suites: [
        {
          title: "home.spec.ts",
          specs: [
            {
              title: "renders the hero",
              tests: [{ projectName: "mobile-360", status: "expected" }],
            },
          ],
          suites: [],
        },
      ],
    };
    writeFileSync(file, JSON.stringify(report), "utf8");
    const notBeforeMs = Date.now() - 1_000;
    assert.deepEqual(declareRetries(notBeforeMs, file), []);
  } finally {
    cleanup();
  }
});

test("green with flaky: declareRetries names the project and title of the retried test", () => {
  const { file, cleanup } = tempReportPath();
  try {
    const report = {
      suites: [
        {
          title: "home.spec.ts",
          specs: [
            {
              title: "renders the hero",
              tests: [{ projectName: "mobile-360", status: "flaky" }],
            },
          ],
          suites: [],
        },
      ],
    };
    writeFileSync(file, JSON.stringify(report), "utf8");
    const notBeforeMs = Date.now() - 1_000;
    assert.deepEqual(declareRetries(notBeforeMs, file), [
      { project: "mobile-360", title: "renders the hero" },
    ]);
  } finally {
    cleanup();
  }
});

test("stale report: declareRetries refuses a report written before this run's gate started, naming it a previous execution", () => {
  const { file, cleanup } = tempReportPath();
  try {
    writeFileSync(file, JSON.stringify({ suites: [] }), "utf8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(file, past, past);
    const notBeforeMs = Date.now();
    assert.throws(
      () => declareRetries(notBeforeMs, file),
      (error) =>
        error instanceof ValidateUiReportError &&
        /previous execution/u.test(error.message),
    );
  } finally {
    cleanup();
  }
});

test("missing report: declareRetries refuses with its own named error", () => {
  const { file, cleanup } = tempReportPath();
  cleanup();
  try {
    assert.throws(
      () => declareRetries(undefined, file),
      (error) =>
        error instanceof ValidateUiReportError && /is missing/u.test(error.message),
    );
  } finally {
    // O diretório já foi removido acima: results.json nunca existiu.
  }
});

test("unreadable report: declareRetries refuses when the file is not valid JSON", () => {
  const { file, cleanup } = tempReportPath();
  try {
    writeFileSync(file, "{not json", "utf8");
    assert.throws(
      () => declareRetries(undefined, file),
      (error) =>
        error instanceof ValidateUiReportError && /not valid JSON/u.test(error.message),
    );
  } finally {
    cleanup();
  }
});

test("Playwright red: resolveExitCode keeps the subprocess's non-zero exit code as the step's exit code", () => {
  assert.deepEqual(resolveExitCode({ status: 1, signal: null, error: undefined }), {
    exitCode: 1,
    reason: null,
  });
});

test("resolveExitCode keeps exit code 0 for a clean or flaky-but-recovered run", () => {
  assert.deepEqual(resolveExitCode({ status: 0, signal: null, error: undefined }), {
    exitCode: 0,
    reason: null,
  });
});

test("resolveExitCode names a subprocess killed by signal as a failure with exit code 1, never null", () => {
  const { exitCode, reason } = resolveExitCode({
    status: null,
    signal: "SIGKILL",
    error: undefined,
  });
  assert.equal(exitCode, 1);
  assert.match(reason, /terminated by signal SIGKILL/u);
});

test("resolveExitCode names a subprocess that failed to start as a failure with exit code 1", () => {
  const { exitCode, reason } = resolveExitCode({
    status: null,
    signal: null,
    error: new Error("spawn ENOENT"),
  });
  assert.equal(exitCode, 1);
  assert.match(reason, /failed to start/u);
});
