import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

/**
 * Pedido de 2026-10-12: o número do dia no cabeçalho da Semana era um círculo
 * com `min-width`, que virava oval nos dias de dois dígitos ("QUI 15"). Agora
 * é um quadrado de cantos arredondados, com largura fixa.
 */
describe("número do dia no cabeçalho da Semana", () => {
  const css = readFileSync("src/shared/styles/avenly-agenda.css", "utf8");
  const rule = /\n\.week-map-date\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  test("quadrado de 28 px com cantos arredondados, nunca círculo", () => {
    expect(rule).toMatch(/\bwidth:\s*28px/);
    expect(rule).toMatch(/\bheight:\s*28px/);
    expect(rule).toMatch(/border-radius:\s*8px/);
    expect(rule).not.toMatch(/min-width/);
    expect(rule).not.toMatch(/50%/);
    // Sem encolher: no cabeçalho em coluna, o número espremido virava oval.
    expect(rule).toMatch(/flex:\s*none/);
  });

  test("hoje no Mês usa o mesmo quadrado arredondado, na escala de 24 px", () => {
    const today =
      /\.month-day\.is-today \.month-day-number\s*\{([^}]*)\}/.exec(css)?.[1] ??
      "";
    expect(today).toMatch(/\bwidth:\s*24px/);
    expect(today).toMatch(/border-radius:\s*7px/);
    expect(today).toMatch(/flex:\s*none/);
    expect(today).not.toMatch(/50%/);
    const base = /\n\.month-day-number\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(base).toMatch(/\bheight:\s*24px/);
  });
});
