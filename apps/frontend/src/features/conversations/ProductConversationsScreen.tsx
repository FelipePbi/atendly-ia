"use client";

import { ConversationInbox } from "./ConversationInbox";
import { ConversationThread } from "./ConversationThread";

/**
 * Despacho dos cenários de Conversas (D-031), no mesmo padrão do Goal015 em
 * Clientes/Serviços e do Goal016 na Agenda: um branch mutuamente exclusivo por
 * cenário, e cada branch declara `useShellConfig` uma única vez, dentro do
 * componente que monta.
 *
 * Cada cenário é alcançável por uma rota de `app/(platform)/conversas/`:
 * `inbox` por `/conversas` e `thread` por `/conversas/[id]`.
 */
type ConversationsScenario = "inbox" | "thread";

export function ProductConversationsScreen({
  conversationId,
  scenario = conversationId ? "thread" : "inbox",
}: {
  conversationId?: string;
  scenario?: ConversationsScenario;
}) {
  if (scenario === "thread" && conversationId) {
    return <ConversationThread conversationId={conversationId} />;
  }
  return <ConversationInbox />;
}
