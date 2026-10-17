// @vitest-environment jsdom
/**
 * D-181: o script do <head> aplica a aparência guardada antes da primeira
 * pintura — sem ele, a tela pinta o padrão claro e depois troca (o "pisca").
 *
 * Prova que o script, executado como o navegador executa (texto solto, sem
 * nada importado), põe os atributos certos para cada combinação guardada, cai
 * no padrão com valor estranho ou armazenamento indisponível, e segue o
 * sistema no Automático. E que o layout raiz de fato o coloca no <head>.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  ACCENT_OPTIONS,
  APPEARANCE_BOOT_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_BROWSER_THEME_COLOR,
  MODE_OPTIONS,
  parseAppearance,
} from "@/shared/theme/appearance";

const html = () => document.documentElement;

function runBootScript() {
  // Igual ao navegador: o texto do script, no escopo global.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const boot = new Function(APPEARANCE_BOOT_SCRIPT) as () => void;
  boot();
}

function setSystemDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? dark : false,
    media: query,
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  for (const name of ["data-accent", "data-theme", "data-theme-mode"])
    html().removeAttribute(name);
  setSystemDark(false);
});

describe("script do <head>", () => {
  test("sem nada guardado, o padrão: petróleo claro", () => {
    runBootScript();
    expect(html()).toHaveAttribute("data-accent", "verde");
    expect(html()).toHaveAttribute("data-theme", "light");
    expect(html()).toHaveAttribute("data-theme-mode", "light");
  });

  test.each(
    ACCENT_OPTIONS.flatMap((accent) =>
      MODE_OPTIONS.filter((mode) => mode.id !== "SYSTEM").map((mode) => [
        accent.id,
        mode.id,
      ]),
    ),
  )("%s + %s guardados viram os atributos do <html>", (accent, mode) => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent, mode }),
    );
    runBootScript();
    expect(html()).toHaveAttribute("data-accent", accent.toLowerCase());
    expect(html()).toHaveAttribute(
      "data-theme",
      mode === "DARK" ? "dark" : "light",
    );
  });

  test("Automático segue o sistema", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "ROSE", mode: "SYSTEM" }),
    );
    setSystemDark(true);
    runBootScript();
    expect(html()).toHaveAttribute("data-theme", "dark");
    expect(html()).toHaveAttribute("data-theme-mode", "system");

    setSystemDark(false);
    runBootScript();
    expect(html()).toHaveAttribute("data-theme", "light");
  });

  test("valor estranho ou JSON quebrado cai no padrão, campo a campo", () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ accent: "NEON", mode: "DARK" }),
    );
    runBootScript();
    expect(html()).toHaveAttribute("data-accent", "verde");
    expect(html()).toHaveAttribute("data-theme", "dark");

    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, "{quebrado");
    runBootScript();
    expect(html()).toHaveAttribute("data-accent", "verde");
    expect(html()).toHaveAttribute("data-theme", "light");
  });

  test("armazenamento bloqueado não quebra a página", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(runBootScript).not.toThrow();
    expect(html()).toHaveAttribute("data-theme", "light");
    getItem.mockRestore();
  });

  test("o script e a leitura do app concordam", () => {
    for (const raw of [
      { accent: "AZUL", mode: "DARK" },
      { accent: "x", mode: "LIGHT" },
      null,
      "texto",
    ]) {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(raw));
      runBootScript();
      const parsed = parseAppearance(raw);
      expect(html()).toHaveAttribute(
        "data-accent",
        parsed.accent.toLowerCase(),
      );
    }
  });
});

describe("layout raiz", () => {
  const root = path.join(__dirname, "..");
  const layout = readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");

  test("põe o script no <head>, antes do corpo", () => {
    const head = layout.indexOf("<head>");
    const script = layout.indexOf("<AppearanceBootScript />");
    const body = layout.indexOf("<body>");
    expect(head).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(head);
    expect(script).toBeLessThan(body);
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
  });

  test("a barra do navegador do padrão é o fundo do tema claro", () => {
    const tokens = readFileSync(
      path.join(root, "src/shared/styles/tokens.css"),
      "utf8",
    );
    expect(tokens).toContain(
      `--at-color-canvas: ${DEFAULT_BROWSER_THEME_COLOR};`,
    );
  });
});
