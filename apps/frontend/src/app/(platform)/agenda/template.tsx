import type { ReactNode } from "react";

import { PageTransition } from "@/shared/motion/PageTransition";

/**
 * Cada tela da Agenda nasce num `.motion-page` novo (o template remonta a
 * cada troca de segmento): é o que permite a transição entre `/agenda`, o
 * detalhe, o novo agendamento e os fluxos (pedido do usuário, 2026-10-12).
 */
export default function AgendaTemplate({ children }: { children: ReactNode }) {
  return <PageTransition scope="/agenda">{children}</PageTransition>;
}
