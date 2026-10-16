"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";

import { onServicesChanged } from "@/data";
import { ListDetailHost } from "@/shared/layout/ListDetail";
import { useWideLayout } from "@/shared/layout/useWideLayout";

import {
  ServiceListPanelView,
  ServiceListProvider,
  type ServiceListState,
  useServiceListState,
} from "./ServiceList";

/**
 * Casca de `/servicos`, montada pelo layout da rota: guarda a lista (catálogo,
 * busca, rolagem) enquanto a pessoa vai da lista ao editor, troca de serviço,
 * abre "Novo serviço" e volta. A partir de 1024 px a própria lista fica ao
 * lado do editor e não é montada de novo a cada clique; abaixo disso, lista e
 * editor são telas separadas, mas a volta encontra a lista como ficou. A lista
 * só busca de novo quando o catálogo muda (`onServicesChanged`).
 */
export function ServicesWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = useWideLayout();
  const onList = pathname === "/servicos";
  // O editor também lê o serviço deste catálogo (não há leitura de um
  // serviço só), então a lista é buscada em qualquer rota de `/servicos`,
  // uma vez, e serve às duas telas.
  const data = useServiceListState();

  const { refresh } = data;
  useEffect(() => onServicesChanged(refresh), [refresh]);

  const emptyList =
    !data.error && data.result !== null && data.result.items.length === 0;
  // Na lista vazia o estado ocupa a tela inteira (S2, Goal122).
  const split = wide && (!onList || !emptyList);
  const heading = onList ? "h1" : "h2";
  return (
    <ServiceListProvider value={data}>
      <ListDetailHost
        detail={children}
        list={
          <Suspense
            fallback={<ServiceListPanelView heading={heading} state={data} />}
          >
            <SelectedListPanel data={data} heading={heading} />
          </Suspense>
        }
        listLabel="Serviços"
        split={split}
      />
    </ServiceListProvider>
  );
}

/** O serviço aberto vem da URL do editor (`?id=`), para o destaque da linha. */
function SelectedListPanel({
  data,
  heading,
}: {
  data: ServiceListState;
  heading: "h1" | "h2";
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = pathname.startsWith("/servicos/editar")
    ? (params.get("id") ?? undefined)
    : undefined;
  return (
    <ServiceListPanelView heading={heading} openId={openId} state={data} />
  );
}
