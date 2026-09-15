import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PLATFORM_NUMBER_NOT_CONFIGURED } from "../../src/config/platform-whatsapp.js";
import {
  ACTIVATION_TEST_ABANDONED,
  ACTIVATION_TEST_REFUSALS,
  ACTIVATION_TEST_STEP_FAILED,
} from "../../src/modules/activation-test/activation-test-run.js";

/**
 * Nenhum codigo de recusa ou de falha vive so no codigo (Goal019, criterio 22).
 *
 * O documento lido e o publicado, nao uma copia: acrescentar um codigo sem
 * descrever significado e caminho de resolucao quebra este teste. Ele existe
 * porque a rodada 2 reaproveitou `ACTIVATION_TEST_NO_ELIGIBLE_SERVICE` para
 * dizer o que nao era — o consumidor le `failureCode` e agiu sobre a causa
 * errada.
 */
const publicApiDoc = readFileSync(
  fileURLToPath(new URL("../../../bff/PUBLIC_API_V1.md", import.meta.url)),
  "utf8",
);

/** Todo codigo que pode chegar ao consumidor, em recusa ou em `failureCode`. */
const PUBLISHED_CODES = [
  PLATFORM_NUMBER_NOT_CONFIGURED,
  ...Object.values(ACTIVATION_TEST_REFUSALS),
  ACTIVATION_TEST_ABANDONED,
  ACTIVATION_TEST_STEP_FAILED,
];

describe("PUBLIC_API_V1.md nomeia cada codigo do teste real", () => {
  it.each(PUBLISHED_CODES)("documenta %s numa linha de tabela", (code) => {
    const rows = publicApiDoc
      .split("\n")
      .filter((row) => row.trimStart().startsWith(`| \`${code}\``));
    expect(
      rows,
      `PUBLIC_API_V1.md has no table row for \`${code}\``,
    ).toHaveLength(1);
    // Significado e caminho de resolucao junto do codigo: a linha precisa ter
    // mais do que o nome. Codigo sozinho nao e documentacao.
    const cells = rows[0].split("|").filter((cell) => cell.trim().length > 0);
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });
});
