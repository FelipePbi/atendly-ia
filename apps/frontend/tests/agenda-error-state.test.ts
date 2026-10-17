import path from "node:path";

import { describe, expect, test } from "vitest";

import { BffHttpError } from "@/data/http/BffHttpClient";
import { requestError } from "@/features/agenda/occupancy";

import { readLightStylesheet } from "./support/stylesheet";

/**
 * Validacao de 2026-10-12, Agenda no celular: o erro mostrava
 * "Internal server error." e o cartao branco ia de ponta a ponta da tela.
 */
describe("erro da Agenda", () => {
  const fallback = "Não foi possível carregar a agenda.";

  test("falha do servidor (5xx) mostra a mensagem do produto, nunca a do servidor", () => {
    const caught = new BffHttpError({
      code: "INTERNAL",
      message: "Internal server error.",
      requestId: "r1",
      status: 500,
    });
    expect(requestError(caught, fallback)).toBe(
      "Não foi possível carregar a agenda. Tente novamente em instantes.",
    );
  });

  test("falha de rede tambem usa a mensagem do produto", () => {
    expect(requestError(new Error("Failed to fetch"), fallback)).toBe(
      "Não foi possível carregar a agenda. Tente novamente em instantes.",
    );
  });

  test("recusa explicada pelo produto (4xx) continua mostrando o motivo", () => {
    const caught = new BffHttpError({
      code: "SLOT_TAKEN",
      message: "Esse horário acabou de ser ocupado.",
      requestId: "r2",
      status: 409,
    });
    expect(requestError(caught, fallback)).toBe("Esse horário acabou de ser ocupado.");
  });

  test("no celular o cartao de estado fica dentro da tela, sem sangrar nas bordas", () => {
    const css = readLightStylesheet(
      path.join(__dirname, "../src/shared/styles/avenly-agenda.css"));
    expect(css).not.toMatch(/\.agenda-state-surface \{\s*min-height: 470px;\s*margin-inline: -16px;/);
    expect(css).toMatch(/\.agenda-state-surface \{\s*min-height: 360px;\s*\}/);
  });
});

describe("dia escolhido na Semana", () => {
  // Validacao de 2026-10-12: o fundo da coluna escolhida era um azul claro
  // estranho; passou a cinza quente translucido.
  test("a coluna escolhida usa cinza translucido, nao o tom de destaque", () => {
    const css = readLightStylesheet(
      path.join(__dirname, "../src/shared/styles/avenly-agenda.css"));
    const rule = /\.week-map-day\.is-selected \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("background: rgba(34, 30, 26, 0.05)");
    expect(rule).not.toContain("--accent-soft");
  });
});

describe("cabecalho dos dias da Semana", () => {
  // Validacao de 2026-10-12: o fundo da coluna escolhida colava em "QUA";
  // o cabecalho ganhou respiro em cima e o eixo das horas acompanha.
  test("cabecalho com 56px e respiro em cima; eixo e horas usam a mesma altura", () => {
    const css = readLightStylesheet(
      path.join(__dirname, "../src/shared/styles/avenly-agenda.css"));
    expect(css).toMatch(/--week-head-h: 56px;/);
    expect(css).toMatch(/\.week-map-head \{\s*height: var\(--week-head-h\);\s*margin: 0;\s*padding: 8px 0 6px;/);
    expect(css).toMatch(/height: calc\(var\(--week-head-h\) \+ var\(--hours\) \* var\(--hour-h\)\);/);
    expect(css).toMatch(/top: calc\(var\(--week-head-h\) - 7px \+ var\(--at\) \* var\(--hour-h\)\);/);
  });
});

describe("atendimento selecionado na lista do Dia", () => {
  // Pedido de 2026-10-12: o destaque da linha selecionada ocupa a largura toda
  // da lista, com cantos retos, sem mudar a posicao do conteudo.
  test("fundo de ponta a ponta da lista e sem arredondar", () => {
    const css = readLightStylesheet(
      path.join(__dirname, "../src/shared/styles/avenly-agenda.css"));
    const rule = /\.agenda-day-row\.is-selected \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("width: calc(100% + 40px)");
    expect(rule).toContain("margin-inline: -20px");
    expect(rule).toContain("padding-inline: 20px");
    expect(rule).toContain("border-radius: 0");
    expect(css).toMatch(/\.agenda-day-list \{\s*margin: 0;\s*padding: 0 20px;/);
  });
});
