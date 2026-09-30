// @vitest-environment jsdom
/**
 * Goal072 — o sprite de ícones é XML bem formado e cobre todo IconName.
 *
 * Um atributo colado (`<symbol id="i-clock"viewBox=…>`) deixa o sprite inteiro
 * ilegível para o navegador e nenhum outro teste percebe: os componentes só
 * emitem `<use href>`. Este teste parseia o arquivo servido, como o navegador
 * faz, e compara com a união `IconName` de `Icon.tsx`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const spritePath = resolve(process.cwd(), "public/icons/atendly-icons.svg");
const iconSourcePath = resolve(process.cwd(), "src/shared/icons/Icon.tsx");

function iconNames(): string[] {
  const source = readFileSync(iconSourcePath, "utf8");
  const union = /export type IconName =([^;]+);/.exec(source);
  if (!union) throw new Error("IconName não encontrado em Icon.tsx");
  return [...union[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

describe("sprite de ícones", () => {
  const doc = new DOMParser().parseFromString(readFileSync(spritePath, "utf8"), "image/svg+xml");

  it("é XML bem formado", () => {
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });

  it("tem um <symbol id=\"i-<nome>\"> para todo IconName", () => {
    const names = iconNames();
    expect(names.length).toBeGreaterThan(0);
    const ids = new Set([...doc.getElementsByTagName("symbol")].map((symbol) => symbol.getAttribute("id")));
    expect(names.filter((name) => !ids.has(`i-${name}`))).toEqual([]);
  });

  it("todo símbolo tem viewBox", () => {
    const semViewBox = [...doc.getElementsByTagName("symbol")]
      .filter((symbol) => !symbol.getAttribute("viewBox"))
      .map((symbol) => symbol.getAttribute("id"));
    expect(semViewBox).toEqual([]);
  });
});
