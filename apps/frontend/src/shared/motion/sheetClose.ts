"use client";

import { createContext, useContext } from "react";

/**
 * Fechar uma folha modal com a saída animada. `ChatSheetShell` fornece a
 * função: ela roda o `onClose` da folha (e o que vier em `after`) dentro de
 * uma View Transition, para a folha sair em 160 ms enquanto o resto da tela
 * já muda. Fora de uma folha, `useSheetClose` devolve `null`.
 */
export type SheetClose = (after?: () => void) => void;

export const SheetCloseContext = createContext<SheetClose | null>(null);

export function useSheetClose(): SheetClose | null {
  return useContext(SheetCloseContext);
}
