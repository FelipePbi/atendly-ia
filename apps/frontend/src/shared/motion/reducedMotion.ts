/**
 * Preferência do sistema por menos movimento. Regra do produto: com
 * `prefers-reduced-motion: reduce` as animações ficam desligadas por padrão —
 * o CSS zera as durações e o código nem dispara uma View Transition.
 */
export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
