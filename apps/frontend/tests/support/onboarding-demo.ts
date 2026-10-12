/**
 * Apoio aos testes da etapa `demonstracao-da-ia` ("Veja sua IA atendendo").
 *
 * Desde a validação de 2026-10-11 a conversa começa vazia e cada item entra
 * depois do "digitando…" de quem fala, também com `prefers-reduced-motion`:
 * não existe mais um quadro com a conversa inteira. Quem precisa do conteúdo
 * da conversa roda a sequência até o fim com relógio falso
 * (`vi.useFakeTimers()`), em vez de depender do movimento reduzido.
 *
 * O teto de 20 s é o contrato de duração da etapa (a conversa padrão leva
 * bem menos, alguns segundos): passar dele é falha, não espera mais longa.
 * Os testes não dependem do ritmo exato (`DEMO_TYPING_MS` e companhia), só
 * da ordem, do "digitando…" antes de cada balão e do Continuar no fim.
 */

import { act, screen } from "@testing-library/react";
import { vi } from "vitest";

/** Tempo máximo, em relógio falso, para a conversa inteira e o Continuar. */
export const DEMO_RUN_LIMIT_MS = 20_000;

const CONTINUE = { name: "Continuar" } as const;

/** Avança o relógio falso dentro de `act`, deixando as promessas assentarem. */
export async function advanceDemo(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Roda a demonstração até o "Continuar" aparecer, em passos de `stepMs`, e
 * devolve o tempo gasto. Falha se ele não aparecer em `limitMs`.
 */
export async function runDemoToEnd(
  limitMs: number = DEMO_RUN_LIMIT_MS,
  stepMs = 250,
): Promise<number> {
  let elapsed = 0;
  while (!screen.queryByRole("button", CONTINUE)) {
    if (elapsed >= limitMs) {
      throw new Error(
        `A demonstração da IA não terminou em ${limitMs} ms de relógio falso: o "Continuar" não apareceu.`,
      );
    }
    await advanceDemo(stepMs);
    elapsed += stepMs;
  }
  return elapsed;
}

/**
 * Os itens já entregues na conversa (balões e eventos), na ordem: fora o
 * "digitando…" e a âncora de rolagem, que são `aria-hidden`.
 */
export function demoItems(log: HTMLElement): HTMLElement[] {
  return [...log.children].filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.getAttribute("aria-hidden") !== "true",
  );
}

/** O texto de cada item entregue, sem o rótulo "sua IA" dos balões da IA. */
export function demoItemTexts(log: HTMLElement): string[] {
  return demoItems(log).map(
    (node) => node.textContent?.replace(/sua IA$/u, "") ?? "",
  );
}

/** Dublê de `matchMedia` (jsdom não tem), com ou sem movimento reduzido. */
export function stubMatchMedia(reduce: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
}
