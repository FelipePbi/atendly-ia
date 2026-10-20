"use client";

import { ORIENTATION_BOOT_SCRIPT } from "./orientationLock";

/**
 * Trava o retrato no celular instalado durante a leitura do HTML, antes da
 * primeira pintura (D-211). No cliente o React não executa nem deve avisar
 * sobre o script: o tipo vira `text/plain` e o DOM do servidor vale, como no
 * script da aparência.
 */
export function OrientationBootScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: ORIENTATION_BOOT_SCRIPT }}
      suppressHydrationWarning
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
    />
  );
}
