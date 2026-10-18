"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { WIDE_LAYOUT_QUERY } from "@/shared/layout/useWideLayout";

import { prefersReducedMotion } from "./reducedMotion";
import { VIEW_TRANSITION_CLASS } from "./viewTransition";

/**
 * Voltar arrastando da borda esquerda (pedido do usuário, 2026-10-18, D-198):
 * numa tela empurrada com voltar, abaixo de 1024 px, o dedo que sai da borda
 * esquerda arrasta a tela inteira para a direita e, solto depois de ~35% da
 * largura (ou num arremesso rápido), leva ao mesmo destino do botão voltar.
 * Antes disso a tela volta ao lugar.
 *
 * Quem tem o gesto é quem tem o voltar: `PushedBar` (com o chevron) e o
 * cabeçalho do chat chamam `useSwipeBack({ href })`. O botão continua sendo o
 * caminho acessível — o gesto não acrescenta nada à árvore acessível nem ao
 * teclado — e o gesto só existe para toque (`pointerType === "touch"`): mouse,
 * caneta e teclado seguem como sempre.
 *
 * O que se move é o `<main id="main-content">`: no celular a tela empurrada é
 * ele inteiro (a barra de abas some). Por trás dele entra um véu
 * (`.swipe-back-scrim`) que clareia conforme a tela sai, e a tela seguinte,
 * quando monta, entra como no voltar normal (16 px da esquerda, com fade).
 * Só `transform` e `opacity` mudam a cada quadro.
 *
 * Não começa: com `prefers-reduced-motion: reduce` (o gesto é movimento
 * contínuo; a regra D-168/D-173 não abre exceção para ele), de 1024 px em
 * diante (a lista está ao lado e o voltar some), fora do `#main-content`
 * (folhas e diálogos), dentro de um diálogo, de um campo de texto, de um
 * controle deslizante, de um conteúdo com rolagem horizontal ou com
 * `touch-action` que reserva o arrasto horizontal, com texto selecionado,
 * durante uma View Transition, e em `[data-swipe-back="off"]`. Arrasto que
 * começa vertical é rolagem e é deixado em paz.
 *
 * Gestos do sistema: no Safari do iOS (aba comum), o voltar nativo da borda
 * ganha do nosso — o navegador cancela o toque (`pointercancel`) e a tela
 * volta ao lugar sem navegar; no app instalado (PWA) não há gesto nativo e o
 * nosso assume. No Android com navegação por gestos a borda é do sistema
 * (voltar do histórico), e o nosso só vale onde o toque chega à página.
 */

/** Largura da faixa da borda esquerda onde o gesto pode começar. */
export const SWIPE_BACK_EDGE_PX = 24;
/** Deslocamento até decidir se o arrasto é horizontal (gesto) ou vertical (rolagem). */
export const SWIPE_BACK_LOCK_PX = 10;
/** Fração da largura a partir da qual soltar completa o voltar. */
export const SWIPE_BACK_COMMIT_RATIO = 0.35;
/** Velocidade (px/ms) de um arremesso: completa (ou desiste) mesmo antes do limite. */
export const SWIPE_BACK_FLING_PX_PER_MS = 0.5;

/** `--at-duration-fast` e `--at-duration-moderate` (tokens.css). */
const SETTLE_MS = 160;
const ENTER_MS = 240;
/** `--at-ease-standard` e o deslocamento `--motion-shift-md` da volta normal. */
const EASE_STANDARD = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const ENTER_SHIFT_PX = 16;
/** Se a rota não trocar (navegação bloqueada, mesma tela), a tela não fica fora do lugar. */
const COMMIT_TIMEOUT_MS = 1200;
/** Janela de amostras para medir a velocidade na hora de soltar. */
const VELOCITY_WINDOW_MS = 100;

