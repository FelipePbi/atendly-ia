"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BffHttpError,
  type CustomerListItem,
  type CustomerListSort,
  type CustomerListStatus,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";
import { recall, remember } from "@/shared/runtime/sessionMemory";

/** Tamanho de cada leva da lista de clientes (scroll infinito). */
export const CUSTOMER_PAGE_SIZE = 15;

export type CustomerPagesError = { reference: string | null };

export type CustomerPages = {
  /** Pessoas já carregadas, na ordem do servidor e sem repetição. */
  items: CustomerListItem[];
  /** Tudo o que a busca casa no negócio inteiro, não só o carregado. */
  total: number;
  managedExternally: boolean;
  /** Primeira leva ainda não chegou (nem com erro). */
  loading: boolean;
  /** Falha da primeira leva. */
  error: CustomerPagesError | null;
  /** Existe outra leva para buscar. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Falha de uma leva seguinte: o que já veio continua na tela. */
  moreError: CustomerPagesError | null;
  loadMore: () => void;
  /**
   * Busca de novo o que já está na tela, sem esqueleto: a lista continua
   * visível até a resposta chegar. Para quando o cadastro mudou.
   */
  refresh: () => void;
  retry: () => void;
};

type PagesState = {
  /** A lista a que este estado pertence: busca e recarga. */
  key: string;
  items: CustomerListItem[];
  total: number;
  managedExternally: boolean;
  nextCursor: string | null;
  loaded: boolean;
  error: CustomerPagesError | null;
  loadingMore: boolean;
  moreError: CustomerPagesError | null;
};

/**
 * A primeira leva sem busca, como veio por último nesta aba (D-168): uma por
 * aba (Ativos/Inativos) e ordem.
 */
function firstPageKey(view: CustomerListView): string {
  return `customers:first-page:${view.status}:${view.sort}`;
}

/** Aba e ordem da lista (2026-10-18). */
export interface CustomerListView {
  status: CustomerListStatus;
  sort: CustomerListSort;
}

type RememberedFirstPage = Pick<
  PagesState,
  "items" | "managedExternally" | "nextCursor" | "total"
>;

/**
 * Voltar a Clientes abre com a primeira leva que a aba já leu, sem esqueleto,
 * e a leitura nova a revalida no lugar (2026-10-16). Busca não é lembrada.
 */
function seededState(
  key: string,
  search: string,
  view: CustomerListView,
): PagesState {
  const remembered = search
    ? undefined
    : recall<RememberedFirstPage>(firstPageKey(view));
  return remembered
    ? { ...initialState(key), ...remembered, loaded: true }
    : initialState(key);
}

function initialState(key: string): PagesState {
  return {
    key,
    items: [],
    total: 0,
    managedExternally: false,
    nextCursor: null,
    loaded: false,
    error: null,
    loadingMore: false,
    moreError: null,
  };
}

/**
 * Lista de clientes sob demanda: a primeira leva de `CUSTOMER_PAGE_SIZE` e as
 * seguintes por cursor, quando `loadMore` é chamado (o sentinela no fim da
 * lista). `search` muda a lista inteira — a busca é do servidor. Resposta de
 * uma busca antiga nunca entra na lista da busca nova: cada estado carrega a
 * chave da lista a que pertence, e o que chega com outra chave é descartado.
 */
const DEFAULT_VIEW: CustomerListView = { status: "active", sort: "name" };

export function useCustomerPages(
  search: string,
  enabled: boolean,
  view: CustomerListView = DEFAULT_VIEW,
): CustomerPages {
  const [reload, setReload] = useState(0);
  const { status, sort } = view;
  const key = `${reload}:${status}:${sort}:${search}`;
  const [stored, setState] = useState<PagesState>(() =>
    seededState(key, search, view),
  );
  const state =
    stored.key === key ? stored : seededState(key, search, { status, sort });
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    moreController.current?.abort();
    getProductServices()
      .customers.list(
        { limit: CUSTOMER_PAGE_SIZE, q: search || undefined, status, sort },
        controller.signal,
      )
      .then((page) => {
        const first: RememberedFirstPage = {
          items: unique(page.items),
          total: page.total ?? page.items.length,
          managedExternally: page.managedExternally,
          nextCursor: page.nextCursor ?? null,
        };
        if (!search) remember(firstPageKey({ status, sort }), first);
        setState({ ...initialState(key), ...first, loaded: true });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({ ...initialState(key), error: requestError(caught) });
      });
    return () => controller.abort();
  }, [enabled, key, search, status, sort]);

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
      .customers.list(
        {
          limit: CUSTOMER_PAGE_SIZE,
          cursor: nextCursor,
          q: search || undefined,
          status,
          sort,
        },
        controller.signal,
      )
      .then((page) => {
        update((previous) => ({
          ...previous,
          items: unique([...previous.items, ...page.items]),
          total: page.total ?? previous.total,
          nextCursor: page.nextCursor ?? null,
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
  }, [key, loaded, loadingMore, nextCursor, search, status, sort]);

  // Depois de uma falha, o sentinela não pede de novo sozinho: quem decide é
  // "Tentar de novo", para a lista não martelar o servidor fora do ar.
  const loadMore = useCallback(() => {
    if (!moreError) fetchMore();
  }, [fetchMore, moreError]);

  const retry = useCallback(() => {
    // Só a leva que falhou volta a ser pedida; o que já veio fica.
    if (moreError) fetchMore();
    else setReload((value) => value + 1);
  }, [fetchMore, moreError]);

  const loadedCount = state.items.length;
  const refresh = useCallback(() => {
    if (!enabled) return;
    if (!loaded) {
      setReload((value) => value + 1);
      return;
    }
    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    getProductServices()
      .customers.list(
        {
          // As mesmas pessoas que já estavam na tela, até o teto da rota.
          limit: Math.min(100, Math.max(CUSTOMER_PAGE_SIZE, loadedCount)),
          q: search || undefined,
          status,
          sort,
        },
        controller.signal,
      )
      .then((page) => {
        setState((previous) =>
          previous.key === key
            ? {
                ...previous,
                items: unique(page.items),
                total: page.total ?? page.items.length,
                nextCursor: page.nextCursor ?? null,
                loadingMore: false,
                moreError: null,
              }
            : previous,
        );
      })
      // Falha aqui não apaga nada: a lista que estava na tela continua.
      .catch(() => undefined);
  }, [enabled, key, loaded, loadedCount, search, status, sort]);

  return {
    items: state.items,
    total: state.total,
    managedExternally: state.managedExternally,
    loading: enabled && !state.loaded && !state.error,
    error: state.error,
    hasMore: state.loaded && state.nextCursor !== null,
    loadingMore: state.loadingMore,
    moreError: state.moreError,
    loadMore,
    refresh,
    retry,
  };
}

/** Uma pessoa aparece uma vez só, mesmo que duas levas a tragam. */
function unique(items: CustomerListItem[]): CustomerListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function requestError(error: unknown): CustomerPagesError {
  return {
    reference: error instanceof BffHttpError ? error.requestId : null,
  };
}
