/** O que pode receber foco dentro de um diálogo. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function isRadio(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === "radio";
}

/**
 * As paradas do Tab dentro do painel, na ordem do documento: nada escondido
 * e, de um grupo de rádios, uma parada só (o marcado, ou o primeiro).
 */
export function tabbableIn(panel: HTMLElement): HTMLElement[] {
  const all = Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return all.filter((element) => {
    if (element.closest("[hidden], [inert]")) return false;
    if (
      typeof element.checkVisibility === "function" &&
      !element.checkVisibility()
    ) {
      return false;
    }
    if (isRadio(element) && element.name) {
      const group = all.filter(
        (other): other is HTMLInputElement =>
          isRadio(other) && other.name === element.name,
      );
      return element === (group.find((other) => other.checked) ?? group[0]);
    }
    return true;
  });
}

/**
 * Tab e Shift+Tab circulam dentro do painel (D-204). O foco anda por conta
 * própria, sem depender do navegador: o Safari pula links no Tab e um grupo
 * de rádios é uma parada só — nos dois casos o "último" que o navegador
 * visita não é o último do seletor, e o foco escapava do diálogo.
 */
export function cycleFocus(panel: HTMLElement, event: KeyboardEvent): void {
  const items = tabbableIn(panel);
  if (items.length === 0) return;
  event.preventDefault();
  const active = document.activeElement;
  let index = items.findIndex((item) => item === active);
  if (index === -1 && active && isRadio(active)) {
    index = items.findIndex(
      (item) => isRadio(item) && item.name === active.name,
    );
  }
  const step = event.shiftKey ? -1 : 1;
  const next =
    index === -1
      ? event.shiftKey
        ? items.length - 1
        : 0
      : (index + step + items.length) % items.length;
  items[next]?.focus();
}
