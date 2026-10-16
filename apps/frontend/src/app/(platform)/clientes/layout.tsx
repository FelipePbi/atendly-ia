import type { Metadata } from "next";

import { CustomersWorkspace } from "@/features/customers/CustomersWorkspace";

export const metadata: Metadata = { title: "Clientes" };

/**
 * A lista de clientes mora aqui, e não em cada página: o layout persiste entre
 * `/clientes`, `/clientes/detalhes` e `/clientes/novo`, então abrir uma cliente
 * não remonta nem busca a lista de novo.
 */
export default function ClientesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomersWorkspace>{children}</CustomersWorkspace>;
}
