import { type ServiceColorToken } from "@/data";
import { cardSwatch, isHexColor, type ServiceColor } from "@/shared/serviceColor";

/**
 * Rótulo visual do cartão da Semana no celular (pedido de 2026-10-12): o nome
 * da cliente abreviado, na cor que contrasta com o fundo do cartão. É só
 * visual — o nome acessível do cartão continua completo.
 */

/** Partículas que não contam como sobrenome: "Maria da Silva" → "Maria S.". */
const NAME_PARTICLES = new Set([
  "da",
  "das",
  "de",
  "di",
  "do",
  "dos",
  "du",
  "e",
]);

/**
 * "Felipe Borges" → "Felipe B."; uma palavra fica inteira; espaços extras
 * não contam. A inicial é a do primeiro sobrenome que não é partícula.
 */
export function abbreviateClientName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = words;
  if (!first) return "";
  const surname =
    rest.find((word) => !NAME_PARTICLES.has(word.toLowerCase())) ?? rest[0];
  if (!surname) return first;
  return `${first} ${surname.charAt(0).toLocaleUpperCase("pt-BR")}.`;
}

/**
 * `--swatch` de cada token, espelho de `avenly-services.css` (um teste
 * compara os dois para não divergirem).
 */
export const SERVICE_SWATCH_HEX: Readonly<Record<ServiceColorToken, string>> = {
  AMBER: "#b8674a",
  EMERALD: "#7c8a3e",
  ROSE: "#c07a88",
  SKY: "#8e5a86",
  SLATE: "#5b6e9a",
  VIOLET: "#8b7bb5",
};

/**
 * Cor do cartão da Semana no celular: igual à paleta, com as quatro cores
 * mais claras escurecidas para o nome branco passar de 4,5:1 (pedido de
 * 2026-10-12). Espelho das regras `.week-bar-stripe b[data-color]` de
 * `avenly-agenda.css` (um teste compara os dois).
 */
export const CARD_SWATCH_HEX: Readonly<Record<ServiceColorToken, string>> = {
  ...SERVICE_SWATCH_HEX,
  AMBER: "#ab6045",
  EMERALD: "#6e7b37",
  ROSE: "#9d6470",
  VIOLET: "#7c6da1",
};

/** Traço de serviço sem cor (`.week-bar-stripe b` sem `--swatch`). */
export const NEUTRAL_SWATCH_HEX = "#b9b1a6";
/** O mesmo traço no tema escuro (`--at-color-ink-ghost` de themes.css). */
export const DARK_NEUTRAL_SWATCH_HEX = "#5f584f";

/** Opacidade do traço de um atendimento que já passou, no celular. */
export const PAST_STRIPE_OPACITY = 0.4;

/** O que pode estar por baixo de um cartão passado: o fundo e a faixa fora do expediente. */
const PAST_UNDERLAYS = ["#f7f4ef", "#efeae2"] as const;
/** Os mesmos fundos no tema escuro (canvas e surface-active de themes.css). */
export const DARK_PAST_UNDERLAYS = ["#161412", "#2b2723"] as const;

/** Claro ou escuro: muda o que fica por baixo do nome (D-181). */
export type WeekBarTheme = "dark" | "light";

export const LIGHT_INK = "#ffffff";
export const DARK_INK = "#000000";

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Luminância relativa da WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste da WCAG (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `top` com `alpha` sobre `bottom`, como o navegador compõe. */
export function blendHex(top: string, alpha: number, bottom: string): string {
  const upper = channels(top);
  const lower = channels(bottom);
  return toHex(
    upper.map(
      (channel, index) => channel * alpha + (lower[index] ?? 0) * (1 - alpha),
    ) as [number, number, number],
  );
}

/**
 * Branco ou preto, o que der o maior contraste mínimo contra todos os fundos
 * possíveis. Fundo escuro dá texto claro e fundo claro dá texto escuro.
 */
export function readableInk(backgrounds: readonly string[]): string {
  const worst = (ink: string) =>
    Math.min(
      ...backgrounds.map((background) => contrastRatio(ink, background)),
    );
  return worst(LIGHT_INK) > worst(DARK_INK) ? LIGHT_INK : DARK_INK;
}

/**
 * Fundos que ficam atrás do nome no cartão: o texto fica no topo, sobre a
 * primeira faixa (num atendimento com vários serviços o traço se divide de
 * cima para baixo). Passado, o traço é esmaecido sobre o fundo da grade.
 */
export function weekBarLabelBackgrounds(
  tokens: ReadonlyArray<ServiceColor | null>,
  isPast: boolean,
  theme: WeekBarTheme = "light",
): string[] {
  const first = tokens[0];
  const dark = theme === "dark";
  const swatch = first
    ? isHexColor(first)
      ? cardSwatch(first)
      : CARD_SWATCH_HEX[first]
    : dark
      ? DARK_NEUTRAL_SWATCH_HEX
      : NEUTRAL_SWATCH_HEX;
  if (!isPast) return [swatch];
  return (dark ? DARK_PAST_UNDERLAYS : PAST_UNDERLAYS).map((underlay) =>
    blendHex(swatch, PAST_STRIPE_OPACITY, underlay),
  );
}

/** Cor do nome no cartão da Semana no celular. */
export function weekBarLabelInk(
  tokens: ReadonlyArray<ServiceColor | null>,
  isPast: boolean,
  theme: WeekBarTheme = "light",
): string {
  // Pedido de 2026-10-12: nas cores do servico o nome fica branco; as quatro
  // cores mais claras foram escurecidas so no cartao (CARD_SWATCH_HEX) para
  // passar de 4,5:1. Cinza "sem cor" e cartao passado (traco esmaecido)
  // seguem a regra de contraste.
  if (!isPast && tokens[0]) return LIGHT_INK;
  return readableInk(weekBarLabelBackgrounds(tokens, isPast, theme));
}
