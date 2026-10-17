import type {
  AppearanceAccent,
  AppearanceMode,
  AppearancePreference,
} from "@/data";

/**
 * Aparência da conta (D-181): cor de destaque × claro/escuro.
 *
 * A fonte é o BFF (`/v1/settings/appearance`, por pessoa). A cópia em
 * `localStorage` existe só para o script do `<head>` pintar a primeira tela
 * já com a escolha, sem piscar o tema padrão antes.
 */

export const APPEARANCE_STORAGE_KEY = "avenly:appearance";

export const DEFAULT_APPEARANCE: AppearancePreference = {
  accent: "VERDE",
  mode: "LIGHT",
};

export type ResolvedTheme = "dark" | "light";

export const ACCENT_OPTIONS: ReadonlyArray<{
  id: AppearanceAccent;
  label: string;
}> = [
  { id: "VERDE", label: "Verde-petróleo" },
  { id: "ROSE", label: "Rosé" },
  { id: "CHAMPANHE", label: "Champanhe" },
  { id: "AZUL", label: "Azul sereno" },
  { id: "LAVANDA", label: "Lavanda" },
  { id: "TERRACOTA", label: "Terracota" },
];

export const MODE_OPTIONS: ReadonlyArray<{
  description: string;
  id: AppearanceMode;
  label: string;
}> = [
  { id: "LIGHT", label: "Claro", description: "Fundo claro" },
  { id: "DARK", label: "Escuro", description: "Fundo escuro" },
  { id: "SYSTEM", label: "Automático", description: "Segue o aparelho" },
];

const ACCENTS = ACCENT_OPTIONS.map((option) => option.id);
const MODES = MODE_OPTIONS.map((option) => option.id);

/** Cor da barra do navegador no padrão claro (espelho de `--at-color-canvas`). */
export const DEFAULT_BROWSER_THEME_COLOR = "#f7f4ef";

/** Qualquer valor guardado vira uma aparência válida; o resto cai no padrão. */
export function parseAppearance(value: unknown): AppearancePreference {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const accent = ACCENTS.find((id) => id === record.accent);
  const mode = MODES.find((id) => id === record.mode);
  return {
    accent: accent ?? DEFAULT_APPEARANCE.accent,
    mode: mode ?? DEFAULT_APPEARANCE.mode,
  };
}

export function sameAppearance(
  a: AppearancePreference,
  b: AppearancePreference,
): boolean {
  return a.accent === b.accent && a.mode === b.mode;
}

export function readStoredAppearance(): AppearancePreference {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return parseAppearance(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function storeAppearance(appearance: AppearancePreference): void {
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify(appearance),
    );
  } catch {
    // Sem armazenamento (modo privado): a escolha vale até fechar a aba e
    // continua salva na conta.
  }
}

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(
  mode: AppearanceMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (mode === "SYSTEM") return prefersDark ? "dark" : "light";
  return mode === "DARK" ? "dark" : "light";
}

/** Duração do atributo de troca: a transição de 240 ms e uma folga. */
export const THEME_SWITCH_MS = 320;

let switchTimer: number | undefined;

/**
 * Põe a aparência no `<html>`. Com `animate`, marca a troca para o CSS
 * atravessar as cores (ou, com movimento reduzido, só o véu de opacidade).
 */
export function applyAppearance(
  appearance: AppearancePreference,
  options: { animate?: boolean; prefersDark?: boolean } = {},
): ResolvedTheme {
  const root = document.documentElement;
  const theme = resolveTheme(
    appearance.mode,
    options.prefersDark ?? systemPrefersDark(),
  );
  const accent = appearance.accent.toLowerCase();
  const changed =
    root.getAttribute("data-theme") !== theme ||
    root.getAttribute("data-accent") !== accent;
  if (options.animate && changed) {
    window.clearTimeout(switchTimer);
    root.removeAttribute("data-theme-switching");
    // Reinicia o véu se duas trocas vierem seguidas.
    void root.offsetWidth;
    root.setAttribute("data-theme-switching", "");
    switchTimer = window.setTimeout(
      () => root.removeAttribute("data-theme-switching"),
      THEME_SWITCH_MS,
    );
  }
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-mode", appearance.mode.toLowerCase());
  syncBrowserThemeColor();
  return theme;
}

/** A barra do navegador acompanha o fundo do tema aplicado. */
export function syncBrowserThemeColor(): void {
  const canvas = getComputedStyle(document.documentElement)
    .getPropertyValue("--at-color-canvas")
    .trim();
  if (!canvas) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    meta.content = canvas;
  }
}

/**
 * Script do `<head>`: roda durante a leitura do HTML, antes da primeira
 * pintura, e repete a regra de `parseAppearance` + `resolveTheme` sem
 * depender de nada carregado.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,a=${JSON.stringify(
  DEFAULT_APPEARANCE.accent,
)},m=${JSON.stringify(DEFAULT_APPEARANCE.mode)},s=null;try{s=JSON.parse(localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)})||"null")}catch(e){}if(s&&typeof s==="object"){if(${JSON.stringify(
  ACCENTS,
)}.indexOf(s.accent)>=0)a=s.accent;if(${JSON.stringify(
  MODES,
)}.indexOf(s.mode)>=0)m=s.mode}var t=m==="DARK"?"dark":m==="SYSTEM"&&window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light";d.setAttribute("data-accent",a.toLowerCase());d.setAttribute("data-theme",t);d.setAttribute("data-theme-mode",m.toLowerCase())}catch(e){}})()`;
