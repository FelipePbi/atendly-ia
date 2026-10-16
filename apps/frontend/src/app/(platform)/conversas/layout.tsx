import type { Metadata } from "next";

import { ConversationsWorkspace } from "@/features/conversations/ConversationsWorkspace";

export const metadata: Metadata = { title: "Conversas" };

/**
 * A lista e o chat de Conversas moram aqui, e não em cada página: o layout
 * persiste entre `/conversas` e `/conversas/[id]`, então abrir ou trocar de
 * conversa não remonta nem busca a lista de novo.
 */
export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConversationsWorkspace>{children}</ConversationsWorkspace>;
}
