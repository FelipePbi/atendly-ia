"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const routeTitles: [RegExp, string][] = [
  [/^\/_preview\//, "Pré-visualização"],
  [/^\/login$/, "Entrar"],
  [/^\/cadastro$/, "Criar conta"],
  [/^\/recuperar-senha$/, "Recuperar senha"],
  [/^\/solicitacao-enviada$/, "Solicitação enviada"],
  [/^\/nova-senha$/, "Nova senha"],
  [/^\/link-expirado$/, "Link expirado"],
  [/^\/onboarding/, "Configuração inicial"],
  [/^\/inicio/, "Início"],
  [/^\/conversas/, "Conversas"],
  [/^\/agenda/, "Agenda"],
  [/^\/clientes/, "Clientes"],
  [/^\/servicos/, "Serviços"],
  [/^\/configuracoes/, "Configurações"],
  [/^\/migracao/, "Migração de agenda"],
  [/^\/termos-de-uso$/, "Termos de Uso"],
  [/^\/politica-de-privacidade$/, "Política de Privacidade"],
];

export function RouteAnnouncer() {
  const pathname = usePathname();
  const title =
    routeTitles.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Atendly";

  useEffect(() => {
    document.title = title === "Atendly" ? title : `${title} — Atendly`;
  }, [title]);

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      Página carregada: {title}
    </div>
  );
}
