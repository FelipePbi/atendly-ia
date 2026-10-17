import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  contrastRatio,
  DARK_NEUTRAL_SWATCH_HEX,
  DARK_PAST_UNDERLAYS,
} from "@/features/agenda/weekBarLabel";
import { ACCENT_OPTIONS } from "@/shared/theme/appearance";

/**
 * D-181: todo par texto/fundo das cores semânticas passa WCAG AA (4,5:1) em
 * cada combinação cor × claro/escuro. Os valores saem de `tokens.css` e
 * `themes.css` pela mesma ordem da cascata — nada é copiado para cá —, então
 * uma cor nova ou um tom mexido que derrube o contraste falha aqui.
 *
 * O gate renderizado (axe no navegador) confere a tela inteira; este confere
 * a paleta, rápido e em todas as doze combinações.
 */

const stylesDir = path.join(__dirname, "../src/shared/styles");
const tokensCss = readFileSync(path.join(stylesDir, "tokens.css"), "utf8");
const themesCss = readFileSync(
  path.join(stylesDir, "themes.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

type Vars = Map<string, string>;

function declarations(body: string): Array<[string, string]> {
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].replace(/\s+/g, " ").trim(),
  ]);
}

/** Corpo de cada regra de themes.css cujo seletor contém `selector`. */
function rules(css: string, selector: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) =>
      match[1]
        .split(",")
        .map((part) => part.replace(/\s+/g, " ").trim())
        .includes(selector),
    )
    .map((match) => match[2]);
}

function cascade(accent: string, dark: boolean): Vars {
  const vars: Vars = new Map();
  const apply = (body: string) => {
    for (const [name, value] of declarations(body)) vars.set(name, value);
  };
  const rootStart = tokensCss.indexOf(":root {");
  apply(tokensCss.slice(rootStart, tokensCss.indexOf("\n}", rootStart)));
  for (const body of rules(themesCss, `[data-accent="${accent}"]`)) apply(body);
  if (dark) {
    for (const body of rules(themesCss, 'html[data-theme="dark"]')) apply(body);
    for (const body of rules(
      themesCss,
      `[data-theme="dark"][data-accent="${accent}"]`,
    ))
      apply(body);
  }
  if (accent !== "verde" || dark)
    for (const body of rules(
      themesCss,
      '[data-accent]:not([data-accent="verde"])',
    ))
      apply(body);
  if (dark)
    for (const body of rules(themesCss, '[data-theme="dark"][data-accent]'))
      // A regra do escuro repete o seletor de cima; só a segunda vale aqui.
      if (body.includes("--at-color-primary-on-dark:")) apply(body);
  return vars;
}

type Rgb = [number, number, number];

