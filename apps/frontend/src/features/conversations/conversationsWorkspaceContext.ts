import { createContext, useContext } from "react";

import type { Conversation, ConversationEvent, Message } from "@/data";
import type { StatusView } from "@/shared/runtime/systemStatus";

import type { ConversationListState } from "./ConversationListColumn";
import type { NoWhatsappProbe } from "./inboxLenses";

/** O que o chat já leu de uma conversa: abre na hora quando a pessoa volta a ela. */
export type ThreadSnapshot = {
  conversation: Conversation;
  events: ConversationEvent[];
  fetchedAt: number;
  messages: Message[];
};

type WorkspaceValue = {
  /** A lista está ao lado, desenhada pela casca: a tela desenha só o painel. */
  hosted: boolean;
  list: ConversationListState;
  probe: NoWhatsappProbe;
  remember: (snapshot: Omit<ThreadSnapshot, "fetchedAt">) => void;
  whatsappView: StatusView;
};

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** A casca de `/conversas`, quando a tela está dentro dela. */
export function useConversationsWorkspace(): WorkspaceValue | null {
  return useContext(WorkspaceContext);
}
