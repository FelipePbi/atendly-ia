"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import { prefersReducedMotion } from "./reducedMotion";
import { runViewTransition, supportsViewTransition } from "./viewTransition";

/**
 * Transição entre as telas de uma seção (pedido do usuário, 2026-10-12).
 *
 * Vai no `template.tsx` da seção: o Next remonta o template a cada troca de
 * segmento filho, então cada tela nasce dentro de um `.motion-page` novo. A
 * animação é uma View Transition nativa: o clique num link da própria seção
 * é interceptado, a tela atual é fotografada, `router.push` faz a navegação
 * de sempre e, quando a tela nova está no DOM (`useLayoutEffect` da nova
 * instância), o navegador anima só o grupo `page-content` — no celular a
 * tela nova empurra a antiga, no desktop troca com fade e 8 px de subida
 * (`avenly-motion.css`). A casca (sidebar, barras) fica parada.
 *
 * A direção é a profundidade da rota: descer um nível é `nav-forward`
 * (`/agenda` → `/agenda/agendamento`), subir é `nav-back`, mesmo nível é
 * `nav-fade`. Um link pode mandar com `data-motion="forward" | "back" |
 * "fade"`, e `data-motion="none"` deixa o link em paz.
 *
 * Não intercepta: clique com modificador ou botão secundário, `target`,
 * `download`, outra origem, link fora da seção (`scope`), link que só muda
 * a query (o template não remonta e a tela não "troca"), e nada quando a
 * API não existe ou o sistema pede menos movimento — nesses casos a
 * navegação é a de sempre, sem animação.
 */
type Direction = "back" | "fade" | "forward";

/** A tela nova avisa que montou; a transição em voo espera por isso. */
let settleCommit: (() => void) | null = null;

/** Se a navegação não trouxer tela nova (bloqueada, falhou), a foto antiga não pode ficar parada. */
const COMMIT_TIMEOUT_MS = 1200;

function waitForCommit(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, COMMIT_TIMEOUT_MS);
    function done() {
      window.clearTimeout(timer);
      if (settleCommit === done) settleCommit = null;
      resolve();
    }
    settleCommit = done;
  });
}

function depthOf(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

export function directionBetween(from: string, to: string): Direction {
  const delta = depthOf(to) - depthOf(from);
  if (delta > 0) return "forward";
  if (delta < 0) return "back";
  return "fade";
}

function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function anchorOf(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

export function PageTransition({
  children,
  className,
  scope,
}: {
  children: ReactNode;
  className?: string;
  /** Prefixo das rotas da seção: só links de uma para outra animam. */
  scope: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  // A tela nova está no DOM: a transição que a esperava pode fotografá-la.
  useLayoutEffect(() => {
    settleCommit?.();
  }, [pathname]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function handleClick(event: MouseEvent) {
      if (!isPlainLeftClick(event)) return;
      const anchor = anchorOf(event.target);
      if (!anchor || !root?.contains(anchor)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const hint = anchor.dataset.motion;
      if (hint === "none") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = window.location.pathname;
      if (url.pathname === current) return;
      if (!current.startsWith(scope) || !url.pathname.startsWith(scope)) return;
      if (!supportsViewTransition() || prefersReducedMotion()) return;

      const direction: Direction =
        hint === "forward" || hint === "back" || hint === "fade"
          ? hint
          : directionBetween(current, url.pathname);
      // A navegação continua sendo a do Next: só a foto é tirada antes dela.
      event.preventDefault();
      void runViewTransition(
        () => {
          const commit = waitForCommit();
          router.push(`${url.pathname}${url.search}${url.hash}`);
          return commit;
        },
        { flush: false, types: [`nav-${direction}`] },
      );
    }
    // Na captura, antes do `onClick` do `<Link>`: ele respeita `defaultPrevented`.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [router, scope]);

  return (
    <div className={clsx("motion-page", className)} ref={rootRef}>
      {children}
    </div>
  );
}