function parseColor(value: string): Rgb {
  if (value === "white") return [255, 255, 255];
  if (value === "black") return [0, 0, 0];
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/^rgb\((\d+) (\d+) (\d+)\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Cor não suportada no teste: ${value}`);
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function resolve(vars: Vars, value: string, depth = 0): string {
  if (depth > 12) throw new Error(`Referência circular: ${value}`);
  const trimmed = value.trim();
  const ref = trimmed.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    const next = vars.get(ref[1]);
    if (next === undefined) throw new Error(`Token ausente: ${ref[1]}`);
    return resolve(vars, next, depth + 1);
  }
  const mix = trimmed.match(
    /^color-mix\(\s*in srgb\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*,\s*(.+?)(?:\s+([\d.]+)%)?\s*\)$/,
  );
  if (mix) {
    const a = parseColor(resolve(vars, mix[1], depth + 1));
    const b = parseColor(resolve(vars, mix[3], depth + 1));
    const pa =
      mix[2] !== undefined
        ? Number(mix[2]) / 100
        : mix[4] !== undefined
          ? 1 - Number(mix[4]) / 100
          : 0.5;
    return toHex(a.map((c, i) => c * pa + b[i] * (1 - pa)) as Rgb);
  }
  return toHex(parseColor(trimmed));
}

/** Texto sobre fundo, nas cores semânticas que a interface usa juntas. */
const TEXT_PAIRS: Array<[string, string]> = [
  ...["ink", "ink-soft", "ink-muted"].flatMap((text) =>
    ["canvas", "surface", "surface-hover", "surface-active"].map(
      (bg) => [text, bg] as [string, string],
    ),
  ),
  ["ink", "primary-tint"],
  ["ink-soft", "primary-tint"],
  ["primary", "canvas"],
  ["primary", "surface"],
  ["primary", "surface-active"],
  ["primary", "primary-tint"],
  ["primary-ink", "primary-tint"],
  ["primary-ink", "primary-tint-mid"],
  ["primary-ink", "primary-tint-strong"],
  ["primary-deep", "primary-tint-strong"],
  ["on-primary", "primary"],
  ["on-primary", "primary-hover"],
  ["on-primary-bright", "primary"],
  ["canvas", "ink"],
  ["canvas", "ink-hover"],
  ["success", "surface"],
  ["success-ink", "success-bg"],
  ["surface", "success-ink"],
  ["warning-ink", "warning-bg"],
  ["warning-ink", "warning-tint"],
  ["warning-ink", "warning-hover"],
  ["warning-deep", "warning-tint-strong"],
  ["danger-ink", "danger-bg"],
  ["danger-ink", "danger-tint"],
  ["danger-ink", "danger-tint-strong"],
  ["danger-border", "surface"],
  ["surface", "danger-border"],
  ["coral-ink", "surface"],
];

const COMBINATIONS = ACCENT_OPTIONS.flatMap((option) =>
  [false, true].map(
    (dark) => [option.id.toLowerCase(), dark ? "escuro" : "claro"] as const,
  ),
);

describe("D-181: contraste de cada combinação", () => {
  test("são doze combinações, e cada cor tem regra no claro e no escuro", () => {
    expect(COMBINATIONS).toHaveLength(12);
    for (const option of ACCENT_OPTIONS) {
      const accent = option.id.toLowerCase();
      expect(rules(themesCss, `[data-accent="${accent}"]`)).toHaveLength(1);
      expect(
        rules(themesCss, `[data-theme="dark"][data-accent="${accent}"]`),
      ).toHaveLength(1);
    }
  });

  test.each(COMBINATIONS)("%s %s: todo texto passa 4,5:1", (accent, mode) => {
    const vars = cascade(accent, mode === "escuro");
    const color = (name: string) => resolve(vars, `var(--at-color-${name})`);
    const failures = TEXT_PAIRS.map(([text, bg]) => ({
      pair: `${text} sobre ${bg}`,
      ratio: contrastRatio(color(text), color(bg)),
    }))
      .filter((result) => result.ratio < 4.5)
      .map((result) => `${result.pair}: ${result.ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  test("no escuro, o painel de entrada (tom escuro da cor) lê o texto claro", () => {
    for (const option of ACCENT_OPTIONS) {
      const vars = cascade(option.id.toLowerCase(), true);
      const color = (name: string) => resolve(vars, `var(--at-color-${name})`);
      for (const text of ["ink", "primary-on-dark", "primary"])
        expect(
          contrastRatio(color(text), color("primary-tint")),
          `${option.id}: ${text}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("no claro, o texto suave do painel de entrada passa sobre a cor", () => {
    for (const option of ACCENT_OPTIONS) {
      const vars = cascade(option.id.toLowerCase(), false);
      const color = (name: string) => resolve(vars, `var(--at-color-${name})`);
      expect(
        contrastRatio(color("primary-on-dark"), color("primary")),
        option.id,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("o padrão claro é exatamente o quadro aprovado", () => {
    const vars = cascade("verde", false);
    const color = (name: string) => resolve(vars, `var(--at-color-${name})`);
    expect(color("primary")).toBe("#0f5f63");
    expect(color("canvas")).toBe("#f7f4ef");
    expect(color("primary-tint-strong")).toBe("#dceceb");
  });

  test("a Semana no celular calcula o nome com os fundos do escuro", () => {
    const vars = cascade("verde", true);
    const color = (name: string) => resolve(vars, `var(--at-color-${name})`);
    expect(DARK_NEUTRAL_SWATCH_HEX).toBe(color("ink-ghost"));
    expect([...DARK_PAST_UNDERLAYS]).toEqual([
      color("canvas"),
      color("surface-active"),
    ]);
  });
});