const MAIN_SELECTOR = "#main-content";
const MOVING_CLASS = "is-swipe-back";
const SCRIM_CLASS = "swipe-back-scrim";
const NOT_FROM = [
  "dialog",
  '[role="dialog"]',
  '[aria-modal="true"]',
  "input",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[data-swipe-back="off"]',
].join(", ");

type SwipeBackTarget = {
  href: string;
  navigate: (href: string) => void;
};

type Sample = { t: number; x: number };

type Gesture = {
  main: HTMLElement;
  phase: "pending" | "dragging";
  pointerId: number;
  samples: Sample[];
  scrim: HTMLElement | null;
  startX: number;
  startY: number;
  target: SwipeBackTarget;
  x: number;
};

/** Telas com voltar montadas agora; a última montada é a da frente. */
const targets: SwipeBackTarget[] = [];
let gesture: Gesture | null = null;
/** Animação de soltar em andamento ou navegação esperando a tela nova. */
let busy = false;
let settleNavigation: (() => void) | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function viewportWidth(): number {
  return window.innerWidth || document.documentElement.clientWidth || 1;
}

function isWide(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(WIDE_LAYOUT_QUERY).matches
  );
}

function hasSelection(): boolean {
  const selection = window.getSelection?.();
  return Boolean(selection && !selection.isCollapsed);
}

/**
 * O toque começou em algo que usa o arrasto horizontal: rolagem lateral,
 * controle deslizante, `touch-action` que reserva o eixo x, campo de texto.
 */
function claimsHorizontalDrag(start: Element, main: HTMLElement): boolean {
  if (start.closest(NOT_FROM)) return true;
  for (
    let node: Element | null = start;
    node && main.contains(node);
    node = node.parentElement
  ) {
    const style = window.getComputedStyle(node);
    const touchAction = style.touchAction ?? "";
    if (/\b(none|pan-x|pan-left|pan-right)\b/.test(touchAction)) return true;
    const overflowX = style.overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth + 1
    ) {
      return true;
    }
  }
  return false;
}

function canStart(event: PointerEvent): HTMLElement | null {
  if (event.pointerType !== "touch" || !event.isPrimary) return null;
  if (busy || gesture || targets.length === 0) return null;
  if (event.clientX > SWIPE_BACK_EDGE_PX) return null;
  if (isWide() || prefersReducedMotion()) return null;
  if (document.documentElement.classList.contains(VIEW_TRANSITION_CLASS)) {
    return null;
  }
  if (!(event.target instanceof Element)) return null;
  const main = event.target.closest<HTMLElement>(MAIN_SELECTOR);
  if (!main) return null;
  if (hasSelection() || claimsHorizontalDrag(event.target, main)) return null;
  return main;
}

function setOffset(current: Gesture, x: number) {
  current.x = x;
  current.main.style.transform = `translate3d(${x}px, 0, 0)`;
  if (current.scrim) {
    current.scrim.style.opacity = String(1 - Math.min(1, x / viewportWidth()));
  }
}

function beginDrag(current: Gesture) {
  current.phase = "dragging";
  const scrim = document.createElement("div");
  scrim.className = SCRIM_CLASS;
  scrim.setAttribute("aria-hidden", "true");
  current.main.before(scrim);
  current.scrim = scrim;
  current.main.classList.add(MOVING_CLASS);
}

/** Tira tudo o que o gesto pôs na tela. */
function clear(main: HTMLElement, scrim: HTMLElement | null) {
  scrim?.remove();
  main.classList.remove(MOVING_CLASS);
  main.style.removeProperty("transform");
  main.style.removeProperty("opacity");
}

/** Anima até o último quadro e o deixa como estilo inline (sem `fill` preso). */
function animate(
  element: HTMLElement,
  keyframes: Keyframe[],
  duration: number,
): Promise<void> {
  const last = keyframes[keyframes.length - 1];
  const hold = () => {
    if (typeof last.transform === "string") {
      element.style.transform = last.transform;
    }
    if (last.opacity !== undefined) {
      element.style.opacity = String(last.opacity);
    }
  };
  if (typeof element.animate !== "function") {
    hold();
    return Promise.resolve();
  }
  const animation = element.animate(keyframes, {
    duration,
    easing: EASE_STANDARD,
    fill: "forwards",
  });
  return animation.finished.then(() => {
    hold();
    animation.cancel();
  }, hold);
}

