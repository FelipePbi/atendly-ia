import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

/**
 * Validação de 2026-10-12: em Conversas, "Ignorados" ao lado da busca tinha o
 * ícone empilhado sobre o texto e ficava mais alto que o campo. Agora ícone e
 * texto na mesma linha, na altura do campo, e cabe ao lado dele até 360 px.
 */
describe("botão Ignorados ao lado da busca de Conversas", () => {
  const css = readFileSync("src/shared/styles/avenly-conversations.css", "utf8");
  const ruleOf = (selector: string) =>
    new RegExp(`\\n${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(
      css,
    )?.[1] ?? "";

  test("ícone e texto em linha, esticado na altura do campo", () => {
    const lens = ruleOf(".conversation-search-panel .conversation-lens");
    expect(lens).toMatch(/display:\s*inline-flex/);
    expect(lens).toMatch(/align-items:\s*center/);
    expect(lens).toMatch(/align-self:\s*stretch/);
    expect(lens).toMatch(/flex:\s*none/);
    expect(lens).toMatch(/min-height:\s*48px/);
  });

  test("o campo cede espaço para o botão caber na mesma linha no celular", () => {
    expect(ruleOf(".conversation-search-panel .conversation-search")).toMatch(
      /flex:\s*1 1 180px/,
    );
  });
});
