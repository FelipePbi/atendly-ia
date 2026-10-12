// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import manifest from "@/app/manifest";
import { OrientationGuard } from "@/shared/ui/OrientationGuard";

import { expectNoA11yViolations } from "./support/a11y";

/**
 * Pedido de 2026-10-12: no celular, travar a orientação em retrato.
 * O navegador não trava a rotação de uma página. Duas aproximações:
 * - manifest com `orientation: "portrait"` (vale com a Avenly instalada);
 * - no navegador, aviso "Gire o celular" cobrindo a tela com o telefone
 *   deitado, só por CSS, no layout raiz (vale para todas as telas).
 * jsdom não avalia media query; a condição é conferida no CSS e a medida
 * real (844x390 com toque mostra, 390x844 e 1024x768 não) foi feita no
 * navegador.
 */
const root = path.join(__dirname, "..");
const css = readFileSync(
  path.join(root, "src/shared/styles/avenly-orientation.css"),
  "utf8",
);
const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
const globals = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

const PHONE_LANDSCAPE =
  "@media (orientation: landscape) and (max-height: 500px) and (pointer: coarse)";

describe("manifest da Avenly", () => {
  test("pede retrato e abre como app instalado na tela inicial logada", () => {
    const value = manifest();
    expect(value.orientation).toBe("portrait");
    expect(value.name).toBe("Avenly");
    expect(value.short_name).toBe("Avenly");
    expect(value.start_url).toBe("/inicio");
    expect(value.display).toBe("standalone");
    expect(value.background_color).toBe("#f7f4ef");
    expect(value.theme_color).toBe("#f7f4ef");
    expect(value.icons?.map((icon) => icon.src)).toContain("/brand/avenly-icon.svg");
  });
});

describe("aviso para girar o celular", () => {
  test("tem o título e o texto certos e passa no axe", async () => {
    const { container } = render(<OrientationGuard />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Gire o celular");
    expect(alert).toHaveTextContent("A Avenly funciona na vertical.");
    // Sem aria-hidden fixo: o display: none já esconde fora da condição.
    expect(alert).not.toHaveAttribute("aria-hidden");
    await expectNoA11yViolations(container);
  });

  test("fica no layout raiz, fora do provider, e o CSS é carregado", () => {
    expect(layout).toMatch(/<\/ProductRuntimeProvider>\s*<OrientationGuard \/>\s*<\/body>/);
    expect(globals).toContain('@import "../shared/styles/avenly-orientation.css";');
  });

  test("só aparece com o telefone deitado", () => {
    // Fora da condição, nada.
    expect(css).toMatch(/^\.orientation-guard \{\s*display: none;\s*\}/m);
    const start = css.indexOf(`${PHONE_LANDSCAPE} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf("\n}\n", start));
    expect(block).toMatch(/\.orientation-guard \{[^}]*display: flex;/);
    expect(block).toMatch(/\.orientation-guard \{[^}]*position: fixed;/);
    expect(block).toMatch(/\.orientation-guard \{[^}]*z-index: 2147483647;/);
    expect(block).toMatch(/\.orientation-guard \{[^}]*background: var\(--bg\);/);
    expect(block).toMatch(/body > :not\(\.orientation-guard\) \{\s*visibility: hidden;/);
  });

  test("a animação de girar só existe sem movimento reduzido", () => {
    const animated = [...css.matchAll(/animation:/g)];
    expect(animated).toHaveLength(1);
    expect(css).toMatch(
      /\(pointer: coarse\) and \(prefers-reduced-motion: no-preference\) \{\s*\.orientation-guard-mark \{\s*animation:/,
    );
  });
});