function springBack(current: Gesture) {
  busy = true;
  const { main, scrim } = current;
  const opacity = scrim?.style.opacity || "1";
  void Promise.all([
    animate(
      main,
      [
        { transform: main.style.transform || "none" },
        { transform: "translate3d(0px, 0, 0)" },
      ],
      SETTLE_MS,
    ),
    scrim
      ? animate(scrim, [{ opacity }, { opacity: 1 }], SETTLE_MS)
      : Promise.resolve(),
  ]).then(() => {
    clear(main, scrim);
    busy = false;
  });
}

/** A tela nova montou (ou o prazo venceu): a casca volta ao lugar e a tela entra. */
function enterNewScreen(main: HTMLElement, scrim: HTMLElement | null) {
  clear(main, scrim);
  busy = false;
  if (typeof main.animate === "function" && !prefersReducedMotion()) {
    main.animate(
      [
        { opacity: 0, transform: `translate3d(-${ENTER_SHIFT_PX}px, 0, 0)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: ENTER_MS, easing: EASE_STANDARD },
    );
  }
}

function commit(current: Gesture) {
  busy = true;
  const { main, scrim, target } = current;
  const width = viewportWidth();
  const opacity = scrim?.style.opacity || "1";
  void Promise.all([
    animate(
      main,
      [
        { transform: main.style.transform || "none" },
        { transform: `translate3d(${width}px, 0, 0)` },
      ],
      SETTLE_MS,
    ),
    scrim
      ? animate(scrim, [{ opacity }, { opacity: 0 }], SETTLE_MS)
      : Promise.resolve(),
  ]).then(() => {
    const timer = window.setTimeout(settle, COMMIT_TIMEOUT_MS);
    function settle() {
      window.clearTimeout(timer);
      if (settleNavigation === settle) settleNavigation = null;
      enterNewScreen(main, scrim);
    }
    settleNavigation = settle;
    target.navigate(target.href);
  });
}

function velocity(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const first =
    samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
}

function shouldCommit(current: Gesture): boolean {
  const speed = velocity(current.samples);
  if (speed >= SWIPE_BACK_FLING_PX_PER_MS) return true;
  if (speed <= -SWIPE_BACK_FLING_PX_PER_MS) return false;
  return current.x >= viewportWidth() * SWIPE_BACK_COMMIT_RATIO;
}

function onPointerDown(event: PointerEvent) {
  if (gesture && event.pointerId !== gesture.pointerId) {
    // Segundo dedo (pinça): o gesto desiste.
    const current = gesture;
    gesture = null;
    if (current.phase === "dragging") springBack(current);
    return;
  }
  const main = canStart(event);
  if (!main) return;
  gesture = {
    main,
    phase: "pending",
    pointerId: event.pointerId,
    samples: [{ t: now(), x: 0 }],
    scrim: null,
    startX: event.clientX,
    startY: event.clientY,
    target: targets[targets.length - 1],
    x: 0,
  };
}

function onPointerMove(event: PointerEvent) {
  const current = gesture;
  if (!current || event.pointerId !== current.pointerId) return;
  const dx = event.clientX - current.startX;
  const dy = event.clientY - current.startY;
  if (current.phase === "pending") {
    if (
      dx <= -SWIPE_BACK_LOCK_PX ||
      (Math.abs(dy) >= SWIPE_BACK_LOCK_PX && Math.abs(dy) > dx)
    ) {
      gesture = null; // rolagem vertical ou arrasto para a esquerda
      return;
    }
    if (dx < SWIPE_BACK_LOCK_PX || dx <= Math.abs(dy)) return;
    beginDrag(current);
  }
  const x = Math.max(0, dx);
  current.samples.push({ t: now(), x });
  if (current.samples.length > 12) current.samples.shift();
  setOffset(current, x);
}

function onPointerEnd(event: PointerEvent) {
  const current = gesture;
  if (!current || event.pointerId !== current.pointerId) return;
  gesture = null;
  if (current.phase !== "dragging") return;
  if (event.type === "pointerup" && shouldCommit(current)) commit(current);
  else springBack(current);
}

/**
 * O navegador decide se um arrasto é rolagem no primeiro `touchmove`
 * cancelável; sem `preventDefault` ali, ele assume o toque e manda
 * `pointercancel`. Por isso o gesto segura os `touchmove` que já pendem para
 * a direita — e só eles: o que pende para cima ou para baixo rola a página.
 */
function onTouchMove(event: TouchEvent) {
  const current = gesture;
  if (!current || !event.cancelable) return;
  if (current.phase === "dragging") {
    event.preventDefault();
    return;
  }
  const touch = event.touches[0];
  if (!touch) return;
  const dx = touch.clientX - current.startX;
  const dy = touch.clientY - current.startY;
  if (dx > 0 && dx >= Math.abs(dy)) event.preventDefault();
}

/** Um arrasto que virou gesto não pode terminar num clique no que estava sob o dedo. */
function onClick(event: MouseEvent) {
  if (busy) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function listen() {
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  document.addEventListener("touchmove", onTouchMove, {
    capture: true,
    passive: false,
  });
  document.addEventListener("click", onClick, true);
}

function unlisten() {
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("pointermove", onPointerMove, true);
  document.removeEventListener("pointerup", onPointerEnd, true);
  document.removeEventListener("pointercancel", onPointerEnd, true);
  document.removeEventListener("touchmove", onTouchMove, true);
  document.removeEventListener("click", onClick, true);
}

function register(target: SwipeBackTarget): () => void {
  targets.push(target);
  if (targets.length === 1) listen();
  return () => {
    const index = targets.indexOf(target);
    if (index >= 0) targets.splice(index, 1);
    if (gesture?.target === target) {
      clear(gesture.main, gesture.scrim);
      gesture = null;
    }
    if (targets.length === 0) unlisten();
    // A tela que pediu o voltar saiu: a nova já está no DOM.
    settleNavigation?.();
  };
}

/**
 * O roteador do app, ou `null` fora dele (um componente renderizado sozinho
 * num teste, sem `next/navigation`): o gesto não pode derrubar a tela que só
 * quer mostrar o botão voltar. `useRouter` só lê um contexto antes de lançar,
 * então a ordem dos hooks é a mesma nos dois casos.
 */
function useOptionalRouter(): ReturnType<typeof useRouter> | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

/**
 * Liga o voltar arrastando da borda para a tela que tem um voltar para
 * `href`. Sem `href` ou com `enabled: false`, nada é ligado.
 */
export function useSwipeBack({
  enabled = true,
  href,
}: {
  enabled?: boolean;
  href?: string;
}): void {
  const router = useOptionalRouter();
  const routerRef = useRef(router);
  useLayoutEffect(() => {
    routerRef.current = router;
  }, [router]);

  // `useLayoutEffect`: a saída da tela (e a volta da casca ao lugar) acontece
  // no mesmo commit em que a tela nova entra, antes da pintura.
  useLayoutEffect(() => {
    if (!enabled || !href) return;
    return register({
      href,
      navigate: (to) => {
        if (routerRef.current) routerRef.current.push(to);
        else window.location.assign(to);
      },
    });
  }, [enabled, href]);
}

/** Só para testes: zera o estado do módulo entre um caso e outro. */
export function resetSwipeBackForTests(): void {
  if (gesture) clear(gesture.main, gesture.scrim);
  gesture = null;
  busy = false;
  settleNavigation = null;
}
