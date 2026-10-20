// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import manifest from "@/app/manifest";
import { OrientationGuard } from "@/shared/ui/OrientationGuard";
import { ORIENTATION_BOOT_SCRIPT } from "@/shared/ui/orientationLock";

import { expectNoA11yViolations } from "./support/a11y";

/**
 * Pedido de 2026-10-12: no celular, travar a orientação em retrato; o
 * tablet segue o aparelho (D-211, relato de 2026-10-20: o tablet deitado
 * abria em retrato). O navegador não trava a rotação de uma página. Duas
 * aproximações:
 * - celular com a Avenly instalada: o script do `<head>` trava o retrato
 *   pela Screen Orientation API; o manifest não pede orientação, porque ela
 *   valeria também para o tablet;
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
  test("não trava orientação e abre como app instalado na tela inicial logada", () => {
    const value = manifest();
    // Com `orientation`, o tablet instalado abria em retrato (D-211).
    expect(value).not.toHaveProperty("orientation");
    expect(value.name).toBe("Avenly");
    expect(value.short_name).toBe("Avenly");
    expect(value.start_url).toBe("/inicio");
    expect(value.display).toBe("standalone");
    expect(value.background_color).toBe("#f7f4ef");
    expect(value.theme_color).toBe("#f7f4ef");
    expect(value.icons?.map((icon) => icon.src)).toContain("/brand/avenly-icon.svg");
  });
});

/** Roda o script do `<head>` numa tela `width` x `height`, instalada ou não. */
function runBootScript({
  height,
  installed,
  lock = vi.fn(() => Promise.resolve()),
  width,
}: {
  height: number;
  installed: boolean;
  lock?: (orientation: string) => Promise<void>;
  width: number;
}) {
  const fakeWindow = {
    screen: { width, height, orientation: { lock } },
    matchMedia: (query: string) => ({
      matches: installed && query === "(display-mode: standalone)",
    }),
  };
  // O script lê `window`: o parâmetro com esse nome faz a tela de mentira
  // valer só aqui, sem mexer no jsdom.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const boot = new Function("window", ORIENTATION_BOOT_SCRIPT) as (
    win: typeof fakeWindow,
  ) => void;
  boot(fakeWindow);
  return lock;
}

describe("retrato só no celular instalado (D-211)", () => {
  test("celular instalado trava em retrato, em pé ou deitado", () => {
    expect(runBootScript({ width: 390, height: 844, installed: true })).toHaveBeenCalledWith(
      "portrait",
    );
    expect(runBootScript({ width: 844, height: 390, installed: true })).toHaveBeenCalledWith(
      "portrait",
    );
  });

  test("tablet instalado, em pé ou deitado, não trava: segue o aparelho", () => {
    for (const [width, height] of [
      [1280, 800],
      [800, 1280],
      [1024, 768],
      [600, 960],
    ] as const) {
      expect(runBootScript({ width, height, installed: true })).not.toHaveBeenCalled();
    }
  });

  test("no navegador comum não tenta travar", () => {
    expect(runBootScript({ width: 390, height: 844, installed: false })).not.toHaveBeenCalled();
  });

  test("navegador que recusa a trava não quebra a página", () => {
    expect(() =>
      runBootScript({
        width: 390,
        height: 844,
        installed: true,
        lock: () => Promise.reject(new Error("NotSupportedError")),
      }),
    ).not.toThrow();
    expect(() =>
      runBootScript({
        width: 390,
        height: 844,
        installed: true,
        lock: () => {
          throw new Error("sem suporte");
        },
      }),
    ).not.toThrow();
  });

  test("o script está no <head> do layout raiz, antes da primeira pintura", () => {
    expect(layout).toMatch(/<head>[\s\S]*<OrientationBootScript \/>[\s\S]*<\/head>/);
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
