import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Folha de estilo com os tokens de cor trocados pelo valor do tema padrão
 * (claro, petróleo), para os testes que conferem a cor do quadro aprovado.
 *
 * Desde a D-181 nenhuma folha além de `tokens.css` declara cor literal:
 * `#0f5f63` virou `var(--at-color-primary)`. O tema padrão continua com os
 * mesmos valores, e é isso que esses testes provam — a resolução lê o
 * `:root` de `tokens.css`, nunca uma tabela copiada aqui.
 */

const stylesDir = path.join(__dirname, "../../src/shared/styles");

function rootTokens(): Map<string, string> {
  const css = readFileSync(path.join(stylesDir, "tokens.css"), "utf8");
  const start = css.indexOf(":root {");
  const root = css.slice(start, css.indexOf("\n}", start));
  const raw = new Map<string, string>();
  for (const match of root.matchAll(/(--at-[\w-]+):\s*([^;]+);/g)) {
    raw.set(match[1], match[2].trim());
  }
  const resolve = (value: string, depth = 0): string =>
    depth > 8
      ? value
      : value.replace(/var\((--at-[\w-]+)\)/g, (whole, name: string) => {
          const next = raw.get(name);
          return next === undefined ? whole : resolve(next, depth + 1);
        });
  return new Map([...raw].map(([name, value]) => [name, resolve(value)]));
}

const tokens = rootTokens();

function rgbChannels(color: string): string {
  if (color === "white") return "255, 255, 255";
  const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const value = Number.parseInt(hex, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255].join(", ");
  }
  const rgb = color.match(/^rgb\((\d+) (\d+) (\d+)\)$/);
  if (rgb) return `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`;
  throw new Error(`Cor sem canais conhecidos: ${color}`);
}

/** Troca cada token de cor pelo valor do tema padrão claro. */
export function resolveLightTokens(css: string): string {
  return css
    .replace(
      /rgb\(var\(--at-shadow-rgb\) \/ ([\d.]+)\)/g,
      (_whole, alpha: string) =>
        `rgba(${tokens.get("--at-shadow-rgb")!.split(/\s+/).join(", ")}, ${alpha})`,
    )
    .replace(
      /color-mix\(in srgb, var\((--at-[\w-]+)\) ([\d.]+)%, transparent\)/g,
      (_whole, name: string, percent: string) =>
        `rgba(${rgbChannels(tokens.get(name)!)}, ${Number(percent) / 100})`,
    )
    .replace(
      /var\((--at-(?:color|swatch|mix)[\w-]*)\)/g,
      (whole, name: string) => tokens.get(name) ?? whole,
    );
}

/** `readFileSync` de uma folha de estilo, já com o tema padrão resolvido. */
export function readLightStylesheet(file: string): string {
  return resolveLightTokens(readFileSync(file, "utf8"));
}
