import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

/**
 * D-201: o faturamento da Home acompanha a cor escolhida em Aparência e o
 * escuro. As cores dele saem da cor de destaque e da superfície — nunca de
 * um valor fixo, que ficaria vinho em todo tema (pedido de 2026-10-18).
 */

const styles = path.join(__dirname, "../src/shared/styles");
const read = (file: string) => readFileSync(path.join(styles, file), "utf8");

function declaration(source: string, name: string): string | null {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(source);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

describe("cores do faturamento na Home", () => {
  const tokens = read("tokens.css");

  test("o que já entrou é a própria cor de destaque", () => {
    expect(declaration(tokens, "--at-color-revenue")).toBe(
      "var(--at-color-primary)",
    );
  });

  test.each([
    "--at-color-revenue-soft",
    "--at-color-revenue-panel",
    "--at-color-revenue-panel-border",
  ])("%s mistura a cor de destaque com a superfície", (name) => {
    expect(declaration(tokens, name)).toMatch(
      /^color-mix\( in srgb, var\(--at-color-primary\) \d+%, var\(--at-color-surface\) \)$/,
    );
  });

  test("a queda usa a tinta de perigo do tema", () => {
    expect(declaration(tokens, "--at-color-decline-ink")).toBe(
      "var(--at-color-danger-ink)",
    );
  });

  test("nenhum tema fixa essas cores por cima", () => {
    expect(read("themes.css")).not.toMatch(/--at-color-(revenue|decline)/);
  });

  test("a folha da Home não usa a cor de um tema só", () => {
    expect(read("avenly-home.css")).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d/i,
    );
  });
});
