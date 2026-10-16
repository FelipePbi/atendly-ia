"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/shared/ui/Button";

import { CUSTOMER_PAGE_SIZE, type CustomerPages } from "./useCustomerPages";

/** Distância do fim da lista em que a próxima leva já começa a ser pedida. */
const PREFETCH_MARGIN = "0px 0px 480px 0px";

/**
 * Rodapé do scroll infinito: um sentinela observado perto do fim da lista
 * pede a próxima leva; enquanto ela chega, uma linha de esqueleto; numa
 * falha, a mensagem com "Tentar de novo" sem perder o que já veio; no fim,
 * o aviso de que não há mais ninguém (só quando houve mais de uma leva).
 */
export function CustomerListMore({ pages }: { pages: CustomerPages }) {
  const sentinel = useRef<HTMLDivElement>(null);
  // Sem IntersectionObserver (navegador antigo), um botão faz o papel do
  // sentinela. Só aparece depois da primeira leva, nunca no HTML do servidor.
  const observable = typeof IntersectionObserver !== "undefined";
  const { hasMore, items, loadMore, loadingMore, moreError } = pages;
  const waiting = hasMore && !loadingMore && !moreError;

  useEffect(() => {
    const element = sentinel.current;
    if (!waiting || !element || !observable) return;
    // Recriado a cada leva: se o sentinela continua visível depois dela
    // (tela alta, leva curta), o primeiro aviso do observador pede a próxima.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: scrollParent(element), rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [waiting, items.length, loadMore, observable]);

  const ended = !hasMore && items.length > CUSTOMER_PAGE_SIZE;
  return (
    <div className="customer-list-more">
      <div
        aria-hidden="true"
        className="customer-list-sentinel"
        ref={sentinel}
      />
      <p className="sr-only" role="status">
        {loadingMore ? "Carregando mais clientes" : ""}
      </p>
      {loadingMore && (
        <div aria-hidden="true" className="customer-skeleton is-more">
          <div className="customer-skeleton-row">
            <span className="customer-skeleton-avatar" />
            <span className="customer-skeleton-copy">
              <span className="customer-skeleton-name" />
              <span className="customer-skeleton-meta" />
            </span>
          </div>
        </div>
      )}
      {moreError && (
        <div className="customer-list-more-error" role="alert">
          <p>Não foi possível carregar mais clientes.</p>
          <Button onClick={pages.retry} type="button" variant="secondary">
            Tentar de novo
          </Button>
        </div>
      )}
      {waiting && !observable && (
        <Button onClick={loadMore} type="button" variant="tertiary">
          Carregar mais clientes
        </Button>
      )}
      {ended && <p className="customer-list-end">Fim da lista</p>}
    </div>
  );
}

/**
 * Ancestral que rola a lista (o painel no desktop) ou `null` (a janela, no
 * celular): a margem de antecipação só vale contra quem de fato rola.
 */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}
