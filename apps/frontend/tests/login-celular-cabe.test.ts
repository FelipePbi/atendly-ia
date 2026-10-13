import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

/**
 * Validação no iPhone (2026-10-13): no navegador, a marca colava na barra de
 * endereço (`safe-area-inset-top` é 0 fora do app instalado) e o hero de
 * ~300 px empurrava o botão "Entrar" e "Criar conta" para fora da tela.
 */
describe("login e cadastro no celular", () => {
  const css = readFileSync("src/shared/styles/avenly.css", "utf8");
  const mobile = css.slice(css.indexOf("/* Validação no iPhone (2026-10-13)"));

  test("respiro mínimo de 20 px no topo, mesmo sem safe area", () => {
    expect(mobile).toMatch(
      /\.entry-panel \{\s*padding: max\(20px, calc\(10px \+ env\(safe-area-inset-top\)\)\) 24px 20px;/,
    );
  });

  test("com pouca altura útil, os respiros encolhem; o texto de apoio sai só como palpite antes da medida", () => {
    const short = css.slice(
      css.indexOf("@media (max-width: 767px) and (max-height: 760px)"),
    );
    expect(short).toMatch(/\.entry-support \{\s*display: none;/);
    expect(short).toMatch(/\.entry-tagline \{\s*font-size: 23px;/);
    expect(short).toMatch(/height: 48px;\s*min-height: 48px;/);
    // A medida da altura visível (data-support) vence o palpite.
    expect(css).toMatch(
      /\.entry-shell\[data-support="fits"\] \.entry-support \{\s*display: block;/,
    );
    expect(css).toMatch(
      /\.entry-shell\[data-support="tight"\] \.entry-support \{\s*display: none;/,
    );
  });

  test("tablet mostra a frase de apoio, centrada (pedido de 2026-10-13)", () => {
    const start = css.indexOf("/* A frase de apoio também no tablet");
    const tablet = css.slice(
      css.lastIndexOf("@media (min-width: 768px) and (max-width: 1023px)", start),
      css.indexOf("@media (min-width: 1024px)", start),
    );
    expect(tablet).not.toMatch(/\.entry-support \{\s*display: none;/);
    expect(tablet).toMatch(/\.entry-badge,\s*\.entry-support \{\s*align-self: center;/);
  });
});
