// @vitest-environment jsdom
/**
 * Voltar a Clientes sem esqueleto (vídeo de 2026-10-16): ao sair de Clientes
 * (para a Agenda, por exemplo) e voltar, a lista abre com a primeira leva que
 * a aba já leu, sem passar por "carregando", e a leitura nova a revalida no
 * lugar (D-168). A busca não é lembrada.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useCustomerPages } from "@/features/customers/useCustomerPages";
import { forget } from "@/shared/runtime/sessionMemory";

const listCustomers = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({ customers: { list: listCustomers } }),
}));

function page(names: string[], total = names.length) {
  return {
    items: names.map((name, index) => ({
      id: `c-${name}-${index}`,
      name,
      phone: null,
    })),
    managedExternally: false,
    nextCursor: null,
    source: "AVENLY",
    total,
  };
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

beforeEach(() => {
  forget();
  listCustomers.mockReset();
});

describe("primeira leva lembrada na aba", () => {
  test("a segunda montagem abre com a lista, sem carregando, e revalida no lugar", async () => {
    listCustomers.mockResolvedValueOnce(page(["Ana", "Bia"], 40));
    const first = renderHook(() => useCustomerPages("", true));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    let answer: (value: ReturnType<typeof page>) => void = () => undefined;
    listCustomers.mockImplementationOnce(
      () =>
        new Promise((done) => {
          answer = done;
        }),
    );
    const second = renderHook(() => useCustomerPages("", true));
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.items.map((item) => item.name)).toEqual([
      "Ana",
      "Bia",
    ]);
    expect(second.result.current.total).toBe(40);

    await act(async () => answer(page(["Ana", "Bia", "Carla"], 41)));
    expect(second.result.current.items).toHaveLength(3);
    expect(second.result.current.total).toBe(41);
  });

  test("busca não é lembrada: abre carregando", async () => {
    listCustomers.mockResolvedValueOnce(page(["Ana"]));
    const first = renderHook(() => useCustomerPages("", true));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    listCustomers.mockImplementation(never);
    const searching = renderHook(() => useCustomerPages("ana", true));
    expect(searching.result.current.loading).toBe(true);
  });
});
