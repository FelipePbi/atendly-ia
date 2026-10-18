"use client";

import { useSyncExternalStore } from "react";

/** De 1024 px em diante a lista e o detalhe aparecem lado a lado (D-103). */
export const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";

/**
 * Agenda com a coluna do Dia ao lado do agendamento só a partir de 1280 px
 * (2026-10-18). No tablet deitado (1024 a 1279 px, com a barra lateral a
 * partir de 1100) o detalhe ficava espremido, com o horário quebrando em
 * duas linhas; ali ele abre em tela cheia, como no tablet em pé.
 */
export const AGENDA_SPLIT_MIN_WIDTH = 1280;
export const AGENDA_SPLIT_QUERY = `(min-width: ${AGENDA_SPLIT_MIN_WIDTH}px)`;

function subscribeTo(query: string) {
  return (onChange: () => void): (() => void) => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return () => undefined;
    }
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

function snapshotOf(query: string) {
  return (): boolean =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches;
}

const subscribe = subscribeTo(WIDE_LAYOUT_QUERY);
const getSnapshot = snapshotOf(WIDE_LAYOUT_QUERY);
const subscribeAgenda = subscribeTo(AGENDA_SPLIT_QUERY);
const getAgendaSnapshot = snapshotOf(AGENDA_SPLIT_QUERY);

/**
 * `true` quando a janela comporta lista e detalhe lado a lado. No servidor e
 * onde `matchMedia` não existe, a resposta é `false`: a tela empurrada é a
 * composição segura, e o painel que não cabe nunca é montado.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** `true` quando a Agenda comporta a coluna do Dia ao lado do agendamento. */
export function useAgendaSplitLayout(): boolean {
  return useSyncExternalStore(subscribeAgenda, getAgendaSnapshot, () => false);
}
