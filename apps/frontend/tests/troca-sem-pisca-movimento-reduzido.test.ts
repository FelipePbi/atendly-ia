/**
 * Troca de item sem pisca com movimento reduzido (vídeo de 2026-10-16).
 *
 * Com as animações do sistema desligadas (`prefers-reduced-motion: reduce`),
 * não há crossfade, e o esmaecimento do item anterior enquanto o novo
 * carrega virava um pisca: o painel escurecia de uma vez e o novo surgia por
 * cima. Em Clientes, Conversas e Serviços, com movimento reduzido, o item
 * anterior fica inteiro até o novo chegar, e a troca é um fade só de
 * opacidade, sem deslocamento (D-173, pedido do usuário).
 *
 * jsdom não aplica `@media`: a prova é a regra no bloco de movimento reduzido
 * e a ordem de importação que a faz vencer a regra de esmaecimento.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const stylesDir = path.join(__dirname, "../src/shared/styles");
const motionCss = readFileSync(
  path.join(stylesDir, "avenly-motion.css"),
  "utf8",
);
const globalsCss = readFileSync(
  path.join(__dirname, "../src/app/globals.css"),
  "utf8",
);

function reducedMotionBlocks(css: string): string {
  return css
    .split("@media (prefers-reduced-motion: reduce) {")
    .slice(1)
    .join("\n");
}

/** Todas as declarações que valem para o seletor, juntas. */
function ruleFor(css: string, selector: string): string {
  const bodies: string[] = [];
  for (
    let at = css.indexOf(selector);
    at !== -1;
    at = css.indexOf(selector, at + 1)
  ) {
    const open = css.indexOf("{", at);
    bodies.push(css.slice(open, css.indexOf("}", open)));
  }
  expect(
    bodies.length,
    `${selector} no bloco de movimento reduzido`,
  ).toBeGreaterThan(0);
  return bodies.join("\n");
}

describe("com movimento reduzido, trocar de item não pisca", () => {
  test.each([
    ".customer-profile.is-refreshing > :not(.pushed-bar)",
    ".conversation-detail-panel.is-refreshing .conversation-chat",
    ".service-form-screen.is-refreshing > :not(.pushed-bar)",
  ])("%s não esmaece", (selector) => {
    expect(ruleFor(reducedMotionBlocks(motionCss), selector)).toMatch(
      /opacity:\s*1\s*;/,
    );
  });

  test("o arquivo de movimento é importado depois dos de tela, para vencer o esmaecimento", () => {
    const motion = globalsCss.indexOf("avenly-motion.css");
    for (const screen of [
      "avenly-customers.css",
      "avenly-conversations.css",
      "avenly-services.css",
    ]) {
      expect(globalsCss.indexOf(screen)).toBeGreaterThan(-1);
      expect(globalsCss.indexOf(screen)).toBeLessThan(motion);
    }
  });

  test.each([
    ["customer-swap", "customer-panel"],
    ["conversation-swap", "conversation-panel"],
    ["service-swap", "service-panel"],
    ["appointment-swap", "appointment-panel"],
    ["appointment-swap", "agenda-panel"],
  ])("a troca %s é um fade só de opacidade (D-173)", (type, name) => {
    const reduced = reducedMotionBlocks(motionCss);
    expect(
      ruleFor(reduced, `html.vt-${type}::view-transition-old(${name})`),
    ).toMatch(/animation:\s*motion-fade-out[^;]*!important/);
    expect(
      ruleFor(reduced, `html.vt-${type}::view-transition-new(${name})`),
    ).toMatch(/animation:\s*motion-fade-in[^;]*!important/);
  });

  test("a primeira entrada no painel também é fade, sem subida (D-173)", () => {
    const reduced = reducedMotionBlocks(motionCss);
    for (const selector of [
      ".customer-profile.is-entering > :not(.pushed-bar)",
      ".service-form-screen.is-entering > :not(.pushed-bar)",
      ".service-list-arrive",
    ]) {
      expect(ruleFor(reduced, selector)).toMatch(
        /animation:\s*motion-fade-in[^;]*!important/,
      );
    }
  });

  test("os quadros-chave do fade não deslocam nada", () => {
    for (const name of ["motion-fade-in", "motion-fade-out"]) {
      const at = motionCss.indexOf(`@keyframes ${name} {`);
      expect(at).toBeGreaterThan(-1);
      const body = motionCss.slice(at, motionCss.indexOf("@keyframes", at + 1));
      expect(body).not.toMatch(/transform/);
    }
  });

  test("as fotos paradas somem com movimento reduzido; as dos painéis com fade ficam (vídeo de 2026-10-16)", () => {
    const reduced = reducedMotionBlocks(motionCss);
    expect(ruleFor(reduced, "::view-transition-old(*)")).toMatch(
      /display:\s*none !important/,
    );
    for (const selector of [
      "html.vt-appointment-swap::view-transition-old(appointment-panel)",
      "html.vt-customer-swap::view-transition-old(customer-panel)",
      "html.vt-settings-swap::view-transition-old(settings-panel)",
    ]) {
      expect(ruleFor(reduced, selector)).toMatch(/display:\s*block !important/);
    }
  });

  test("trocar de agendamento não mexe na coluna nem na grade, e o aviso fica por cima", () => {
    expect(
      ruleFor(
        motionCss,
        "html.vt-appointment-swap::view-transition-old(agenda-content)",
      ),
    ).toMatch(/display:\s*none/);
    expect(
      ruleFor(
        motionCss,
        "html.vt-appointment-swap::view-transition-new(agenda-content)",
      ),
    ).toMatch(/animation:\s*none/);
    // O nome fica em cada aviso, que tem tamanho: na camada de altura zero a
    // foto saía vazia e o aviso sumia durante a troca.
    expect(motionCss).not.toMatch(
      /\.shell-status-layer \{[^}]*view-transition-name/,
    );
    expect(
      ruleFor(
        motionCss,
        ".shell-status-layer > .shell-status-banner:nth-child(1) {",
      ),
    ).toMatch(/view-transition-name:\s*shell-status-1/);
    expect(
      ruleFor(
        motionCss,
        ".shell-status-layer > .shell-status-banner:nth-child(2) {",
      ),
    ).toMatch(/view-transition-name:\s*shell-status-2/);
    // Fora de navegação, a foto antiga da página não fica sob a nova.
    expect(motionCss).toMatch(
      /html:not\(\.vt-nav-fade\):not\(\.vt-nav-forward\):not\(\s*\.vt-nav-back\s*\)::view-transition-old\(page-content\) \{\s*display: none;/,
    );
  });
});
