"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** Distância mínima até a borda da tela, como as margens do app no celular. */
const GUTTER = 16;
const GAP = 6;

type Placement = { left: number; top: number; width: number };

/**
 * Painel flutuante dos seletores, preso ao campo que o abriu.
 *
 * Vai para o `body` (portal) porque os campos moram dentro de `<label>`,
 * folhas com `transform` e cartões com `overflow: hidden`: lá dentro um toque
 * no calendário viraria clique no rótulo e o painel seria cortado.
 *
 * Fecha com Esc, com toque fora e quando quem usa chama `onClose`. Esc e Tab
 * são tratados na captura do documento, antes do `Dialog` que talvez esteja
 * por baixo: Esc fecha só o painel, e Tab circula dentro dele.
 */
export function PickerPopover({
  anchorRef,
  children,
  label,
  onClose,
  preferredWidth,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  label: string;
  onClose: (reason: "escape" | "outside") => void;
  preferredWidth: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        // Acompanha a largura do campo, até a do cartão do seletor (480 px).
        Math.min(Math.max(preferredWidth, rect.width), 480),
        viewportWidth - GUTTER * 2,
      );
      const left = Math.min(
        Math.max(rect.left, GUTTER),
        viewportWidth - width - GUTTER,
      );
      const height = panel.offsetHeight;
      const below = rect.bottom + GAP;
      const above = rect.top - GAP - height;
      let top = below;
      if (below + height > viewportHeight - GUTTER) {
        top =
          above >= GUTTER
            ? above
            : Math.max(GUTTER, viewportHeight - GUTTER - height);
      }
      setPlacement((previous) =>
        previous &&
        previous.left === left &&
        previous.top === top &&
        previous.width === width
          ? previous
          : { left, top, width },
      );
    }
    place();
    // A altura muda quando o mês abre ou recolhe.
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, preferredWidth]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        onCloseRef.current("escape");
        return;
      }
      if (event.key !== "Tab" || !panel.contains(document.activeElement))
        return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        event.stopPropagation();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        event.stopPropagation();
        first?.focus();
      } else {
        // O Dialog por baixo não deve reagir a um Tab que é do painel.
        event.stopPropagation();
      }
    }
    function onPointerDown(event: PointerEvent | MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current("outside");
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [anchorRef]);

  return createPortal(
    <div
      aria-label={label}
      className="picker-popover"
      data-placed={placement ? "true" : undefined}
      ref={panelRef}
      role="dialog"
      style={
        placement
          ? { left: placement.left, top: placement.top, width: placement.width }
          : { width: preferredWidth }
      }
    >
      {children}
    </div>,
    document.body,
  );
}
