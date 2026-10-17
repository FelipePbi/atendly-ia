/**
 * Números do seletor de data no centro da célula (print de 2026-10-16): o
 * número e a bolinha de dia ocupado ficavam empilhados no flex da célula, e a
 * bolinha (4 px) mais o espaço entre os dois empurravam o número para cima —
 * no dia de hoje e no escolhido, com borda e fundo, isso aparecia.
 *
 * jsdom não faz layout: a prova é a regra. A célula centraliza só o número, e
 * a bolinha sai do fluxo. A medida no navegador foi feita com o Playwright.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const css = readFileSync(
  path.join(__dirname, "../src/shared/styles/avenly-pickers.css"),
  "utf8",
);

function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open, css.indexOf("}", open));
}

describe("dia do seletor de data", () => {
  test("a célula centraliza o número sem empilhar a bolinha", () => {
    const day = rule(".date-picker-day");
    expect(day).toMatch(/align-items:\s*center/);
    expect(day).toMatch(/justify-content:\s*center/);
    expect(day).toMatch(/position:\s*relative/);
    expect(day).not.toMatch(/flex-direction:\s*column/);
    expect(day).not.toMatch(/\bgap:/);
  });

  test("a bolinha de dia ocupado fica fora do fluxo, centrada embaixo", () => {
    const dot = rule(".date-picker-dot");
    expect(dot).toMatch(/position:\s*absolute/);
    expect(dot).toMatch(/left:\s*50%/);
    expect(dot).toMatch(/translate:\s*-50% 0/);
  });
});
