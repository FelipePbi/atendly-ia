/**
 * Goal085 (d) — a casca e a sidebar não dependem de unidade de viewport.
 *
 * Guarda sobre a folha de estilo, porque jsdom não tem layout: nenhuma altura
 * (`height`, `min-height`, `max-height`) de regra cujo seletor contém
 * `.app-frame` ou `.sidebar` usa `vh`, `dvh`, `svh` nem `lvh`, em qualquer
 * largura. Quem prova que a sidebar cobre a janela de verdade é a medida G-3 do
 * gate autenticado (`e2e/authenticated-matrix.spec.ts`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const STYLE_FILES = [
  "src/shared/styles/atendly.css",
  "src/app/globals.css",
] as const;

const SHELL_SELECTOR = /\.(?:app-frame|sidebar)/;
const HEIGHT_PROPERTY = /^(?:height|min-height|max-height)$/;
const VIEWPORT_UNIT = /[\d.]\s*(?:vh|dvh|svh|lvh)\b/i;

type Declaration = { selector: string; property: string; value: string };

function readStyle(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
}

function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("CSS com chave aberta e nunca fechada.");
}

function declarationsOf(source: string): Declaration[] {
  const found: Declaration[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("{", cursor);
    if (open === -1) break;
    const close = closingBrace(source, open);
    const prelude = source.slice(cursor, open).trim();
    const body = source.slice(open + 1, close);
    if (prelude.startsWith("@")) {
      if (/^@(?:media|supports|layer|container)\b/.test(prelude)) {
        found.push(...declarationsOf(body));
      }
    } else {
      for (const declaration of body.split(";")) {
        const colon = declaration.indexOf(":");
        if (colon === -1) continue;
        found.push({
          selector: prelude,
          property: declaration.slice(0, colon).trim().toLowerCase(),
          value: declaration.slice(colon + 1).trim(),
        });
      }
    }
    cursor = close + 1;
  }
  return found;
}

function shellDeclarations(relativePath: string): Declaration[] {
  return declarationsOf(readStyle(relativePath)).filter((declaration) =>
    SHELL_SELECTOR.test(declaration.selector),
  );
}

describe("Goal085 (d): a casca não usa unidade de viewport", () => {
  test.each(STYLE_FILES)(
    "%s: nenhuma altura de regra com .app-frame ou .sidebar usa vh, dvh, svh nem lvh",
    (relativePath) => {
      const offenders = shellDeclarations(relativePath)
        .filter(
          (declaration) =>
            HEIGHT_PROPERTY.test(declaration.property) &&
            VIEWPORT_UNIT.test(declaration.value),
        )
        .map(
          (declaration) =>
            `${declaration.selector} { ${declaration.property}: ${declaration.value} }`,
        );

      expect(offenders).toEqual([]);
    },
  );

  test("a guarda lê a folha de verdade: atendly.css tem regras com .app-frame e .sidebar", () => {
    const selectors = shellDeclarations(STYLE_FILES[0]).map(
      (declaration) => declaration.selector,
    );

    expect(selectors.some((selector) => /\.app-frame/.test(selector))).toBe(
      true,
    );
    expect(selectors.some((selector) => /\.sidebar/.test(selector))).toBe(true);
  });

  test("a guarda reprova uma altura em vh dentro de @media e aceita a mesma altura em px", () => {
    const sample = `
      @media (min-width: 1100px) {
        .app-frame > .sidebar { height: calc(100dvh - 8px); min-height: 480px }
      }
      .sidebar { max-height: min(50svh, 400px) }
      .app-frame { min-height: 100lvh }
      .page { height: 100vh }
    `;
    const flagged = declarationsOf(sample)
      .filter(
        (declaration) =>
          SHELL_SELECTOR.test(declaration.selector) &&
          HEIGHT_PROPERTY.test(declaration.property) &&
          VIEWPORT_UNIT.test(declaration.value),
      )
      .map((declaration) => declaration.property);

    expect(flagged).toEqual(["height", "max-height", "min-height"]);
  });
});
