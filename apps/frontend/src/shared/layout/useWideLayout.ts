"use client";

import { useSyncExternalStore } from "react";

/** De 1024 px em diante a lista e o detalhe aparecem lado a lado (D-103). */
export const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia(WIDE_LAYOUT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(WIDE_LAYOUT_QUERY).matches
  );
}

/**
 * `true` quando a janela comporta lista e detalhe lado a lado. No servidor e
 * onde `matchMedia` não existe, a resposta é `false`: a tela empurrada é a
 * composição segura, e o painel que não cabe nunca é montado.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
