// Leitor do relatório JSON do Playwright e extrator de testes que precisaram
// de retentativa, compartilhado por TODO gate que roda `playwright test` com
// o reporter `json` — hoje o gate autenticado (Goal033) e o gate público
// (Goal038/WU-05). Duas cópias que pudessem divergir são exatamente a classe
// de problema que o Goal037 fechou para VOCABULARIO_DE_ESPERA: um extrator
// aqui e outro lá, um corrigido e o outro esquecido.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { repositoryRoot } from "./gate.mjs";

export class PlaywrightReportError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlaywrightReportError";
  }
}

/**
 * Lê e decodifica o relatório JSON que uma execução do Playwright escreveu.
 * Ausente ou ilegível é sempre um erro nomeado (`ErrorClass`, padrão
 * `PlaywrightReportError`), nunca silêncio: um leitor que se cala diante de
 * relatório quebrado reintroduz o gate que mente.
 *
 * `notBeforeMs`, quando informado, é o instante (epoch ms) em que ESTA
 * execução começou a rodar o gate. Um relatório cujo `mtime` seja anterior a
 * esse instante não pode ter sido escrito por ela — é o resíduo de uma
 * execução passada, e não o desta.
 */
export function readPlaywrightReport(
  reportPath,
  {
    notBeforeMs,
    ErrorClass = PlaywrightReportError,
    gateLabel = "the gate",
    runLabel = "this run's gate",
  } = {},
) {
  let stats;
  let raw;
  try {
    stats = statSync(reportPath);
    raw = readFileSync(reportPath, "utf8");
  } catch (error) {
    throw new ErrorClass(
      `${gateLabel}'s JSON report is missing at ${path.relative(repositoryRoot, reportPath)}: ${error.message}. A gate whose retries cannot be read cannot declare them.`,
    );
  }
  if (typeof notBeforeMs === "number" && stats.mtimeMs < notBeforeMs) {
    throw new ErrorClass(
      `${gateLabel}'s JSON report at ${path.relative(repositoryRoot, reportPath)} was last written at ${new Date(stats.mtimeMs).toISOString()}, before ${runLabel} started at ${new Date(notBeforeMs).toISOString()}. It is the report of a previous execution, not this one, and cannot be trusted to describe it.`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ErrorClass(
      `${gateLabel}'s JSON report at ${path.relative(repositoryRoot, reportPath)} is not valid JSON: ${error.message}.`,
    );
  }
}

/**
 * Todo teste cujo `outcome()` o reporter JSON gravou como `"flaky"` — falhou
 * numa tentativa e passou numa seguinte. É essa marca, não o exit code, que
 * torna a retentativa observável: o processo termina 0 do mesmo jeito.
 *
 * `spec.title` sozinho não identifica o teste: uma spec pode repetir o mesmo
 * título dentro de `test.describe` diferentes (por exemplo, uma rota por
 * bloco). `title` aqui é a cadeia de `suites` ancestrais mais `spec.title`,
 * então dois testes do mesmo nome em blocos diferentes continuam
 * distinguíveis. O suite de arquivo (o primeiro nível, um por arquivo
 * `.spec.ts`) fica fora da cadeia: seu título é sempre o mesmo em todo
 * relatório e não ajuda a distinguir nada.
 */
export function extractRetriedTests(report) {
  const retried = [];
  const walk = (suite, ancestors) => {
    for (const spec of suite.specs ?? []) {
      const title = [...ancestors, spec.title].filter(Boolean).join(" > ");
      for (const test of spec.tests ?? []) {
        if (test.status === "flaky") {
          retried.push({
            project: test.projectName ?? test.projectId ?? "unknown",
            title,
          });
        }
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, [...ancestors, child.title].filter(Boolean));
    }
  };
  for (const suite of report?.suites ?? []) walk(suite, []);
  retried.sort((a, b) =>
    a.project === b.project
      ? a.title.localeCompare(b.title)
      : a.project.localeCompare(b.project),
  );
  return retried;
}

/** Mensagem de uma linha, igual nos dois gates: quantos e quais testes retentaram. */
export function formatRetriesMessage(label, retried) {
  if (retried.length === 0) {
    return `${label} retries: 0 — every test passed on its first attempt`;
  }
  const list = retried
    .map((entry) => `${entry.project} › ${entry.title}`)
    .join("; ");
  return `${label} retries: ${retried.length} test(s) needed a retry — ${list}`;
}
