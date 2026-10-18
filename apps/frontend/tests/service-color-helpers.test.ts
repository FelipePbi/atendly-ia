import { describe, expect, test } from "vitest";

import {
  cardSwatch,
  contrastRatio,
  hexToRgb,
  hsvToRgb,
  legibleSwatch,
  rgbToHex,
  rgbToHsv,
  savedServiceColors,
  serviceColorOf,
  swatchProps,
} from "@/shared/serviceColor";

/** Cor personalizada do serviço (2026-10-18). */
describe("serviceColor", () => {
  test("hex, RGB e HSV vão e voltam sem perder a cor", () => {
    for (const hex of ["#7a9e7e", "#000000", "#ffffff", "#8e5a86", "#123abc"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
  });

  test("a cor personalizada vence o token; sem nenhuma, traço neutro", () => {
    expect(serviceColorOf({ colorToken: "SKY", colorHex: "#7A9E7E" })).toBe(
      "#7a9e7e",
    );
    expect(serviceColorOf({ colorToken: "SKY", colorHex: null })).toBe("SKY");
    expect(serviceColorOf({})).toBeNull();
  });

  test("tom médio fica como escolhido; cor clara demais escurece só o necessário", () => {
    expect(legibleSwatch("#7a9e7e")).toBe("#7a9e7e");
    const pale = legibleSwatch("#f3ecd8");
    expect(pale).not.toBe("#f3ecd8");
    expect(contrastRatio(pale, "#f7f4ef")).toBeGreaterThanOrEqual(2.2);
    expect(contrastRatio(pale, "#f7f4ef")).toBeLessThan(2.6);
  });

  test("o cartão da Semana deixa o nome branco acima de 4,5:1", () => {
    for (const hex of ["#7a9e7e", "#f3ecd8", "#00ff00", "#123abc"]) {
      expect(contrastRatio(cardSwatch(hex), "#ffffff")).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  test("token vira data-color; hex vira CUSTOM com as variáveis do traço", () => {
    expect(swatchProps("ROSE")).toEqual({ "data-color": "ROSE" });
    expect(swatchProps(null)).toEqual({});
    expect(swatchProps(null, { flexGrow: 2 })).toEqual({
      style: { flexGrow: 2 },
    });
    const custom = swatchProps("#7a9e7e", { flexGrow: 2 });
    expect(custom["data-color"]).toBe("CUSTOM");
    expect(custom.style).toMatchObject({
      flexGrow: 2,
      "--swatch-custom": "#7a9e7e",
      "--swatch-custom-card": cardSwatch("#7a9e7e"),
    });
  });

  test("Suas cores: uma entrada por cor, sem o serviço aberto, com as extras no fim", () => {
    const services = [
      { colorHex: "#FF5AD8", id: "a", name: "Aplicação 5D" },
      { colorHex: null, id: "b", name: "Corte" },
      { colorHex: "#ff5ad8", id: "c", name: "Manutenção 5D" },
      { colorHex: "#123abc", id: "d", name: "Aberto" },
    ];
    expect(
      savedServiceColors(services, {
        excludeId: "d",
        extra: ["#123ABC", "SKY", null, "#ff5ad8"],
      }),
    ).toEqual([
      { hex: "#ff5ad8", usedBy: ["Aplicação 5D", "Manutenção 5D"] },
      { hex: "#123abc", usedBy: [] },
    ]);
    expect(savedServiceColors([])).toEqual([]);
  });
});
