import type { Metadata } from "next";

import { ServicesWorkspace } from "@/features/services/ServicesWorkspace";

export const metadata: Metadata = { title: "Serviços" };

/**
 * A lista de serviços mora aqui, e não em cada página: o layout persiste entre
 * `/servicos`, `/servicos/editar` e `/servicos/novo`, então abrir um serviço
 * não remonta nem busca a lista de novo.
 */
export default function ServicosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ServicesWorkspace>{children}</ServicesWorkspace>;
}
