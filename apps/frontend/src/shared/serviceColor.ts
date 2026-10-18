import type { CSSProperties } from "react";

import type { ServiceColorToken } from "@/data";

/**
 * Cor de um serviço na agenda: uma das seis sugeridas (token) ou uma cor
 * personalizada `#rrggbb`, escolhida no seletor de cores (2026-10-18). O
 * serviço tem uma cor só, e todo lugar que pinta a cor passa por aqui.
 *
 * Arquivo `.ts` de propósito: as cores literais abaixo são a matemática do
 * seletor e do contraste, não estilo (o teste de tokens só lê `.tsx`/`.css`).
 */
export type HexColor = `#${string}`;
export type ServiceColor = ServiceColorToken | HexColor;

export interface ColoredService {
  colorToken?: ServiceColorToken | null;
  colorHex?: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === "string" && HEX.test(value);
}

/** A cor do serviço: a personalizada vence; sem nenhuma, `null` (traço neutro). */
export function serviceColorOf(service: ColoredService): ServiceColor | null {
  if (isHexColor(service.colorHex))
    return service.colorHex.toLowerCase() as HexColor;
  return service.colorToken ?? null;
}

// --- conversões -------------------------------------------------------------

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): HexColor {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Matiz 0–360, saturação e brilho 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// --- contraste --------------------------------------------------------------

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

/** Escurece mantendo o tom, em passos de 4%, até passar do contraste pedido. */
function darkenUntil(hex: string, against: string, ratio: number): HexColor {
  const hsv = rgbToHsv(hexToRgb(hex));
  let current = hex.toLowerCase() as HexColor;
  while (contrastRatio(current, against) < ratio && hsv.v > 0) {
    hsv.v = Math.max(0, hsv.v - 0.04);
    current = rgbToHex(hsvToRgb(hsv));
  }
  return current;
}

/** Fundo claro do produto (`--at-color-canvas` de tokens.css). */
const PAPER = "#f7f4ef";
const WHITE = "#ffffff";

/**
 * Traço legível sobre o papel: só cor clara de verdade escurece, o mínimo
 * para 2,2:1 contra o fundo. Tons médios (o `#7A9E7E` do protótipo) ficam como
 * a pessoa escolheu. É o que o protótipo promete: "Se a cor for clara demais,
 * escurecemos um pouco o traço". O nome ao lado do traço continua sendo o que
 * identifica o serviço.
 */
export function legibleSwatch(hex: string): HexColor {
  return darkenUntil(hex, PAPER, 2.2);
}

/** Cartão da Semana no celular: o nome branco por cima pede 4,5:1. */
export function cardSwatch(hex: string): HexColor {
  return darkenUntil(legibleSwatch(hex), WHITE, 4.5);
}

// --- pintura ----------------------------------------------------------------

type SwatchProps = {
  "data-color"?: string;
  style?: CSSProperties;
};

/**
 * Atributos que pintam a cor de um serviço. Token vira `data-color` (as
 * regras de `avenly-services.css` dão o `--swatch`); hex vira
 * `data-color="CUSTOM"` com o traço legível e a versão do cartão em
 * variáveis próprias, que o CSS liga ao `--swatch` conforme o lugar.
 */
export function swatchProps(
  color: ServiceColor | null | undefined,
  style?: CSSProperties,
): SwatchProps {
  if (!color) return style ? { style } : {};
  if (!isHexColor(color))
    return style ? { "data-color": color, style } : { "data-color": color };
  return {
    "data-color": "CUSTOM",
    style: {
      ...style,
      ["--swatch-custom" as string]: legibleSwatch(color),
      ["--swatch-custom-card" as string]: cardSwatch(color),
    },
  };
}

/** Cor própria que o negócio já usa, com os serviços que a usam. */
export interface SavedServiceColor {
  hex: HexColor;
  usedBy: string[];
}

/**
 * "Suas cores" (2026-10-18): as cores personalizadas que o negócio já deu a
 * algum serviço ficam à mão para reusar em outro. Vêm do próprio catálogo,
 * sem lista separada para manter: a cor existe enquanto algum serviço a usa.
 * `extra` acrescenta, sem serviço, a cor que o serviço aberto tinha e a que
 * acabou de ser escolhida no seletor, para que trocar de ideia não a perca.
 */
export function savedServiceColors(
  services: ReadonlyArray<{
    colorHex?: string | null;
    id: string;
    name: string;
  }>,
  options: { excludeId?: string | null; extra?: ReadonlyArray<unknown> } = {},
): SavedServiceColor[] {
  const byHex = new Map<HexColor, string[]>();
  for (const service of services) {
    if (service.id === options.excludeId || !isHexColor(service.colorHex))
      continue;
    const hex = service.colorHex.toLowerCase() as HexColor;
    byHex.set(hex, [...(byHex.get(hex) ?? []), service.name]);
  }
  for (const value of options.extra ?? []) {
    if (!isHexColor(value)) continue;
    const hex = value.toLowerCase() as HexColor;
    if (!byHex.has(hex)) byHex.set(hex, []);
  }
  return [...byHex].map(([hex, usedBy]) => ({ hex, usedBy }));
}
