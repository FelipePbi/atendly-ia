"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type ActivityEntry, type ActivityQuery, BffHttpError } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

/** Tamanho de cada leva do registro (scroll infinito). */
export const ACTIVITY_PAGE_SIZE = 30;

export type ActivityPagesError = { reference: string | null };

export type ActivityPages = {
  /** Linhas já carregadas, da mais recente para a mais antiga, sem repetição. */
  items: ActivityEntry[];
  /** Primeira leva ainda não chegou (nem com erro). */
  loading: boolean;
  error: ActivityPagesError | null;
  hasMore: boolean;
  loadingMore: boolean;
  /** Falha de uma leva seguinte: o que já veio continua na tela. */
  moreError: ActivityPagesError | null;
  loadMore: () => void;
  retry: () => void;
};

type PagesState = {
  key: string;
  items: ActivityEntry[];
  nextCursor: string | null;
  loaded: boolean;
  error: ActivityPagesError | null;
  loadingMore: boolean;
  moreError: ActivityPagesError | null;
};

/** A primeira leva sem filtro, como veio por último nesta aba (D-167). */
const FIRST_PAGE = "activity:first-page";

type RememberedFirstPage = Pick<PagesState, "items" | "nextCursor">;

/** A aba já leu o registro antes: a lista volta na hora, sem fade de entrada. */
export function hasRememberedActivity(): boolean {
  return recall<RememberedFirstPage>(FIRST_PAGE) !== undefined;
}

function initialState(key: string): PagesState {
  return {
    key,
    items: [],
    nextCursor: null,
    loaded: false,
    error: null,
    loadingMore: false,
    moreError: null,
  };
}

function seededState(key: string, unfiltered: boolean): PagesState {
  const remembered = unfiltered
    ? recall<RememberedFirstPage>(FIRST_PAGE)
    : undefined;
  return remembered
    ? { ...initialState(key), ...remembered, loaded: true }
    : initialState(key);
}

/**
 * Registro sob demanda: a primeira leva e as seguintes por cursor, quando
 * `loadMore` é chamado (o sentinela no fim da lista). Trocar um filtro troca
 * a lista inteira; resposta de um filtro antigo nunca entra na lista do novo.
 */
export function useActivityPages(query: Omit<ActivityQuery, "cursor" | "limit">): ActivityPages {
  const [reload, setReload] = useState(0);
  const filterKey = JSON.stringify(query);
  const unfiltered = filterKey === "{}";
  const key = `${reload}:${filterKey}`;
  const [stored, setState] = useState<PagesState>(() =>
    seededState(key, unfiltered),
  );
  const state = stored.key === key ? stored : seededState(key, unfiltered);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort();
    getProductServices()
      .activity.list(
        { ...filtersOf(filterKey), limit: ACTIVITY_PAGE_SIZE },
        controller.signal,
      )
      .then((page) => {
        const first: RememberedFirstPage = {
          items: unique(page.items),
          nextCursor: page.nextCursor,
        };
        if (unfiltered) remember(FIRST_PAGE, first);
        setState({ ...initialState(key), ...first, loaded: true });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({ ...initialState(key), error: requestError(caught) });
      });
    return () => controller.abort();
  }, [filterKey, key, unfiltered]);

  useEffect(() => () => moreController.current?.abort(), []);

  const { loaded, loadingMore, moreError, nextCursor } = state;
  const fetchMore = useCallback(() => {
    if (!loaded || !nextCursor || loadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    const update = (change: (previous: PagesState) => PagesState) =>
      setState((previous) =>
        previous.key === key ? change(previous) : previous,
      );
    update((previous) => ({ ...previous, loadingMore: true, moreError: null }));
    getProductServices()
      .activity.list(
        {
          ...filtersOf(filterKey),
          cursor: nextCursor,
          limit: ACTIVITY_PAGE_SIZE,
        },
        controller.signal,
      )
      .then((page) => {
        update((previous) => ({
          ...previous,
          items: unique([...previous.items, ...page.items]),
          nextCursor: page.nextCursor,
          loadingMore: false,
        }));
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        update((previous) => ({
          ...previous,
          loadingMore: false,
          moreError: requestError(caught),
        }));
      });
  }, [filterKey, key, loaded, loadingMore, nextCursor]);

  // Depois de uma falha, o sentinela não pede de novo sozinho: quem decide é
  // "Tentar novamente".
  const loadMore = useCallback(() => {
    if (!moreError) fetchMore();
  }, [fetchMore, moreError]);

  const retry = useCallback(() => {
    if (moreError) fetchMore();
    else setReload((value) => value + 1);
  }, [fetchMore, moreError]);

  return {
    items: state.items,
    loading: !state.loaded && !state.error,
    error: state.error,
    hasMore: state.loaded && state.nextCursor !== null,
    loadingMore: state.loadingMore,
    moreError: state.moreError,
    loadMore,
    retry,
  };
}

/** O filtro volta do texto da chave: a leitura não depende da identidade do objeto. */
function filtersOf(filterKey: string): ActivityQuery {
  return JSON.parse(filterKey) as ActivityQuery;
}

function unique(items: ActivityEntry[]): ActivityEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function requestError(error: unknown): ActivityPagesError {
  return {
    reference: error instanceof BffHttpError ? error.requestId : null,
  };
}
