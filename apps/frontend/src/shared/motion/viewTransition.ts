import { flushSync } from "react-dom";

import { prefersReducedMotion } from "./reducedMotion";

/**
 * View Transitions nativas a serviço de uma atualização de estado do React
 * (pedido do usuário, 2026-10-12: transições suaves, sem exagero).
 *
 * `runViewTransition(update)` fotografa a tela, aplica `update` dentro de
 * `flushSync` (o DOM novo precisa existir antes da segunda foto) e deixa o
 * navegador animar os pseudo-elementos `::view-transition-*` que
 * `avenly-motion.css` descreve. Enquanto a transição roda, `<html>` carrega
 * `is-view-transition` e uma classe `vt-<tipo>` por tipo pedido — é por elas
 * que o CSS escolhe a direção (`vt-nav-forward`, `vt-step-prev`, ...).
 *
 * Sem suporte à API, ou com `prefers-reduced-motion: reduce`, `update` roda
 * na hora, de forma síncrona, sem animação: o comportamento de antes. A
 * exceção é `fadeOnReducedMotion` (D-173): a troca de item no painel ao lado
 * da lista roda mesmo com movimento reduzido, e o CSS a reduz a um fade só de
 * opacidade, sem deslocamento.
 */
export const VIEW_TRANSITION_CLASS = "is-view-transition";

/** Direções e gestos que o CSS conhece; outros tipos viram `vt-<tipo>` do mesmo jeito. */
export type ViewTransitionType =
  | "nav-back"
  | "nav-fade"
  | "nav-forward"
  | "sheet-close"
  | "step-next"
  | "step-prev"
  | (string & {});

export type ViewTransitionOptions = {
  /**
   * `false` quando `update` não atualiza estado do React de forma síncrona
   * (uma navegação de rota, por exemplo): sem `flushSync`, a promessa que
   * `update` devolve é quem diz quando o DOM novo está pronto.
   */
  flush?: boolean;
  /**
   * Roda também com `prefers-reduced-motion: reduce` (D-173). Só para trocas
   * que o CSS anima apenas com opacidade no bloco de movimento reduzido.
   */
  fadeOnReducedMotion?: boolean;
  types?: ViewTransitionType[];
};

type StartViewTransition = (update: () => void | Promise<void>) => {
  finished: Promise<void>;
};

function startViewTransitionOf(target: Document): StartViewTransition | null {
  const candidate = (target as Document & { startViewTransition?: unknown })
    .startViewTransition;
  return typeof candidate === "function"
    ? (candidate as StartViewTransition).bind(target)
    : null;
}

export function supportsViewTransition(): boolean {
  return (
    typeof document !== "undefined" && startViewTransitionOf(document) !== null
  );
}

function classesFor(types: ViewTransitionType[] | undefined): string[] {
  return [VIEW_TRANSITION_CLASS, ...(types ?? []).map((type) => `vt-${type}`)];
}

/** Verdadeiro enquanto a atualização de uma transição está sendo aplicada. */
let updating = false;

export function runViewTransition(
  update: () => void | Promise<void>,
  options: ViewTransitionOptions = {},
): Promise<void> {
  const start =
    typeof document === "undefined" ? null : startViewTransitionOf(document);
  // Uma atualização pedida de dentro de outra (escolher o dia no calendário
  // fecha a folha E move a Agenda) entra na foto da transição em andamento.
  const reduced = prefersReducedMotion() && !options.fadeOnReducedMotion;
  if (!start || updating || reduced) {
    return Promise.resolve(update()).then(() => undefined);
  }
  const root = document.documentElement;
  const classes = classesFor(options.types);
  root.classList.add(...classes);
  const transition = start(() => {
    updating = true;
    try {
      if (options.flush === false) return update();
      let result: void | Promise<void> = undefined;
      flushSync(() => {
        result = update();
      });
      return result;
    } finally {
      updating = false;
    }
  });
  return transition.finished
    .catch(() => {
      /* Transição pulada (outra começou, nome repetido): o estado já mudou. */
    })
    .then(() => {
      root.classList.remove(...classes);
    });
}
