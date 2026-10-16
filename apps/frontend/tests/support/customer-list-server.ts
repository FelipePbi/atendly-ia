import { screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";

import type { CustomerListQuery } from "@/data";

type ListResult = {
  items: Array<{ name: string | null; phone: string | null }>;
};

/**
 * A busca de Clientes saiu do navegador e foi para o servidor: o dobro de
 * `customers.list` que devolve a lista inteira passa por aqui para filtrar
 * `q` como o Scheduling filtra — trecho do nome sem diferenciar caixa ou,
 * sem letra, trecho dos dígitos do telefone. A paginação continua por conta
 * de cada teste.
 */
export async function asServerSearch<T extends ListResult>(
  result: T | Promise<T>,
  query?: CustomerListQuery,
): Promise<T> {
  const resolved = await result;
  const search = query?.q?.trim().toLocaleLowerCase("pt-BR");
  if (!search || !resolved) return resolved;
  const digits = /\p{L}/u.test(search) ? "" : search.replace(/\D/gu, "");
  return {
    ...resolved,
    items: resolved.items.filter(
      (item) =>
        (item.name ?? "").toLocaleLowerCase("pt-BR").includes(search) ||
        (digits !== "" &&
          (item.phone ?? "").replace(/\D/gu, "").includes(digits)),
    ),
  };
}

/** Espera a busca digitada voltar do servidor (o esqueleto "Buscando clientes" sai). */
export async function waitForSearch(): Promise<void> {
  await waitFor(() =>
    expect(screen.queryByText("Buscando clientes")).not.toBeInTheDocument(),
  );
}
