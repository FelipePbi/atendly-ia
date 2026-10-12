"use client";

import { useEffect, useSyncExternalStore } from "react";

import { prefersReducedMotion } from "./reducedMotion";

/**
 * O splash da marca no primeiro carregamento (pedido do usuário, 2026-10-12,
 * D-168): depois dele a tela entra já com conteúdo, nunca com um esqueleto.
 *
 * O `ProductRuntimeProvider` cobre a tela com o `BrandLoader` enquanto
 * verifica a sessão (`coverSplash`). Quando a sessão chega, a tela monta POR
 * BAIXO do splash e a casca registra uma "espera" (`useSplashHold`) enquanto a
 * tela declara `loading`. O splash só sai (`armSplash` + última espera
 * liberada) quando a primeira leitura da tela terminou — ou, no máximo, após
 * `SPLASH_HOLD_TIMEOUT_MS`, para uma leitura que falha nunca prender o
 * splash. Enquanto ele cobre, `useDeferredLoading` não mostra esqueleto
 * nenhum (não há o que esqueletar sob um splash opaco).
 *
 * Ao sair, o splash some em 160 ms e a tela que estava embaixo ganha, por
 * ~700 ms, o estado "apresentando" (`useSplashPresenting`): a raiz da tela
 * põe `is-presenting` e os blocos marcados com `data-present="1|2|3"` entram
 * escalonados (barra, depois grade/lista, depois painel), com os tokens de
 * D-168. Com `prefers-reduced-motion` o estado nem é ligado: a tela aparece
 * no mesmo quadro em que o splash some.
 *
 * É um evento por documento: trocas de rota depois disso não passam por aqui.
 */
export const SPLASH_LEAVE_MS = 160;
export const SPLASH_PRESENT_MS = 700;
export const SPLASH_SETTLE_MS = 80;
export const SPLASH_HOLD_TIMEOUT_MS = 4000;

type SplashPhase = "idle" | "covering" | "leaving" | "done";

export type SplashSnapshot = {
  /** O splash está opaco sobre a tela: nenhum esqueleto deve aparecer. */
  covering: boolean;
  /** O splash está sumindo (160 ms): o elemento ainda existe, já transparente. */
  leaving: boolean;
  /** A tela está se apresentando (só no primeiro carregamento, sem movimento reduzido). */
  presenting: boolean;
};

let phase: SplashPhase = "idle";
let presenting = false;
let holds = 0;
let armed = false;
let snapshot: SplashSnapshot = {
  covering: false,
  leaving: false,
  presenting: false,
};
const listeners = new Set<() => void>();
const timers = new Set<ReturnType<typeof setTimeout>>();

const SERVER_SNAPSHOT: SplashSnapshot = {
  covering: false,
  leaving: false,
  presenting: false,
};

function publish() {
  snapshot = {
    covering: phase === "covering",
    leaving: phase === "leaving",
    presenting,
  };
  for (const listener of listeners) listener();
}

function later(callback: () => void, ms: number) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback();
  }, ms);
  timers.add(timer);
}

export function subscribeSplash(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSplashSnapshot(): SplashSnapshot {
  return snapshot;
}

/** O runtime cobriu a tela com o splash (sessão sendo verificada). */
export function coverSplash(): void {
  if (phase !== "idle") return;
  phase = "covering";
  publish();
}

function release() {
  if (phase !== "covering") return;
  phase = "leaving";
  presenting = !prefersReducedMotion();
  publish();
  later(() => {
    if (phase === "leaving") {
      phase = "done";
      publish();
    }
  }, SPLASH_LEAVE_MS);
  if (presenting) {
    later(() => {
      presenting = false;
      publish();
    }, SPLASH_PRESENT_MS);
  }
}

/**
 * A tela de baixo montou e se declarou à casca: passado um instante para ela
 * registrar as esperas, o splash sai assim que a última for liberada (ou no
 * prazo máximo). Quem arma é a casca, no primeiro `useShellConfig` da tela —
 * não o runtime ao liberar a sessão: num carregamento frio a página pode
 * chegar depois (streaming), e armar antes dela soltaria o splash em cima do
 * esqueleto.
 */
export function armSplash(): void {
  if (phase !== "covering" || armed) return;
  armed = true;
  later(() => {
    if (holds === 0) release();
  }, SPLASH_SETTLE_MS);
  later(release, SPLASH_HOLD_TIMEOUT_MS);
}

/**
 * Prazo máximo contado da sessão liberada: uma tela que nunca se declara à
 * casca (rota logada fora da plataforma) não prende o splash.
 */
export function scheduleSplashTimeout(): void {
  if (phase !== "covering") return;
  later(release, SPLASH_HOLD_TIMEOUT_MS);
}

/** Segura o splash enquanto uma leitura inicial corre; devolve a liberação. */
export function holdSplash(): () => void {
  if (phase !== "covering") return () => undefined;
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0 && armed) release();
  };
}

/** Só para testes: volta ao estado de um documento recém-aberto. */
export function resetSplashForTests(): void {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  phase = "idle";
  presenting = false;
  holds = 0;
  armed = false;
  publish();
}

function getServerSnapshot(): SplashSnapshot {
  return SERVER_SNAPSHOT;
}

export function useSplash(): SplashSnapshot {
  return useSyncExternalStore(
    subscribeSplash,
    getSplashSnapshot,
    getServerSnapshot,
  );
}

export function useSplashCovering(): boolean {
  return useSplash().covering;
}

export function useSplashPresenting(): boolean {
  return useSplash().presenting;
}

/**
 * Segura o splash enquanto `active` for verdadeiro (a casca passa o `loading`
 * da tela; a coluna do Dia, a própria leitura). Fora do primeiro carregamento
 * não faz nada.
 */
export function useSplashHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return holdSplash();
  }, [active]);
}

/** A casca chama quando a tela se declarou (`declared`): arma a saída do splash. */
export function useSplashArm(declared: boolean): void {
  useEffect(() => {
    if (declared) armSplash();
  }, [declared]);
}
