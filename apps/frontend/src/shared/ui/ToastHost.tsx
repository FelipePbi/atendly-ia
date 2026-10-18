"use client";

import { useEffect, useState } from "react";

import { Toast } from "./Toast";
import { subscribeToasts, type ToastItem } from "./toastBus";

/** Quanto o aviso fica na tela. */
export const TOAST_DURATION_MS = 3500;
/** Mais que isso empilhado é ruído: o mais antigo sai. */
const MAX_TOASTS = 3;

/**
 * Pilha de avisos da casca logada. O texto do formulário continua sendo o
 * anúncio para leitor de tela; o toast repete a confirmação para quem olha
 * o canto da tela, então não anuncia de novo (`aria-hidden`) e não tem nada
 * focável: some sozinho.
 */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      subscribeToasts((toast) => {
        setToasts((current) => [...current, toast].slice(-MAX_TOASTS));
        window.setTimeout(() => {
          setToasts((current) =>
            current.filter((item) => item.id !== toast.id),
          );
        }, TOAST_DURATION_MS);
      }),
    [],
  );

  if (toasts.length === 0) return null;
  return (
    <div aria-hidden="true" className="toast-stack">
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} />
      ))}
    </div>
  );
}
