"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * "Ocultar por 1h" dos avisos persistentes da casca (pedido de 2026-10-12):
 * no celular, o aviso de WhatsApp desconectado ocupava o topo de toda tela.
 * A pessoa pode tirá-lo do caminho por uma hora; depois ele volta sozinho,
 * porque a condição continua impedindo a IA de atender. A central de
 * notificações e a sidebar seguem mostrando o estado durante a pausa.
 *
 * O prazo fica no `localStorage` do navegador (preferência de quem vê, não
 * estado do negócio). Sem armazenamento disponível, o aviso só some nesta
 * página: nunca deixa de aparecer por erro de leitura.
 */
export const STATUS_BANNER_SNOOZE_MS = 60 * 60 * 1000;

export type StatusBannerKind = "ai-unavailable" | "whatsapp-disconnected";

export function statusBannerSnoozeKey(kind: StatusBannerKind): string {
  return `avenly.shell-banner.${kind}.hidden-until`;
}

const CHANGE_EVENT = "avenly:shell-banner-snooze";
/** Fallback em memória quando o `localStorage` não aceita escrita. */
const memory = new Map<StatusBannerKind, string>();

function readRaw(kind: StatusBannerKind): string | null {
  try {
    return (
      window.localStorage.getItem(statusBannerSnoozeKey(kind)) ??
      memory.get(kind) ??
      null
    );
  } catch {
    return memory.get(kind) ?? null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Prazo ainda valendo, ou `null`: um prazo vencido é o mesmo que nenhum. */
function readActiveUntil(kind: StatusBannerKind): number | null {
  const raw = readRaw(kind);
  const until = raw === null ? NaN : Number(raw);
  return Number.isFinite(until) && until > Date.now() ? until : null;
}

/** `[oculto agora, ocultar por 1h]`. Volta a mostrar sozinho quando o prazo vence. */
export function useStatusBannerSnooze(
  kind: StatusBannerKind,
): [boolean, () => void] {
  const until = useSyncExternalStore(
    subscribe,
    () => readActiveUntil(kind),
    () => null,
  );

  // No vencimento, avisa o store: a leitura seguinte já vem `null`.
  useEffect(() => {
    if (until === null) return;
    const timer = window.setTimeout(
      () => window.dispatchEvent(new Event(CHANGE_EVENT)),
      Math.max(0, until - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [until]);

  const hide = useCallback(() => {
    const value = String(Date.now() + STATUS_BANNER_SNOOZE_MS);
    try {
      window.localStorage.setItem(statusBannerSnoozeKey(kind), value);
      memory.delete(kind);
    } catch {
      // Sem armazenamento: vale só nesta página (o `memory` acima).
      memory.set(kind, value);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [kind]);

  return [until !== null, hide];
}
