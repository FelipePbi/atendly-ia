"use client";

import { createContext, type ReactNode, useContext } from "react";

import { useDeferredLoading } from "./useDeferredLoading";

/**
 * Esqueleto na forma do conteúdo real que não pisca (D-168): dentro de
 * `<SkeletonSettle>`, cada `<Skeleton>` reserva o lugar desde o primeiro
 * quadro, mas só vira esqueleto (classe `skeleton`, com o brilho) se a carga
 * passar de ~150 ms. Dado que chega antes nunca mostra um esqueleto — nem no
 * DOM, para a regra "nenhum `.skeleton` em cima de conteúdo" valer à letra.
 *
 * `quiet` reserva o lugar e nunca mostra o brilho (revisão de 2026-10-12):
 * é o caso das linhas secundárias de um conteúdo que já está na tela
 * (histórico e lembrete do atendimento), que não podem virar esqueleto numa
 * transição nem depois do splash da marca.
 */
const SkeletonSettledContext = createContext(true);

export function useSkeletonSettled(): boolean {
  return useContext(SkeletonSettledContext);
}

export function SkeletonSettle({
  children,
  quiet = false,
}: {
  children: ReactNode;
  quiet?: boolean;
}) {
  const settled = useDeferredLoading(!quiet);
  return (
    <SkeletonSettledContext.Provider value={settled}>
      {children}
    </SkeletonSettledContext.Provider>
  );
}
