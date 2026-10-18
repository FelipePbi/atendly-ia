import type { ToastTone } from "./Toast";

/**
 * Avisos rápidos no canto da tela (pedido de 2026-10-18): toda configuração
 * salva confirma com um toast, além do texto do próprio formulário. Qualquer
 * tela chama `showToast`; o `ToastHost` da casca mostra.
 */
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showToast(message: string, tone: ToastTone = "success") {
  const toast = { id: nextId++, message, tone };
  for (const listener of listeners) listener(toast);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
