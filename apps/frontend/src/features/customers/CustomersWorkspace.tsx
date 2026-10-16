"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useState } from "react";

import { onCustomersChanged } from "@/data";
import { ListDetailHost } from "@/shared/layout/ListDetail";
import { useWideLayout } from "@/shared/layout/useWideLayout";

import {
  type CustomerListData,
  CustomerListPanelView,
  CustomerListProvider,
  useCustomerListState,
} from "./CustomerList";

/**
 * Casca de `/clientes`, montada pelo layout da rota: guarda a lista (levas já
 * carregadas, busca, rolagem) enquanto a pessoa vai da lista ao detalhe, troca
 * de cliente, abre "Novo cliente" e volta. A partir de 1024 px a própria lista
 * fica ao lado do detalhe e não é montada de novo a cada clique; abaixo disso,
 * lista e detalhe são telas separadas, mas a volta encontra a lista como ficou.
 * A lista só busca de novo quando o cadastro muda (`onCustomersChanged`).
 */
export function CustomersWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = useWideLayout();
  const onList = pathname === "/clientes";
  // No celular, abrir direto um detalhe não busca a lista; ela só começa a
  // ser buscada quando aparece, e daí em diante fica guardada.
  const wanted = onList || wide;
  const [active, setActive] = useState(wanted);
  if (wanted && !active) setActive(true);
  const data = useCustomerListState(active);

  const { refresh } = data;
  useEffect(() => onCustomersChanged(refresh), [refresh]);

  const emptyList = !data.loading && !data.error && data.customers.length === 0;
  // Na lista vazia ou com erro, o estado ocupa a tela inteira (CL2/CL10).
  const split = wide && (!onList || (!data.error && !emptyList));
  const heading = onList ? "h1" : "h2";
  return (
    <CustomerListProvider value={data}>
      <ListDetailHost
        detail={children}
        list={
          <Suspense
            fallback={<CustomerListPanelView data={data} heading={heading} />}
          >
            <SelectedListPanel data={data} heading={heading} />
          </Suspense>
        }
        listLabel="Clientes"
        split={split}
      />
    </CustomerListProvider>
  );
}

/** A cliente aberta vem da URL do detalhe (`?id=`), para o destaque da linha. */
function SelectedListPanel({
  data,
  heading,
}: {
  data: CustomerListData;
  heading: "h1" | "h2";
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = pathname.startsWith("/clientes/detalhes")
    ? (params.get("id") ?? undefined)
    : undefined;
  return (
    <CustomerListPanelView data={data} heading={heading} openId={openId} />
  );
}
