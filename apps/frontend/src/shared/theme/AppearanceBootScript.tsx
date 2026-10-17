"use client";

import { APPEARANCE_BOOT_SCRIPT } from "./appearance";

/**
 * Aplica a aparência guardada durante a leitura do HTML, antes da primeira
 * pintura (D-181). No cliente o React não executa nem deve avisar sobre o
 * script: o tipo vira `text/plain` e o DOM do servidor vale.
 */
export function AppearanceBootScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }}
      suppressHydrationWarning
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
    />
  );
}
