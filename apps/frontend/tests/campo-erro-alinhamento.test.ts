import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

/**
 * Validação de 2026-10-12 (Bloquear horário, Início e Fim lado a lado): com a
 * mensagem de erro sob "Fim", o campo "Início" esticava até a mesma altura e
 * a grade espalhava a sobra entre rótulo e input, que desciam e saíam do
 * alinhamento. A base `.field` empilha do topo, em todo formulário.
 */
describe("campo com erro ao lado de outro campo", () => {
  test("`.field` empilha do topo: a sobra de altura fica embaixo, não entre rótulo e input", () => {
    const css = readFileSync("src/shared/styles/avenly.css", "utf8");
    const rule = /\n\.field \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*grid/);
    expect(rule).toMatch(/align-content:\s*start/);
  });
});
