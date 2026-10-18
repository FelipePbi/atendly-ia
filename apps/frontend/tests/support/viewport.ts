import { vi } from "vitest";

/**
 * Dublê de `matchMedia` com uma largura de tela: responde `min-width` e
 * `max-width` em px como o navegador faria (jsdom não tem `matchMedia` nem
 * layout). `reduceMotion` liga `prefers-reduced-motion: reduce`.
 */
export function stubViewport(width: number, reduceMotion = false): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      const max = /max-width:\s*(\d+)px/.exec(query);
      const matches = query.includes("prefers-reduced-motion")
        ? reduceMotion
        : (!min || width >= Number(min[1])) &&
          (!max || width <= Number(max[1])) &&
          Boolean(min || max);
      return {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
    },
    writable: true,
  });
}

/** Volta ao jsdom sem `matchMedia`. */
export function clearViewport(): void {
  Reflect.deleteProperty(window, "matchMedia");
}
