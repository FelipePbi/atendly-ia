/**
 * Shared test setup.
 *
 * This file runs for EVERY test, including the data tests that deliberately
 * stay on the `node` environment, so everything DOM-shaped is guarded. A setup
 * file that assumed a document would turn "this suite needs no DOM" into a
 * crash at import time.
 */

import { afterEach } from "vitest";

import { claimSessionMemory } from "@/shared/runtime/sessionMemory";

// A memória da aba (D-167) vive o arquivo inteiro: o que um teste leu não
// pode semear o seguinte.
afterEach(() => {
  claimSessionMemory(null);
  claimSessionMemory("test");
});

const hasDom = typeof document !== "undefined";

if (hasDom) {
  const [{ cleanup }] = await Promise.all([
    import("@testing-library/react"),
    import("@testing-library/jest-dom/vitest"),
  ]);

  // Without this a component from one test is still mounted during the next,
  // and a query that should find one node finds two.
  afterEach(() => {
    cleanup();
    // O storage do jsdom vive o arquivo inteiro: uma escolha lembrada num
    // teste (a visualização da Agenda, por exemplo) mudaria o ponto de
    // partida do seguinte.
    try {
      window.localStorage.clear();
    } catch {
      /* Teste que trocou o storage por um que recusa: nada a limpar. */
    }
  });
}
