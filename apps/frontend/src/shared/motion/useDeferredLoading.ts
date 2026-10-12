"use client";

import { useEffect, useState } from "react";

import { useSplashCovering } from "./splash";

/** Abaixo disso o dado "chegou na hora": mostrar um esqueleto só piscaria. */
export const SKELETON_DELAY_MS = 150;

/**
 * Só confirma um carregamento que durou mais que `delayMs` (pedido do
 * usuário, 2026-10-12, D-168): quem mostra um esqueleto na primeira carga o
 * segura por esse tempo; se o dado chegar antes, o esqueleto nunca aparece.
 * Com `active` falso, volta a `false` na hora. Sob o splash da marca
 * (primeiro carregamento), nunca confirma: a tela entra já com conteúdo.
 */
export function useDeferredLoading(
  active: boolean,
  delayMs: number = SKELETON_DELAY_MS,
): boolean {
  const covering = useSplashCovering();
  const [elapsed, setElapsed] = useState(false);
  // Um carregamento novo recomeça a contagem (estado derivado da prop).
  const [tracked, setTracked] = useState(active);
  if (tracked !== active) {
    setTracked(active);
    setElapsed(false);
  }
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setElapsed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);
  return active && elapsed && !covering;
}
